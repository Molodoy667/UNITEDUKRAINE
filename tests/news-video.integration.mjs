import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAccountHandler} from '../lib/account/service.js';
import {createAdminHandler} from '../lib/admin/service.js';
import {createSiteHandler} from '../lib/site/public.js';
import {createLauncherApi} from '../api/launcher.js';
import {createMediaHandler} from '../lib/site/media.js';
import {VIDEO_PART_BYTES,MAX_VIDEO_BYTES,byteRange,validateMp4} from '../lib/site/news-video.js';
const origin='http://127.0.0.1:5173';
const box=(type,bytes)=>{const header=Buffer.alloc(8);header.writeUInt32BE(8+bytes.length);header.write(type,4);return Buffer.concat([header,bytes]);};
// Synthetic container for transport and structural validation; not a decodable movie.
const clip=Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',Buffer.from('metadata')),box('mdat',Buffer.alloc(5*VIDEO_PART_BYTES,0x56))]);
async function call(handler,url,actor={},body){
 const req={url,method:body===undefined?'GET':'POST',body,headers:{host:'127.0.0.1:5173',origin,'content-type':'application/json',cookie:actor.cookie,'x-account-csrf':actor.csrf},socket:{remoteAddress:'127.0.0.1'}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;},end(){}};
 await handler(req,res);return res;
}
test('MP4 structure, byte ranges, suffix and invalid range validation',()=>{
 assert.doesNotThrow(()=>validateMp4(clip));assert.throws(()=>validateMp4(Buffer.alloc(64)));assert.throws(()=>validateMp4(clip.subarray(0,clip.length-1)));
 assert.deepEqual(byteRange('bytes=-3',10),{start:7,end:9,partial:true});
 assert.deepEqual(byteRange('bytes=2-',10),{start:2,end:9,partial:true});
 for(const range of ['bytes=0-2,4-5','bytes=10-','bytes=2-1','bytes=-0','bytes=9007199254740992-','items=0-2'])assert.equal(byteRange(range,10),null);
});
test('news editor persists video and audience; old photo feeds and public Range work over HTTP',async()=>{
 const fixture=await rouletteDatabase(),{pool}=fixture,options={pool:()=>pool};
 const admin=createAdminHandler(options),account=createAccountHandler({...options,getPresence:async()=>({online:false})}),site=createSiteHandler(options),launcher=createLauncherApi(options),media=createMediaHandler(options);
 const server=createServer((req,res)=>{res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};void media(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const local='http://127.0.0.1:'+server.address().port;
 try{
  await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
  const login=await call(account,'/api/account?action=login',{}, {email:'player@example.test',password:'Synthetic-Game-Password'});
  assert.equal(login.code,200);
  const actor={cookie:login.headers['Set-Cookie'].split(';')[0],csrf:login.body.csrf};
  const write=(action,body,who=actor)=>call(admin,'/api/admin?action='+action,who,{requestId:randomUUID(),...body});
  const start=()=>write('site-video-start',{size:clip.length});
  assert.equal((await write('site-video-start',{size:clip.length},{})).code,401);
  assert.equal((await write('site-video-start',{size:clip.length},{...actor,csrf:'bad'})).code,403);
  assert.equal((await write('site-video-start',{size:MAX_VIDEO_BYTES+1})).code,400);
  const upload=await start();assert.equal(upload.code,200,JSON.stringify(upload.body));const id=upload.body.id;
  assert.equal((await write('site-video-finish',{id})).body.error,'video_incomplete');
  for(let part=0;part*VIDEO_PART_BYTES<clip.length;part++){
   const body={id,part,data:clip.subarray(part*VIDEO_PART_BYTES,(part+1)*VIDEO_PART_BYTES).toString('base64'),requestId:randomUUID()};
   const chunk=await write('site-video-part',body);assert.equal(chunk.code,200,JSON.stringify(chunk.body));
   if(!part)assert.equal((await write('site-video-part',body)).body.replayed,true);
  }
  const done=await write('site-video-finish',{id});assert.equal(done.code,200,JSON.stringify(done.body));const video=done.body.url;
  assert.equal((await fetch(local+video)).status,404);
  const doc={kind:'news',slug:'legacy-photo-test',title:'Photo',excerpt:'Excerpt',body:'Text',image:'/assets/world.jpg',category:'',seo_title:'',seo_description:'',published:true};
  const save=(document,current)=>write('site-document-save',{document,id:current?.id??null,version:current?.version??0});
  const read=async(path='/api/launcher?action=news',handler=launcher)=>{const res=await call(handler,path);assert.equal(res.code,200,JSON.stringify(res.body));return res.body;};
  const [legacy]=await pool.query('INSERT INTO site_documents SET ?',[{...doc,published_at:new Date()}]);
  const photo={body:{id:legacy.insertId,version:1}};
  let feed=await read();assert.equal(feed.schemaVersion,1);assert.deepEqual(Object.keys(feed.news.find(n=>n.id===photo.body.id)),['id','title','excerpt','image','url','publishedAt']);
  assert.equal((await save({...doc,video})).body.error,'mixed_news_media');
  assert.equal((await save({...doc,slug:'unfinished',image:'',video:'/media/news/'+(await start()).body.id+'.mp4'})).body.error,'video_not_ready');
  assert.equal((await save({...doc,image:'',video:'https://youtube.example/watch?v=12'})).body.error,'invalid_video');
  const withVisibility=(showInLauncher,showInFeed)=>({...doc,slug:'only-launcher',image:'',video,showInLauncher,showInFeed});
  assert.equal((await save({...withVisibility(false,false),showInFeed:'true'})).code,400);
  const only=await save(withVisibility(true,false));assert.equal(only.code,200,JSON.stringify(only.body));
  assert.ok(!(await read()).news.some(n=>n.id===only.body.id));
  assert.ok(!(await read('/api/site?action=news&audience=launcher',site)).news.some(n=>n.id===only.body.id));
  assert.ok(!(await read('/api/site',site)).news.some(n=>n.id===only.body.id));
  assert.equal((await call(site,'/api/site?action=document&kind=news&slug=only-launcher')).code,404);
  feed=await read('/api/launcher?action=news&audience=launcher');
  const item=feed.news.find(n=>n.id===only.body.id);assert.equal(item.launcherOnly,true);assert.equal(item.hasPage,false);assert.equal(item.image,'');assert.equal(item.video,'https://united-rp.com.ua'+video);assert.ok(feed.news.some(n=>n.id===photo.body.id));
  const first=VIDEO_PART_BYTES-3,last=VIDEO_PART_BYTES+3;
  const range=await fetch(local+video,{headers:{Range:'bytes='+first+'-'+last}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');assert.equal(range.headers.get('accept-ranges'),'bytes');assert.equal(range.headers.get('content-range'),`bytes ${first}-${last}/${clip.length}`);assert.deepEqual(Buffer.from(await range.arrayBuffer()),clip.subarray(first,last+1));
  const full=await fetch(local+'/api/media?video='+id);assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),clip);
  const head=await fetch(local+video,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(clip.length));assert.equal(await head.text(),'');
  const bad=await fetch(local+video,{headers:{Range:'bytes=999999999-'}});assert.equal(bad.status,416);assert.equal(bad.headers.get('content-range'),'bytes */'+clip.length);
  let current=only.body;
  for(const [inLauncher,inFeed] of [[false,true],[true,true],[false,false]]){
   const updated=await save(withVisibility(inLauncher,inFeed),current);assert.equal(updated.code,200);current=updated.body;
   const home=await read('/api/site',site),windows=await read('/api/launcher?action=news&audience=launcher');
   assert.equal(home.news.some(n=>n.id===current.id),inFeed);
   assert.equal(windows.news.some(n=>n.id===current.id),inLauncher);
   assert.ok(!(await read()).news.some(n=>n.id===current.id));
   assert.equal((await call(site,'/api/site?action=document&kind=news&slug=only-launcher')).code,404);
   assert.equal((await fetch(local+video,{method:'HEAD'})).status,inLauncher||inFeed?200:404);
   if(inLauncher){const row=windows.news.find(n=>n.id===current.id);assert.equal(row.hasPage,false);assert.equal(row.launcherOnly,undefined);}
  }
  const turnedVideo=await save({...doc,image:'',video},photo.body);assert.equal(turnedVideo.code,200);
  const switched=await save({...withVisibility(false,true),image:doc.image,video:''},current);assert.equal(switched.code,200);
  assert.ok((await read('/api/site',site)).news.find(n=>n.id===current.id).image);
  assert.equal((await save(doc,turnedVideo.body)).code,200);
  assert.ok(!(await read('/api/launcher?action=news&audience=launcher')).news.some(n=>n.video));
  assert.equal((await fetch(local+video)).status,404);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fixture.close();}
});
