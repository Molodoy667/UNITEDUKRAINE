import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAdminHandler,listQuery} from '../lib/admin/service.js';
import {entities,selectFields} from '../lib/admin/catalog.js';
import {createChangeService,proposal,recordVersion} from '../lib/admin/changes.js';
export async function adminCall(handler,action='overview',params={},extra={}){
  const query=new URLSearchParams({action,...params}),request={method:'GET',url:`/api/admin?${query}`,headers:{},...extra};
  const response={headers:{},status(code){this.code=code;return this;},setHeader(key,value){this.headers[key]=value;},json(body){this.body=body;return this;}};
  await handler(request,response);return response;
}
test('no data queries before verified game admin 12; browser admin overrides never grant access',async()=>{
  let reads=0,user=null;const handler=createAdminHandler({pool:()=>({execute:async()=>{reads++;return [[]];}}),getSession:async()=>user});
  assert.equal((await adminCall(handler,'list',{entity:'players',admin:12})).code,401);
  for(const admin of [0,1,11,13]){user={id:1,name:'Test_Admin',admin};assert.equal((await adminCall(handler,'list',{entity:'players',admin:12})).code,403);}
  assert.equal(reads,0);assert.equal((await adminCall(handler,'list',{entity:'players'},{method:'POST'})).code,405);assert.equal(reads,0);
});
test('fixed table, column, method and sort allowlists reject arbitrary SQL and prototype properties',async()=>{
  const handler=createAdminHandler({pool:()=>({execute:async()=>{throw Error('Should not execute');}}),getSession:async()=>({id:1,name:'Test_Admin',admin:12})});
  for(const entity of ['accounts_1101','__proto__','constructor','players;DROP TABLE houses'])assert.equal((await adminCall(handler,'list',{entity})).code,404);
  for(const params of [{sort:'email'},{filter:'password'},{page:'0'},{page:'-1'},{size:'9999'},{size:'19'},{q:'x'.repeat(81)},{ownerId:'2'}])assert.throws(()=>listQuery(new URLSearchParams(params),entities.players));
  const query=listQuery(new URLSearchParams({q:"x%' OR 1=1 --_!"}),entities.houses);assert.ok(!query.where.includes('OR 1=1'));assert.equal(query.values[0],"%x!%' OR 1=1 --!_!!%");
  for(const entity of Object.values(entities))assert.doesNotMatch(selectFields(entity),/email|password|google|last_ip|reg_ip|serial|setting_pin/i);
});
test('unknown table counts stay null, other cards survive, and private responses are never publicly cached',async()=>{
  const handler=createAdminHandler({pool:()=>({execute:async sql=>{if(sql.includes('`business`'))throw Error('Synthetic unavailable');return [[{total:4,free:2,admins:1}]];}}),getSession:async()=>({id:1,name:'Test_Admin',admin:12}),getOnline:async()=>({names:null,checkedAt:'2026-10-19T00:00:00Z'})});
  const result=await adminCall(handler);assert.equal(result.code,200);assert.equal(result.body.stats.businesses.available,false);assert.equal(result.body.stats.businesses.total,null);assert.equal(result.body.stats.houses.total,4);assert.equal(result.body.online.count,null);assert.deepEqual(result.body.capabilities,{read:true,edit:false,propose:true,ai:false});assert.equal(result.headers['Cache-Control'],'private, no-store');assert.equal(result.headers.Vary,'Cookie');
});
test('online failure is unavailable, not an empty server; database failure is a generic 503',async()=>{
  const handler=createAdminHandler({pool:()=>({execute:async()=>{const e=Error('Private password SQL host');e.code='ER_BAD_FIELD_ERROR';throw e;}}),getSession:async()=>({id:1,name:'Test_Admin',admin:12}),getOnline:async()=>({names:null,checkedAt:'now'})});
  const online=await adminCall(handler,'online');assert.equal(online.code,503);assert.equal(online.body.error,'online_unavailable');
  const list=await adminCall(handler,'list',{entity:'players'});assert.equal(list.code,503);assert.doesNotMatch(JSON.stringify(list.body),/Private|password|SQL|host|ER_BAD/);
});

