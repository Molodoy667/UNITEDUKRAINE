import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAdminHandler} from '../lib/admin/service.js';
import {createAccountHandler} from '../lib/account/service.js';
import {createSiteHandler} from '../lib/site/public.js';
import {seedKnowledge,loadKnowledgeSeed} from '../lib/knowledge/seed.js';
import {writeKnowledge} from '../lib/knowledge/service.js';
const origin='http://127.0.0.1:5173';
async function call(handler,url,actor={},body,method=body===undefined?'GET':'POST'){
 const request={url,method,body,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...actor.headers},socket:{remoteAddress:'127.0.0.1'}};
 const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(body){this.bytes=body;return this;}};await handler(request,response);return response;
}
test('real DB knowledge import, public client contract, protected CRUD/hierarchy and atomic audit',async t=>{
 const fixture=await rouletteDatabase(),{pool}=fixture,admin=createAdminHandler({pool:()=>pool}),account=createAccountHandler({pool:()=>pool,getPresence:async()=>({online:false})}),site=createSiteHandler({pool:()=>pool});
 let actor,ordinary,category,child,post;
 const write=(action,body,identity=actor)=>call(admin,`/api/admin?action=${action}`,identity,{requestId:randomUUID(),...body});
 const get=path=>call(site,`/api/knowledge-base/${path}`);
 const catValue=(overrides={})=>({parent:0,title:'Нова категорія',position:100,published:true,...overrides});
 const postValue=(overrides={})=>({category_id:category.id,client:'all',title:'Пошук Ґанку, Їжак та досвід',content:'Об’єкт 100%_!\r\n\r\nДругий абзац /me test.',position:10,published:true,...overrides});
 try{
  await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
  const login=async email=>{const res=await call(account,'/api/account?action=login',{}, {email,password:'Synthetic-Game-Password'});assert.equal(res.code,200);return {cookie:res.headers['Set-Cookie'].split(';')[0],csrf:res.body.csrf};};actor=await login('player@example.test');ordinary=await login('other@example.test');
  await t.test('translated seed is complete, all original IDs survive and game records unchanged',async()=>{
   assert.deepEqual(fixture.before,fixture.after);const categories=await get('categories');assert.equal(categories.code,200);assert.equal(categories.body.length,55);
   const items=(await Promise.all(categories.body.map(c=>get(`posts/${c.id}`)))).flatMap(r=>r.body);assert.equal(items.length,256);assert.equal(new Set(items.map(p=>p.id)).size,256);
   assert.equal(items.find(p=>p.id===1).title,'Отримання досвіду в PayDay');
   const seed=await loadKnowledgeSeed();assert.equal(seed.posts.length,256);assert.equal(seed.categories.length,55);assert.deepEqual((await get('posts/36')).body,[]);
  });
  await t.test('reads/writes require current admin12; origin and CSRF protect all knowledge mutations',async()=>{
   assert.equal((await call(admin,'/api/admin?action=kb-categories')).code,401);assert.equal((await call(admin,'/api/admin?action=kb-categories',ordinary)).code,403);
   for(const identity of [{...actor,csrf:'bad'},{...actor,headers:{origin:'https://evil.test'}},ordinary])assert.equal((await write('kb-category-save',{id:null,version:0,category:catValue()},identity)).code,403);
  });
  await t.test('actual loopback HTTP serves UTF-8 JSON arrays, rewritten routes, HEAD and preflight',async()=>{
   const server=createServer((req,res)=>{
    res.status=code=>{res.statusCode=code;return res;};res.json=body=>res.end(JSON.stringify(body));
    void site(req,res).catch(error=>{res.statusCode=500;res.end(JSON.stringify({error:error.message}));});
   });server.listen(0,'127.0.0.1');await once(server,'listening');
   try{
    const base=`http://127.0.0.1:${server.address().port}`,response=await fetch(`${base}/api/knowledge-base/categories`);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');assert.equal((await response.json()).length,55);
    const rewritten=await fetch(`${base}/api/site?kbRoute=posts/1`),posts=await rewritten.json();assert.equal(rewritten.status,200);assert.equal(posts[0].title,'Отримання досвіду в PayDay');
    const search=await fetch(`${base}/api/knowledge-base/search?query=${encodeURIComponent('ДОСВІД')}`);assert.ok((await search.json()).length>0);
    const head=await fetch(`${base}/api/knowledge-base/categories`,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    const options=await fetch(`${base}/api/knowledge-base/categories`,{method:'OPTIONS',headers:{Origin:'https://client.example.test','Access-Control-Request-Headers':'X-Unity-Version'}});assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),'*');
    const unknown=await fetch(`${base}/api/knowledge-base/not-found`);assert.equal(unknown.status,404);assert.equal((await unknown.json()).error,'not_found');
   }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  await t.test('create is stable/idempotent and new IDs follow the imported IDs',async()=>{
   const body={requestId:randomUUID(),id:null,version:0,category:catValue()};const res=await write('kb-category-save',body);assert.equal(res.code,200,JSON.stringify(res.body));category=res.body;assert.ok(category.id>57);
   const replay=await write('kb-category-save',body);assert.equal(replay.body.id,category.id);assert.equal(replay.body.replayed,true);assert.equal((await write('kb-category-save',{...body,category:catValue({title:'Different'})})).code,409);
   const next=await write('kb-category-save',{id:null,version:0,category:catValue({parent:category.id,title:'Підкатегорія'})});assert.equal(next.code,200);child=next.body;
   const item=await write('kb-post-save',{id:null,version:0,post:postValue()});assert.equal(item.code,200,JSON.stringify(item.body));post=item.body;assert.ok(post.id>260);
  });
  await t.test('public arrays include full plain text and search is Ukrainian/case-insensitive/literal',async()=>{
   const posts=(await get(`posts/${category.id}`)).body;assert.equal(posts.length,1);assert.equal(posts[0].content,postValue().content);assert.deepEqual(Object.keys(posts[0]),['id','category_id','client','title','content','position']);
   for(const query of ['ґанку','ЇЖАК','100%_!','Об’єкт'])assert.ok((await get(`search?query=${encodeURIComponent(query)}`)).body.some(p=>p.id===post.id),query);
   for(const query of ['',"' OR 1=1 --",'нетакогоунікальногослова'])assert.deepEqual((await get(`search?query=${encodeURIComponent(query)}`)).body,[]);
   assert.deepEqual((await get('posts/2147483647')).body,[]);const head=await call(site,'/api/knowledge-base/categories',{},undefined,'HEAD');assert.equal(head.code,200);assert.equal(head.bytes,undefined);
   assert.equal((await get('categories')).headers['Access-Control-Allow-Origin'],'*');assert.equal((await get('categories')).headers['Cache-Control'],'no-store');
  });
  await t.test('unpublishing ancestors hides entire subtree and articles while drafts stay editable',async()=>{
   let result=await write('kb-category-save',{id:category.id,version:category.version,category:catValue({published:false})});assert.equal(result.code,200);category=result.body;
   const ids=(await get('categories')).body.map(c=>c.id);assert.ok(!ids.includes(category.id)&&!ids.includes(child.id));assert.deepEqual((await get(`posts/${category.id}`)).body,[]);assert.ok(!(await get('search?query=%D2%91%D0%B0%D0%BD%D0%BA%D1%83')).body.some(p=>p.id===post.id));
   assert.ok((await call(admin,'/api/admin?action=kb-categories',actor)).body.items.some(c=>c.id===child.id));
   result=await write('kb-category-save',{id:category.id,version:category.version,category:catValue()});assert.equal(result.code,200);category=result.body;
  });
  await t.test('cycles, deleted parents, stale versions and deletion of populated categories are rejected',async()=>{
   assert.equal((await write('kb-category-save',{id:category.id,version:category.version,category:catValue({parent:child.id})})).body.error,'category_cycle');
   assert.equal((await write('kb-category-delete',{id:category.id,version:category.version})).body.error,'category_not_empty');
   assert.equal((await write('kb-category-save',{id:category.id,version:1,category:catValue()})).body.error,'stale_content');
   assert.equal((await write('kb-post-save',{id:null,version:0,post:postValue({category_id:999999})})).code,409);
  });
  await t.test('move posts, soft-delete/restore and explicit republishing retain content',async()=>{
   let result=await write('kb-post-save',{id:post.id,version:post.version,post:postValue({category_id:child.id})});assert.equal(result.code,200);post=result.body;
   assert.deepEqual((await get(`posts/${category.id}`)).body,[]);assert.equal((await get(`posts/${child.id}`)).body[0].id,post.id);
   result=await write('kb-post-delete',{id:post.id,version:post.version});assert.equal(result.code,200);post=result.body;assert.deepEqual((await get(`posts/${child.id}`)).body,[]);
   result=await write('kb-post-restore',{id:post.id,version:post.version});assert.equal(result.code,200);post=result.body;assert.deepEqual((await get(`posts/${child.id}`)).body,[]);
   const stored=(await call(admin,`/api/admin?action=kb-posts&categoryId=${child.id}`,actor)).body.items[0];assert.equal(stored.content,postValue().content);assert.equal(stored.published,false);
  });
  await t.test('seed retry cannot overwrite edited or deleted content and does not duplicate records',async()=>{
   const res=await write('kb-post-save',{id:1,version:1,post:{category_id:1,client:'all',title:'Редакторська зміна',content:'Це текст редактора.',position:0,published:true}});assert.equal(res.code,200);
   assert.equal((await write('kb-post-delete',{id:2,version:1})).code,200);
   const db=await pool.getConnection();try{assert.equal((await seedKnowledge(db)).replayed,true);}finally{db.release();}
   const [stored]=await pool.query('SELECT title FROM site_kb_posts WHERE id=1');assert.equal(stored[0].title,'Редакторська зміна');const [[count]]=await pool.query('SELECT COUNT(*) n FROM site_kb_posts');assert.equal(Number(count.n),257);
   const [[deleted]]=await pool.query('SELECT deleted_at,published FROM site_kb_posts WHERE id=2');assert.ok(deleted.deleted_at);assert.equal(deleted.published,0);
  });
  await t.test('old repeatable-read snapshots cannot bypass cycle or populated-category deletion checks',async()=>{
   const a=(await write('kb-category-save',{id:null,version:0,category:catValue({title:'Concurrent A'})})).body;
   const b=(await write('kb-category-save',{id:null,version:0,category:catValue({title:'Concurrent B'})})).body;
   const stale=await pool.getConnection();
   try{
    await stale.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await stale.beginTransaction();
    await stale.query('SELECT id FROM site_kb_categories'); // Audit-like consistent snapshot before global lock.
    assert.equal((await write('kb-category-save',{id:a.id,version:1,category:catValue({parent:b.id,title:'Concurrent A'})})).code,200);
    await assert.rejects(()=>writeKnowledge(stale,{id:73},'kb-category-save',{id:b.id,version:1,category:catValue({parent:a.id,title:'Concurrent B'})}),e=>e.code==='category_cycle');
    await stale.rollback();await stale.beginTransaction();await stale.query('SELECT id FROM site_kb_posts');
    assert.equal((await write('kb-post-save',{id:null,version:0,post:postValue({category_id:b.id,title:'Concurrent child'})})).code,200);
    await assert.rejects(()=>writeKnowledge(stale,{id:73},'kb-category-delete',{id:b.id,version:1}),e=>e.code==='category_not_empty');
   }finally{await stale.rollback();stale.release();}
  });
  await t.test('public category/article reads share a snapshot during concurrent unpublishing',async()=>{
   let triggered=false;const snapSite=createSiteHandler({pool:()=>({getConnection:async()=>{
    const db=await pool.getConnection();return {query:(...args)=>db.query(...args),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release(),execute:async(sql,values)=>{
     const result=await db.execute(sql,values);
     if(sql.includes('FROM site_kb_categories')&&!triggered){triggered=true;await pool.execute('UPDATE site_kb_categories SET published=0 WHERE id=?',[category.id]);await pool.execute('INSERT INTO site_kb_posts(category_id,client,title,content,position,published) VALUES(?,?,?,?,?,1)',[category.id,'all','Never visible','Concurrent unpublished child',0]);}
     return result;
    }};
   }})});
   const response=await call(snapSite,`/api/knowledge-base/posts/${category.id}`);assert.equal(response.code,200);assert.ok(!response.body.some(p=>p.title==='Never visible'));
   assert.deepEqual((await get(`posts/${category.id}`)).body,[]);await pool.execute('UPDATE site_kb_categories SET published=1 WHERE id=?',[category.id]);
  });
  await t.test('public search returns over 100 matches without pagination; admin pagination is explicit',async()=>{
   const inserted=[];
   try{
    for(let i=0;i<105;i++){const [result]=await pool.execute('INSERT INTO site_kb_posts(category_id,client,title,content,position,published) VALUES(?,?,?,?,?,1)',[category.id,'all',`Унікальниймасив ${i}`,'Понад сто результатів.',i]);inserted.push(result.insertId);}
    assert.equal((await get(`search?query=${encodeURIComponent('УНІКАЛЬНИЙМАСИВ')}`)).body.length,105);
    const page=await call(admin,`/api/admin?action=kb-posts&q=${encodeURIComponent('Унікальниймасив')}&size=50&page=3`,actor);assert.equal(page.body.total,105);assert.equal(page.body.items.length,5);assert.equal(page.body.pages,3);
   }finally{if(inserted.length)await pool.query('DELETE FROM site_kb_posts WHERE id IN (?)',[inserted]);}
   for(const path of ['','unknown','posts/nope']){const res=await get(path);assert.equal(res.code,404);assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');}
  });
  await t.test('audit failure rolls back mutations; role demotion invalidates management immediately',async()=>{
   await pool.query("CREATE TRIGGER synthetic_kb_failure BEFORE INSERT ON site_content_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'");
   const res=await write('kb-category-save',{id:null,version:0,category:catValue({title:'Must rollback'})});assert.equal(res.code,503);await pool.query('DROP TRIGGER synthetic_kb_failure');
   const [[count]]=await pool.query("SELECT COUNT(*) n FROM site_kb_categories WHERE title='Must rollback'");assert.equal(Number(count.n),0);
   await pool.execute('UPDATE accounts_1101 SET admin=0 WHERE id=73');assert.equal((await write('kb-category-save',{id:null,version:0,category:catValue()})).code,403);
  });
 }finally{await fixture.close();}
});
