import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAccountHandler} from '../lib/account/service.js';
import {createAdminHandler} from '../lib/admin/service.js';
import {createSiteHandler} from '../lib/site/public.js';
import {createMediaHandler} from '../lib/site/media.js';
const origin='http://127.0.0.1:5173';
async function call(handler,url,actor={},body,method=body===undefined?'GET':'POST'){
 const req={url,method,body,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...actor.headers},socket:{remoteAddress:'127.0.0.1'}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(body){this.bytes=body;return this;}};await handler(req,res);return res;
}
test('news photo upload persists real bytes, authorizes drafts, publishes via API and rolls back atomically',async t=>{
 const fixture=await rouletteDatabase(),{pool}=fixture;
 const admin=createAdminHandler({pool:()=>pool}),account=createAccountHandler({pool:()=>pool,getPresence:async()=>({online:false})}),media=createMediaHandler({pool:()=>pool}),news=createSiteHandler({pool:()=>pool,launcherOnly:true});
 const png=await readFile(new URL('../public/assets/logo.png',import.meta.url)),jpeg=await readFile(new URL('../public/assets/world.jpg',import.meta.url));
 let actor,ordinary,photo,article;
 const write=(action,body,identity=actor)=>call(admin,`/api/admin?action=${action}`,identity,{requestId:randomUUID(),...body});
 const doc={kind:'news',slug:'uploaded-photo-news',title:'Synthetic upload test',excerpt:'Synthetic excerpt',body:'Synthetic body',image:'',category:'Test',seo_title:'',seo_description:'',published:false};
 const count=async table=>Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n);
 try{
  await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
  const login=async email=>{const res=await call(account,'/api/account?action=login',{}, {email,password:'Synthetic-Game-Password'});assert.equal(res.code,200);return {cookie:res.headers['Set-Cookie'].split(';')[0],csrf:res.body.csrf};};
  actor=await login('player@example.test');ordinary=await login('other@example.test');
  await t.test('uploads require administrator 12, correct Origin and CSRF',async()=>{
   const body={mime:'image/png',data:png.toString('base64')};
   assert.equal((await write('site-image-upload',body,{})).code,401);assert.equal((await write('site-image-upload',body,ordinary)).code,403);
   assert.equal((await write('site-image-upload',body,{...actor,csrf:'bad'})).code,403);assert.equal((await write('site-image-upload',body,{...actor,headers:{origin:'https://evil.test'}})).code,403);assert.equal(await count('site_media'),0);
  });
  await t.test('server rejects spoofed MIME, arbitrary HTML, excessive payloads and extra fields',async()=>{
   for(const body of [{mime:'image/jpeg',data:png.toString('base64')},{mime:'image/png',data:Buffer.from('<html>bad</html>').toString('base64')},{mime:'image/png',data:png.toString('base64'),arbitrary:true}])assert.equal((await write('site-image-upload',body)).code,400);
   assert.equal((await write('site-image-upload',{mime:'image/png',data:'a'.repeat(3*1024*1024)})).code,400);assert.equal(await count('site_media'),0);
  });
  await t.test('same upload retry and concurrent deduplication store one copy with metadata-only audit',async()=>{
   const body={requestId:randomUUID(),mime:'image/png',data:png.toString('base64')};
   const first=await write('site-image-upload',body);assert.equal(first.code,200,JSON.stringify(first.body));photo=first.body;
   assert.equal((await write('site-image-upload',body)).body.replayed,true);
   assert.equal((await write('site-image-upload',{...body,data:jpeg.toString('base64'),mime:'image/jpeg'})).code,409);
   const pair=await Promise.all([write('site-image-upload',{...body,requestId:randomUUID()}),write('site-image-upload',{...body,requestId:randomUUID()})]);assert.ok(pair.every(r=>r.code===200&&r.body.id===photo.id));assert.equal(await count('site_media'),1);
   const [[stored]]=await pool.execute('SELECT data FROM site_media WHERE id=?',[photo.id]);assert.deepEqual(stored.data,png);
   const [audit]=await pool.query("SELECT after_json FROM site_content_audit WHERE event='site-image-upload'");assert.ok(audit.length>=1);assert.ok(JSON.stringify(audit).length<5000);assert.doesNotMatch(JSON.stringify(audit),/iVBORw0KGgo/);
  });
  await t.test('unlinked and draft photos are private; administrators can preview',async()=>{
   assert.equal((await call(media,photo.url)).code,404);assert.equal((await call(media,photo.url,ordinary)).code,404);
   const preview=await call(media,photo.url,actor);assert.equal(preview.code,200);assert.deepEqual(preview.bytes,png);assert.equal(preview.headers['Access-Control-Allow-Origin'],undefined);
   doc.image=photo.url;const res=await write('site-document-save',{id:null,version:0,document:doc});assert.equal(res.code,200,JSON.stringify(res.body));article=res.body;
   assert.equal((await call(media,photo.url)).code,404);assert.ok(!(await call(news,'/api/launcher?action=news')).body.news.some(n=>n.id===article.id));
  });
  await t.test('publication makes photo readable without login and same absolute URL appears in news DTO',async()=>{
   const res=await write('site-document-save',{id:article.id,version:article.version,document:{...doc,published:true}});assert.equal(res.code,200);article=res.body;
   const image=await call(media,photo.url);assert.equal(image.code,200);assert.deepEqual(image.bytes,png);assert.equal(image.headers['Content-Type'],'image/png');assert.equal(image.headers['Access-Control-Allow-Origin'],'*');assert.equal(image.headers['X-Content-Type-Options'],'nosniff');
   const head=await call(media,photo.url,{},undefined,'HEAD');assert.equal(head.code,200);assert.equal(head.bytes,undefined);
   const result=await call(news,'/api/launcher?action=news');assert.equal(result.body.schemaVersion,1);const item=result.body.news.find(n=>n.id===article.id);assert.equal(item.image,`https://united-rp.com.ua${photo.url}`);assert.equal(item.title,doc.title);assert.ok(item.publishedAt);
  });
  await t.test('delete hides public photo; restore as draft does not republish it',async()=>{
   let res=await write('site-document-delete',{id:article.id,version:article.version});assert.equal(res.code,200);article=res.body;assert.equal((await call(media,photo.url)).code,404);
   res=await write('site-document-restore',{id:article.id,version:article.version});assert.equal(res.code,200);assert.equal((await call(media,photo.url)).code,404);assert.equal((await call(media,photo.url,actor)).code,200);
  });
  await t.test('failure writing audit also rolls back photo bytes and JPEG succeeds after retry',async()=>{
   const before=await count('site_media');await pool.query("CREATE TRIGGER synthetic_media_failure BEFORE INSERT ON site_content_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'");
   const body={requestId:randomUUID(),mime:'image/jpeg',data:jpeg.toString('base64')};assert.equal((await write('site-image-upload',body)).code,503);await pool.query('DROP TRIGGER synthetic_media_failure');assert.equal(await count('site_media'),before);
   const res=await write('site-image-upload',body);assert.equal(res.code,200,JSON.stringify(res.body));assert.equal(res.body.mime,'image/jpeg');assert.equal(await count('site_media'),before+1);
   assert.equal((await call(media,'/api/media?id=../../private',actor)).code,404);
  });
 }finally{await fixture.close();}
});