test('proposal field allowlists reject credentials, roles, money, ownership and malformed values',()=>{
  const item={skin:223,name:'Old Name',color_1:0,color_2:0,locked:0};
  for(const key of ['players_password','admin','money','bank','donate_current','email','owner_id','__proto__'])assert.throws(()=>proposal('players',JSON.parse(`{"${key}":"1"}`),item));
  for(const value of [-1,1.5,30001,'1e3','0;DROP',' '.repeat(5),{},null])assert.throws(()=>proposal('players',{skin:value},item));
  for(const name of ['', ' ', 'x'.repeat(20),'bad\nname','{FFAA00}bad','bad\0name','emoji😀','bad"name','bad\\name'])assert.throws(()=>proposal('houses',{name},item));
  assert.doesNotThrow(()=>proposal('houses',{name:'x'.repeat(19)},item));assert.doesNotThrow(()=>proposal('businesses',{name:'x'.repeat(29)},item));assert.throws(()=>proposal('businesses',{name:'x'.repeat(30)},item));
  assert.throws(()=>proposal('vehicles',{color_1:256},item));assert.throws(()=>proposal('apartments',{locked:2},item));
  assert.throws(()=>proposal('players',{skin:223},item));assert.throws(()=>proposal('players',{},item));assert.throws(()=>proposal('__proto__',{name:'bad'},item));
  assert.deepEqual(proposal('houses',{name:' Нова назва '},item),{name:{before:'Old Name',after:'Нова назва'}});
  assert.deepEqual(proposal('vehicles',{color_2:'23',color_1:12},item),{color_1:{before:0,after:12},color_2:{before:0,after:23}});
});

test('version hash is stable across SQL numeric representations and never hashes credential fields',()=>{
  const before={id:73,skin:223,name:'Player',money:'9007199254740993'},version=recordVersion('players',before);
  assert.equal(recordVersion('players',{...before,id:'73',skin:'223',players_password:'A_SECRET'}),version);
  assert.notEqual(recordVersion('players',{...before,money:'9007199254740994'}),version);
  assert.notEqual(recordVersion('players',{...before,skin:224}),version);
});

test('signed previews expire, are session-bound and cannot be modified before confirmation',async()=>{
  const item={id:73,name:'Player',skin:223};let clock=1000,rolledBack=0,connections=0;
  const db={execute:async sql=>{
    if(sql.includes('FROM `accounts_1101`'))return [[item]];
    if(sql.includes('SELECT attempts'))return [[{attempts:1}]];
    if(sql.includes('SELECT id,payload_hash,status'))return [[]];
    return [{affectedRows:1}];
  },beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{rolledBack++;},release:()=>{}};
  const pool={...db,getConnection:async()=>{connections++;return db;}},service=createChangeService({clock:()=>clock}),user={id:73,session_id:'test-session'},body={entity:'players',id:73,version:recordVersion('players',item),values:{skin:224},reason:'Synthetic reason for a preview.'};
  const preview=await service.preview(pool,user,body),request={token:preview.token,requestId:crypto.randomUUID()};
  await assert.rejects(service.confirm(pool,{...user,session_id:'another-session'},request),{code:'preview_owner'});assert.equal(connections,0);
  await assert.rejects(service.confirm(pool,user,{...request,token:preview.token+'x'}),{code:'invalid_preview'});assert.equal(connections,0);
  clock=601001;await assert.rejects(service.confirm(pool,user,request),{code:'preview_expired'});assert.equal(rolledBack,1);
  await assert.rejects(service.preview(pool,user,{...body,reason:'short'}),{code:'invalid_reason'});
  const previous={NODE_ENV:process.env.NODE_ENV,VERCEL:process.env.VERCEL,ACCOUNT_RATE_SECRET:process.env.ACCOUNT_RATE_SECRET,FORUM_IP_SECRET:process.env.FORUM_IP_SECRET};
  try{
    process.env.NODE_ENV='production';delete process.env.ACCOUNT_RATE_SECRET;delete process.env.FORUM_IP_SECRET;
    await assert.rejects(service.preview(pool,user,body),{code:'admin_unconfigured'});
  }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
