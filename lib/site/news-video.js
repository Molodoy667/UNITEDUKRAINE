import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fail} from '../account/core.js';

export const VIDEO_PART_BYTES=1024*1024;
export const MAX_VIDEO_BYTES=20*VIDEO_PART_BYTES;
export const videoWrites=['site-video-start','site-video-part','site-video-finish'];
const idSource='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const idPattern=new RegExp('^'+idSource+'$');
const pathPattern=new RegExp('^/media/news/('+idSource+')\\.mp4$');
export const videoPath=id=>'/media/news/'+id+'.mp4';
export const videoPathId=path=>typeof path==='string'?pathPattern.exec(path)?.[1]:undefined;
const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
const invalid=()=>fail(400,'invalid_video','Оберіть коректний MP4 до 20 МіБ.');

// Validate ISO BMFF container bounds, not the codec or decodability of every frame.
export function validateMp4(data){
 if(!Buffer.isBuffer(data)||data.length<32||data.length>MAX_VIDEO_BYTES)invalid();
 let pos=0,metadata=false,payload=false;
 while(pos<data.length){
  if(data.length-pos<8)invalid();
  let length=data.readUInt32BE(pos),header=8;const type=data.toString('latin1',pos+4,pos+8);
  if(length===1){if(data.length-pos<16)invalid();const n=data.readBigUInt64BE(pos+8);if(n>BigInt(data.length-pos))invalid();length=Number(n);header=16;}
  if(length===0)length=data.length-pos;
  if(length<header||length>data.length-pos)invalid();
  if(pos===0&&(type!=='ftyp'||length<header+8||data.toString('ascii',pos+header,pos+header+4)==='qt  '))invalid();
  if(type==='moov'&&length>header)metadata=true;
  if(type==='mdat'&&length>header)payload=true;
  pos+=length;
 }
 if(!metadata||!payload)invalid();
}
export async function writeNewsVideo(db,user,action,body){
 const keys=action==='site-video-start'?['requestId','size']:action==='site-video-part'?['requestId','id','part','data']:['requestId','id'];
 if(Object.keys(body).length!==keys.length||keys.some(key=>!Object.hasOwn(body,key)))invalid();
 let id=body.id,result,after;
 if(action==='site-video-start'){
  if(!Number.isInteger(body.size)||body.size<32||body.size>MAX_VIDEO_BYTES)invalid();
  id=randomUUID();
  await rows(db,'INSERT INTO site_news_videos(id,size_bytes,owner_id) VALUES(?,?,?)',[id,body.size,user.id]);
  after={size:body.size};result={id,partBytes:VIDEO_PART_BYTES};
 }else{
  if(typeof id!=='string'||!idPattern.test(id))invalid();
  const [video]=await rows(db,'SELECT size_bytes,ready,owner_id FROM site_news_videos WHERE id=? FOR UPDATE',[id]);
  if(!video||Number(video.owner_id)!==Number(user.id))fail(404,'video_not_found','Завантаження не знайдено.');
  const count=Math.ceil(video.size_bytes/VIDEO_PART_BYTES);
  if(action==='site-video-part'){
   if(video.ready)fail(409,'video_ready','Готове відео не можна змінити.');
   if(!Number.isInteger(body.part)||body.part<0||body.part>=count||typeof body.data!=='string')invalid();
   const expected=Math.min(VIDEO_PART_BYTES,video.size_bytes-body.part*VIDEO_PART_BYTES);
   if(body.data.length!==4*Math.ceil(expected/3))invalid();
   const bytes=Buffer.from(body.data,'base64');
   if(bytes.length!==expected||bytes.toString('base64')!==body.data)invalid();
   const [old]=await rows(db,'SELECT data FROM site_news_video_chunks WHERE video_id=? AND part=?',[id,body.part]);
   if(old&&!old.data.equals(bytes))fail(409,'video_part_conflict','Ця частина вже має інший вміст.');
   if(!old)await rows(db,'INSERT INTO site_news_video_chunks(video_id,part,data) VALUES(?,?,?)',[id,body.part,bytes]);
   after={part:body.part,size:expected};result={id,part:body.part};
  }else{
   if(!video.ready){
    const parts=await rows(db,'SELECT part,data FROM site_news_video_chunks WHERE video_id=? ORDER BY part',[id]);
    if(parts.length!==count||parts.some((p,i)=>p.part!==i||p.data.length!==Math.min(VIDEO_PART_BYTES,video.size_bytes-i*VIDEO_PART_BYTES)))fail(409,'video_incomplete','Не всі частини відео завантажено.');
    validateMp4(Buffer.concat(parts.map(p=>p.data)));
    await rows(db,'UPDATE site_news_videos SET ready=1 WHERE id=?',[id]);
   }
   after={ready:true};result={id,url:videoPath(id)};
  }
 }
 return {before:null,after,target:'video:'+id,result};
}

// Single RFC byte range; malformed, multiple or out-of-bounds ranges are rejected.
export function byteRange(value,size){
 if(value===undefined)return {start:0,end:size-1,partial:false};
 const match=typeof value==='string'&&/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2]))return null;
 const a=Number(match[1]),b=Number(match[2]);
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))return null;
 const start=match[1]?a:Math.max(0,size-b),end=match[1]&&match[2]?Math.min(b,size-1):size-1;
 return start<size&&start<=end?{start,end,partial:true}:null;
}
export async function serveNewsVideo(request,response,db,id,getSession){
 if(!idPattern.test(id))fail(404,'not_found','Відео не знайдено.');
 const [item]=await rows(db,`SELECT size_bytes,EXISTS(SELECT 1 FROM site_news_options o JOIN site_documents d ON d.id=o.document_id
  WHERE o.video_id=v.id AND (o.placement IS NULL OR o.placement>0) AND d.kind='news' AND d.published=1 AND d.deleted_at IS NULL) AS visible
  FROM site_news_videos v WHERE v.id=? AND v.ready=1`,[id]);
 if(!item||(!item.visible&&Number((await getSession(request,db))?.admin)!==12))fail(404,'not_found','Відео не знайдено.');
 const size=item.size_bytes,etag='"'+id+'"';
 const range=byteRange(request.headers?.['if-range']&&request.headers['if-range']!==etag?undefined:request.headers?.range,size);
 response.setHeader('Accept-Ranges','bytes');response.setHeader('ETag',etag);
 if(item.visible){response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Expose-Headers','Accept-Ranges, Content-Range, ETag');}
 if(!range){response.setHeader('Content-Range','bytes */'+size);return response.status(416).end();}
 response.setHeader('Content-Type','video/mp4');response.setHeader('Content-Length',String(range.end-range.start+1));
 response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
 if(range.partial)response.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${size}`);
 response.status(range.partial?206:200);
 if(request.method==='HEAD')return response.end();
 async function* stream(){
  for(let i=Math.floor(range.start/VIDEO_PART_BYTES);i<=Math.floor(range.end/VIDEO_PART_BYTES);i++){
   const [part]=await rows(db,'SELECT data FROM site_news_video_chunks WHERE video_id=? AND part=?',[id,i]);
   const base=i*VIDEO_PART_BYTES;
   if(!part||part.data.length!==Math.min(VIDEO_PART_BYTES,size-base))throw Error('Missing video chunk');
   yield part.data.subarray(Math.max(0,range.start-base),Math.min(part.data.length,range.end-base+1));
  }
 }
 await pipeline(Readable.from(stream()),response);
}
