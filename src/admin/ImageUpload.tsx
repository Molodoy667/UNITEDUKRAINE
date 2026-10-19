import {useRef,useState} from 'react';
import {ImagePlus,LoaderCircle,Trash2} from 'lucide-react';
import {adminWrite,AdminError} from './client';
type Uploaded={url:string;width:number;height:number};
const maxBytes=2*1024*1024;
export default function ImageUpload({value,csrf,disabled,onChange,onBusyChange}:{value:string;csrf:string;disabled:boolean;onChange:(url:string)=>void;onBusyChange:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef<{data:string;mime:string;requestId:string}|null>(null),locked=useRef(false);
 async function upload(file?:File){
  if(!file||disabled||locked.current)return;
  setError('');setMessage('');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>maxBytes||!file.size){setError('Оберіть PNG, JPEG або WebP до 2 МБ.');return;}
  locked.current=true;setBusy(true);onBusyChange(true);
  try{
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('read'));reader.onabort=()=>reject(Error('read'));reader.readAsDataURL(file);});
   if(pending.current?.data!==data||pending.current.mime!==file.type)pending.current={data,mime:file.type,requestId:crypto.randomUUID()};
   const result=await adminWrite<Uploaded>('site-image-upload',pending.current,csrf);onChange(result.url);setMessage(`Фото збережено в базі · ${result.width} × ${result.height}. Збережіть новину, щоб прикріпити його.`);
  }catch(error){setError(error instanceof AdminError?error.message:'Фото не завантажено або відповідь втрачена. Оберіть той самий файл для повтору.');}
  finally{locked.current=false;setBusy(false);onBusyChange(false);}
 }
 return <div className="sa-image-upload sa-wide"><label className="sa-upload-button"><ImagePlus size={18}/>{busy?'Завантажуємо фото…':'Завантажити фото з комп’ютера'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void upload(file);}}/></label><small>PNG, JPEG або WebP · до 2 МБ · до 4096 × 4096. Завантажене фото стане публічним після публікації матеріалу.</small>{busy&&<LoaderCircle className="cp-spin" size={18}/>}<label>Або посилання на зображення<input maxLength={2048} value={value} disabled={disabled||busy} placeholder="https://…" onChange={event=>{onChange(event.target.value);setError('');setMessage('');}}/></label>{value&&<div className="sa-image-preview"><img key={value} src={value} alt="Попередній перегляд фото новини" referrerPolicy="no-referrer" onError={()=>setError('Не вдалося відкрити фото. Перевірте посилання або завантажте інший файл.')}/><button type="button" disabled={disabled||busy} onClick={()=>{onChange('');setError('');setMessage('');}}><Trash2 size={14}/>Прибрати з матеріалу</button></div>}{error&&<p role="alert" className="cp-error">{error}</p>}{message&&<p role="status" className="sa-success">{message}</p>}</div>;
}
