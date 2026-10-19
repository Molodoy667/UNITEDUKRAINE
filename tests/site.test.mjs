import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDocument,validateSettings,documentUrl} from '../lib/site/content.js';
import {renderSiteHtml} from '../lib/site/render.js';
import {createServerHandler,parseServerInfo,ADDRESS} from '../lib/server-status.js';
const launcher={version:'1',downloadUrl:'https://example.test/setup.exe',resourcesEnabled:false,resourcesUrl:'',resourcesVersion:'',resourcesUpdateUrl:'',maintenance:false,maintenanceMessage:''};
const document={kind:'page',slug:'test-page',title:'Заголовок',excerpt:'',body:'Абзац 1\n\nАбзац 2',image:'',category:'',seo_title:'',seo_description:'',published:false};
test('CMS validates fixed fields, booleans, resource flag, slugs and HTTPS without accepting arbitrary scripts',()=>{
 assert.equal(validateSettings('launcher',launcher).downloadUrl,launcher.downloadUrl);
 for(const value of [{...launcher,resourcesEnabled:true},{...launcher,maintenance:'false'},{...launcher,downloadUrl:'javascript:alert(1)'},{...launcher,downloadUrl:'https://user:pass@example.test/'},{...launcher,password:'private'}])assert.throws(()=>validateSettings('launcher',value));
 assert.throws(()=>validateSettings('__proto__',{}));assert.throws(()=>validateDocument({...document,slug:'../api/admin'}));assert.throws(()=>validateDocument({...document,published:'false'}));
 assert.equal(validateDocument({...document,image:'/assets/world.jpg'}).image,'/assets/world.jpg');
 assert.equal(documentUrl({...document,slug:'privacy'}),'/privacy');assert.equal(documentUrl(document),'/p/test-page');assert.equal(documentUrl({...document,kind:'news'}),'/news/test-page');
});
test('HTML contains DB metadata and readable content before JS, with safe JSON and escaped administrator text',()=>{
 const site={seo:{siteName:'United',title:'DB <title> $&',description:'" onload="bad',keywords:'RP',siteUrl:'https://example.test',image:'/assets/world.jpg'},home:{headline:'DB headline',highlight:'DB highlight',description:'DB description'},launcher,news:[],pages:[]};
 const template='<html><head><title>OLD</title><meta name="description" content="OLD"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
 const item={...document,title:'</h1><script>alert(1)</script>',body:'</script><img onerror=bad>',url:'/p/test-page'};
 const html=renderSiteHtml(template,site,item);
 assert.doesNotMatch(html,/<title>OLD|<img onerror=bad>|<script>alert/);assert.match(html,/&lt;script&gt;/);assert.match(html,/rel="canonical" href="https:\/\/example.test\/p\/test-page"/);
 const raw=html.match(/<script id="site-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)[1];assert.doesNotMatch(raw,/<\/script/);assert.deepEqual(JSON.parse(raw),site);
 assert.equal((html.match(/<title>/g)||[]).length,1);const homeHtml=renderSiteHtml(template,site);assert.match(homeHtml,/DB headline DB highlight/);assert.match(homeHtml,/DB &lt;title&gt; \$&amp;/);
});
function packet(players=123,max=500){const strings=['United','RolePlay','UA'].map(s=>{const b=Buffer.from(s),size=Buffer.alloc(4);size.writeUInt32LE(b.length);return Buffer.concat([size,b]);});const header=Buffer.alloc(16);header.write('SAMP');header[10]=0x69;header.writeUInt16LE(players,12);header.writeUInt16LE(max,14);return Buffer.concat([header,...strings]);}
test('direct info query parses counts over 100 and rejects malformed/truncated packets',()=>{
 assert.equal(parseServerInfo(packet()).players,123);assert.equal(parseServerInfo(packet(0)).players,0);assert.throws(()=>parseServerInfo(packet(501)));assert.throws(()=>parseServerInfo(packet().subarray(0,23)));assert.throws(()=>parseServerInfo(Buffer.concat([packet(),Buffer.from('x')])));
});
async function call(handler,method='GET'){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};await handler({method},res);return res;}
test('server monitoring prioritizes real query, coalesces refresh, expires cache and never invents zero',async()=>{
 let calls=0,now=0;const handler=createServerHandler({clock:()=>now,query:async()=>{calls++;return {status:'online',address:ADDRESS,players:7,maxPlayers:500,source:'game-query'};},request:()=>{throw Error('must not use fallback');}});
 assert.equal((await call(handler,'POST')).code,405);const result=await Promise.all([call(handler),call(handler)]);assert.equal(calls,1);assert.equal(result[0].body.players,7);now=16000;await call(handler);assert.equal(calls,2);
 const down=createServerHandler({query:async()=>null,request:async()=>{throw Error();}});assert.equal((await call(down)).body.status,'unavailable');assert.equal((await call(down)).body.players,undefined);
 const failed=createServerHandler({query:async()=>{throw Error();},request:async()=>{throw Error();}});assert.equal((await call(failed)).body.status,'unavailable');
 const indexed=createServerHandler({query:async()=>null,request:async()=>({ok:true,json:async()=>[{ip:ADDRESS,pc:9,pm:500,hn:'United'}]})});assert.equal((await call(indexed)).body.source,'open.mp');
});
