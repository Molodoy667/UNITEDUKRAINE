import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,LoaderCircle,Plus,RefreshCw,Save,Trash2} from 'lucide-react';
import {adminRead,adminWrite,AdminError} from './client';
import {SettingsForm} from './ContentAdmin';
import ImageUpload from './ImageUpload';
import type {SiteBuilderSettings,SiteMenuLink} from '../site/content';

type Setting<T>={value:T;version:number;updatedAt:string};
type Settings={home:Setting<Record<string,string|boolean>>;builder:Setting<SiteBuilderSettings>};
const failure=(error:unknown)=>error instanceof AdminError?error.message:'Не вдалося завантажити налаштування сайту.';

function BuilderEditor({setting,csrf,onSaved}:{setting:Setting<SiteBuilderSettings>;csrf:string;onSaved:()=>void}){
 const [value,setValue]=useState(setting.value),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const pending=useRef<{signature:string;id:string}|null>(null),activeUploads=useRef(new Set<string>());
 function updateImage(key:'logo'|'hero'|'world'|'gallery1'|'gallery2'|'gallery3',url:string){
  if(key==='logo')setValue(previous=>({...previous,logo:url}));
  else setValue(previous=>({...previous,images:{...previous.images,[key]:url}}));
 }
 function updateLink(id:string,key:'label'|'href',next:string){setValue(previous=>({...previous,navigation:previous.navigation.map(item=>item.id===id?{...item,[key]:next}:item)}));}
 function move(index:number,direction:-1|1){setValue(previous=>{const navigation=[...previous.navigation],target=index+direction;if(target<0||target>=navigation.length)return previous;[navigation[index],navigation[target]]=[navigation[target],navigation[index]];return {...previous,navigation};});}
 function uploadBusy(key:string,isBusy:boolean){if(isBusy)activeUploads.current.add(key);else activeUploads.current.delete(key);setUploading(activeUploads.current.size>0);}
 async function save(){if(busy||uploading)return;setBusy(true);setError('');setMessage('');const signature=JSON.stringify({group:'builder',value,version:setting.version});if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};try{await adminWrite('site-settings-save',{group:'builder',value,version:setting.version,requestId:pending.current.id},csrf);setMessage('Зміни збережено. Вони вже використовуються на публічному сайті.');onSaved();}catch(error){setError(failure(error));}finally{setBusy(false);}}
 const linkFields=(item:SiteMenuLink,index:number)=><fieldset className="sa-builder-link" key={item.id}><legend>Пункт меню {index+1}</legend><div className="sa-builder-link-fields"><label>Назва<input required maxLength={60} value={item.label} disabled={busy||uploading} onChange={event=>updateLink(item.id,'label',event.target.value)}/></label><label>Адреса<input required maxLength={2048} value={item.href} disabled={busy||uploading} placeholder="/wiki або https://…" onChange={event=>updateLink(item.id,'href',event.target.value)}/><small>Внутрішній шлях починається з /; зовнішні адреси — лише HTTPS.</small></label></div><div className="sa-builder-link-actions"><button type="button" aria-label={`Перемістити пункт ${index+1} вгору`} disabled={busy||uploading||index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/>Вгору</button><button type="button" aria-label={`Перемістити пункт ${index+1} вниз`} disabled={busy||uploading||index===value.navigation.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/>Вниз</button><button type="button" disabled={busy||uploading} onClick={()=>setValue(previous=>({...previous,navigation:previous.navigation.filter(link=>link.id!==item.id)}))}><Trash2 size={15}/>Прибрати</button></div></fieldset>;
 return <form className="sa-form sa-builder-form" onSubmit={event=>{event.preventDefault();void save();}}>
  <div className="sa-title"><h3>Вигляд і навігація</h3><small>Версія {setting.version}</small></div>
  <p className="sa-note">Змінюйте логотип, порядок посилань у меню та ключові зображення головної. Тексти заголовка й описів редагуються нижче.</p>
  <div className="sa-builder-brand"><h4>Логотип</h4><ImageUpload value={value.logo} csrf={csrf} disabled={busy||uploading} siteAsset compact onChange={url=>updateImage('logo',url)} onBusyChange={isBusy=>uploadBusy('logo',isBusy)}/></div>
  <div className="sa-builder-navigation"><div className="sa-builder-heading"><div><h4>Пункти головного меню</h4><small>Пересувайте посилання кнопками «Вгору» та «Вниз».</small></div><button type="button" disabled={busy||uploading||value.navigation.length>=12} onClick={()=>setValue(previous=>({...previous,navigation:[...previous.navigation,{id:crypto.randomUUID(),label:'Новий пункт',href:'/'}]}))}><Plus size={16}/>Додати пункт</button></div><div className="sa-builder-links">{value.navigation.map(linkFields)}</div></div>
  <div className="sa-builder-media"><div className="sa-builder-heading"><div><h4>Зображення головної сторінки</h4><small>Завантажуйте PNG, JPEG або WebP до 2 МБ або вставляйте HTTPS-посилання.</small></div></div><div className="sa-builder-image-grid">
   <ImageUpload value={value.images.hero} csrf={csrf} disabled={busy||uploading} siteAsset compact onChange={url=>updateImage('hero',url)} onBusyChange={isBusy=>uploadBusy('hero',isBusy)}/>
   <ImageUpload value={value.images.world} csrf={csrf} disabled={busy||uploading} siteAsset compact onChange={url=>updateImage('world',url)} onBusyChange={isBusy=>uploadBusy('world',isBusy)}/>
   {(['gallery1','gallery2','gallery3'] as const).map((key,index)=><ImageUpload key={key} value={value.images[key]} csrf={csrf} disabled={busy||uploading} siteAsset compact onChange={url=>updateImage(key,url)} onBusyChange={isBusy=>uploadBusy(key,isBusy)}/>)}</div></div>
  {error&&<p role="alert" className="cp-error">{error}</p>}{message&&<p role="status" className="sa-success">{message}</p>}
  <button className="cp-primary" type="submit" disabled={busy||uploading}>{busy?<LoaderCircle size={16} className="cp-spin"/>:<Save size={16}/>}Зберегти конструктор</button>
 </form>;
}

export default function SiteBuilder({csrf}:{csrf:string}){
 const [settings,setSettings]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setBusy(true);setError('');adminRead<{settings:Settings}>('site-settings',{},controller.signal).then(result=>{if(!controller.signal.aborted)setSettings(result.settings);}).catch(reason=>{if(!controller.signal.aborted){setError(failure(reason));setSettings(null);}}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});return()=>controller.abort();},[revision]);
 return <section className="sa-content sa-builder"><div className="sa-title"><h2>Редагування сайту</h2><button onClick={()=>{setNotice('');setRevision(value=>value+1);}} disabled={busy}><RefreshCw size={15}/>Оновити</button></div><p className="sa-note">Тут змінюються меню, логотип, основні зображення й тексти головної. Новини та сторінки редагуються в сусідніх розділах адмінки.</p>{error&&<p role="alert" className="cp-error">{error}</p>}{notice&&<p role="status" className="sa-success">{notice}</p>}{busy&&!settings?<p role="status"><LoaderCircle size={20} className="cp-spin"/>Читаємо налаштування сайту…</p>:settings&&<><BuilderEditor key={`builder:${settings.builder.version}`} setting={settings.builder} csrf={csrf} onSaved={()=>{setNotice('Вигляд і меню збережено.');setRevision(value=>value+1);}}/><SettingsForm key={`home:${settings.home.version}`} group="home" title="Тексти головної сторінки" setting={settings.home} csrf={csrf} onRefresh={()=>{setNotice('Тексти головної збережено.');setRevision(value=>value+1);}}/></>}</section>;
}
