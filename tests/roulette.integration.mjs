import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {rouletteDatabase} from './roulette-database.mjs';
import {createRouletteHandler} from '../lib/roulette/service.js';
import {createAccountHandler} from '../lib/account/service.js';
import {prizes,rarities,selectPrize} from '../lib/roulette/catalog.js';

const origin='http://127.0.0.1:5173';
async function call(handler,action='state',body,actor={},extra={}){
  const request={method:body===undefined?'GET':'POST',url:`/api/roulette?action=${action}`,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...extra.headers},socket:{remoteAddress:'127.0.0.1'},body,...extra.request};
  const response={headers:{},status(code){this.code=code;return this;},setHeader(key,value){this.headers[key]=value;},json(body){this.body=body;return this;}};
  await handler(request,response);return response;
}
test('roulette transactions on disposable MariaDB',async t=>{
  const system=await rouletteDatabase(),{pool}=system;let online=false;
  const handler=createRouletteHandler({pool:()=>pool,getPresence:async()=>({online}),pick:()=>prizes[5]});
  const account=createAccountHandler({pool:()=>pool,getPresence:async()=>({online})});
  const login=async email=>{const result=await call(account,'login',{email,password:'Synthetic-Game-Password'});assert.equal(result.code,200,JSON.stringify(result.body));return {cookie:result.headers['Set-Cookie'].split(';')[0],csrf:result.body.csrf};};
  const balance=async()=>Number((await pool.query('SELECT donate_current FROM accounts_1101 WHERE id=73'))[0][0].donate_current);
  const totals=async()=>{const [[s]]=await pool.query('SELECT COUNT(*) n FROM site_roulette_spins');const [[l]]=await pool.query('SELECT COUNT(*) n FROM site_roulette_ledger');return [Number(s.n),Number(l.n),await balance()];};
  const spin=async(payment='donate',requestId=randomUUID(),actor=player)=>call(handler,'spin',{payment,requestId},actor);
  const resolve=async(id,decision='sell',actor=player)=>call(handler,'resolve',{spinId:id,decision},actor);
  let player,other;
  try{
    await t.test('approved migration converts MyISAM without changing account values, and reruns safely',async()=>{
      assert.deepEqual(system.after,system.before);
      const [[row]]=await pool.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts_1101'");assert.equal(row.ENGINE,'InnoDB');
      const {migrateForum}=await import('../lib/forum/migrate.js');await migrateForum();assert.equal(await balance(),1450);
    });
    await t.test('authentication, Origin, CSRF, action/method and body validation',async()=>{
      assert.equal((await call(handler)).code,401);player=await login('player@example.test');other=await login('other@example.test');
      const body={payment:'donate',requestId:randomUUID()};
      assert.equal((await call(handler,'spin',body,{cookie:player.cookie})).code,403);
      assert.equal((await call(handler,'spin',body,player,{headers:{origin:'https://evil.test'}})).code,403);
      assert.equal((await call(handler,'spin',{payment:'free',requestId:'bad'},player)).code,400);
      assert.equal((await call(handler,'spin',body,player,{request:{method:'DELETE'}})).code,405);
      assert.equal((await call(handler,'state',{},player)).code,404);assert.deepEqual(await totals(),[0,0,1450]);
    });
    await t.test('one persistent free spin, saved server prize, pending recovery, owned collection',async()=>{
      const initial=await call(handler,'state',undefined,player);assert.equal(initial.body.freeSpins,1);assert.equal(initial.body.prizes.length,6);
      const requestId=randomUUID(),first=await spin('free',requestId);assert.equal(first.code,200);assert.equal(first.body.spin.prize.id,'aurora-gt');assert.equal(first.body.spin.cost,0);
      assert.equal((await spin('free',requestId)).body.spin.id,first.body.spin.id);assert.equal((await spin()).code,409);
      assert.equal((await resolve(first.body.spin.id,'keep',other)).code,404);
      const state=await call(handler,'state',undefined,player);assert.equal(state.body.pending.id,first.body.spin.id);assert.equal(state.body.freeSpins,0);
      assert.equal((await resolve(first.body.spin.id,'keep')).body.spin.status,'kept');assert.equal((await resolve(first.body.spin.id,'keep')).code,200);
      assert.equal((await resolve(first.body.spin.id,'sell')).code,409);assert.equal((await spin('free')).code,409);assert.deepEqual(await totals(),[1,0,1450]);
    });
    await t.test('paid spin debits 100 once, concurrent replay never double debits',async()=>{
      const requestId=randomUUID();const responses=await Promise.all([spin('donate',requestId),spin('donate',requestId)]);
      for(const result of responses)assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(responses[0].body.spin.id,responses[1].body.spin.id);
      assert.deepEqual(await totals(),[2,1,1350]);await resolve(responses[0].body.spin.id,'keep');
      assert.equal((await spin('free',requestId)).code,409);
    });
    await t.test('concurrent distinct spins allow just one pending prize',async()=>{
      const responses=await Promise.all([spin(),spin()]);assert.deepEqual(responses.map(r=>r.code).sort(),[200,409]);
      const result=responses.find(r=>r.code===200);assert.equal(await balance(),1250);
      const sales=await Promise.all([resolve(result.body.spin.id),resolve(result.body.spin.id)]);
      for(const result of sales)assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(await balance(),1350);
      const [[row]]=await pool.execute('SELECT COUNT(*) n FROM site_roulette_ledger WHERE spin_id=? AND kind=?',[result.body.spin.id,'sale']);assert.equal(Number(row.n),1);
      assert.equal((await resolve(result.body.spin.id,'keep')).code,409);
    });
    await t.test('insufficient funds rollback the prize and payment',async()=>{
      await pool.execute('UPDATE accounts_1101 SET donate_current=50 WHERE id=73');const before=await totals();assert.equal((await spin()).code,402);assert.deepEqual(await totals(),before);
      await pool.execute('UPDATE accounts_1101 SET donate_current=1350 WHERE id=73');
    });
    await t.test('online and unknown presence fail closed without changing donation',async()=>{
      const before=await totals();online=true;assert.equal((await spin()).code,409);online=null;assert.equal((await spin()).code,409);assert.deepEqual(await totals(),before);online=false;
      const first=await spin();online=true;assert.equal((await resolve(first.body.spin.id)).code,409);assert.equal(await balance(),1250);online=false;await resolve(first.body.spin.id,'keep');
    });
    await t.test('ledger failure rolls back an already executed game-account UPDATE and prize INSERT',async()=>{
      const before=await totals();await pool.query("CREATE TRIGGER roulette_test_fail BEFORE INSERT ON site_roulette_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic injected failure'");
      try{assert.equal((await spin()).code,503);assert.deepEqual(await totals(),before);}finally{await pool.query('DROP TRIGGER roulette_test_fail');}
      const first=await spin(),beforeSale=await totals();await pool.query("CREATE TRIGGER roulette_test_fail BEFORE INSERT ON site_roulette_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic sale failure'");
      try{assert.equal((await resolve(first.body.spin.id)).code,503);assert.deepEqual(await totals(),beforeSale);const state=await call(handler,'state',undefined,player);assert.equal(state.body.pending.id,first.body.spin.id);}finally{await pool.query('DROP TRIGGER roulette_test_fail');}
      await resolve(first.body.spin.id);
    });
    await t.test('MyISAM blocks payment until the operator-approved migration is applied',async()=>{
      await pool.query('ALTER TABLE accounts_1101 ENGINE=MyISAM');const before=await totals();
      try{assert.equal((await spin()).code,503);assert.deepEqual(await totals(),before);}finally{await pool.query('ALTER TABLE accounts_1101 ENGINE=InnoDB');}
    });
    await t.test('balances ignore client overrides, history excludes other accounts, session revocation',async()=>{
      const result=await call(handler,'spin',{payment:'donate',requestId:randomUUID(),cost:0,prize:prizes[0],accountId:999,admin:12},player);assert.equal(result.code,200);assert.equal(result.body.spin.cost,100);assert.equal(result.body.spin.prize.id,'aurora-gt');
      await resolve(result.body.spin.id);assert.equal((await call(handler,'state',undefined,other)).body.history.length,0);
      await pool.execute("UPDATE accounts_1101 SET players_password='Synthetic changed password' WHERE id=73");assert.equal((await call(handler,'state',undefined,player)).code,401);
    });
  }finally{await system.close();}
});
test('server draw boundaries and visual tape agree with all six published prizes',async()=>{
  assert.equal(prizes.length,6);assert.equal(rarities.length,6);assert.equal(prizes.reduce((sum,p)=>sum+p.weight,0),10000);
  let start=0;for(const prize of prizes){assert.equal(selectPrize(()=>start).id,prize.id);assert.equal(selectPrize(()=>start+prize.weight-1).id,prize.id);start+=prize.weight;}
  const source=stripTypeScriptTypes(await readFile(new URL('../src/roulette/model.ts',import.meta.url),'utf8'),{mode:'transform'});
  const {spinProgress,createTape}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(spinProgress(0),0);assert.equal(spinProgress(1),1);let last=0;
  for(let i=0;i<=12000;i++){const progress=spinProgress(i/12000);assert.ok(progress>=last&&progress<=1);last=progress;}
  for(const winner of prizes)for(let i=0;i<100;i++){const tape=createTape(prizes,winner);assert.equal(tape[96].id,winner.id);for(const prize of prizes)assert.ok(tape.slice(4,96).some(p=>p.id===prize.id));}
  for(const prize of prizes)assert.ok((await readFile(new URL(`../public${prize.image}`,import.meta.url))).length>100);
  assert.equal(prizes.find(p=>p.id==='maybach-x222').image,'/wiki/cars/429_2.png');
});
test('continuous synthesized audio loops throughout the spin and stops on finish/dispose',async()=>{
  const previous=globalThis.AudioContext,instances=[];
  class Node{constructor(){this.gain=this.frequency={value:0,setValueAtTime(){},setTargetAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}};this.Q={value:0};}connect(){}disconnect(){this.disconnected=true;}start(){this.started=true;}stop(){this.stopped=true;}}
  class Context{constructor(){this.nodes=[];this.sampleRate=100;this.currentTime=0;this.destination={};instances.push(this);}async resume(){this.resumed=true;}async close(){this.closed=true;}make(){const node=new Node();this.nodes.push(node);return node;}createGain(){return this.make();}createOscillator(){return this.make();}createBiquadFilter(){return this.make();}createBufferSource(){return this.make();}createBuffer(){return {getChannelData:()=>new Float32Array(100)};}}
  globalThis.AudioContext=Context;
  try{
    const source=stripTypeScriptTypes(await readFile(new URL('../src/roulette/sound.ts',import.meta.url),'utf8'),{mode:'transform'}),{RouletteSound}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const sound=new RouletteSound();await sound.unlock();sound.start();const ctx=instances[0],loop=ctx.nodes.find(n=>n.loop===true);assert.ok(ctx.resumed&&loop.started&&!loop.stopped);
    for(let i=0;i<120;i++){sound.speed(i/120);sound.tick();assert.equal(loop.stopped,undefined);}
    sound.mute(true);const count=ctx.nodes.length;sound.tick();assert.equal(ctx.nodes.length,count);sound.mute(false);sound.finish();assert.equal(loop.stopped,true);assert.ok(ctx.nodes.length>count);sound.dispose();assert.equal(ctx.closed,true);
  }finally{globalThis.AudioContext=previous;}
});
