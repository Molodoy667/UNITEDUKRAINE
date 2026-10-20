import {fail} from '../account/core.js';
import {CHANNEL,BRANCHES,CDN,policyId,manifestUrls,channelVersion,publicationFingerprint} from './policy.js';
import {verifyManifests} from './manifests.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export async function publicConfig(db){
 const [[row]]=await db.execute('SELECT config_json FROM site_launcher_config WHERE id=1');
 if(!row)fail(503,'release_unconfigured','Launcher configuration has not been migrated.');
 const value=parse(row.config_json);channelVersion(value);return value;
}
export async function releaseState(db){
 const [[row]]=await db.execute('SELECT l.config_json,l.revision,c.files_sha256,c.archives_sha256 FROM site_launcher_config l JOIN site_android_release_channels c ON c.channel_id=? WHERE l.id=1',[CHANNEL]);
 if(!row)fail(503,'release_unconfigured','Resource release storage has not been migrated.');
 return {schemaVersion:1,channel:CHANNEL,policyId,branches:[...BRANCHES],cdn:CDN,resourcesVersion:channelVersion(parse(row.config_json)),configRevision:row.revision,manifests:{...manifestUrls,filesSha256:row.files_sha256,archivesSha256:row.archives_sha256},verification:{manifests:'cdn-sha256-on-activation',assets:'publisher-attested'}};
}
export async function publicationState(db,id){
 const [[row]]=await db.execute('SELECT result_json FROM site_android_publications WHERE publication_id=?',[id]);
 if(!row)fail(404,'publication_not_found','No committed activation exists for this publicationId. Retry the original request, not a new ID.');
 return {found:true,publication:parse(row.result_json)};
}
export async function activateRelease(pool,body,{verify=verifyManifests,clock=()=>new Date()}={}){
 const fingerprint=publicationFingerprint(body),db=await pool.getConnection();
 try{
  await db.beginTransaction();
  // Every publisher serializes on the same config row. Read versions and history
  // with current reads, never with a snapshot created before the lock.
  const [[row]]=await db.execute('SELECT config_json,revision FROM site_launcher_config WHERE id=1 FOR UPDATE');
  if(!row)fail(503,'release_unconfigured','Resource release storage has not been migrated.');
  const [[previous]]=await db.execute('SELECT fingerprint,result_json FROM site_android_publications WHERE publication_id=? FOR UPDATE',[body.publicationId]);
  if(previous){
   if(previous.fingerprint!==fingerprint)fail(409,'publication_id_conflict','publicationId already belongs to a different request.');
   await db.commit();return {publication:parse(previous.result_json),replayed:true};
  }
  if(body.policyId!==policyId)fail(409,'policy_conflict','Reload release state; channel policy changed.');
  const config=parse(row.config_json),version=channelVersion(config);
  if(body.expectedVersion!==version)fail(409,'version_conflict','Expected version is no longer current. Reload state and investigate concurrent publication.');
  const [[channel]]=await db.execute('SELECT files_sha256,archives_sha256 FROM site_android_release_channels WHERE channel_id=? FOR UPDATE',[CHANNEL]);
  if(!channel)fail(503,'release_unconfigured','Android channel has not been migrated.');
  if(channel.files_sha256===body.filesSha256&&channel.archives_sha256===body.archivesSha256)fail(409,'no_resource_changes','Both manifests already belong to the active release.');
  const verification=await verify(body);
  if(verification?.manifests!=='cdn-sha256'||verification?.assets!=='publisher-attested')fail(503,'verification_failed','Manifest verification did not complete.');
  const next=version+1;
  for(const key of BRANCHES)config[key].Android.resourcesVersion=next;
  const result={publicationId:body.publicationId,channel:CHANNEL,branches:[...BRANCHES],policyId,fingerprint,previousVersion:version,resourcesVersion:next,configRevision:row.revision+1,filesSha256:body.filesSha256,archivesSha256:body.archivesSha256,verification,activatedAt:clock().toISOString()};
  await db.execute('UPDATE site_launcher_config SET config_json=?,revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE id=1',[JSON.stringify(config)]);
  await db.execute('UPDATE site_android_release_channels SET files_sha256=?,archives_sha256=?,updated_at=UTC_TIMESTAMP() WHERE channel_id=?',[body.filesSha256,body.archivesSha256,CHANNEL]);
  await db.execute('INSERT INTO site_android_publications(publication_id,channel_id,fingerprint,previous_version,resources_version,files_sha256,archives_sha256,result_json) VALUES(?,?,?,?,?,?,?,?)',[body.publicationId,CHANNEL,fingerprint,version,next,body.filesSha256,body.archivesSha256,JSON.stringify(result)]);
  await db.commit();return {publication:result,replayed:false};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
