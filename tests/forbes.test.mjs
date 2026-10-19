import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createForbesHandler,publicRanking,rankingSql} from '../lib/forbes/service.js';

export async function forbesCall(handler,method='GET',url='/api/forbes'){
  const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method,url,headers:{}},response);return response;
}
test('Forbes is GET-only, public, and selects no private columns or user-supplied SQL',async()=>{
  let calls=0;const handler=createForbesHandler({pool:()=>({execute:async sql=>{calls++;assert.equal(sql,rankingSql);return [[]];}})});
  for(const method of ['POST','PATCH','DELETE','HEAD']){const result=await forbesCall(handler,method);assert.equal(result.code,405);assert.equal(result.headers.Allow,'GET');}
  assert.equal(calls,0);const result=await forbesCall(handler,'GET','/api/forbes?limit=9999&accountId=73&order=players_password');
  assert.equal(result.code,200);assert.deepEqual(result.body.players,[]);assert.equal(result.body.limit,13);assert.equal(result.body.basis,'cash_plus_bank');
  assert.match(result.headers['Cache-Control'],/s-maxage=60/);assert.doesNotMatch(rankingSql,/SELECT \*|email|password|donate|reg_ip|UPDATE|DELETE/i);
});
test('concurrent public requests coalesce, and the ranking refreshes when the cache expires',async()=>{
  let count=0,now=1000000;const handler=createForbesHandler({now:()=>now,pool:()=>({execute:async()=>{count++;await new Promise(resolve=>setTimeout(resolve,5));return [[{id:1,name:'Test_Player',skin:223,wealth:'9007199254740993'}]];}})});
  const responses=await Promise.all(Array.from({length:20},()=>forbesCall(handler)));assert.equal(count,1);
  for(const response of responses){assert.equal(response.code,200);assert.equal(response.body.players[0].wealth,'9007199254740993');}
  await forbesCall(handler);assert.equal(count,1);now+=60001;const fresh=await forbesCall(handler);assert.equal(count,2);assert.equal(fresh.body.updatedAt,new Date(now).toISOString());
});
test('DB failures are not cached and expose no raw SQL, host, credentials, or invented players',async()=>{
  let broken=true;const handler=createForbesHandler({pool:()=>({execute:async()=>{if(broken){const error=Error('password Private-Test-Password host 127.0.0.1 SELECT email');error.code='ER_ACCESS_DENIED_ERROR';throw error;}return [[]];}})});
  const error=await forbesCall(handler);assert.equal(error.code,503);assert.equal(error.headers['Cache-Control'],'no-store');assert.equal(error.body.error,'forbes_unavailable');assert.equal(error.body.players,undefined);assert.doesNotMatch(JSON.stringify(error.body),/password|127\.0\.0\.1|SELECT|email|Private-Test/i);
  broken=false;assert.equal((await forbesCall(handler)).code,200);
});
test('public DTO allowlists fields and preserves very large signed totals as exact strings',()=>{
  const result=publicRanking([{id:1,name:'Test_Player',skin:223,wealth:'1999999999999999999998',email:'private@example.test',players_password:'private',donate_current:1000}],new Date(0).toISOString());
  assert.deepEqual(Object.keys(result.players[0]).sort(),['id','nickname','rank','skinId','wealth'].sort());assert.equal(result.players[0].wealth,'1999999999999999999998');
  assert.equal(publicRanking([{id:2,name:'Debt_Player',skin:null,wealth:'-20'}],'time').players[0].skinId,null);
  for(const wealth of ['9e4','Infinity','123.4',9007199254740992])assert.throws(()=>publicRanking([{id:1,name:'Test',skin:0,wealth}],'time'));
});
test('podium formatting never rounds a balance through JavaScript Number',async()=>{
  const source=stripTypeScriptTypes(await readFile(new URL('../src/forbes/model.ts',import.meta.url),'utf8'),{mode:'transform'}),{fullWealth,compactWealth}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(fullWealth('9007199254740993').replace(/\s/g,''),'9007199254740993₴');assert.equal(compactWealth('6280000000'),'6,28 млрд ₴');assert.equal(compactWealth('3775000000'),'3,77 млрд ₴');assert.equal(compactWealth('1000000'),'1 млн ₴');assert.equal(compactWealth('-1500'),'−1,5 тис. ₴');assert.match(fullWealth('0'),/^0/);
});
test('invalid API JSON cannot reach BigInt/date rendering or inject extra players',async()=>{
  const source=stripTypeScriptTypes(await readFile(new URL('../src/forbes/model.ts',import.meta.url),'utf8'),{mode:'transform'}),{parseRanking}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const good={basis:'cash_plus_bank',limit:13,updatedAt:new Date(0).toISOString(),players:[{id:1,rank:1,nickname:'Test_Player',skinId:223,wealth:'9007199254740993'}]};
  assert.deepEqual(parseRanking(good),good);
  for(const bad of [null,{...good,updatedAt:'bad'},{...good,limit:999},{...good,players:[{...good.players[0],wealth:'NaN'}]},{...good,players:[{...good.players[0],rank:2}]},{...good,players:[good.players[0],{...good.players[0],rank:2}]}])assert.throws(()=>parseRanking(bad));
});
test('expired ranking refresh sees changed balances, then reports DB failure instead of claiming fresh data',async()=>{
  let now=1000000,wealth='100',broken=false;const handler=createForbesHandler({now:()=>now,pool:()=>({execute:async()=>{if(broken)throw Error('synthetic failure');return [[{id:1,name:'Test_Player',skin:21,wealth}]];}})});
  assert.equal((await forbesCall(handler)).body.players[0].wealth,'100');wealth='200';assert.equal((await forbesCall(handler)).body.players[0].wealth,'100');now+=60001;assert.equal((await forbesCall(handler)).body.players[0].wealth,'200');broken=true;now+=60001;assert.equal((await forbesCall(handler)).code,503);broken=false;assert.equal((await forbesCall(handler)).code,200);
});
