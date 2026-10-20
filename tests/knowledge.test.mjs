import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {visibleCategories,validateCategory,validatePost,validateParent} from '../lib/knowledge/service.js';
import {createKnowledgeHandler} from '../lib/knowledge/public.js';
import {loadKnowledgeSeed,validateCorpus} from '../lib/knowledge/seed.js';
import './knowledge-ui.test.mjs';
const cats=[{id:1,parent:0,published:1},{id:2,parent:1,published:1},{id:3,parent:2,published:1},{id:4,parent:0,published:0},{id:5,parent:4,published:1},{id:6,parent:7,published:1},{id:7,parent:6,published:1}];
test('knowledge hierarchy hides draft/deleted ancestors, orphans and cycles',()=>{
 assert.deepEqual(visibleCategories(cats).map(c=>c.id),[1,2,3]);assert.deepEqual(visibleCategories(cats.map(c=>c.id===1?{...c,deleted_at:'now'}:c)),[]);
 assert.throws(()=>validateParent(1,3,cats));assert.throws(()=>validateParent(1,1,cats));assert.throws(()=>validateParent(1,999,cats));assert.doesNotThrow(()=>validateParent(3,0,cats));
});
test('knowledge validators allow only fixed fields, real booleans and plain text preserving CRLF',()=>{
 const category={parent:0,title:'Основи гри',position:0,published:true},post={category_id:1,client:'all',title:'Досвід',content:'Рядок 1\r\n\r\nРядок 2',position:0,published:true};
 assert.deepEqual(validateCategory(category),category);assert.deepEqual(validatePost(post),post);
 for(const invalid of [{...category,parent:-1},{...category,published:'true'},{...category,sql:'bad'},{...category,title:''}])assert.throws(()=>validateCategory(invalid));
 for(const invalid of [{...post,category_id:0},{...post,client:'admin'},{...post,content:''},{...post,content:'\0'},{...post,version:1}])assert.throws(()=>validatePost(invalid));
});
test('public preflight and methods require no login or DB and declare UTF-8/CORS/no-store',async()=>{
 const handler=createKnowledgeHandler({pool:()=>{throw Error('Must not query');}}),res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},end(){},json(body){this.body=body;}};
 await handler({url:'/api/knowledge-base/categories',method:'OPTIONS'},res);assert.equal(res.code,204);assert.equal(res.headers['Access-Control-Allow-Origin'],'*');assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');assert.match(res.headers['Access-Control-Allow-Methods'],/GET, HEAD, OPTIONS/);
 await handler({url:'/api/knowledge-base/categories',method:'POST'},res);assert.equal(res.code,405);
});
test('public successes are arrays without wrappers/pagination and route precedes SPA fallback',async()=>{
 let reads=0;const connection={query:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},execute:async(sql,values)=>{reads++;if(sql.includes('site_kb_categories'))return [[{...cats[0],title:'Основи гри',position:0}]];return [[{id:1,category_id:1,client:'all',title:'Досвід',content:'Текст',position:0}]];}};
 const handler=createKnowledgeHandler({pool:()=>({getConnection:async()=>connection})});
 const res={setHeader(){},status(code){this.code=code;return this;},end(){this.ended=true;},json(body){this.body=body;}};
 await handler({url:'/api/knowledge-base/categories',method:'GET'},res);assert.equal(res.code,200);assert.ok(Array.isArray(res.body));assert.deepEqual(Object.keys(res.body[0]),['id','parent','title','position']);
 await handler({url:'/api/site?kbRoute=posts/1',method:'GET'},res);assert.equal(res.body[0].title,'Досвід');
 await handler({url:'/api/knowledge-base/search?query=',method:'GET'},res);assert.deepEqual(res.body,[]);
 await handler({url:'/api/knowledge-base/categories',method:'HEAD'},res);assert.equal(res.code,200);assert.equal(res.ended,true);
 await handler({url:'/api/knowledge-base/unknown',method:'GET'},res);assert.equal(res.code,404);assert.equal(res.body.error,'not_found');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url))),fallback=config.rewrites.findIndex(r=>r.source==='/(.*)');
 for(const route of ['/api/knowledge-base/categories','/api/knowledge-base/posts/:categoryId','/api/knowledge-base/search'])assert.ok(config.rewrites.findIndex(r=>r.source===route)<fallback);
 assert.equal(readdirSync(new URL('../api/',import.meta.url)).filter(n=>n.endsWith('.js')).length,12);
});

test('all Ukrainian translations preserve metadata, numbers, commands, links and line breaks',async()=>{
 const seed=await loadKnowledgeSeed();assert.deepEqual(seed.counts,{categories:55,posts:256});
 const root=new URL('../data/knowledge/source/',import.meta.url),categories=JSON.parse(readFileSync(new URL('categories.original.json',root))),posts=JSON.parse(readFileSync(new URL('posts.original.json',root)));
 const changed=structuredClone(seed.posts);changed[0].content+=' 123';assert.throws(()=>validateCorpus(seed.categories,changed,categories,posts));
 const brands=seed.posts.find(p=>p.id===45).content;assert.ok(brands.includes('Развитие')&&brands.includes('Интеграл'));
 for(const id of [11,13])assert.match(seed.posts.find(p=>p.id===id).content,/@HasslePlusBot/);
 assert.match(seed.posts.find(p=>p.id===12).content,/https:\/\/radmir\.online\/login/);
});
test('copied original corpus matches transfer SHA-256 and exact source counts',()=>{
 const root=new URL('../data/knowledge/source/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('source-manifest.json',root)));
 for(const file of ['categories.original.json','posts.original.json'])assert.equal(createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex'),manifest.files[file].sha256);
 assert.equal(JSON.parse(readFileSync(new URL('categories.original.json',root))).length,55);assert.equal(JSON.parse(readFileSync(new URL('posts.original.json',root))).length,256);
});
