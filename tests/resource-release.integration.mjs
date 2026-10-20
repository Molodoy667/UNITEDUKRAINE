import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {rouletteDatabase} from './roulette-database.mjs';
import {createLauncherApi} from '../api/launcher.js';
import {CHANNEL,BRANCHES,BASELINE,policyId,sha256} from '../lib/resource-release/policy.js';
import {seedLauncherConfig} from '../lib/resource-release/seed.js';
import {verifyManifests} from '../lib/resource-release/manifests.js';
const token='2'.repeat(64),headers={'x-forwarded-proto':'https',authorization:`Bearer ${token}`,'content-type':'application/json'};
async function call(handler,path,body){
 const request={url:path,method:body===undefined?'GET':'POST',headers,body},response={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.body=value;return this;},end(value){this.text=value;return this;}};await handler(request,response);return response;
}
test('persistent Android activation CAS, replay/recovery and public config on isolated MariaDB',async t=>{
 const fixture=await rouletteDatabase(),{pool}=fixture;let verified=0;
 let manifestFiles=Buffer.from('{"list":[{"test":"first"}]}'),manifestArchives=Buffer.from('{"0":{"test":"first"}}');
 const request=async url=>new Response(String(url).includes('files.json')?manifestFiles:manifestArchives,{headers:{'content-type':'application/json'}});
 const verify=async body=>{verified++;return verifyManifests(body,request);};
 const options={pool:()=>pool,secret:()=>token,verify},handler=createLauncherApi(options);
 const state=async()=>{const res=await call(handler,'/api/android-resources/state');assert.equal(res.code,200,JSON.stringify(res.body));return res.body;};
 const payload=(version,changes={})=>({publicationId:randomUUID(),channel:CHANNEL,expectedVersion:version,policyId,filesSha256:sha256(manifestFiles),archivesSha256:sha256(manifestArchives),uploadCompleted:true,...changes});
 const activate=body=>call(handler,'/api/android-resources/activate',body);
 let firstBody,firstResult;
 try{
  await t.test('migration initializes exactly observed 288 without changing any game data or other config fields',async()=>{
   assert.deepEqual(fixture.before,fixture.after);const initial=await state();assert.equal(initial.resourcesVersion,288);assert.deepEqual(initial.branches,[...BRANCHES]);assert.equal(initial.manifests.filesSha256,BASELINE.filesSha256);
   const publicRes=await call(handler,'/Project/info.json');assert.equal(publicRes.code,200);assert.deepEqual(publicRes.body,JSON.parse(readFileSync(new URL('../data/launcher/project-info.seed.json',import.meta.url))));
   const [[count]]=await pool.query('SELECT COUNT(*) n FROM site_android_publications');assert.equal(Number(count.n),0);
  });
  await t.test('opening/checking state, incomplete uploads, wrong policy and unchanged manifests never increase version',async()=>{
   await state();await state();assert.equal((await activate(payload(288,{uploadCompleted:false}))).code,400);
   assert.equal((await activate(payload(288,{policyId:'0'.repeat(64)}))).body.error,'policy_conflict');
   assert.equal((await activate(payload(288,{filesSha256:BASELINE.filesSha256,archivesSha256:BASELINE.archivesSha256}))).body.error,'no_resource_changes');
   assert.equal((await state()).resourcesVersion,288);assert.equal(verified,0);
  });
  await t.test('CDN mismatch rolls back config and leaves publicationId uncommitted',async()=>{
   const body=payload(288,{filesSha256:'f'.repeat(64)}),res=await activate(body);assert.equal(res.code,409);assert.equal(res.body.error,'manifest_hash_mismatch');
   assert.equal((await state()).resourcesVersion,288);assert.equal((await call(handler,`/api/android-resources/publications/${body.publicationId}`)).code,404);
  });
  await t.test('one activation changes Android resourcesVersion in both selected branches and nothing else',async()=>{
   firstBody=payload(288);const before=(await call(handler,'/Project/info.json')).body,res=await activate(firstBody);assert.equal(res.code,200,JSON.stringify(res.body));firstResult=res.body.publication;
   assert.equal(res.body.replayed,false);assert.equal(firstResult.previousVersion,288);assert.equal(firstResult.resourcesVersion,289);assert.deepEqual(firstResult.verification,{manifests:'cdn-sha256',assets:'publisher-attested'});
   const after=(await call(handler,'/Project/info.json')).body;for(const key of BRANCHES)before[key].Android.resourcesVersion=289;assert.deepEqual(after,before);
  });
  await t.test('same ID/same body replays immutable original after app restart, without CDN or another increment',async()=>{
   const before=verified;manifestFiles=Buffer.from('{"list":[{"test":"changed-after-commit"}]}');
   const restarted=createLauncherApi(options),res=await call(restarted,'/api/android-resources/activate',firstBody);assert.equal(res.code,200);assert.equal(res.body.replayed,true);assert.deepEqual(res.body.publication,firstResult);assert.equal(verified,before);
   const found=await call(restarted,`/api/android-resources/publications/${firstBody.publicationId}`);assert.deepEqual(found.body,{found:true,publication:firstResult});assert.equal((await state()).resourcesVersion,289);
   assert.equal((await activate({...firstBody,expectedVersion:289})).body.error,'publication_id_conflict');
  });
  await t.test('concurrent same ID commits once; stale/different IDs cannot both win CAS',async()=>{
   const body=payload(289),responses=await Promise.all([activate(body),activate(body)]);assert.deepEqual(responses.map(r=>r.code),[200,200]);assert.deepEqual(responses.map(r=>r.body.replayed).sort(),[false,true]);assert.equal((await state()).resourcesVersion,290);
   manifestFiles=Buffer.from('{"list":[{"test":"third"}]}');const a=payload(290),b=payload(290),competing=await Promise.all([activate(a),activate(b)]);
   assert.deepEqual(competing.map(r=>r.code).sort(),[200,409]);assert.equal(competing.find(r=>r.code===409).body.error,'version_conflict');assert.equal((await state()).resourcesVersion,291);
   const [[count]]=await pool.query('SELECT COUNT(*) n FROM site_android_publications');assert.equal(Number(count.n),3);
   assert.deepEqual((await activate(firstBody)).body.publication,firstResult); // Original result survives later releases.
  });
  await t.test('new ID with same activated hashes cannot force version increase; unrelated channel config survives',async()=>{
   assert.equal((await activate(payload(291))).body.error,'no_resource_changes');
   const config=(await call(handler,'/Project/info.json')).body;config.unrelated={released:true,cdn:'https://unrelated.example.test',Android:{version:'9',resourcesVersion:44}};await pool.execute('UPDATE site_launcher_config SET config_json=? WHERE id=1',[JSON.stringify(config)]);
   manifestArchives=Buffer.from('{"0":{"test":"next"}}');assert.equal((await activate(payload(291))).code,200);
   const after=(await call(handler,'/Project/info.json')).body;assert.deepEqual(after.unrelated,config.unrelated);assert.equal(after['0.0.0'].Android.resourcesVersion,292);
   const db=await pool.getConnection();try{await seedLauncherConfig(db);}finally{db.release();}assert.equal((await state()).resourcesVersion,292);
  });
  await t.test('publication ledger failure rolls back already executed config update and all fingerprints',async()=>{
   const before=await state();manifestFiles=Buffer.from('{"list":[{"test":"must-rollback"}]}');const body=payload(before.resourcesVersion);
   await pool.query("CREATE TRIGGER synthetic_release_failure BEFORE INSERT ON site_android_publications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic failure'");
   try{assert.equal((await activate(body)).code,503);}finally{await pool.query('DROP TRIGGER synthetic_release_failure');}
   assert.deepEqual(await state(),before);assert.equal((await call(handler,`/api/android-resources/publications/${body.publicationId}`)).code,404);
   assert.equal((await activate(body)).body.publication.resourcesVersion,293);
  });
  await t.test('concurrent reuse of ID with different bytes rejects the loser; invalid policy state never mutates',async()=>{
   manifestFiles=Buffer.from('{"list":[{"test":"id-collision"}]}');const a=payload(293),b={...a,archivesSha256:'0'.repeat(64)};
   const results=await Promise.all([activate(a),activate(b)]);assert.equal(results[0].code,200);assert.equal(results[1].body.error,'publication_id_conflict');
   const current=(await call(handler,'/Project/info.json')).body,changed=structuredClone(current);changed['1.7.6'].Android.resourcesVersion++;
   await pool.execute('UPDATE site_launcher_config SET config_json=? WHERE id=1',[JSON.stringify(changed)]);
   try{const failedState=await call(handler,'/api/android-resources/state');assert.equal(failedState.code,503);assert.equal(failedState.body.error,'channel_versions_diverged');const res=await activate(payload(294));assert.equal(res.body.error,'channel_versions_diverged');}
   finally{await pool.execute('UPDATE site_launcher_config SET config_json=? WHERE id=1',[JSON.stringify(current)]);}
   const db=await pool.getConnection();
   try{
    await pool.execute('DELETE FROM site_android_release_channels WHERE channel_id=?',[CHANNEL]);
    await assert.rejects(()=>seedLauncherConfig(db),/no release channel/);
   }finally{db.release();await pool.execute('INSERT INTO site_android_release_channels(channel_id,files_sha256,archives_sha256) VALUES(?,?,?)',[CHANNEL,a.filesSha256,a.archivesSha256]);}
   assert.equal((await state()).resourcesVersion,294);
  });
  await t.test('real HTTP public config and authenticated state/lookup are uncached JSON, never static file',async()=>{
   const server=createServer((req,res)=>{req.headers['x-forwarded-proto']='https';res.status=code=>{res.statusCode=code;return res;};res.json=value=>res.end(JSON.stringify(value));void handler(req,res);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   try{
    const base=`http://127.0.0.1:${server.address().port}`,publicResponse=await fetch(base+'/Project/info.json');assert.equal(publicResponse.status,200);assert.match(publicResponse.headers.get('content-type'),/application\/json/);assert.equal(publicResponse.headers.get('cache-control'),'no-store');assert.equal((await publicResponse.json())['1.7.6'].Android.resourcesVersion,294);
    const denied=await fetch(base+'/api/android-resources/state');assert.equal(denied.status,401);
    const privateResponse=await fetch(base+'/api/android-resources/state',{headers:{Authorization:`Bearer ${token}`}});assert.equal(privateResponse.status,200);assert.equal(privateResponse.headers.get('cache-control'),'no-store');assert.equal(privateResponse.headers.get('access-control-allow-origin'),null);assert.equal((await privateResponse.json()).resourcesVersion,294);
   }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
 }finally{await fixture.close();}
});
