import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAdminHandler} from '../lib/admin/service.js';
import {createAccountHandler} from '../lib/account/service.js';
import {entities} from '../lib/admin/catalog.js';
import {digest} from '../lib/account/core.js';
import {totp} from '../lib/forum/core.js';
const origin='http://127.0.0.1:5173';
async function call(handler,action,params={},actor={},body){
  const request={method:body===undefined?'GET':'POST',url:`/api/admin?${new URLSearchParams({action,...params})}`,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...actor.headers},socket:{remoteAddress:'127.0.0.1'},body};
  const response={headers:{},status(code){this.code=code;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;}};await handler(request,response);return response;
}
test('admin panel SQL, real session access boundary and ownership filters in isolated MariaDB',async t=>{
  const db=await rouletteDatabase(),{pool}=db;let names=['Alex_United','Unknown_Player'];
  const handler=createAdminHandler({pool:()=>pool,getOnline:async()=>({names,checkedAt:new Date().toISOString()})});
  const account=createAccountHandler({pool:()=>pool,getPresence:async()=>({online:false})});
  let admin,player;
  try{
    for(const entity of Object.values(entities)){
      const [columns]=await pool.query(`SHOW COLUMNS FROM \`${entity.table}\``),found=new Set(columns.map(c=>c.Field));
      for(const column of entity.columns)if(!found.has(column))await pool.query(`ALTER TABLE \`${entity.table}\` ADD COLUMN \`${column}\` ${column==='name'?'VARCHAR(60)':'BIGINT'} DEFAULT ${column==='name'?"''":0}`);
    }
    await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
    for(const entity of ['houses','businesses','apartments','vehicles']){
      const table=entities[entity].table;
      for(const [id,owner] of [[1,73],[2,0],[3,999]])await pool.query(`INSERT INTO \`${table}\` SET ?`,{id,owner_id:owner,...(entity==='houses'||entity==='businesses'?{name:id===2?'Free_Test':'Owned_Test',price:10000+id}:{}),...(entity==='vehicles'?{model_id:411,number:`AA${id}`,famcar:0}:{}),...(entity==='apartments'?{app_id:2,floor:3,apt_num:1,price:10000}:{} )});
    }
    const login=async email=>{const result=await call(account,'login',{}, {},{email,password:'Synthetic-Game-Password'});assert.equal(result.code,200);return {cookie:result.headers['Set-Cookie'].split(';')[0],csrf:result.body.csrf};};
    await t.test('real admin session is required, ordinary accounts cannot enumerate data',async()=>{
      admin=await login('player@example.test');player=await login('other@example.test');assert.equal((await call(handler,'overview')).code,401);assert.equal((await call(handler,'overview',{},player)).code,403);assert.equal((await call(handler,'list',{entity:'players',admin:'12'},player)).code,403);
    });
    await t.test('statistics and online list are verified and do not expose credentials',async()=>{
      const overview=await call(handler,'overview',{},admin);assert.equal(overview.code,200,JSON.stringify(overview.body));assert.equal(overview.body.stats.players.total,2);assert.equal(overview.body.stats.houses.free,1);assert.equal(overview.body.online.count,2);
      const online=await call(handler,'online',{},admin);assert.equal(online.body.items.length,1);assert.deepEqual(online.body.unmatched,['Unknown_Player']);assert.equal(online.body.items[0].name,'Alex_United');
      names=null;assert.equal((await call(handler,'online',{},admin)).body.error,'online_unavailable');names=[];assert.deepEqual((await call(handler,'online',{},admin)).body.items,[]);
    });
    await t.test('all five lists and record cards execute real SQL; free and owner filters match',async()=>{
      for(const entity of Object.keys(entities)){
        const result=await call(handler,'list',{entity},admin);assert.equal(result.code,200,JSON.stringify(result.body));assert.ok(result.body.items.length);assert.doesNotMatch(JSON.stringify(result.body),/password|email|google_code|serialid/);
        const detail=await call(handler,'detail',{entity,id:String(result.body.items[0].id)},admin);assert.equal(detail.code,200);assert.equal(detail.body.editable,false);
        if(entity!=='players'){
          const free=await call(handler,'list',{entity,filter:'free'},admin);assert.deepEqual(free.body.items.map(i=>i.id),[2]);
          const owned=await call(handler,'list',{entity,ownerId:'73'},admin);assert.deepEqual(owned.body.items.map(i=>i.id),[1]);assert.equal(owned.body.items[0].owner_name,'Alex_United');
        }
      }
    });
    await t.test('numeric money sorting, literal wildcard search and pagination are correct',async()=>{
      await pool.execute("UPDATE accounts_1101 SET money='9007199254740993',bank='100' WHERE id=999");
      const rich=await call(handler,'list',{entity:'players',sort:'wealth'},admin);assert.equal(rich.body.items[0].id,999);assert.equal(rich.body.items[0].wealth,'9007199254741093');
      assert.equal((await call(handler,'list',{entity:'houses',q:'%'},admin)).body.total,0);assert.equal((await call(handler,'list',{entity:'houses',q:"' OR 1=1 --"},admin)).body.total,0);
      assert.equal((await call(handler,'list',{entity:'houses',q:'Owned_Test'},admin)).body.total,2);
      const paged=await call(handler,'list',{entity:'players',page:'9999',size:'10'},admin);assert.equal(paged.body.page,1);assert.equal(paged.body.total,2);
    });
    await t.test('family vehicles are not incorrectly attributed to a player with the same numeric ID',async()=>{
      await pool.query('INSERT INTO ownable_cars SET ?',{id:4,owner_id:73,model_id:400,number:'FAMILY',famcar:1});
      const family=await call(handler,'list',{entity:'vehicles',filter:'family'},admin);assert.equal(family.body.items.length,1);assert.equal(family.body.items[0].owner_name,null);
      const owned=await call(handler,'list',{entity:'vehicles',ownerId:'73'},admin);assert.deepEqual(owned.body.items.map(i=>i.id),[1]);
    });
    const proposal=async(entity,id,values,actor=admin)=>{
      const detail=await call(handler,'detail',{entity,id:String(id)},actor);assert.equal(detail.code,200);
      return call(handler,'preview',{},actor,{entity,id,version:detail.body.version,values,reason:'Synthetic operator request for a controlled change.'});
    };
    await t.test('preview and confirmation enforce session, role, CSRF, trusted origin and bounded JSON',async()=>{
      const body={entity:'houses',id:1,values:{name:'Edited'},reason:'Synthetic reason'};
      assert.equal((await call(handler,'preview',{}, {},body)).code,401);
      assert.equal((await call(handler,'preview',{},player,body)).code,403);
      assert.equal((await call(handler,'preview',{}, {...admin,csrf:''},body)).body.error,'csrf_rejected');
      assert.equal((await call(handler,'preview',{}, {...admin,headers:{origin:'https://untrusted.test'}},body)).body.error,'origin_rejected');
      assert.equal((await call(handler,'preview',{}, {...admin,headers:{'content-type':'text/plain'}},body)).code,415);
      assert.equal((await call(handler,'preview',{},admin,'not-json')).code,400);
      assert.equal((await call(handler,'preview',{},admin,{...body,reason:'x'.repeat(20000)})).code,400);
      assert.equal((await call(handler,'preview',{},admin,body)).body.error,'stale_record');
      assert.equal((await call(handler,'confirm',{},admin)).code,404);
      assert.equal((await proposal('players',999,{admin:12})).body.error,'invalid_fields');
      assert.equal((await proposal('players',999,{money:'900000'})).body.error,'invalid_fields');
      assert.equal((await proposal('vehicles',1,{owner_id:999})).body.error,'invalid_fields');
      assert.equal((await proposal('houses',1,{name:'bad{FF0000}color'})).code,400);
      const preview=await proposal('houses',1,{name:'Queued House'});assert.equal(preview.code,200,JSON.stringify(preview.body));
      const token=preview.body.token;assert.equal((await call(handler,'confirm',{},admin,{token:token+'x',requestId:crypto.randomUUID()})).body.error,'invalid_preview');
      const newSession=await login('player@example.test');
      assert.equal((await call(handler,'confirm',{},newSession,{token,requestId:crypto.randomUUID()})).body.error,'preview_owner');
      assert.equal((await call(handler,'confirm',{},admin,{token,requestId:'not-a-uuid'})).code,400);
    });
    await t.test('confirmation detects changes since preview and stores nothing on stale records',async()=>{
      const preview=await proposal('houses',1,{name:'Queued House'});assert.equal(preview.code,200);
      await pool.execute("UPDATE houses SET name='Game changed this' WHERE id=1");
      const confirm=await call(handler,'confirm',{},admin,{token:preview.body.token,requestId:crypto.randomUUID()});assert.equal(confirm.body.error,'stale_record');
      const [[count]]=await pool.query('SELECT COUNT(*) n FROM site_admin_changes');assert.equal(count.n,0);
    });
    await t.test('all five proposal forms persist queue and audit atomically without touching game tables',async()=>{
      const cases=[['players',999,{skin:224}],['houses',1,{name:'Queued House'}],['businesses',1,{name:'Queued Business'}],['vehicles',1,{color_1:23,color_2:44}],['apartments',1,{locked:1}]];
      const snapshot=async()=>Promise.all(Object.values(entities).map(async entity=>(await pool.query(`SELECT * FROM \`${entity.table}\` ORDER BY id`))[0]));
      const before=await snapshot();
      for(const [entity,id,values] of cases){
        const preview=await proposal(entity,id,values);assert.equal(preview.code,200,JSON.stringify(preview.body));
        const confirmed=await call(handler,'confirm',{},admin,{token:preview.body.token,requestId:crypto.randomUUID()});assert.equal(confirmed.code,200,JSON.stringify(confirmed.body));assert.equal(confirmed.body.applied,false);assert.equal(confirmed.body.status,'awaiting_bridge');
        const [[event]]=await pool.execute('SELECT event,actor_id FROM site_admin_audit WHERE change_id=?',[confirmed.body.id]);assert.equal(event.event,'submitted');assert.equal(event.actor_id,73);
      }
      assert.deepEqual(await snapshot(),before);
      const history=await call(handler,'changes',{},admin);assert.equal(history.code,200);assert.equal(history.body.total,5);assert.ok(history.body.items.every(i=>i.events.length===1));assert.doesNotMatch(JSON.stringify(history.body),/password|credential|google_code|payload_hash|record_version|token/);
      assert.equal((await call(handler,'changes',{status:'unsupported'},admin)).code,400);
      assert.equal((await call(handler,'changes',{page:'0'},admin)).code,400);
    });
    await t.test('pending targets cannot be overwritten; cancellation appends audit exactly once and allows a new request',async()=>{
      const preview=await proposal('houses',1,{name:'Next House'});assert.equal(preview.code,200);
      const body={token:preview.body.token,requestId:crypto.randomUUID()};
      assert.equal((await call(handler,'confirm',{},admin,body)).body.error,'pending_conflict');
      const parallel=await Promise.all(Array.from({length:3},()=>call(handler,'confirm',{},admin,{...body,requestId:crypto.randomUUID()})));assert.ok(parallel.every(r=>r.code===409),JSON.stringify(parallel));
      const history=await call(handler,'changes',{},admin),house=history.body.items.find(i=>i.entity==='houses');
      const cancel={id:house.id,reason:'Cancel synthetic request before replacement.'};
      const results=await Promise.all([call(handler,'cancel',{},admin,cancel),call(handler,'cancel',{},admin,cancel)]);assert.deepEqual(results.map(r=>r.code),[200,200]);assert.equal(results.filter(r=>!r.body.replayed).length,1);
      const [[count]]=await pool.execute("SELECT COUNT(*) n FROM site_admin_audit WHERE change_id=? AND event='cancelled'",[house.id]);assert.equal(count.n,1);
      const confirmed=await call(handler,'confirm',{},admin,body);assert.equal(confirmed.code,200);assert.equal(confirmed.body.applied,false);
      const filtered=await call(handler,'changes',{status:'cancelled'},admin);assert.equal(filtered.body.total,1);assert.equal(filtered.body.items[0].events.length,2);
      const [[game]]=await pool.execute('SELECT name FROM houses WHERE id=1');assert.equal(game.name,'Game changed this');
    });
    await t.test('simultaneous confirmation retries create one queue row and one audit, including replay after cancellation',async()=>{
      const preview=await proposal('houses',2,{name:'Parallel House'});assert.equal(preview.code,200);
      const body={token:preview.body.token,requestId:crypto.randomUUID()};
      const results=await Promise.all([call(handler,'confirm',{},admin,body),call(handler,'confirm',{},admin,body)]);
      assert.deepEqual(results.map(r=>r.code),[200,200],JSON.stringify(results));assert.equal(results[0].body.id,results[1].body.id);assert.equal(results.filter(r=>!r.body.replayed).length,1);
      const id=results[0].body.id,[[count]]=await pool.execute('SELECT COUNT(*) n FROM site_admin_audit WHERE change_id=?',[id]);assert.equal(count.n,1);
      const another=await proposal('houses',3,{name:'Other House'});
      assert.equal((await call(handler,'confirm',{},admin,{...body,token:another.body.token})).body.error,'idempotency_conflict');
      await call(handler,'cancel',{},admin,{id,reason:'Synthetic cancellation for idempotency check.'});
      const retry=await call(handler,'confirm',{},admin,body);assert.equal(retry.code,200);assert.equal(retry.body.status,'cancelled');assert.equal(retry.body.replayed,true);
    });
    await t.test('audit insertion failure rolls the whole request back; no silent unaudited write',async()=>{
      const preview=await proposal('businesses',2,{name:'Audit failure test'});assert.equal(preview.code,200);
      const body={token:preview.body.token,requestId:crypto.randomUUID()};
      await pool.query("CREATE TRIGGER fail_admin_audit BEFORE INSERT ON site_admin_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'");
      try{const result=await call(handler,'confirm',{},admin,body);assert.equal(result.code,503);assert.doesNotMatch(JSON.stringify(result.body),/Synthetic|SQLSTATE/);const [[count]]=await pool.execute('SELECT COUNT(*) n FROM site_admin_changes WHERE request_id=?',[body.requestId]);assert.equal(count.n,0);}
      finally{await pool.query('DROP TRIGGER fail_admin_audit');}
      assert.equal((await call(handler,'confirm',{},admin,body)).code,200);
    });
    await t.test('admin write rate limit fails closed and migration creates only InnoDB website tables',async()=>{
      const [tables]=await pool.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'site_admin_%'");assert.equal(tables.length,5);assert.ok(tables.every(t=>t.ENGINE==='InnoDB'));
      await pool.execute('UPDATE site_admin_limits SET attempts=120,reset_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE actor_id=73');
      const result=await proposal('houses',3,{name:'Too many requests'});assert.equal(result.code,429);assert.equal(result.headers['Retry-After'],'900');
      await pool.execute('DELETE FROM site_admin_limits WHERE actor_id=73');
    });
    let bridgeChange;
    const dispatch=async(id,extra={},actor=admin)=>call(handler,'dispatch',{},actor,{id,password:'Synthetic-Game-Password',...extra});
    await t.test('bridge dispatch fails closed without configuration, current heartbeat, capability or password',async()=>{
      delete process.env.ADMIN_BRIDGE_ID;
      const history=await call(handler,'changes',{},admin);bridgeChange=history.body.items.find(i=>i.entity==='players');
      assert.equal((await call(handler,'bridge',{},admin)).body.available,false);
      assert.equal((await dispatch(bridgeChange.id)).body.error,'bridge_unavailable');
      assert.equal((await dispatch(bridgeChange.id,{password:'wrong'})).body.error,'step_up_required');
      assert.equal((await dispatch(bridgeChange.id,{},player)).code,403);
      process.env.ADMIN_BRIDGE_ID='integration-main';
      await pool.execute("INSERT INTO site_admin_bridge(bridge_id,instance_id,protocol,enabled,capabilities,heartbeat_at) VALUES('integration-main','synthetic-server',1,1,?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 SECOND))",[JSON.stringify({players:1,houses:0,apartments:1})]);
      assert.equal((await dispatch(bridgeChange.id)).body.error,'bridge_unavailable');
      await pool.execute("UPDATE site_admin_bridge SET heartbeat_at=UTC_TIMESTAMP() WHERE bridge_id='integration-main'");
      const house=history.body.items.find(i=>i.entity==='houses'&&i.status==='awaiting_bridge');
      assert.equal((await dispatch(house.id)).body.error,'engine_blocked');
      const [[count]]=await pool.query('SELECT COUNT(*) n FROM site_admin_dispatch');assert.equal(count.n,0);
    });
    await t.test('explicit dispatch persists exact snapshot but never directly updates game rows; retry and cancellation are safe',async()=>{
      const [[before]]=await pool.query('SELECT * FROM accounts_1101 WHERE id=999');
      const result=await dispatch(bridgeChange.id);assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(result.body.status,'queued');assert.equal(result.body.applied,false);
      const again=await dispatch(bridgeChange.id);assert.equal(again.body.replayed,true);
      const [[queued]]=await pool.execute('SELECT snapshot,expires_at,created_at FROM site_admin_dispatch WHERE change_id=?',[bridgeChange.id]);
      const snapshot=typeof queued.snapshot==='string'?JSON.parse(queued.snapshot):queued.snapshot;assert.equal(snapshot.skin,String(before.skin));assert.equal(snapshot.money,String(before.money));assert.equal(Object.keys(snapshot).length,entities.players.columns.length);assert.equal((queued.expires_at-queued.created_at)/1000,300);
      assert.doesNotMatch(JSON.stringify(snapshot),/password|google_code|email/);
      const [[after]]=await pool.query('SELECT * FROM accounts_1101 WHERE id=999');assert.deepEqual(after,before);
      assert.equal((await call(handler,'changes',{status:'queued'},admin)).body.total,1);
      assert.equal((await call(handler,'cancel',{},admin,{id:bridgeChange.id,reason:'Cancel dispatched request before game processing.'})).code,200);
      const [[cancelled]]=await pool.execute('SELECT result_code,finished_at FROM site_admin_dispatch WHERE change_id=?',[bridgeChange.id]);assert.equal(cancelled.result_code,'cancelled');assert.ok(cancelled.finished_at);
      assert.equal((await dispatch(bridgeChange.id)).body.error,'invalid_status');
    });
    await t.test('dispatch requires enabled game TOTP and rejects reuse of the login step',async()=>{
      await pool.execute('DELETE FROM site_account_limits WHERE bucket=?',[digest('admin-dispatch:73')]);
      const secret='JBSWY3DPEHPK3PXP',step=Math.floor(Date.now()/30000);
      await pool.execute('UPDATE accounts_1101 SET google_auth=1,google_code=? WHERE id=73',[secret]);
      const signed=await call(account,'login',{}, {},{email:'player@example.test',password:'Synthetic-Game-Password',code:totp(secret,step)});assert.equal(signed.code,200);
      const actor={cookie:signed.headers['Set-Cookie'].split(';')[0],csrf:signed.body.csrf};
      const preview=await proposal('houses',3,{name:'TOTP Test'},actor);assert.equal(preview.code,200);
      const saved=await call(handler,'confirm',{},actor,{token:preview.body.token,requestId:crypto.randomUUID()});assert.equal(saved.code,200);
      await pool.execute("UPDATE site_admin_bridge SET capabilities=?,heartbeat_at=UTC_TIMESTAMP() WHERE bridge_id='integration-main'",[JSON.stringify({players:1,houses:1,apartments:1})]);
      assert.equal((await dispatch(saved.body.id,{},actor)).body.error,'totp_required');
      assert.equal((await dispatch(saved.body.id,{code:totp(secret,step)},actor)).body.error,'totp_reused');
      const sent=await dispatch(saved.body.id,{code:totp(secret,step+1)},actor);assert.equal(sent.code,200,JSON.stringify(sent.body));
      await pool.execute("UPDATE accounts_1101 SET google_auth=0,google_code='' WHERE id=73");admin=await login('player@example.test');
    });
    await t.test('step-up failures remain throttled after transaction rollback',async()=>{
      const bucket=digest('admin-dispatch:73');await pool.execute('UPDATE site_account_limits SET attempts=10,reset_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE bucket=?',[bucket]);
      const result=await dispatch(bridgeChange.id);assert.equal(result.code,429);assert.equal(result.headers['Retry-After'],'900');
      await pool.execute('DELETE FROM site_account_limits WHERE bucket=?',[bucket]);
    });
    await t.test('no direct mutation API, no arbitrary entity, and demotion revokes already-issued admin access',async()=>{
      const [[before]]=await pool.query('SELECT COUNT(*) n FROM accounts_1101');assert.equal((await call(handler,'delete',{entity:'players',id:'999'},admin,{})).code,405);assert.equal((await call(handler,'detail',{entity:'__proto__',id:'1'},admin)).code,404);assert.equal((await call(handler,'detail',{entity:'players',id:'0'},admin)).code,400);assert.equal((await call(handler,'detail',{entity:'players',id:'10000'},admin)).code,404);
      const [[after]]=await pool.query('SELECT COUNT(*) n FROM accounts_1101');assert.equal(before.n,after.n);await pool.execute('UPDATE accounts_1101 SET admin=0 WHERE id=73');assert.equal((await call(handler,'overview',{},admin)).code,403);assert.equal((await call(handler,'preview',{},admin,{})).code,403);assert.equal((await call(handler,'changes',{},admin)).code,403);
    });
  }finally{await db.close();}
});
