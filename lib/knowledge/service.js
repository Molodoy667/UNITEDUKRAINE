import {fail} from '../account/core.js';
const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
export const knowledgeReads=['kb-categories','kb-posts'];
export const knowledgeWrites=['kb-category-save','kb-category-delete','kb-category-restore','kb-post-save','kb-post-delete','kb-post-restore'];
const categoryColumns='id,parent,title,position,published,deleted_at,version';
const postColumns='id,category_id,client,title,content,position,published,deleted_at,version';
export function integer(value,min=0,max=2147483647){if(!Number.isInteger(value)||value<min||value>max)fail(400,'invalid_number','Некоректний ID або порядок.');return value;}
const string=(value,max,trim=true)=>{if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))fail(400,'invalid_text','Перевірте текст і довжину полів.');return trim?value.trim():value;};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail(400,'invalid_fields','Непідтримувані поля.');if(typeof value.published!=='boolean')fail(400,'invalid_boolean','Опублікувати має бути true або false.');};
export function validateCategory(value){exact(value,['parent','title','position','published']);return {parent:integer(value.parent),title:string(value.title,180),position:integer(value.position),published:value.published};}
export function validatePost(value){exact(value,['category_id','client','title','content','position','published']);if(!['all','pc'].includes(value.client))fail(400,'invalid_client','Оберіть all або pc.');return {category_id:integer(value.category_id,1),client:value.client,title:string(value.title,240),content:string(value.content,30000,false),position:integer(value.position),published:value.published};}
export function visibleCategories(categories){
 const byId=new Map(categories.map(c=>[c.id,c])),memo=new Map();
 const visible=id=>{if(memo.has(id))return memo.get(id);const visited=new Set();let current=byId.get(id),result=false;
  while(current){if(visited.has(current.id)||!current.published||current.deleted_at)break;visited.add(current.id);if(current.parent===0){result=true;break;}current=byId.get(current.parent);}
  memo.set(id,result);return result;};
 return categories.filter(c=>visible(c.id));
}
export function validateParent(id,parent,categories){
 integer(parent);if(parent===0)return;
 const map=new Map(categories.map(c=>[c.id,c])),seen=new Set(id?[id]:[]);let current=parent;
 while(current){if(seen.has(current))fail(409,'category_cycle','Категорія не може бути власним нащадком.');seen.add(current);const row=map.get(current);if(!row||row.deleted_at)fail(409,'parent_unavailable','Оберіть активну батьківську категорію.');current=row.parent;}
}
const literal=value=>value.replace(/[!%_]/g,c=>'!'+c);
export async function readKnowledge(db,action,params){
 const state=params.get('state')||'active';if(!['active','trash'].includes(state))fail(400,'invalid_state','Некоректний стан.');
 if(action==='kb-categories'){
  const items=await rows(db,`SELECT c.id,c.parent,c.title,c.position,c.published,c.deleted_at,c.version,(SELECT COUNT(*) FROM site_kb_posts p WHERE p.category_id=c.id AND p.deleted_at IS NULL) postCount,(SELECT COUNT(*) FROM site_kb_categories ch WHERE ch.parent=c.id AND ch.deleted_at IS NULL) childCount FROM site_kb_categories c WHERE c.deleted_at IS ${state==='trash'?'NOT ':''}NULL ORDER BY c.position,c.id`);
  return {items:items.map(c=>({...c,published:Boolean(c.published),postCount:Number(c.postCount),childCount:Number(c.childCount)})),total:items.length};
 }
 const page=integer(Number(params.get('page')||1),1,100000),size=integer(Number(params.get('size')||20),1,100);if(![20,50,100].includes(size))fail(400,'invalid_size','Оберіть 20, 50 або 100.');
 const q=(params.get('q')||'').trim();if(q.length>200)fail(400,'invalid_query','Запит до 200 символів.');
 const where=[`deleted_at IS ${state==='trash'?'NOT ':''}NULL`],values=[];
 if(params.has('categoryId')){where.push('category_id=?');values.push(integer(Number(params.get('categoryId')),1));}
 if(q){where.push("(title LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!')");values.push(`%${literal(q)}%`,`%${literal(q)}%`);}
 const [count]=await rows(db,`SELECT COUNT(*) n FROM site_kb_posts WHERE ${where.join(' AND ')}`,values),total=Number(count.n),pages=Math.max(1,Math.ceil(total/size)),current=Math.min(page,pages);
 const items=await rows(db,`SELECT ${postColumns} FROM site_kb_posts WHERE ${where.join(' AND ')} ORDER BY position,id LIMIT ${size} OFFSET ${(current-1)*size}`,values);
 return {items:items.map(p=>({...p,published:Boolean(p.published)})),total,page:current,pages};
}
// Called inside the existing authenticated, CSRF-protected CMS transaction/audit.
export async function writeKnowledge(db,user,action,body){
 if(!knowledgeWrites.includes(action))fail(400,'invalid_action','Непідтримувана дія.');
 await rows(db,'SELECT id FROM site_knowledge_lock WHERE id=1 FOR UPDATE');
 const category=action.startsWith('kb-category-'),table=category?'site_kb_categories':'site_kb_posts',columns=category?categoryColumns:postColumns;
 const creating=body.id===null;let before=null;
 if(!creating){integer(body.id,1);[before]=await rows(db,`SELECT ${columns} FROM ${table} WHERE id=? FOR UPDATE`,[body.id]);if(!before)fail(404,'not_found','Матеріал не знайдено.');if(before.version!==body.version)fail(409,'stale_content','Матеріал уже змінено. Оновіть список перед редагуванням.');}
 else if(body.version!==0)fail(400,'invalid_version','Для нового матеріалу версія має бути 0.');
 let id=before?.id,after;
 // Current locking reads, not the older snapshot established by the audit lookup.
 const categories=await rows(db,`SELECT ${categoryColumns} FROM site_kb_categories FOR UPDATE`);
 if(action.endsWith('-save')){
  if(before?.deleted_at)fail(409,'deleted_content','Спочатку відновіть матеріал із кошика.');
  after=category?validateCategory(body.category):validatePost(body.post);
  if(category)validateParent(id,after.parent,categories);
  else if(!categories.some(c=>c.id===after.category_id&&!c.deleted_at))fail(409,'category_unavailable','Оберіть активну категорію.');
  const keys=Object.keys(after),values=Object.values(after);
  if(before)await rows(db,`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')},version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[...values,user.id,id]);
  else {const inserted=await rows(db,`INSERT INTO ${table}(${keys.join(',')},created_by,updated_by) VALUES(${keys.map(()=>'?').join(',')},?,?)`,[...values,user.id,user.id]);id=inserted.insertId;}
 }else{
  if(!before)fail(400,'invalid_id','Оберіть матеріал.');
  const deleting=action.endsWith('-delete');if(deleting?Boolean(before.deleted_at):!before.deleted_at)fail(409,'invalid_state','Стан матеріалу вже змінено.');
  if(category&&deleting){const children=categories.filter(c=>c.parent===id&&!c.deleted_at),posts=await rows(db,'SELECT id FROM site_kb_posts WHERE category_id=? AND deleted_at IS NULL FOR UPDATE',[id]);if(children.length||posts.length)fail(409,'category_not_empty',`Спочатку перенесіть або видаліть підкатегорії (${children.length}) та статті (${posts.length}). Автоматичного каскадного видалення немає.`);}
  if(!deleting){if(category)validateParent(id,before.parent,categories);else if(!categories.some(c=>c.id===before.category_id&&!c.deleted_at))fail(409,'category_unavailable','Спочатку відновіть категорію статті.');}
  await rows(db,`UPDATE ${table} SET deleted_at=${deleting?'UTC_TIMESTAMP()':'NULL'},published=0,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[user.id,id]);after={published:false,deleted:deleting};
 }
 return {before,after,target:`${category?'kb-category':'kb-post'}:${id}`,result:{saved:true,id,version:(before?.version||0)+1}};
}
