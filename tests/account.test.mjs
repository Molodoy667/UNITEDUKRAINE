import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountHandler } from '../lib/account/service.js';
import { credentials, digest, experience, profile } from '../lib/account/core.js';
import { clientNames } from '../lib/account/presence.js';
import { totp } from '../lib/forum/core.js';
import { TestDatabase,testPlayer } from './account-fixtures.mjs';

const origin='http://127.0.0.1:5173';
function setup(players){const db=new TestDatabase(players);const handler=createAccountHandler({pool:()=>db,getPresence:async()=>({online:false,checkedAt:new Date().toISOString(),source:'synthetic-test'})});return {db,handler};}
async function call(system,action='session',body,actor={},extra={}){
  const request={method:body===undefined?'GET':'POST',url:`/api/account?action=${action}${extra.query||''}`,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...extra.headers},socket:{remoteAddress:'127.0.0.1'},body,...extra.request};
  const response={headers:{},status(value){this.code=value;return this;},setHeader(key,value){this.headers[key]=value;},json(value){this.body=value;return this;}};
  await system.handler(request,response);return response;
}
async function login(system,player=system.db.players[0]){const response=await call(system,'login',{email:player.email,password:player.players_password});assert.equal(response.code,200);return {cookie:response.headers['Set-Cookie'].split(';')[0],csrf:response.body.csrf};}

