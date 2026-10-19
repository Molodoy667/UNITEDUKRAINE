import {createHash} from 'node:crypto';
import {AccountError,fail} from '../account/core.js';
import {getMysqlPool} from '../mysql.js';
import {readAccountSession} from '../account/service.js';

export const MAX_IMAGE_BYTES=2*1024*1024;
export const mediaIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const mediaUrl=id=>`/api/media?id=${id}`;
const invalid=()=>fail(400,'invalid_image','Оберіть справжнє PNG, JPEG або WebP до 2 МБ, розміром до 4096 × 4096.');

// Inspect the container and dimension headers. This is not a full image decoder.
export function validateImage(body){
 if(!body||typeof body.data!=='string'||!['image/png','image/jpeg','image/webp'].includes(body.mime)||body.data.length>4*Math.ceil(MAX_IMAGE_BYTES/3)||!body.data.length||body.data.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.data))invalid();
 const data=Buffer.from(body.data,'base64');if(!data.length||data.length>MAX_IMAGE_BYTES||data.toString('base64')!==body.data)invalid();
 let mime,width,height;
 if(data.length>=45&&data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
  if(data.readUInt32BE(8)!==13||data.toString('ascii',12,16)!=='IHDR'||!data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex')))invalid();
  mime='image/png';width=data.readUInt32BE(16);height=data.readUInt32BE(20);
  let offset=8,hasData=false;
  while(offset+12<=data.length){const length=data.readUInt32BE(offset);if(length>data.length-offset-12)invalid();const type=data.toString('ascii',offset+4,offset+8);if(type==='IDAT')hasData=true;offset+=length+12;if(type==='IEND'){if(offset!==data.length)invalid();break;}}
  if(offset!==data.length||!hasData)invalid();
 }else if(data.length>=20&&data[0]===255&&data[1]===216&&data.at(-2)===255&&data.at(-1)===217){
  mime='image/jpeg';let offset=2,hasScan=false;
  while(offset+4<=data.length){if(data[offset++]!==255)invalid();while(data[offset]===255)offset++;const marker=data[offset++];if(offset+2>data.length)invalid();if(marker===0xd9||marker===0||marker===0xd8)invalid();if(marker===1||marker>=0xd0&&marker<=0xd7)continue;const length=data.readUInt16BE(offset);if(length<2||offset+length>data.length)invalid();if(marker===0xda){hasScan=true;break;}if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)invalid();height=data.readUInt16BE(offset+3);width=data.readUInt16BE(offset+5);}offset+=length;}
  if(!hasScan)invalid();
 }else if(data.length>=30&&data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'&&data.readUInt32LE(4)+8===data.length){
  mime='image/webp';let offset=12,hasImage=false;
  while(offset+8<=data.length){const type=data.toString('ascii',offset,offset+4),length=data.readUInt32LE(offset+4),start=offset+8;if(length>data.length-start)invalid();
   if(type==='ANIM'||type==='ANMF')invalid();
   if(type==='VP8X'){if(length!==10||(data[start]&2))invalid();width=1+data.readUIntLE(start+4,3);height=1+data.readUIntLE(start+7,3);}
   if(type==='VP8 '){if(length<10||!data.subarray(start+3,start+6).equals(Buffer.from([157,1,42])))invalid();hasImage=true;width=data.readUInt16LE(start+6)&16383;height=data.readUInt16LE(start+8)&16383;}
   if(type==='VP8L'){if(length<5||data[start]!==47)invalid();hasImage=true;const bits=data.readUInt32LE(start+1);width=1+(bits&16383);height=1+((bits>>>14)&16383);}
   offset=start+length+(length%2);
  }if(offset!==data.length||!hasImage)invalid();
 }else invalid();
 if(mime!==body.mime||!width||!height||width>4096||height>4096)invalid();
 return {data,mime,width,height,size:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}

export function createMediaHandler({pool=getMysqlPool,getSession=readAccountSession}={}){
 return async(request,response)=>{
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','private, no-store');response.setHeader('Vary','Cookie');
  try{
   if(request.method==='OPTIONS'){response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');response.setHeader('Access-Control-Allow-Headers','Accept, Content-Type, X-Unity-Version');return response.status(204).end();}
   if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD, OPTIONS');fail(405,'method_not_allowed','Лише читання.');}
   const id=new URL(request.url,'http://media.local').searchParams.get('id');if(!mediaIdPattern.test(id||''))fail(404,'not_found','Фото не знайдено.');
   const db=pool(),url=mediaUrl(id);
   const [[visible]]=await db.execute("SELECT 1 AS visible FROM site_documents WHERE image=? AND published=1 AND deleted_at IS NULL LIMIT 1",[url]);
   let seo;if(!visible){const [rows]=await db.execute("SELECT 1 AS visible FROM site_settings WHERE setting_key='seo' AND JSON_UNQUOTE(JSON_EXTRACT(value_json,'$.image'))=? LIMIT 1",[url]);seo=rows[0];}
   if(!visible&&!seo){const user=await getSession(request,db);if(Number(user?.admin)!==12)fail(404,'not_found','Фото не знайдено.');}
   const [[item]]=await db.execute('SELECT mime,size_bytes,data FROM site_media WHERE id=?',[id]);if(!item||!['image/png','image/jpeg','image/webp'].includes(item.mime))fail(404,'not_found','Фото не знайдено.');
   if(visible||seo){response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Cache-Control','no-store');}
   response.setHeader('Content-Type',item.mime);response.setHeader('Content-Length',String(item.size_bytes));response.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
   return response.status(200).end(request.method==='HEAD'?undefined:item.data);
  }catch(error){const known=error instanceof AccountError;return response.status(known?error.status:503).json({error:known?error.code:'media_unavailable',message:known?error.message:'Фото тимчасово недоступне. Перевірте міграції.'});}
 };
}
