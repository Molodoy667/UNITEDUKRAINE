import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {activationBody,publicationFingerprint,channelVersion,policyId,CHANNEL,BRANCHES,CDN,sha256,manifestUrls} from '../lib/resource-release/policy.js';
import {verifyManifests} from '../lib/resource-release/manifests.js';
import {createLauncherApi} from '../api/launcher.js';
const seed=JSON.parse(readFileSync(new URL('../data/launcher/project-info.seed.json',import.meta.url)));
const body=(changes={})=>({publicationId:randomUUID(),channel:CHANNEL,expectedVersion:288,policyId,filesSha256:'a'.repeat(64),archivesSha256:'b'.repeat(64),uploadCompleted:true,...changes});
async function call(handler,url,method='GET',headers={},body){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.body=value;return this;},end(value){this.text=value;return this;}};
 await handler({url,method,headers,body},res);return res;
}
test('explicit approved branches share current version, unrelated platforms and channels are not selected',()=>{
 assert.equal(channelVersion(seed),288);assert.deepEqual(BRANCHES,['0.0.0','1.7.6']);
 const config=structuredClone(seed);config.unrelated={released:true,cdn:'https://elsewhere.test',Android:{resourcesVersion:999}};assert.equal(channelVersion(config),288);
 config['1.7.6'].Android.resourcesVersion=289;assert.throws(()=>channelVersion(config),e=>e.code==='channel_versions_diverged');
 config['1.7.6'].Android.resourcesVersion=288;config.newBranch=structuredClone(seed['1.7.6']);assert.throws(()=>channelVersion(config),e=>e.code==='channel_policy_changed');
 assert.ok(CDN.startsWith('https://'));assert.ok(policyId.match(/^[a-f0-9]{64}$/));
});
test('strict activation body and canonical fingerprint reject incomplete uploads, extra fields and non-integers',()=>{
 const value=body();assert.deepEqual(activationBody(JSON.stringify(value)),value);
 assert.equal(publicationFingerprint(value),publicationFingerprint(Object.fromEntries(Object.entries(value).reverse())));
 for(const changes of [{uploadCompleted:false},{expectedVersion:'288'},{expectedVersion:-1},{expectedVersion:2147483647},{channel:'other'},{publicationId:'not-uuid'},{filesSha256:'short'},{archivesSha256:'A'.repeat(64)},{url:'https://evil.test'}])assert.throws(()=>activationBody({...value,...changes}));
 assert.throws(()=>activationBody('{'));assert.throws(()=>activationBody(' '.repeat(4097)),e=>e.status===413);
 assert.notEqual(publicationFingerprint(value),publicationFingerprint({...value,filesSha256:'c'.repeat(64)}));
});
test('authentication is independent, HTTPS only, no cookies/frontend origins; fail closed before DB',async()=>{
 let reads=0;const token='1'.repeat(64),handler=createLauncherApi({secret:()=>token,pool:()=>{reads++;throw Error('Must not query');}});
 for(const [headers,status]of [[{},400],[{'x-forwarded-proto':'https'},401],[{'x-forwarded-proto':'https',authorization:'Bearer wrong'},401],[{'x-forwarded-proto':'https',authorization:`Bearer ${token}`,origin:'https://site.test'},403]]){
  const res=await call(handler,'/api/android-resources/state','GET',headers);assert.equal(res.code,status);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Access-Control-Allow-Origin'],undefined);assert.ok(!JSON.stringify(res.body).includes(token));
 }
 assert.equal((await call(createLauncherApi({secret:()=>undefined}),'/api/android-resources/state')).body.error,'publisher_unconfigured');
 const auth={'x-forwarded-proto':'https',authorization:`Bearer ${token}`};
 assert.equal((await call(handler,'/api/android-resources/state','POST',auth)).code,405);
 assert.equal((await call(handler,'/api/android-resources/activate','POST',auth,body())).code,415);
 assert.equal((await call(handler,'/api/android-resources/activate','POST',{...auth,'content-type':'application/json'},{...body(),uploadCompleted:false})).code,400);
 assert.equal((await call(handler,'/api/android-resources/publications/invalid','GET',auth)).code,400);
 assert.equal(reads,0);
});
test('public config is persisted UTF-8 JSON, uncached; HEAD/OPTIONS and failures never return stale seed or SPA',async()=>{
 const config=structuredClone(seed);for(const branch of BRANCHES)config[branch].Android.resourcesVersion=301;
 const handler=createLauncherApi({pool:()=>({execute:async()=>[[{config_json:JSON.stringify(config)}]]})});
 for(const path of ['/Project/info.json','/api/launcher?resourceAction=config']){
  const res=await call(handler,path);assert.equal(res.code,200);assert.deepEqual(res.body,config);assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');assert.equal(res.headers['Vercel-CDN-Cache-Control'],'no-store');assert.equal(res.headers['Cache-Control'],'no-store');
 }
 const head=await call(handler,'/Project/info.json','HEAD');assert.equal(head.code,200);assert.equal(head.text,undefined);assert.equal(head.body,undefined);
 const unavailable=createLauncherApi({pool:()=>{throw Error('private password');}});
 const res=await call(unavailable,'/Project/info.json');assert.equal(res.code,503);assert.equal(res.body.error,'release_unavailable');assert.ok(!res.body.message.includes('password'));
 assert.equal((await call(unavailable,'/Project/info.json','OPTIONS')).code,204);
 assert.equal((await call(handler,'/Project/info.json','POST')).code,405);
});
test('CDN verification hashes exact bytes at pinned paths, validates roots and rejects mismatch/error',async()=>{
 const files=Buffer.from('{"list":[]}\r\n'),archives=Buffer.from('{}'),value=body({filesSha256:sha256(files),archivesSha256:sha256(archives)}),requests=[];
 const request=async(url,options)=>{requests.push([String(url),options]);return new Response(String(url).includes('files.json')?files:archives,{headers:{'content-type':'application/json'}});};
 assert.deepEqual(await verifyManifests(value,request),{manifests:'cdn-sha256',assets:'publisher-attested'});
 assert.equal(requests.length,2);for(const [url,options]of requests){const target=new URL(url);assert.ok(url.startsWith(CDN+'/Android/'));assert.equal(target.searchParams.get('release'),value.publicationId);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');}
 await assert.rejects(()=>verifyManifests({...value,filesSha256:'c'.repeat(64)},request),e=>e.code==='manifest_hash_mismatch');
 await assert.rejects(()=>verifyManifests(value,async()=>new Response('<html>',{headers:{'content-type':'text/html'}})),e=>e.code==='manifest_unavailable');
 await assert.rejects(()=>verifyManifests(value,async()=>new Response('',{headers:{'content-type':'application/json','content-length':String(17*1024*1024)}})),e=>e.code==='manifest_too_large');
 const broken=Buffer.from('{');await assert.rejects(()=>verifyManifests(body({filesSha256:sha256(broken),archivesSha256:sha256(broken)}),async()=>new Response(broken,{headers:{'content-type':'application/json'}})),e=>e.code==='invalid_manifest');
 assert.equal(manifestUrls.files,CDN+'/Android/files.json');
});
test('static config cannot shadow dynamic rewrite and no thirteenth Vercel function is added',()=>{
 assert.equal(existsSync(new URL('../public/Project/info.json',import.meta.url)),false);
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url))),fallback=config.rewrites.findIndex(r=>r.source==='/(.*)');
 for(const [source,destination]of [['/Project/info.json','/api/launcher?resourceAction=config'],['/api/android-resources/state','/api/launcher?resourceAction=state'],['/api/android-resources/activate','/api/launcher?resourceAction=activate'],['/api/android-resources/publications/:publicationId','/api/launcher?resourceAction=publications/:publicationId']]){
  const index=config.rewrites.findIndex(r=>r.source===source);assert.ok(index>=0&&index<fallback);assert.equal(config.rewrites[index].destination,destination);
 }
 assert.equal(readdirSync(new URL('../api/',import.meta.url)).filter(n=>n.endsWith('.js')).length,12);
});