test('guest access and unsupported methods do not query private account data',async()=>{
  const system=setup();assert.deepEqual((await call(system)).body,{account:null});assert.equal(system.db.queries.length,0);
  assert.equal((await call(system,'session',undefined,{}, {request:{method:'DELETE'}})).code,405);
  assert.equal((await call(system,'admin')).code,401);
});
test('literal game password is case-sensitive, email is normalized and session secret is hashed',async()=>{
  const system=setup(),player=system.db.players[0];
  assert.equal((await call(system,'login',{email:player.email,password:player.players_password.toLowerCase()})).code,401);
  const result=await call(system,'login',{email:` ${player.email.toUpperCase()} `,password:player.players_password});assert.equal(result.code,200);
  assert.match(result.headers['Set-Cookie'],/HttpOnly; SameSite=Lax; Max-Age=604800/);
  const raw=result.headers['Set-Cookie'].split(';')[0].split('=')[1];assert.ok(system.db.sessions.has(digest(raw)));assert.ok(!system.db.sessions.has(raw));
  assert.ok(!JSON.stringify(result.body).includes(player.players_password));assert.equal(result.body.account.email,player.email);
});
test('property isolation uses authenticated id despite browser-supplied id and admin values',async()=>{
  const system=setup(),actor=await login(system);const result=await call(system,'session',undefined,actor,{query:'&accountId=999&admin=12'});
  assert.equal(result.code,200);assert.equal(result.body.account.id,73);assert.deepEqual(result.body.assets.cars.map(p=>p.id),[41,42]);
  assert.equal(result.body.assets.apartments[0].apartmentNumber,28);assert.equal(result.body.assets.houses[0].cityName,'Арзамас');
  assert.ok(!JSON.stringify(result.body).includes('PRIVATE'));assert.ok(!JSON.stringify(result.body).includes('FAMILY'));
  for(const query of system.db.queries.filter(q=>q.sql.includes('WHERE owner_id=?')))assert.deepEqual(query.values,[73]);
  assert.equal(result.body.account.isSiteAdmin,false);assert.equal((await call(system,'session',undefined,{cookie:'uu_account='+'a'.repeat(64)})).body.account,null);
});
test('password changes invalidate website sessions before the next private read',async()=>{
  const system=setup(),actor=await login(system);system.db.players[0].players_password='Changed-In-Game';
  assert.equal((await call(system,'session',undefined,actor)).body.account,null);assert.equal(system.db.sessions.size,0);
});
test('logout requires trusted Origin and session CSRF, then revokes the cookie',async()=>{
  const system=setup(),actor=await login(system);
  assert.equal((await call(system,'logout',{},actor,{headers:{origin:'https://untrusted.example'}})).code,403);
  assert.equal((await call(system,'logout',{}, {cookie:actor.cookie})).code,403);assert.equal(system.db.sessions.size,1);
  const response=await call(system,'logout',{},actor);assert.equal(response.code,200);assert.match(response.headers['Set-Cookie'],/Max-Age=0/);assert.equal(system.db.sessions.size,0);
  assert.equal((await call(system,'session',undefined,actor)).body.account,null);
});
test('production sets a Secure host-only cookie and enforces configured Origins',async()=>{
  const keys=['NODE_ENV','ACCOUNT_ORIGIN','ACCOUNT_RATE_SECRET'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  Object.assign(process.env,{NODE_ENV:'production',ACCOUNT_ORIGIN:'https://united.example.test',ACCOUNT_RATE_SECRET:'synthetic-rate-limit-secret-for-tests-only'});
  try{
    const system=setup(),body={email:'player@example.test',password:'Synthetic-Game-Password'};
    assert.equal((await call(system,'login',body)).code,403);
    const response=await call(system,'login',body,{}, {headers:{origin:'https://united.example.test'}});
    assert.equal(response.code,200);assert.match(response.headers['Set-Cookie'],/^__Host-uu_account=/);assert.match(response.headers['Set-Cookie'],/; Secure$/);assert.ok(!response.headers['Set-Cookie'].includes('Domain='));
    const actor={cookie:response.headers['Set-Cookie'].split(';')[0],csrf:response.body.csrf};assert.equal((await call(system,'session',undefined,actor)).body.account.id,73);
  }finally{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});
test('site administration is checked server-side for exactly game admin level 12',async()=>{
  for(const admin of [0,11,12,13]){const system=setup([testPlayer({admin})]),actor=await login(system);const response=await call(system,'admin',undefined,actor);assert.equal(response.code,admin===12?200:403);assert.equal(profile(system.db.players[0]).isSiteAdmin,admin===12);}
});
test('ambiguous duplicate emails fail rather than logging into an arbitrary character',async()=>{
  const system=setup([testPlayer(),testPlayer({id:999})]);const response=await call(system,'login',{email:'player@example.test',password:'Synthetic-Game-Password'});assert.equal(response.code,401);assert.equal(system.db.sessions.size,0);
});
test('email attempts are rate-limited across requests and secrets stay out of errors',async()=>{
  const system=setup();for(let i=0;i<10;i++)assert.equal((await call(system,'login',{email:'player@example.test',password:'Wrong-Password'})).code,401);
  const response=await call(system,'login',{email:'player@example.test',password:'Synthetic-Game-Password'});assert.equal(response.code,429);assert.equal(response.headers['Retry-After'],'900');assert.equal(system.db.sessions.size,0);
});
test('game TOTP is required and replay is rejected after logout',async()=>{
  const player=testPlayer({google_auth:1,google_code:'JBSWY3DPEHPK3PXP'}),system=setup([player]),body={email:player.email,password:player.players_password};
  const required=await call(system,'login',body);assert.equal(required.code,401);assert.equal(required.body.error,'totp_required');
  const response=await call(system,'login',{...body,code:totp(player.google_code)});assert.equal(response.code,200);assert.ok(!JSON.stringify(response.body).includes(player.google_code));
  const actor={cookie:response.headers['Set-Cookie'].split(';')[0],csrf:response.body.csrf};await call(system,'logout',{},actor);
  const replay=await call(system,'login',{...body,code:totp(player.google_code)});assert.equal(replay.code,401);assert.equal(replay.body.error,'totp_reused');
});
test('unsupported TOTP secrets fail closed',async()=>{
  const system=setup([testPlayer({google_auth:1,google_code:'invalid'})]);const response=await call(system,'login',{email:'player@example.test',password:'Synthetic-Game-Password',code:'123456'});assert.equal(response.code,403);assert.equal(system.db.sessions.size,0);
});
test('validation rejects malformed/oversized bodies and SQL values remain bound',async()=>{
  const system=setup();assert.equal((await call(system,'login','{bad json')).code,400);
  assert.equal((await call(system,'login',[])).code,400);
  assert.equal((await call(system,'login',{email:'player@example.test',password:'x'.repeat(3000)})).code,400);
  assert.throws(()=>credentials({email:'None',password:'test'}));
  const attack="player'OR'1'='1@example.test";await call(system,'login',{email:attack,password:'anything'});
  const query=system.db.queries.find(q=>q.sql.startsWith('SELECT id,name,email'));assert.ok(!query.sql.includes(attack));assert.equal(query.values[0],attack.toLowerCase());
});
test('property outage is a generic 503 without failing the prior successful login',async()=>{
  const system=setup();system.db.failAssets=true;const actor=await login(system);const response=await call(system,'session',undefined,actor);assert.equal(response.code,503);assert.ok(!JSON.stringify(response.body).includes('Private DB'));assert.equal(system.db.sessions.size,1);
});
test('experience matches the game strict greater-than promotion boundary',()=>{
  assert.equal(experience(1,8).remaining,1);assert.equal(experience(1,9).remaining,0);assert.equal(experience(18,36).required,77);assert.equal(experience(1,99).percent,100);
});
test('public profile preserves money precision, expires premium and excludes sensitive columns',()=>{
  const data=profile(testPlayer({money:'900719925474099312345',premium_time:1,adminspasslogin:'PRIVATE',reg_ip:'PRIVATE',serialid:'PRIVATE'}));assert.equal(data.balances.cash,'900719925474099312345');assert.equal(data.premium.active,false);
  assert.ok(!JSON.stringify(data).includes('PRIVATE'));assert.ok(!('players_password' in data));assert.ok(!('google_code' in data));
  assert.equal(profile(testPlayer({premium:0})).premium.active,false);
});
test('client list decoder rejects truncated and excessive responses',()=>{
  const packet=Buffer.alloc(13+1+4+4);packet.writeUInt16LE(1,11);packet[13]=4;packet.write('Alex',14);assert.deepEqual(clientNames(packet),['Alex']);
  assert.throws(()=>clientNames(packet.subarray(0,-1)));const empty=Buffer.alloc(13);assert.deepEqual(clientNames(empty),[]);empty.writeUInt16LE(101,11);assert.throws(()=>clientNames(empty));
});
