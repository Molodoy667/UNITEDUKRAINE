import {digest,equal,fail} from '../account/core.js';
import {validTotp} from '../forum/core.js';
import {readAccountSession} from '../account/service.js';
import {entities,selectFields,joinOwner} from './catalog.js';
import {recordVersion,proposal} from './changes.js';

const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
export const bridgeId=()=>{
  const value=process.env.ADMIN_BRIDGE_ID;
  return typeof value==='string'&&/^[a-z0-9_-]{1,48}$/.test(value)?value:null;
};
export async function bridgeStatus(db){
  const id=bridgeId();if(!id)return {configured:false,available:false,reason:'unconfigured',capabilities:{}};
  const [item]=await rows(db,'SELECT bridge_id,protocol,enabled,capabilities,heartbeat_at,detail_code,(heartbeat_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 SECOND)) fresh FROM site_admin_bridge WHERE bridge_id=?',[id]);
  if(!item)return {configured:true,available:false,reason:'not_started',capabilities:{}};
  const raw=typeof item.capabilities==='string'?JSON.parse(item.capabilities):item.capabilities;
  const capabilities=Object.fromEntries(Object.keys(entities).map(key=>[key,raw?.[key]===true||raw?.[key]===1]));
  const reason=!Number(item.fresh)?'stale_heartbeat':Number(item.enabled)!==1?'disabled':Number(item.protocol)!==1?'protocol_mismatch':item.detail_code;
  return {configured:true,available:reason==='ready',reason,bridgeId:id,checkedAt:item.heartbeat_at,capabilities};
}
export async function dispatchChange(pool,request,user,body){
  if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id)||typeof body.password!=='string'||body.password.length>84)fail(400,'invalid_dispatch','Вкажіть заявку та пароль ігрового акаунта.');
  // Count failed step-up attempts outside the transaction so rollback cannot
  // undo throttling. Never log or persist the password/TOTP payload.
  await rows(pool,'INSERT INTO site_admin_limits(actor_id,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[user.id]);
  const [attempt]=await rows(pool,'SELECT attempts FROM site_admin_limits WHERE actor_id=?',[user.id]);
  if(Number(attempt.attempts)>120)fail(429,'rate_limited','Забагато операцій. Повторіть через 15 хвилин.');
  const bucket=digest(`admin-dispatch:${user.id}`);
  await rows(pool,'INSERT INTO site_account_limits(bucket,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[bucket]);
  const [stepLimit]=await rows(pool,'SELECT attempts FROM site_account_limits WHERE bucket=?',[bucket]);
  if(Number(stepLimit.attempts)>10)fail(429,'rate_limited','Повторне підтвердження обмежене 10 спробами за 15 хвилин.');
  const db=await pool.getConnection();
  try{
    await db.beginTransaction();
    const [change]=await rows(db,'SELECT * FROM site_admin_changes WHERE id=? FOR UPDATE',[body.id]);
    if(!change)fail(404,'not_found','Заявку не знайдено.');
    // Lock identity through commit: a concurrent demotion/password update must
    // not authorize a write from stale credentials already read by the handler.
    await rows(db,'SELECT id FROM accounts_1101 WHERE id=? FOR UPDATE',[user.id]);
    const current=await readAccountSession(request,db);
    if(!current||Number(current.admin)!==12)fail(403,'forbidden','Потрібен актуальний доступ адміністратора рівня 12.');
    if(!equal(body.password,current.players_password))fail(401,'step_up_required','Неправильний пароль ігрового акаунта.');
    let step=null;
    if(Number(current.google_auth)>0){if(!/^[A-Z2-7]{16,64}$/.test(String(current.google_code||'')))fail(403,'totp_unavailable','Захист акаунта потребує перевірки адміністрацією.');step=validTotp(current.google_code,body.code);if(step===null)fail(401,'totp_required','Введіть актуальний код Google Authenticator.');}
    if(change.status!=='awaiting_bridge'){
      if(['queued','applied','rejected'].includes(change.status)){await db.commit();return {id:change.id,status:change.status,applied:change.status==='applied',replayed:true};}
      fail(409,'invalid_status','Заявка скасована або більше не доступна для відправлення.');
    }
    const bridge=await bridgeStatus(db);
    if(!bridge.available)fail(503,'bridge_unavailable','Ігровий міст не підключений або його heartbeat застарів.');
    if(bridge.capabilities?.[change.entity]!==true&&bridge.capabilities?.[change.entity]!==1)fail(409,'engine_blocked','Цей розділ не готовий до транзакційної зміни. Потрібна перевірка рушія таблиці на сервері.');
    if(!Object.hasOwn(entities,change.entity))fail(409,'invalid_target','Непідтримуваний об’єкт.');
    const entity=entities[change.entity],[item]=await rows(db,`SELECT ${selectFields(entity)} FROM \`${entity.table}\` a${joinOwner(entity)} WHERE a.id=?`,[change.record_id]);
    if(!item||recordVersion(change.entity,item)!==change.record_version)fail(409,'stale_record','Дані змінилися. Скасуйте заявку й підготуйте нову.');
    const changes=typeof change.changes==='string'?JSON.parse(change.changes):change.changes;
    proposal(change.entity,Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,value.after])),item);
    if(step!==null){
      await rows(db,'INSERT IGNORE INTO site_account_totp_steps(account_id,last_step) VALUES(?,-1)',[user.id]);
      const [previous]=await rows(db,'SELECT last_step FROM site_account_totp_steps WHERE account_id=? FOR UPDATE',[user.id]);
      if(Number(previous.last_step)>=step)fail(401,'totp_reused','Зачекайте на новий код Google Authenticator.');
      await rows(db,'UPDATE site_account_totp_steps SET last_step=? WHERE account_id=?',[step,user.id]);
    }
    const snapshot=Object.fromEntries(entity.columns.map(key=>[key,item[key]===null?null:String(item[key])]));
    await rows(db,'INSERT INTO site_admin_dispatch(change_id,bridge_id,dispatched_by,snapshot,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))',[change.id,bridge.bridgeId,user.id,JSON.stringify(snapshot)]);
    await rows(db,"UPDATE site_admin_changes SET status='queued' WHERE id=?",[change.id]);
    await rows(db,"INSERT INTO site_admin_audit(change_id,actor_id,event,reason) VALUES(?,?,'dispatched','Explicit dispatch after game password / enabled TOTP verification')",[change.id,user.id]);
    await db.commit();return {id:change.id,status:'queued',applied:false,replayed:false};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
