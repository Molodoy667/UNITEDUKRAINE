import {createHmac, randomBytes, randomUUID} from 'node:crypto';
import {digest, equal, fail} from '../account/core.js';
import {entities, selectFields, joinOwner} from './catalog.js';

// These are proposals, not game commands. Wallets, permissions, ownership,
// coordinates and credentials intentionally have no editor at this stage.
export const proposalFields={
  players:{skin:{label:'ID скіна',kind:'integer',min:0,max:30000}},
  houses:{name:{label:'Назва будинку',kind:'text',maxLength:19}},
  businesses:{name:{label:'Назва бізнесу',kind:'text',maxLength:29}},
  vehicles:{color_1:{label:'Колір 1',kind:'integer',min:0,max:255},color_2:{label:'Колір 2',kind:'integer',min:0,max:255}},
  apartments:{locked:{label:'Замкнено (0 або 1)',kind:'integer',min:0,max:1}},
};
const localSecret=randomBytes(32).toString('hex');
const secret=()=>{
  const value=process.env.ACCOUNT_RATE_SECRET||process.env.FORUM_IP_SECRET;
  if((process.env.NODE_ENV==='production'||process.env.VERCEL)&&(!value||value.length<32))fail(503,'admin_unconfigured','Налаштуйте серверний секрет адміністративних запитів.');
  return value||localSecret;
};
const sign=value=>createHmac('sha256',secret()).update(value).digest('hex');
const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function recordVersion(entity,item){
  return digest(JSON.stringify(entities[entity].columns.map(key=>[key,item[key]===null?null:String(item[key])])));
}
export function changeBody(request){
  let body;try{body=typeof request.body==='string'?JSON.parse(request.body):request.body;}catch{fail(400,'invalid_body','Некоректний JSON.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>16384)fail(400,'invalid_body','Некоректний або завеликий запит.');
  return body;
}
function reason(value){
  if(typeof value!=='string'||value.trim().length<10||value.trim().length>500||/[\x00-\x08\x0b-\x1f\x7f]/u.test(value))fail(400,'invalid_reason','Вкажіть причину: від 10 до 500 символів, без службових кодів.');
  return value.trim();
}
export function proposal(entity,values,item){
  if(typeof entity!=='string'||!Object.hasOwn(proposalFields,entity)||!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).length)fail(400,'invalid_fields','Немає дозволених полів для зміни.');
  const changes={};
  for(const key of Object.keys(values).sort()){
    if(!Object.hasOwn(proposalFields[entity],key))fail(400,'invalid_fields','Це поле не можна змінювати через панель.');
    const rule=proposalFields[entity][key];let value=values[key];
    if(rule.kind==='integer'){
      if(!['string','number'].includes(typeof value)||!/^\d{1,6}$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<rule.min||Number(value)>rule.max)fail(400,'invalid_value',`Поле «${rule.label}»: ${rule.min}–${rule.max}.`);
      value=Number(value);
    }else{
      if(typeof value!=='string'||!value.trim()||value.trim().length>rule.maxLength||/[\x00-\x1f\x7f{}"\\]/u.test(value)||/[^\u0000-\uFFFF]/u.test(value))fail(400,'invalid_value',`Поле «${rule.label}»: до ${rule.maxLength} символів, без керівних/колірних кодів, подвійних лапок і зворотної риски.`);
      value=value.trim();
    }
    if(String(value)!==String(item[key]))changes[key]={before:item[key],after:value};
  }
  if(!Object.keys(changes).length)fail(400,'no_changes','Значення не змінилися.');
  return changes;
}
async function record(db,entity,id){
  if(typeof entity!=='string'||!Object.hasOwn(entities,entity)||!Number.isSafeInteger(id)||id<1||id>2147483647)fail(400,'invalid_target','Некоректний об’єкт.');
  const info=entities[entity];
  const [item]=await rows(db,`SELECT ${selectFields(info)} FROM \`${info.table}\` a${joinOwner(info)} WHERE a.id=?`,[id]);
  if(!item)fail(404,'not_found','Запис не знайдено.');return item;
}
async function limit(db,user){
  await rows(db,'INSERT INTO site_admin_limits(actor_id,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[user.id]);
  const [row]=await rows(db,'SELECT attempts FROM site_admin_limits WHERE actor_id=?',[user.id]);
  if(Number(row.attempts)>120)fail(429,'rate_limited','Забагато операцій. Повторіть через 15 хвилин.');
}
export function createChangeService({clock=()=>Date.now()}={}){
  async function preview(db,user,body){
    await limit(db,user);
    const item=await record(db,body.entity,body.id),version=recordVersion(body.entity,item);
    if(body.version!==version)fail(409,'stale_record','Запис змінився. Закрийте картку й відкрийте її знову.');
    const changes=proposal(body.entity,body.values,item),text=reason(body.reason);
    const data={actor:Number(user.id),session:digest(user.session_id),entity:body.entity,id:body.id,version,changes,reason:text,expires:clock()+10*60*1000};
    const encoded=Buffer.from(JSON.stringify(data)).toString('base64url');
    return {entity:body.entity,id:body.id,changes,reason:text,expiresAt:new Date(data.expires).toISOString(),token:`${encoded}.${sign(encoded)}`,applied:false};
  }
  function verified(user,body){
    if(typeof body.token!=='string'||body.token.length>12000||!uuid(body.requestId))fail(400,'invalid_preview','Повторіть перегляд змін.');
    const [encoded,signature,...extra]=body.token.split('.');
    if(extra.length||!signature||!equal(signature,sign(encoded)))fail(400,'invalid_preview','Підтвердження змін пошкоджене.');
    let data;try{data=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{fail(400,'invalid_preview','Некоректне підтвердження.');}
    if(data.actor!==Number(user.id)||data.session!==digest(user.session_id))fail(403,'preview_owner','Перегляньте зміни у своєму поточному сеансі.');
    return data;
  }
  async function confirm(pool,user,body){
    const data=verified(user,body),payloadHash=digest(body.token),db=await pool.getConnection();
    try{
      await db.beginTransaction();
      // Unique request and target keys also serialize concurrent requests. There
      // is deliberately no UPDATE against any game table in this module.
      const [existing]=await rows(db,'SELECT id,payload_hash,status FROM site_admin_changes WHERE actor_id=? AND request_id=?',[user.id,body.requestId]);
      if(existing){if(existing.payload_hash!==payloadHash)fail(409,'idempotency_conflict','Ключ запиту вже використаний для інших змін.');await db.commit();return {id:existing.id,status:existing.status,applied:false,replayed:true};}
      if(data.expires<clock())fail(409,'preview_expired','Час підтвердження минув. Перегляньте зміни знову.');
      await limit(db,user);
      const item=await record(db,data.entity,data.id);
      if(recordVersion(data.entity,item)!==data.version)fail(409,'stale_record','Запис змінився після перегляду. Відкрийте картку знову.');
      const id=randomUUID();
      await rows(db,'INSERT INTO site_admin_changes(id,actor_id,request_id,payload_hash,entity,record_id,record_version,changes,reason,active_target) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,user.id,body.requestId,payloadHash,data.entity,data.id,data.version,JSON.stringify(data.changes),data.reason,`${data.entity}:${data.id}`]);
      await rows(db,"INSERT INTO site_admin_audit(change_id,actor_id,event,reason) VALUES(?,?,'submitted',?)",[id,user.id,data.reason]);
      await db.commit();return {id,status:'awaiting_bridge',applied:false,replayed:false};
    }catch(error){await db.rollback();
      if(error.code==='ER_DUP_ENTRY'){
        // Reuse this connection after rollback: asking a two-connection pool for
        // another one here can deadlock simultaneous conflicting submissions.
        const [existing]=await rows(db,'SELECT id,payload_hash,status FROM site_admin_changes WHERE actor_id=? AND request_id=?',[user.id,body.requestId]);
        if(existing?.payload_hash===payloadHash)return {id:existing.id,status:existing.status,applied:false,replayed:true};
        fail(409,'pending_conflict','Для цього об’єкта вже є заявка або цей ключ запиту зайнятий. Перевірте журнал.');
      }
      throw error;
    }finally{db.release();}
  }
  async function cancel(pool,user,body){
    if(!uuid(body.id))fail(400,'invalid_id','Некоректний ID заявки.');const text=reason(body.reason),db=await pool.getConnection();
    try{
      await db.beginTransaction();await limit(db,user);
      const [item]=await rows(db,'SELECT id,status FROM site_admin_changes WHERE id=? FOR UPDATE',[body.id]);
      if(!item)fail(404,'not_found','Заявку не знайдено.');
      if(item.status==='cancelled'){await db.commit();return {id:item.id,status:'cancelled',applied:false,replayed:true};}
      if(!['awaiting_bridge','queued'].includes(item.status))fail(409,'invalid_status','Цю заявку вже не можна скасувати.');
      await rows(db,"UPDATE site_admin_changes SET status='cancelled',active_target=NULL,cancelled_at=UTC_TIMESTAMP() WHERE id=?",[item.id]);
      await rows(db,"UPDATE site_admin_dispatch SET finished_at=UTC_TIMESTAMP(),result_code='cancelled' WHERE change_id=? AND finished_at IS NULL",[item.id]);
      await rows(db,"INSERT INTO site_admin_audit(change_id,actor_id,event,reason) VALUES(?,?,'cancelled',?)",[item.id,user.id,text]);
      await db.commit();return {id:item.id,status:'cancelled',applied:false,replayed:false};
    }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
  async function history(db,params){
    const status=params.get('status')||'all',page=Number(params.get('page')||1);
    if(!['all','awaiting_bridge','queued','applied','rejected','cancelled'].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000)fail(400,'invalid_filter','Некоректний фільтр журналу.');
    const where=status==='all'?'1=1':'c.status=?',values=status==='all'?[]:[status];
    const [count]=await rows(db,`SELECT COUNT(*) total FROM site_admin_changes c WHERE ${where}`,values),total=Number(count.total),pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
    const items=await rows(db,`SELECT c.id,c.actor_id,c.entity,c.record_id,c.changes,c.reason,c.status,c.created_at,c.cancelled_at,a.name actor_name,d.result_code,d.finished_at FROM site_admin_changes c LEFT JOIN accounts_1101 a ON a.id=c.actor_id LEFT JOIN site_admin_dispatch d ON d.change_id=c.id WHERE ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT 20 OFFSET ${(current-1)*20}`,values);
    const events=items.length?await rows(db,`SELECT CAST(e.id AS CHAR) id,e.change_id,e.actor_id,e.event,e.reason,e.created_at,a.name actor_name FROM site_admin_audit e LEFT JOIN accounts_1101 a ON a.id=e.actor_id WHERE e.change_id IN (${items.map(()=>'?').join(',')}) ORDER BY e.id ASC`,items.map(i=>i.id)):[];
    return {items:items.map(item=>({...item,changes:parse(item.changes),events:events.filter(event=>event.change_id===item.id)})),total,page:current,pages};
  }
  return {preview,confirm,cancel,history};
}
