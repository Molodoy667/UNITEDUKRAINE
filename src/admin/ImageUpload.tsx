import {useRef,useState} from 'react';
import {ImagePlus,LoaderCircle,Trash2} from 'lucide-react';
import {adminWrite,AdminError} from './client';
type Uploaded={url:string;width:number;height:number};
const maxInputBytes=5*1024*1024,maxOutputBytes=3*1024*1024,maxDimension=4096;
async function toWebp(file:File){
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  let width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw new Error('canvas');
  for(let resize=0;resize<12;resize++){
   canvas.width=width;canvas.height=height;context.clearRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
   for(const quality of [.9,.84,.78,.72,.66,.6,.54,.48]){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('encode')),'image/webp',quality));
    if(blob.type!=='image/webp')throw new Error('webp');
    if(blob.size<=maxOutputBytes)return {blob,width,height};
   }
   width=Math.max(1,Math.floor(width*.82));height=Math.max(1,Math.floor(height*.82));
  }
  throw new Error('size');
 }finally{bitmap.close();}
}
async function toPng(file:File){
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  let width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('canvas');
  for(let resize=0;resize<12;resize++){
   canvas.width=width;canvas.height=height;context.clearRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('encode')),'image/png'));
   if(blob.type!=='image/png')throw new Error('png');
   if(blob.size<=maxOutputBytes)return {blob,width,height};
   width=Math.max(1,Math.floor(width*.82));height=Math.max(1,Math.floor(height*.82));
  }
  throw new Error('size');
 }finally{bitmap.close();}
}
function base64(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result),separator=value.indexOf(',');separator<0?reject(new Error('read')):resolve(value.slice(separator+1));};reader.onerror=()=>reject(new Error('read'));reader.onabort=()=>reject(new Error('read'));reader.readAsDataURL(blob);});}
export default function ImageUpload({value,csrf,disabled,onChange,onBusyChange,siteAsset=false,compact=false,format='webp',allowUrl=true}:{value:string;csrf:string;disabled:boolean;onChange:(url:string)=>void;onBusyChange:(busy:boolean)=>void;siteAsset?:boolean;compact?:boolean;format?:'webp'|'png';allowUrl?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef<{data:string;mime:string;requestId:string}|null>(null),locked=useRef(false);
 async function upload(file?:File){
  if(!file||disabled||locked.current)return;
  setError('');setMessage('');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>maxInputBytes){setError('Оберіть PNG, JPEG або WebP розміром до 5 МБ.');return;}
  locked.current=true;setBusy(true);onBusyChange(true);
  try{
   const optimized=format==='png'?await toPng(file):await toWebp(file),mime=`image/${format}`,data=await base64(optimized.blob);
   if(pending.current?.data!==data||pending.current.mime!==mime)pending.current={data,mime,requestId:crypto.randomUUID()};
   const result=await adminWrite<Uploaded>('site-image-upload',pending.current,csrf);onChange(result.url);
   setMessage(`Завантажено як ${format.toUpperCase()}: ${optimized.width} × ${optimized.height}. ${siteAsset?'Зміни набудуть чинності після збереження налаштувань.':'Зображення готове для публікації.'}`);
  }catch(error){
   if(error instanceof AdminError)setError(error.message);
   else setError(error instanceof Error&&error.message==='size'?'Не вдалося стиснути зображення до 3 МБ. Зменште його розмір і спробуйте ще раз.':'Не вдалося обробити зображення. Спробуйте інший файл.');
  }finally{locked.current=false;setBusy(false);onBusyChange(false);}
 }
 return <div className={`sa-image-upload${compact?'':' sa-wide'}`}><label className="sa-upload-button"><ImagePlus size={18}/>{busy?'Обробка та завантаження…':'Завантажити зображення'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void upload(file);}}/></label><small>Зображення до 5 МБ автоматично конвертується у {format.toUpperCase()}, за потреби зменшується до 4096 × 4096 і зберігається у форматі до 3 МБ.</small>{busy&&<LoaderCircle className="cp-spin" size={18}/>} {allowUrl&&<label>Або вставте URL зображення<input maxLength={2048} value={value} disabled={disabled||busy} placeholder="https://" onChange={event=>{onChange(event.target.value);setError('');setMessage('');}}/></label>}{value&&<div className="sa-image-preview"><img key={value} src={value} alt={siteAsset?'Попередній перегляд зображення сайту':'Попередній перегляд зображення'} referrerPolicy="no-referrer" onError={()=>setError('Не вдалося показати зображення. Перевірте URL або завантажте інший файл.')}/><button type="button" disabled={disabled||busy} onClick={()=>{onChange('');setError('');setMessage('');}}><Trash2 size={14}/>{siteAsset?'Очистити зображення':'Очистити посилання'}</button></div>}{error&&<p role="alert" className="cp-error">{error}</p>}{message&&<p role="status" className="sa-success">{message}</p>}</div>;
}
