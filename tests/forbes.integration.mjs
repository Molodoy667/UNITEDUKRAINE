import assert from 'node:assert/strict';
import {test} from 'node:test';
import {forbesDatabase,forbesFixtures} from './forbes-database.mjs';
import {createForbesHandler} from '../lib/forbes/service.js';

async function read(pool){const response={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await createForbesHandler({pool:()=>pool})({method:'GET',headers:{},url:'/api/forbes?limit=9999'},response);assert.equal(response.code,200,JSON.stringify(response.body));return response.body;}
test('Forbes uses the actual read-only SQL against disposable MariaDB',async t=>{
  const db=await forbesDatabase();
  try{
    await t.test('top three plus exactly ten subsequent accounts, ordered numerically by cash plus bank',async()=>{
      const [before]=await db.pool.query('SELECT * FROM accounts_1101 ORDER BY id'),data=await read(db.pool),[after]=await db.pool.query('SELECT * FROM accounts_1101 ORDER BY id');
      assert.equal(data.players.length,13);assert.deepEqual(data.players.map(p=>p.rank),Array.from({length:13},(_,i)=>i+1));assert.deepEqual(data.players.slice(0,3).map(p=>p.nickname),forbesFixtures.slice(0,3).map(p=>p.name));assert.equal(data.players[0].wealth,'6280000000');assert.deepEqual(after,before);
      assert.doesNotMatch(JSON.stringify(data),/private@example|Private-Test|password|donate_current|email/);
    });
    await t.test('bank is included, equal totals have deterministic ID order, and string 900 sorts below 10000',async()=>{
      await db.replace([{id:25,name:'Cash_Player',skin:21,money:'10000',bank:'0'},{id:20,name:'Bank_Player',skin:223,money:'900',bank:'20000'},{id:10,name:'Tied_Player',skin:190,money:'100',bank:'9900'},{id:30,name:'Last_Player',skin:7,money:'900',bank:'0'}]);
      const data=await read(db.pool);assert.deepEqual(data.players.map(p=>p.id),[20,10,25,30]);assert.equal(data.players[0].wealth,'20900');
    });
    await t.test('21-digit balances and totals beyond signed BIGINT and Number precision remain exact',async()=>{
      await db.replace([{id:1,name:'Exact_One',skin:21,money:'9007199254740993',bank:'0'},{id:2,name:'Exact_Two',skin:223,money:'9007199254740992',bank:'0'},{id:3,name:'Exact_Max',skin:190,money:'999999999999999999999',bank:'999999999999999999999'}]);
      const data=await read(db.pool);assert.deepEqual(data.players.map(p=>p.id),[3,1,2]);assert.equal(data.players[0].wealth,'1999999999999999999998');assert.equal(data.players[1].wealth,'9007199254740993');
    });
    await t.test('debt remains signed; malformed/NULL balances count as zero without partial numeric coercion',async()=>{
      await db.replace([{id:1,name:'Debt_Player',skin:21,money:'-100',bank:'20'},{id:2,name:'Invalid_Player',skin:223,money:'999999oops',bank:'1e8'},{id:3,name:'Null_Player',skin:null,money:null,bank:null},{id:4,name:'Positive_Player',skin:190,money:'-100',bank:'200'}]);
      const data=await read(db.pool);assert.deepEqual(data.players.map(p=>[p.id,p.wealth]),[[4,'100'],[2,'0'],[3,'0'],[1,'-80']]);
    });
    await t.test('an empty game table produces no fabricated podium or players',async()=>{
      await db.replace([]);const data=await read(db.pool);assert.deepEqual(data.players,[]);assert.equal(data.limit,13);
    });
  }finally{await db.close();}
});
