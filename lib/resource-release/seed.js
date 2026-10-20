import {readFile} from 'node:fs/promises';
import {CHANNEL,BASELINE,channelVersion} from './policy.js';
export async function seedLauncherConfig(db){
 const config=JSON.parse(await readFile(new URL('../../data/launcher/project-info.seed.json',import.meta.url),'utf8'));
 if(channelVersion(config)!==BASELINE.version)throw Error('Launcher seed baseline changed; use an explicit migration');
 await db.beginTransaction();
 try{
  // Single deterministic row; never replace a config/version already activated in MySQL.
  const [[existing]]=await db.execute('SELECT config_json FROM site_launcher_config WHERE id=1 FOR UPDATE');
  if(existing){
   const [[channel]]=await db.execute('SELECT channel_id FROM site_android_release_channels WHERE channel_id=?',[CHANNEL]);
   if(!channel)throw Error('Existing launcher config has no release channel; restore both from backup, do not reset fingerprints');
  }else{
   await db.execute('INSERT INTO site_launcher_config(id,config_json) VALUES(1,?)',[JSON.stringify(config)]);
   await db.execute('INSERT INTO site_android_release_channels(channel_id,files_sha256,archives_sha256) VALUES(?,?,?)',[CHANNEL,BASELINE.filesSha256,BASELINE.archivesSha256]);
  }
  await db.commit();
 }catch(error){await db.rollback();throw error;}
}
