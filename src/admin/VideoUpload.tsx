import {useRef,useState} from 'react';
import {Film,Trash2} from 'lucide-react';
import {adminWrite,AdminError,type AdminWriteAction} from './client';

const maxBytes=20*1024*1024;
type Props={value:string;csrf:string;disabled:boolean;onChange:(value:string)=>void;onBusyChange:(busy:boolean)=>void};
export default function VideoUpload({value,csrf,disabled,onChange,onBusyChange}:Props){
 const active=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 async function send<T>(action:AdminWriteAction,fields:Record<string,unknown>){
  const payload={...fields,requestId:crypto.randomUUID()};
  try{return await adminWrite<T>(action,payload,csrf);}
  catch(err){if(err instanceof AdminError&&err.status<500)throw err;return adminWrite<T>(action,payload,csrf);}
 }
 async function upload(file?:File){
  if(!file||disabled||active.current)return;
  setError('');setProgress('');
  if(!/\.mp4$/i.test(file.name)||file.size<32||file.size>maxBytes){setError('Оберіть MP4 до 20 МіБ.');return;}
  active.current=true;setBusy(true);onBusyChange(true);
  try{
   const {id,partBytes}=await send<{id:string;partBytes:number}>('site-video-start',{size:file.size});
   if(!Number.isSafeInteger(partBytes)||partBytes<1||partBytes>1024*1024)throw Error('part size');
   for(let part=0;part*partBytes<file.size;part++){
    setProgress(`Завантажуємо відео · ${part+1} / ${Math.ceil(file.size/partBytes)}`);
    const blob=file.slice(part*partBytes,(part+1)*partBytes);
    const data=await new Promise<string>((resolve,reject)=>{
     const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('read'));reader.onabort=()=>reject(Error('read'));reader.readAsDataURL(blob);
    });
    await send('site-video-part',{id,part,data});
   }
   setProgress('Перевіряємо MP4…');
   const result=await send<{url:string}>('site-video-finish',{id});onChange(result.url);setProgress('Відео готове. Збережіть новину, щоб прикріпити його.');
  }catch(err){setError(err instanceof AdminError?err.message:'Відео не завантажено. Повторіть спробу.');setProgress('');}
  finally{active.current=false;setBusy(false);onBusyChange(false);}
 }
 return <div className="sa-image-upload sa-wide">
  <label className="sa-upload-button"><Film size={18}/>Завантажити MP4 з комп’ютера<input type="file" accept="video/mp4,.mp4" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void upload(file);}}/></label>
  <small>MP4 · до 20 МіБ. Для Windows рекомендовано H.264 з AAC. Посилання на YouTube не підтримуються.</small>
  {value&&<div className="sa-image-preview"><video controls preload="metadata" src={value} style={{width:'min(100%, 360px)',maxHeight:240}}/><button type="button" disabled={disabled||busy} onClick={()=>{onChange('');setProgress('');setError('');}}><Trash2 size={14}/>Прибрати з матеріалу</button></div>}
  {progress&&<p role="status">{progress}</p>}{error&&<p role="alert" className="cp-error">{error}</p>}
 </div>;
}
