import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAccountHandler} from '../lib/account/service.js';
import {createAdminHandler} from '../lib/admin/service.js';
import {createSiteHandler} from '../lib/site/public.js';
import {createRenderHandler} from '../lib/site/render.js';
import {migrateForum} from '../lib/forum/migrate.js';
const origin='http://127.0.0.1:5173';
async function call(handler,url,actor={},body){const req={url,method:body===undefined?'GET':'POST',body,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',...(actor.cookie?{cookie:actor.cookie}:{}),...(actor.csrf?{'x-account-csrf':actor.csrf}:{}),...actor.headers},socket:{remoteAddress:'127.0.0.1'}};const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(body){this.html=body;return this;}};await handler(req,res);return res;}
test('CMS persists through real MySQL, auth/CSRF, publication, recovery, conflicts and atomic audit',async t=>{
 const fixture=await rouletteDatabase(),{pool}=fixture;
 const admin=createAdminHandler({pool:()=>pool,getOnline:async()=>({names:[],checkedAt:new Date().toISOString()})}),account=createAccountHandler({pool:()=>pool,getPresence:async()=>({online:false})}),site=createSiteHandler({pool:()=>pool}),launcher=createSiteHandler({pool:()=>pool,launcherOnly:true});
 const render=createRenderHandler({pool:()=>pool,template:async()=>'<html><head><title>OLD</title></head><body><div id="root"></div></body></html>'});let actor,ordinary,itemId,version,settings;
 const read=(action,params={})=>call(admin,`/api/admin?${new URLSearchParams({action,...params})}`,actor);
 const write=(action,body,identity=actor)=>call(admin,`/api/admin?action=${action}`,identity,{requestId:randomUUID(),...body});
 const value=(kind='page',published=false)=>({kind,slug:`synthetic-${kind}`,title:'Тестовий матеріал',excerpt:'Тестовий опис',body:'Тестовий абзац.\n\nДругий абзац.',image:'/assets/world.jpg',category:'Оновлення',seo_title:'SEO із бази',seo_description:'Опис із бази',published});
 try{
  await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
  const login=async email=>{const response=await call(account,'/api/account?action=login',{}, {email,password:'Synthetic-Game-Password'});assert.equal(response.code,200);return {cookie:response.headers['Set-Cookie'].split(';')[0],csrf:response.body.csrf};};
  actor=await login('player@example.test');ordinary=await login('other@example.test');
  await t.test('migration seeds only existing static documents/settings and preserves game records',async()=>{
   assert.deepEqual(fixture.before,fixture.after);const data=(await call(site,'/api/site')).body;assert.equal(data.news.length,0);assert.equal(data.pages.length,3);assert.match(data.home.description,/\n/);assert.equal(data.launcher.resourcesEnabled,false);
   await migrateForum();assert.equal((await call(site,'/api/site')).body.pages.length,3);
  });
  await t.test('ordinary and unauthenticated users cannot read or write CMS; CSRF/Origin enforced',async()=>{
   assert.equal((await call(admin,'/api/admin?action=site-settings')).code,401);assert.equal((await call(admin,'/api/admin?action=site-settings',ordinary)).code,403);
   const doc={document:value(),id:null,version:0};assert.equal((await write('site-document-save',doc,{...actor,csrf:'bad'})).code,403);assert.equal((await write('site-document-save',doc,{...actor,headers:{origin:'https://evil.test'}})).code,403);
   assert.equal((await call(site,'/api/site',{},{})).code,405);
  });
  await t.test('settings persistence, retry idempotence and stale/changed-request conflicts',async()=>{
   settings=(await read('site-settings')).body.settings;const body={group:'seo',version:settings.seo.version,value:{...settings.seo.value,title:'SEO database title'},requestId:randomUUID()};
   const saved=await write('site-settings-save',body);assert.equal(saved.code,200,JSON.stringify(saved.body));assert.equal((await write('site-settings-save',body)).body.replayed,true);assert.equal((await write('site-settings-save',{...body,value:{...body.value,title:'other'}})).code,409);
   assert.equal((await write('site-settings-save',{...body,requestId:randomUUID()})).body.error,'stale_content');assert.equal((await call(site,'/api/site')).body.seo.title,'SEO database title');
   const html=await call(render,'/api/render?path=/');assert.equal(html.code,200);assert.match(html.html,/<title>SEO database title<\/title>/);
  });
  await t.test('draft page is private, can be published, edited, read and emitted as crawlable HTML',async()=>{
   const saved=await write('site-document-save',{id:null,version:0,document:value()});assert.equal(saved.code,200,JSON.stringify(saved.body));itemId=saved.body.id;version=saved.body.version;
   assert.equal((await call(site,'/api/site?action=document&kind=page&slug=synthetic-page')).code,404);
   const published=await write('site-document-save',{id:itemId,version,document:value('page',true)});assert.equal(published.code,200);version=published.body.version;
   const visible=await call(site,'/api/site?action=document&kind=page&slug=synthetic-page');assert.equal(visible.body.title,value().title);assert.equal(visible.body.url,'/p/synthetic-page');assert.doesNotMatch(JSON.stringify(visible.body),/updated_by|created_by|deleted_at/);
   const html=await call(render,'/api/render?path=/p/synthetic-page');assert.equal(html.code,200);assert.match(html.html,/<title>SEO із бази<\/title>/);assert.match(html.html,/Другий абзац/);
   assert.equal((await write('site-document-save',{id:itemId,version:1,document:value('page',true)})).body.error,'stale_content');
  });
  await t.test('published news and launcher settings are synchronized across fresh public handlers',async()=>{
   const doc=value('news',true);assert.equal((await write('site-document-save',{id:null,version:0,document:doc})).code,200);
   const current=(await read('site-settings')).body.settings.launcher;
   const config={...current.value,version:'2.0',downloadUrl:'https://example.test/setup.exe',resourcesEnabled:true,resourcesUrl:'https://example.test/resources.zip',resourcesVersion:'3',resourcesUpdateUrl:'https://example.test/update.zip',maintenance:false};
   assert.equal((await write('site-settings-save',{group:'launcher',version:current.version,value:config})).code,200);
   const response=await call(launcher,'/api/launcher');assert.equal(response.code,200);assert.deepEqual(response.body.launcher,config);assert.equal(response.body.news.length,1);assert.equal(response.body.news[0].url,'https://united-rp.com.ua/news/synthetic-news');assert.equal(response.body.server.port,2219);
   assert.equal((await call(createSiteHandler({pool:()=>pool}),'/api/site')).body.news.length,1);
  });
  await t.test('delete hides content and returns 404; restore preserves body but remains draft',async()=>{
   assert.equal((await write('site-document-delete',{id:itemId,version})).code,200);version++;
   assert.equal((await call(site,'/api/site?action=document&kind=page&slug=synthetic-page')).code,404);assert.equal((await call(render,'/api/render?path=/p/synthetic-page')).code,404);
   assert.equal((await read('site-documents',{kind:'page',state:'trash'})).body.items[0].id,itemId);
   assert.equal((await write('site-document-restore',{id:itemId,version})).code,200);version++;
   assert.equal((await call(site,'/api/site?action=document&kind=page&slug=synthetic-page')).code,404);const row=(await read('site-documents',{kind:'page'})).body.items.find(i=>i.id===itemId);assert.equal(row.body,value().body);assert.equal(row.published,false);
  });
  await t.test('concurrent identical create requests persist once and conflicting slugs fail without new audit',async()=>{
   const body={requestId:randomUUID(),id:null,version:0,document:{...value('page',false),slug:'concurrent-page'}};
   const [first,second]=await Promise.all([write('site-document-save',body),write('site-document-save',body)]);assert.equal(first.code,200);assert.equal(second.code,200);assert.equal(first.body.id,second.body.id);assert.ok(first.body.replayed||second.body.replayed);
   assert.equal((await write('site-document-save',{...body,requestId:randomUUID()})).body.error,'slug_conflict');
  });
  await t.test('audit insertion failure rolls back content changes and account demotion is rechecked',async()=>{
   const current=(await read('site-settings')).body.settings.seo,auditBefore=(await read('site-audit')).body.items.length;await pool.query("CREATE TRIGGER synthetic_content_failure BEFORE INSERT ON site_content_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'");
   assert.equal((await write('site-settings-save',{group:'seo',version:current.version,value:{...current.value,title:'Must rollback'}})).code,503);await pool.query('DROP TRIGGER synthetic_content_failure');assert.equal((await call(site,'/api/site')).body.seo.title,current.value.title);
   assert.equal((await read('site-audit')).body.items.length,auditBefore);assert.ok(auditBefore>=8);await pool.execute('UPDATE accounts_1101 SET admin=0 WHERE id=73');assert.equal((await write('site-document-save',{id:null,version:0,document:{...value(),slug:'blocked'}})).code,403);
  });
  await t.test('actual built Vite entry retains its assets and receives fresh database metadata',async()=>{
   const response=await call(createRenderHandler({pool:()=>pool}),'/api/render?path=/');assert.equal(response.code,200);assert.match(response.html,/type="module"[^>]*src="\/assets\//);assert.doesNotMatch(response.html,/src="\/src\/main.tsx"/);assert.match(response.html,/<title>SEO database title<\/title>/);
  });
 }finally{await fixture.close();}
});
