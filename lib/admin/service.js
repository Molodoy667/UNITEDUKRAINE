import {getMysqlPool} from '../mysql.js';
import {readAccountSession,verifyAccountWrite} from '../account/service.js';
import {AccountError,fail} from '../account/core.js';
import {presenceSnapshot} from '../account/presence.js';
import {entities,selectFields,joinOwner} from './catalog.js';
import {changeBody,createChangeService,proposalFields,recordVersion} from './changes.js';
import {bridgeStatus,dispatchChange} from './bridge.js';
import {createContentService,cmsBody} from '../site/content.js';
const number=(value,fallback,min,max)=>{if(value===null)return fallback;if(!/^\d+$/.test(value))fail(400,'invalid_filter','Некоректні параметри списку.');const parsed=Number(value);if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max)fail(400,'invalid_filter','Параметр поза дозволеним діапазоном.');return parsed;};
const literal=value=>value.replace(/[!%_]/g,char=>'!'+char);
export function listQuery(params,entity){
  const page=number(params.get('page'),1,1,100000),size=number(params.get('size'),20,10,100);
  if(![10,20,50,100].includes(size))fail(400,'invalid_filter','Оберіть 10, 20, 50 або 100 записів.');
  const sort=params.get('sort')||'id',filter=params.get('filter')||'all',q=(params.get('q')||'').trim();
  if(!Object.hasOwn(entity.sorts,sort)||!Object.hasOwn(entity.filters,filter)||q.length>80)fail(400,'invalid_filter','Непідтримуваний фільтр або сортування.');
  const values=[],where=[entity.filters[filter]],ownerId=number(params.get('ownerId'),null,1,2147483647);
  if(ownerId!==null){if(entity.table==='accounts_1101')fail(400,'invalid_filter','Фільтр власника доступний для майна.');where.push('a.owner_id=?');if(entity.table==='ownable_cars')where.push('a.famcar=0');values.push(ownerId);}
  if(q){const terms=[];if(/^\d+$/.test(q)&&Number(q)<=2147483647){terms.push('a.id=?');values.push(Number(q));}if(entity.name){terms.push(`a.\`${entity.name}\` LIKE ? ESCAPE '!'`);values.push(`%${literal(q)}%`);}if(entity.table==='ownable_cars'&&/^\d+$/.test(q)&&Number(q)<=2147483647){terms.push('a.model_id=?');values.push(Number(q));}where.push(terms.length?`(${terms.join(' OR ')})`:'1=0');}
  return {page,size,sort,filter,q,where:where.join(' AND '),values};
}
export function createAdminHandler({pool=getMysqlPool,getSession=readAccountSession,getOnline=presenceSnapshot,now=()=>new Date().toISOString()}={}){
  const changes=createChangeService();
  const content=createContentService();
  const contentWrites=['site-settings-save','site-document-save','site-document-delete','site-document-restore'];
  const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
  async function overview(db,user){
    const stats=await Promise.all(Object.entries(entities).map(async([key,entity])=>{
      try{const extra=key==='players'?',SUM(admin>0) AS admins':key==='vehicles'?',SUM(owner_id<=0 AND famcar=0) AS free':',SUM(owner_id<=0) AS free';const [row]=await rows(db,`SELECT COUNT(*) AS total${extra} FROM \`${entity.table}\``);return [key,{available:true,total:Number(row.total),...(key==='players'?{admins:Number(row.admins)||0}:{free:Number(row.free)||0})}];}
      catch{return [key,{available:false,total:null,free:null}];}
    }));
    let online;try{const result=await getOnline();online={available:result.names!==null,count:result.names?.length??null,checkedAt:result.checkedAt};}catch{online={available:false,count:null,checkedAt:now()};}
    return {operator:{id:Number(user.id),nickname:user.name},stats:Object.fromEntries(stats),online,updatedAt:now(),capabilities:{read:true,edit:false,propose:true,ai:false},source:'game-database'};
  }
  async function list(db,key,params){
    const entity=Object.hasOwn(entities,key)?entities[key]:null;if(!entity)fail(404,'not_found','Розділ не знайдено.');
    const query=listQuery(params,entity),[count]=await rows(db,`SELECT COUNT(*) AS total FROM \`${entity.table}\` a WHERE ${query.where}`,query.values),total=Number(count.total),pages=Math.max(1,Math.ceil(total/query.size)),page=Math.min(query.page,pages);
    const items=await rows(db,`SELECT ${selectFields(entity)} FROM \`${entity.table}\` a${joinOwner(entity)} WHERE ${query.where} ORDER BY ${entity.sorts[query.sort]} LIMIT ${query.size} OFFSET ${(page-1)*query.size}`,query.values);
    return {entity:key,items,total,page,size:query.size,pages,sort:query.sort,filter:query.filter,q:query.q,updatedAt:now()};
  }
  return async(request,response)=>{
    response.setHeader('Cache-Control','private, no-store');response.setHeader('Vary','Cookie');response.setHeader('X-Content-Type-Options','nosniff');
    try{
      const params=new URL(request.url,'http://admin.local').searchParams,action=params.get('action')||'overview';
      if(request.method!=='GET'&&!(request.method==='POST'&&['preview','confirm','cancel','dispatch',...contentWrites].includes(action))){response.setHeader('Allow','GET, POST');fail(405,'method_not_allowed','Операцію або метод не підтримано.');}
      const user=await getSession(request,pool());if(!user)fail(401,'login_required','Увійдіть до ігрового акаунта.');
      if(Number(user.admin)!==12)fail(403,'forbidden','Доступ лише для адміністратора рівня 12.');
      const db=pool();let data;
      if(request.method==='POST'){
        if(contentWrites.includes(action)){verifyAccountWrite(request,user);return response.status(200).json(await content.write(db,user,action,cmsBody(request)));}
        verifyAccountWrite(request,user);const body=changeBody(request);
        data=action==='preview'?await changes.preview(db,user,body):action==='confirm'?await changes.confirm(db,user,body):action==='dispatch'?await dispatchChange(db,request,user,body):await changes.cancel(db,user,body);
        return response.status(200).json(data);
      }
      if(['site-settings','site-documents','site-audit'].includes(action))data=await content.read(db,action,params);
      else if(action==='overview')data=await overview(db,user);
      else if(action==='list')data=await list(db,params.get('entity')||'players',params);
      else if(action==='detail'){
        const key=params.get('entity'),entity=Object.hasOwn(entities,key)?entities[key]:null;if(!entity)fail(404,'not_found','Розділ не знайдено.');
        const id=number(params.get('id'),null,1,2147483647);if(id===null)fail(400,'invalid_id','Вкажіть ID запису.');
        const [item]=await rows(db,`SELECT ${selectFields(entity)} FROM \`${entity.table}\` a${joinOwner(entity)} WHERE a.id=?`,[id]);if(!item)fail(404,'not_found','Запис не знайдено.');
        data={entity:key,item,version:recordVersion(key,item),proposalFields:proposalFields[key],updatedAt:now(),editable:false};
      }else if(action==='changes')data=await changes.history(db,params);
      else if(action==='bridge')data=await bridgeStatus(db);
      else if(action==='online'){
        const snapshot=await getOnline();
        if(snapshot.names===null)fail(503,'online_unavailable','Список онлайн зараз не підтверджено. Це не означає, що сервер порожній.');
        const names=[...new Set(snapshot.names)].slice(0,100),entity=entities.players;
        const items=names.length?await rows(db,`SELECT ${selectFields(entity)} FROM accounts_1101 a WHERE a.name IN (${names.map(()=>'?').join(',')}) ORDER BY a.name ASC`,names):[];
        const matched=new Set(items.map(item=>item.name.toLowerCase()));
        data={entity:'online',items,total:items.length,onlineCount:names.length,unmatched:names.filter(name=>!matched.has(name.toLowerCase())),updatedAt:snapshot.checkedAt};
      }else fail(404,'not_found','Операцію не знайдено.');
      return response.status(200).json(data);
    }catch(error){
      if(error instanceof AccountError){if(error.status===429)response.setHeader('Retry-After','900');return response.status(error.status).json({error:error.code,message:error.message});}
      console.error('Admin API failed',/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'REQUEST_FAILED');
      return response.status(503).json({error:'admin_unavailable',message:'Операція недоступна. Перевірте підключення та міграції; після збою підтвердження повторіть той самий запит або перевірте журнал.'});
    }
  };
}
