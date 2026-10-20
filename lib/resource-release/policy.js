import {createHash} from 'node:crypto';
import {fail} from '../account/core.js';
export const CHANNEL='android-main';
export const BRANCHES=Object.freeze(['0.0.0','1.7.6']);
export const CDN='https://pub-713bd1fbe95b48e2bf632fed4e16a48a.r2.dev/game/1.8.9.4';
// Read-only observations of the manifests paired with public version 288 on 2026-10-21.
export const BASELINE=Object.freeze({version:288,filesSha256:'b3f2c180cbcd1853857d18a714ef0e9bbc1e80bb6baf810c632100de367430ed',archivesSha256:'bef7a9749ddf59f2688a26c23283a0b2d2f9b000a9a57b9c59f47a9faaca1828'});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const policyId=sha256(JSON.stringify({channel:CHANNEL,branches:BRANCHES,cdn:CDN}));
export const manifestUrls=Object.freeze({files:`${CDN}/Android/files.json`,archives:`${CDN}/Android/archives.json`});
export const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export function channelVersion(config){
 if(!config||typeof config!=='object'||Array.isArray(config))fail(503,'channel_unconfigured','Launcher configuration is invalid.');
 const grouped=Object.keys(config).filter(key=>config[key]?.released===true&&config[key]?.cdn===CDN&&config[key]?.Android).sort();
 if(JSON.stringify(grouped)!==JSON.stringify(BRANCHES))fail(503,'channel_policy_changed','Active branches differ from the approved channel policy.');
 const versions=BRANCHES.map(key=>{
  const branch=config[key],value=branch?.Android?.resourcesVersion;
  if(branch?.released!==true||branch.cdn!==CDN||!Number.isInteger(value)||value<0||value>2147483647)fail(503,'channel_unconfigured','Android channel is inconsistent.');
  return value;
 });
 if(new Set(versions).size!==1)fail(503,'channel_versions_diverged','Android branch versions differ. Operator intervention required.');
 return versions[0];
}
export function activationBody(raw){
 let body=raw;
 if(typeof raw==='string'){if(Buffer.byteLength(raw)>4096)fail(413,'body_too_large','Maximum 4096 bytes.');try{body=JSON.parse(raw);}catch{fail(400,'invalid_json','Invalid JSON body.');}}
 const keys=['publicationId','channel','expectedVersion','policyId','filesSha256','archivesSha256','uploadCompleted'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>4096||Object.keys(body).length!==keys.length||keys.some(k=>!Object.hasOwn(body,k)))fail(400,'invalid_fields','Unsupported or missing fields.');
 if(!uuid(body.publicationId)||body.channel!==CHANNEL||body.uploadCompleted!==true||!Number.isInteger(body.expectedVersion)||body.expectedVersion<0||body.expectedVersion>=2147483647||!['filesSha256','archivesSha256','policyId'].every(k=>typeof body[k]==='string'&&/^[a-f0-9]{64}$/.test(body[k])))fail(400,'invalid_publication','Invalid publication identity, version, hashes or upload attestation.');
 // Canonical field ordering: JSON whitespace/property ordering does not alter idempotency.
 return Object.fromEntries(keys.map(key=>[key,body[key]]));
}
export const publicationFingerprint=body=>sha256(JSON.stringify(activationBody(body)));
