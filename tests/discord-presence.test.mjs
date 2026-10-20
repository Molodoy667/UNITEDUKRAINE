import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {ADDRESS,GAME_SERVER,createServerStatusReader,createServerHandler} from '../lib/server-status.js';
import {DISCORD_INFO_PATH,xmlText,discordInfoXml,createDiscordInfoHandler} from '../lib/discord-presence.js';
import {createServerApi} from '../api/server.js';
const snapshot=(overrides={})=>({status:'online',address:ADDRESS,players:7,maxPlayers:500,name:'Untrusted monitor name',source:'game-query',...overrides});
async function call(handler,method='GET'){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(body){this.xml=body;return this;}};
 await handler({method,url:DISCORD_INFO_PATH,headers:{}},res);return res;
}
test('game server mapping agrees with every published Project/info.json server entry',()=>{
 const config=JSON.parse(readFileSync(new URL('../data/launcher/project-info.seed.json',import.meta.url),'utf8'));
 for(const release of Object.values(config)){
  const server=release.servers[String(GAME_SERVER.id)];assert.equal(server.ip,GAME_SERVER.ip);assert.equal(server.port,GAME_SERVER.port);assert.equal(server.name,GAME_SERVER.name);
 }
 assert.equal(ADDRESS,'51.75.44.14:2219');
});
test('XML is UTF-8 with servers at the root and separate IP and port; only verified counts appear',()=>{
 const xml=discordInfoXml(snapshot());assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>\n<servers>/);
 assert.match(xml,/<server id="1">/);assert.match(xml,/<name>United Ukraine \| Онлайн: 7<\/name>/);assert.match(xml,/<ip>51\.75\.44\.14<\/ip>/);assert.match(xml,/<port>2219<\/port>/);assert.match(xml,/<\/servers>\n$/);assert.doesNotMatch(xml,/Untrusted monitor|<root>|<html|ip>[^<]*:/);
 assert.match(discordInfoXml(snapshot({players:0})),/Онлайн: 0/);
 for(const status of [null,{},snapshot({status:'unavailable'}),snapshot({players:-1}),snapshot({players:'7'}),snapshot({players:501}),snapshot({address:'other:7777'}),snapshot({maxPlayers:0}),snapshot({source:'unknown'})]){
  const value=discordInfoXml(status);assert.match(value,/<name>United Ukraine<\/name>/);assert.doesNotMatch(value,/Онлайн|<online>/);
 }
});
test('XML escapes text and drops forbidden XML 1.0 codepoints without damaging Unicode',()=>{
 assert.equal(xmlText('A&B<>"\'\x00\x1f\ud800🙂'),'A&amp;B&lt;&gt;&quot;&apos;🙂');
 const xml=discordInfoXml(null,{id:'"',name:'United <Ukraine> & "RP"',ip:'x&y',port:2219});
 assert.match(xml,/id="&quot;"/);assert.match(xml,/<name>United &lt;Ukraine&gt; &amp; &quot;RP&quot;<\/name>/);assert.match(xml,/<ip>x&amp;y<\/ip>/);
});
test('public GET and HEAD return XML, byte-accurate length and cache/source headers without cookies',async()=>{
 const handler=createDiscordInfoHandler({getStatus:async()=>snapshot()});
 const response=await call(handler);assert.equal(response.code,200);assert.equal(response.headers['Content-Type'],'application/xml; charset=utf-8');assert.equal(response.headers['X-Content-Type-Options'],'nosniff');assert.equal(response.headers['X-Online-Source'],'game-query');assert.equal(response.headers['Content-Length'],String(Buffer.byteLength(response.xml,'utf8')));assert.match(response.headers['Cache-Control'],/s-maxage=15/);assert.equal(response.headers['Location'],undefined);assert.equal(response.headers['Set-Cookie'],undefined);
 const head=await call(handler,'HEAD');assert.equal(head.code,200);assert.equal(head.xml,undefined);assert.equal(head.headers['Content-Length'],response.headers['Content-Length']);
});
test('outage still returns static server identity, never JSON/HTML or fabricated online',async()=>{
 const response=await call(createDiscordInfoHandler({getStatus:async()=>{throw Error('unavailable');}}));
 assert.equal(response.code,200);assert.equal(response.headers['X-Server-Status'],'unavailable');assert.equal(response.headers['X-Online-Source'],'unavailable');assert.match(response.xml,/<name>United Ukraine<\/name>/);assert.doesNotMatch(response.xml,/Онлайн|unavailable|<html/);
 let calls=0;const method=await call(createDiscordInfoHandler({getStatus:async()=>{calls++;}}),'POST');assert.equal(method.code,405);assert.equal(method.headers.Allow,'GET, HEAD');assert.equal(method.headers['Cache-Control'],'no-store');assert.match(method.xml,/<error>method_not_allowed<\/error>/);assert.equal(calls,0);
});
test('JSON and XML share cached monitoring, coalesce concurrent requests and recheck after 15 seconds',async()=>{
 let reads=0,clock=0;const getStatus=createServerStatusReader({clock:()=>clock,query:async()=>{reads++;return snapshot({players:reads});}}),json=createServerHandler({getStatus}),xml=createDiscordInfoHandler({getStatus});
 const pair=await Promise.all([call(json),call(xml)]);assert.equal(reads,1);assert.equal(pair[0].body.players,1);assert.match(pair[1].xml,/Онлайн: 1/);
 clock=15000;await call(xml);assert.equal(reads,1);clock=15001;const next=await call(xml);assert.equal(reads,2);assert.match(next.xml,/Онлайн: 2/);
});
test('route rewrite precedes SPA fallback without adding another Vercel function',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')),index=config.rewrites.findIndex(r=>r.source===DISCORD_INFO_PATH),fallback=config.rewrites.findIndex(r=>r.source==='/(.*)');
 assert.ok(index>=0&&index<fallback);assert.equal(config.rewrites[index].destination,'/api/server?format=discord');assert.ok(readdirSync(new URL('../api/',import.meta.url)).filter(n=>n.endsWith('.js')).length<=12);
});
test('actual API router serves both exact/rewritten XML and unchanged JSON over loopback HTTP',async()=>{
 const handler=createServerApi({getStatus:async()=>snapshot()}),server=createServer((request,response)=>{
  response.status=code=>{response.statusCode=code;return response;};response.json=body=>{response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(body));};void handler(request,response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}${DISCORD_INFO_PATH}`,response=await fetch(url,{redirect:'manual'}),body=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('Location'),null);assert.match(response.headers.get('Content-Type'),/application\/xml/);assert.equal(body,discordInfoXml(snapshot()));
  const base=`http://127.0.0.1:${server.address().port}`;
  const rewritten=await fetch(`${base}/api/server?format=discord`,{redirect:'manual'});assert.equal(rewritten.status,200);assert.equal(await rewritten.text(),body);
  const json=await fetch(`${base}/api/server`);assert.equal(json.status,200);assert.match(json.headers.get('Content-Type'),/application\/json/);assert.equal((await json.json()).players,7);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
