import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {ADDRESS,GAME_SERVER,createServerStatusReader} from '../lib/server-status.js';
import {ONLINE_PATH,clientOnlineJson,createOnlineHandler} from '../lib/online.js';
import {createServerApi} from '../api/server.js';
const snapshot=(overrides={})=>({status:'online',address:ADDRESS,players:7,maxPlayers:500,source:'game-query',updatedAt:new Date(0).toISOString(),...overrides});
async function call(handler,{method='GET',url=ONLINE_PATH}={}){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},end(body){this.text=body;return this;},json(body){this.body=body;return this;}};
 await handler({method,url,headers:{}},res);return res;
}

test('Android mapping uses crmp_new/server 1 with integer counts from the verified snapshot',()=>{
 assert.deepEqual(clientOnlineJson(snapshot()),{crmp_new:{'1':{players:7,maxPlayers:500}}});
 assert.deepEqual(clientOnlineJson(snapshot({players:0})),{crmp_new:{'1':{players:0,maxPlayers:500}}});
 const config=JSON.parse(readFileSync(new URL('../data/launcher/project-info.seed.json',import.meta.url),'utf8'));
 for(const release of Object.values(config)){
  const server=release.servers[String(GAME_SERVER.id)];assert.equal(server.ip,GAME_SERVER.ip);assert.equal(server.port,GAME_SERVER.port);
 }
 assert.equal(ONLINE_PATH,'/online.json');assert.equal(ADDRESS,'51.75.44.14:2219');
});

test('unknown/mismatched/untrusted counts omit the server instead of inventing zero/1000 or returning null',()=>{
 for(const value of [null,{},snapshot({status:'unavailable'}),snapshot({address:'other:7777'}),snapshot({source:'unknown'}),snapshot({players:'7'}),snapshot({players:-1}),snapshot({players:501}),snapshot({maxPlayers:0}),snapshot({maxPlayers:10001}),snapshot({maxPlayers:null}),snapshot({players:NaN})])assert.deepEqual(clientOnlineJson(value),{crmp_new:{}});
 for(const source of ['game-query','configured-monitor','open.mp'])assert.equal(clientOnlineJson(snapshot({source})).crmp_new['1'].players,7);
});

test('GET/HEAD declare JSON UTF-8, source, CORS and byte length without redirects or cookies',async()=>{
 const handler=createOnlineHandler({getStatus:async()=>snapshot()});const res=await call(handler);
 assert.equal(res.code,200);assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');assert.equal(res.headers['Access-Control-Allow-Origin'],'*');
 assert.equal(res.headers['X-Server-Status'],'online');assert.equal(res.headers['X-Online-Source'],'game-query');assert.match(res.headers['Cache-Control'],/s-maxage=15/);
 assert.equal(res.headers['Content-Length'],String(Buffer.byteLength(res.text)));assert.equal(res.headers.Location,undefined);assert.equal(res.headers['Set-Cookie'],undefined);assert.deepEqual(JSON.parse(res.text),clientOnlineJson(snapshot()));
 const head=await call(handler,{method:'HEAD'});assert.equal(head.code,200);assert.equal(head.text,undefined);assert.equal(head.headers['Content-Length'],res.headers['Content-Length']);
});

test('preflight and rejected writes never query monitoring or disclose data',async()=>{
 let calls=0;const handler=createOnlineHandler({getStatus:async()=>{calls++;throw Error('Must not query');}});
 const options=await call(handler,{method:'OPTIONS'});assert.equal(options.code,204);assert.equal(options.headers['Cache-Control'],'no-store');assert.equal(options.text,undefined);
 for(const method of ['POST','PUT','DELETE','PATCH']){const res=await call(handler,{method});assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET, HEAD, OPTIONS');assert.deepEqual(JSON.parse(res.text),{error:'method_not_allowed'});}
 assert.equal(calls,0);
});

test('monitor outage is valid uncached JSON with explicit headers, not HTML, exceptions or false numbers',async()=>{
 for(const getStatus of [async()=>snapshot({status:'unavailable'}),async()=>{throw Error('private internal failure');}]){
  const res=await call(createOnlineHandler({getStatus}));assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['X-Server-Status'],'unavailable');assert.equal(res.headers['X-Online-Source'],'unavailable');assert.equal(res.text,'{"crmp_new":{}}');
 }
});

test('online.json, website JSON and Discord share one coalesced reader and expire together',async()=>{
 let reads=0,now=0;
 const getStatus=createServerStatusReader({clock:()=>now,query:async()=>snapshot({players:++reads}),request:async()=>{throw Error('fallback must not run');}}),handler=createServerApi({getStatus});
 const [online,website,discord]=await Promise.all([call(handler),call(handler,{url:'/api/server'}),call(handler,{url:'/api/server?format=discord'})]);
 assert.equal(reads,1);assert.equal(JSON.parse(online.text).crmp_new['1'].players,1);assert.equal(website.body.players,1);assert.match(discord.text,/Онлайн: 1/);
 now=15001;const next=await call(handler);assert.equal(reads,2);assert.equal(JSON.parse(next.text).crmp_new['1'].players,2);
 const fallback=createServerStatusReader({query:async()=>null,request:async()=>({ok:true,json:async()=>[{ip:ADDRESS,pc:9,pm:500,hn:'United'}]})});
 const indexed=await call(createOnlineHandler({getStatus:fallback}));assert.equal(indexed.headers['X-Online-Source'],'open.mp');assert.equal(JSON.parse(indexed.text).crmp_new['1'].players,9);
});

test('exact rewrite and local routing precede SPA fallback without creating a thirteenth Vercel function',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')),index=config.rewrites.findIndex(r=>r.source===ONLINE_PATH),fallback=config.rewrites.findIndex(r=>r.source==='/(.*)');
 assert.ok(index>=0&&index<fallback);assert.equal(config.rewrites[index].destination,'/api/server?format=online');assert.equal(readdirSync(new URL('../api/',import.meta.url)).filter(n=>n.endsWith('.js')).length,12);
 assert.match(readFileSync(new URL('../scripts/forum-dev.mjs',import.meta.url),'utf8'),/route === '\/online\.json'/);
 assert.match(readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8'),/"\/online\.json": "http:\/\/127\.0\.0\.1:4174"/);
});

test('real loopback HTTP returns JSON for both client URL and rewritten function; existing routes retain format',async()=>{
 const handler=createServerApi({getStatus:async()=>snapshot({players:0})}),server=createServer((req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));};void handler(req,res);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/online.json','/api/server?format=online']){
   const response=await fetch(base+path,{redirect:'manual'});assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.match(response.headers.get('content-type'),/application\/json/);assert.deepEqual(await response.json(),{crmp_new:{'1':{players:0,maxPlayers:500}}});
  }
  const head=await fetch(base+ONLINE_PATH,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const json=await fetch(base+'/api/server');assert.equal((await json.json()).status,'online');
  const xml=await fetch(base+'/projects/crmp/v2/info.xml');assert.match(xml.headers.get('content-type'),/application\/xml/);assert.match(await xml.text(),/<servers>/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
