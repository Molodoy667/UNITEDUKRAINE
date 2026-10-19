import {createHash} from 'node:crypto';
import {fail} from '../account/core.js';
export const gameAddress={host:'51.75.44.14',port:2219};
export const settingsRules={
 seo:{siteName:120,title:180,description:400,keywords:500,siteUrl:'origin',image:'image'},
 home:{headline:100,highlight:100,description:600,aboutTitle:180,aboutText:1200,discordUrl:'url',trailerUrl:'url'},
 launcher:{version:80,downloadUrl:'url',resourcesEnabled:'boolean',resourcesUrl:'url',resourcesVersion:80,resourcesUpdateUrl:'url',maintenance:'boolean',maintenanceMessage:600},
};
const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
const json=value=>typeof value==='string'?JSON.parse(value):value;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function text(value,max,required=false){
 if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)||(required&&!value.trim()))fail(400,'invalid_content','Перевірте довжину та заповнення текстових полів.');return value.trim();
}
export function safeUrl(value,kind='url'){
 value=text(value,2048);if(!value)return '';
 if(kind==='image'&&/^\/(?!\/)[A-Za-z0-9_./%+-]+$/.test(value)&&!value.includes('..'))return value;
 let url;try{url=new URL(value);}catch{fail(400,'invalid_url','Посилання має починатися з https://.');}
 if(url.protocol!=='https:'||url.username||url.password)fail(400,'invalid_url','Дозволені лише HTTPS-посилання без логіна й пароля.');
 if(kind==='origin'&&(url.pathname!=='/'||url.search||url.hash))fail(400,'invalid_url','Вкажіть тільки адресу сайту, без шляху та параметрів.');
 return kind==='origin'?url.origin:url.href;
}
export function validateSettings(group,value){
 const rules=Object.hasOwn(settingsRules,group)?settingsRules[group]:null;
 if(!rules||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==Object.keys(rules).length||Object.keys(value).some(key=>!Object.hasOwn(rules,key)))fail(400,'invalid_settings','Непідтримувані поля налаштувань.');
 const result={};for(const [key,rule]of Object.entries(rules)){
  if(rule==='boolean'){if(typeof value[key]!=='boolean')fail(400,'invalid_boolean','Перемикач має бути true або false.');result[key]=value[key];}
  else result[key]=typeof rule==='number'?text(value[key],rule,['siteName','title','headline','highlight'].includes(key)):safeUrl(value[key],rule);
 }
 if(group==='seo'&&!result.siteUrl)fail(400,'invalid_url','Вкажіть основний HTTPS-домен сайту.');
 if(group==='launcher'&&result.resourcesEnabled&&(!result.resourcesUrl||!result.resourcesVersion))fail(400,'resources_incomplete','Для оновлення ресурсів потрібні URL та версія.');
 return result;
}
export function validateDocument(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'invalid_document','Некоректна сторінка.');
 const keys=['kind','slug','title','excerpt','body','image','category','seo_title','seo_description','published'];
 if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||!['page','news'].includes(value.kind)||typeof value.published!=='boolean')fail(400,'invalid_document','Перевірте поля сторінки.');
 const slug=text(value.slug,100,true);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'invalid_slug','Адреса: латиниця, цифри та одиночні дефіси.');
 return {kind:value.kind,slug,title:text(value.title,180,true),excerpt:text(value.excerpt,600),body:text(value.body,30000,true),image:safeUrl(value.image,'image'),category:text(value.category,60),seo_title:text(value.seo_title,180),seo_description:text(value.seo_description,400),published:value.published};
}
export const documentUrl=item=>item.kind==='news'?`/news/${item.slug}`:['contacts','terms','privacy'].includes(item.slug)?`/${item.slug}`:`/p/${item.slug}`;
const publicColumns='id,kind,slug,title,excerpt,body,image,category,seo_title,seo_description,published_at,updated_at';
export async function readSettings(db){
 const items=await rows(db,'SELECT setting_key,value_json,version,updated_at FROM site_settings');
 const settings=Object.fromEntries(items.filter(i=>Object.hasOwn(settingsRules,i.setting_key)).map(i=>[i.setting_key,{value:json(i.value_json),version:i.version,updatedAt:i.updated_at}]));
 if(Object.keys(settings).length!==3)fail(503,'site_unconfigured','Потрібна міграція налаштувань сайту.');return settings;
}
export async function readPublicSite(db){
 const settings=await readSettings(db);
 const news=await rows(db,`SELECT ${publicColumns} FROM site_documents WHERE kind='news' AND published=1 AND deleted_at IS NULL ORDER BY published_at DESC,id DESC LIMIT 12`);
 const pages=await rows(db,"SELECT id,kind,slug,title FROM site_documents WHERE kind='page' AND published=1 AND deleted_at IS NULL ORDER BY id LIMIT 100");
 return {seo:settings.seo.value,home:settings.home.value,launcher:settings.launcher.value,news:news.map(item=>({...item,url:documentUrl(item)})),pages:pages.map(item=>({...item,url:documentUrl(item)}))};
}
export async function readPublicDocument(db,kind,slug){
 if(!['page','news'].includes(kind)||typeof slug!=='string'||!slug||slug.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(404,'not_found','Сторінку не знайдено.');
 const [item]=await rows(db,`SELECT ${publicColumns} FROM site_documents WHERE kind=? AND slug=? AND published=1 AND deleted_at IS NULL`,[kind,slug]);
 if(!item)fail(404,'not_found','Сторінку не знайдено.');return {...item,url:documentUrl(item)};
}
export function cmsBody(request){let body;try{body=typeof request.body==='string'?JSON.parse(request.body):request.body;}catch{fail(400,'invalid_body','Некоректний JSON.');}if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>65536)fail(400,'invalid_body','Запит має бути до 64 КБ.');return body;}
export function createContentService(){
 async function read(db,action,params){
  if(action==='site-settings')return {settings:await readSettings(db)};
  if(action==='site-audit')return {items:await rows(db,'SELECT id,actor_id,event,target,created_at FROM site_content_audit ORDER BY id DESC LIMIT 50')};
  const kind=params.get('kind'),page=Number(params.get('page')||1),state=params.get('state')||'active';
  if(!['page','news'].includes(kind)||!Number.isInteger(page)||page<1||page>100000||!['active','trash'].includes(state))fail(400,'invalid_filter','Непідтримуваний фільтр.');
  const where=`kind=? AND deleted_at IS ${state==='trash'?'NOT ':''}NULL`,[count]=await rows(db,`SELECT COUNT(*) total FROM site_documents WHERE ${where}`,[kind]);
  const pages=Math.max(1,Math.ceil(Number(count.total)/20)),current=Math.min(page,pages);
  const items=await rows(db,`SELECT id,kind,slug,title,excerpt,body,image,category,seo_title,seo_description,published,published_at,deleted_at,version,updated_at FROM site_documents WHERE ${where} ORDER BY id DESC LIMIT 20 OFFSET ${(current-1)*20}`,[kind]);
  return {items:items.map(i=>({...i,published:Boolean(i.published),url:documentUrl(i)})),total:Number(count.total),page:current,pages};
 }
 async function write(pool,user,action,body){
  if(!uuid(body.requestId))fail(400,'invalid_request','Потрібен унікальний ID запиту.');
  const payloadHash=hash({action,...body}),db=await pool.getConnection();
  try{
   await db.beginTransaction();
   const [actor]=await rows(db,'SELECT admin FROM accounts_1101 WHERE id=? FOR UPDATE',[user.id]);if(Number(actor?.admin)!==12)fail(403,'forbidden','Потрібен актуальний рівень адміністратора 12.');
   const [previous]=await rows(db,'SELECT payload_hash,result_json FROM site_content_audit WHERE actor_id=? AND request_id=?',[user.id,body.requestId]);
   if(previous){if(previous.payload_hash!==payloadHash)fail(409,'request_conflict','ID запиту вже використаний.');await db.commit();return {...json(previous.result_json),replayed:true};}
   await rows(db,'INSERT INTO site_admin_limits(actor_id,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[user.id]);
   const [limit]=await rows(db,'SELECT attempts FROM site_admin_limits WHERE actor_id=?',[user.id]);if(Number(limit.attempts)>120)fail(429,'rate_limited','Забагато змін. Повторіть через 15 хвилин.');
   let before=null,after=null,target,result;
   if(action==='site-settings-save'){
    const value=validateSettings(body.group,body.value);
    const [record]=await rows(db,'SELECT value_json,version FROM site_settings WHERE setting_key=? FOR UPDATE',[body.group]);
    if(!record||record.version!==body.version)fail(409,'stale_content','Налаштування вже змінені. Оновіть форму.');
    before=json(record.value_json);after=value;target=`settings:${body.group}`;
    await rows(db,'UPDATE site_settings SET value_json=?,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE setting_key=?',[JSON.stringify(value),user.id,body.group]);
    result={saved:true,version:record.version+1};
   }else{
    let record=null;
    if(body.id!==null&&body.id!==undefined){if(!Number.isInteger(body.id)||body.id<1||body.id>2147483647)fail(400,'invalid_id','Некоректний ID.');[record]=await rows(db,'SELECT * FROM site_documents WHERE id=? FOR UPDATE',[body.id]);if(!record)fail(404,'not_found','Запис не знайдено.');if(record.version!==body.version)fail(409,'stale_content','Запис уже змінено. Оновіть форму.');before=record;}
    if(action==='site-document-save'){
     after=validateDocument(body.document);
     if(record&&(record.deleted_at||record.kind!==after.kind))fail(409,'invalid_state','Спочатку відновіть запис; тип змінювати не можна.');
     const values=Object.values(after);let id=record?.id;
     if(record)await rows(db,'UPDATE site_documents SET kind=?,slug=?,title=?,excerpt=?,body=?,image=?,category=?,seo_title=?,seo_description=?,published=?,published_at=IF(?=1,COALESCE(published_at,UTC_TIMESTAMP()),published_at),version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[...values,after.published,user.id,id]);
     else {const inserted=await rows(db,'INSERT INTO site_documents(kind,slug,title,excerpt,body,image,category,seo_title,seo_description,published,published_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,IF(?=1,UTC_TIMESTAMP(),NULL),?,?)',[...values,after.published,user.id,user.id]);id=inserted.insertId;}
     target=`${after.kind}:${id}`;result={saved:true,id,version:(record?.version||0)+1,url:documentUrl(after)};
    }else{
     if(!record)fail(400,'invalid_id','Вкажіть запис.');
     if(action==='site-document-delete'){if(record.deleted_at)fail(409,'invalid_state','Запис уже в кошику.');await rows(db,'UPDATE site_documents SET deleted_at=UTC_TIMESTAMP(),published=0,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[user.id,record.id]);}
     else if(action==='site-document-restore'){if(!record.deleted_at)fail(409,'invalid_state','Запис не в кошику.');await rows(db,'UPDATE site_documents SET deleted_at=NULL,published=0,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[user.id,record.id]);}
     else fail(400,'invalid_action','Непідтримувана дія.');
     after={published:false,deleted:action==='site-document-delete'};target=`${record.kind}:${record.id}`;result={saved:true,id:record.id,version:record.version+1};
    }
   }
   await rows(db,'INSERT INTO site_content_audit(actor_id,request_id,payload_hash,event,target,before_json,after_json,result_json) VALUES(?,?,?,?,?,?,?,?)',[user.id,body.requestId,payloadHash,action,target,before?JSON.stringify(before):null,JSON.stringify(after),JSON.stringify(result)]);
   await db.commit();return {...result,replayed:false};
  }catch(error){await db.rollback();if(error.code==='ER_DUP_ENTRY')fail(409,'slug_conflict','Така адреса вже зайнята. Перевірте також кошик.');throw error;}finally{db.release();}
 }
 return {read,write};
}
