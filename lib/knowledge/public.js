import {getMysqlPool} from '../mysql.js';
import {AccountError,fail} from '../account/core.js';
import {visibleCategories,integer} from './service.js';
const prefix='/api/knowledge-base';
export async function publicKnowledge(db,route,params){
 if(route!=='categories'&&route!=='search'&&!/^posts\/\d+$/.test(route))fail(404,'not_found','Невідомий маршрут бази знань.');
 const [all]=await db.execute('SELECT id,parent,title,position,published,deleted_at FROM site_kb_categories ORDER BY position,id');
 const categories=visibleCategories(all);
 if(route==='categories')return categories.map(({id,parent,title,position})=>({id,parent,title,position}));
 const ids=categories.map(c=>c.id);if(!ids.length)return [];
 const where=['published=1','deleted_at IS NULL',`category_id IN (${ids.map(()=>'?').join(',')})`],values=[...ids];
 if(route.startsWith('posts/')){const id=integer(Number(route.slice(6)),1);if(!ids.includes(id))return [];where.push('category_id=?');values.push(id);}
 else{const q=(params.get('query')||'').trim();if(!q)return [];if(q.length>200)fail(400,'invalid_query','Запит до 200 символів.');const term=`%${q.replace(/[!%_]/g,c=>'!'+c)}%`;where.push("(title LIKE ? ESCAPE '!' OR content LIKE ? ESCAPE '!')");values.push(term,term);}
 const [items]=await db.execute(`SELECT id,category_id,client,title,content,position FROM site_kb_posts WHERE ${where.join(' AND ')} ORDER BY position,id`,values);return items;
}
export function createKnowledgeHandler({pool=getMysqlPool}={}){
 return async(request,response)=>{
  response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
  response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Accept, Content-Type, X-Unity-Version');
  try{
   if(request.method==='OPTIONS')return response.status(204).end();
   if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD, OPTIONS');fail(405,'method_not_allowed','Лише читання.');}
   const url=new URL(request.url,'http://knowledge.local');
   const route=url.pathname.startsWith(prefix+'/')?url.pathname.slice(prefix.length+1):url.searchParams.get('kbRoute')||'';
   if(route!=='categories'&&route!=='search'&&!/^posts\/\d+$/.test(route))fail(404,'not_found','Невідомий маршрут бази знань.');
   const db=await pool().getConnection();let items;
   try{
    // One visibility snapshot: a newly published post must never be combined
    // with category visibility from before its ancestor was unpublished.
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    items=await publicKnowledge(db,route,url.searchParams);await db.commit();
   }catch(error){await db.rollback();throw error;}finally{db.release();}
   return request.method==='HEAD'?response.status(200).end():response.status(200).json(items);
  }catch(error){const known=error instanceof AccountError;response.setHeader('Cache-Control','no-store');response.status(known?error.status:503);return request.method==='HEAD'?response.end():response.json({error:known?error.code:'knowledge_unavailable',message:known?error.message:'База знань недоступна. Перевірте підключення та міграції.'});}
 };
}
