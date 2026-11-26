import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {ArrowRight,CheckCircle2,LockKeyhole,RefreshCw,ShieldCheck,Sparkles,Wrench} from 'lucide-react';
import {useSite} from './content';
import './site-mode.css';

type AccessCheck={authenticated:boolean;isSiteAdmin:boolean};
type CheckState={status:'idle'|'checking'|'done'|'error';value:AccessCheck;revision:number};
const emptyAccess:AccessCheck={authenticated:false,isSiteAdmin:false};
function safeReturn(value:string|null|undefined){
 if(!value||!value.startsWith('/')||/[\r\n]/.test(value))return '/';
 try{const url=new URL(value,window.location.origin);if(url.origin!==window.location.origin||url.pathname==='/account'&&url.searchParams.get('site-login')==='1')return '/';return url.pathname+url.search+url.hash;}catch{return '/';}
}
function storedReturn(){try{return sessionStorage.getItem('uu-site-return');}catch{return null;}}
function requestedPath(){
 const params=new URLSearchParams(window.location.search);
 if(window.location.pathname==='/site-access')return safeReturn(params.get('returnTo')||storedReturn());
 if(window.location.pathname==='/account'&&params.get('site-login')==='1')return safeReturn(params.get('returnTo')||storedReturn());
 return safeReturn(window.location.pathname+window.location.search+window.location.hash);
}
function loginHref(){
 const url=new URL('/account',window.location.origin);url.searchParams.set('site-login','1');url.searchParams.set('returnTo',requestedPath());return url.pathname+url.search;
}
function setAccessUrl(){
 const returnTo=requestedPath();try{sessionStorage.setItem('uu-site-return',returnTo);}catch{}
 const url=new URL('/site-access',window.location.origin);url.searchParams.set('returnTo',returnTo);window.history.replaceState(null,'',url.pathname+url.search);
}
function returnFromGate(){
 const target=safeReturn(new URLSearchParams(window.location.search).get('returnTo')||storedReturn());
 try{sessionStorage.removeItem('uu-site-return');}catch{}
 window.location.replace(target);
}

function SiteModeScreen({mode,message,checking,error,onRetry}:{mode:'authenticated'|'maintenance';message:string;checking?:boolean;error?:boolean;onRetry?:()=>void}){
 const restricted=mode==='authenticated';
 useEffect(()=>{const previous=document.title,title=restricted?'Доступ лише для авторизованих — United Ukraine':error?'Перевірка доступу — United Ukraine':'Технічні роботи — United Ukraine';document.title=title;let robots=document.head.querySelector<HTMLMetaElement>('meta[name="robots"]'),created=false;if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots);created=true;}const previousRobots=robots.content;robots.content='noindex,nofollow';return()=>{document.title=previous;if(robots){if(created)robots.remove();else robots.content=previousRobots;}};},[restricted,error]);
 return <main className={`site-mode-page ${restricted?'site-mode-private':'site-mode-maintenance'}`}>
  <div className="site-mode-backdrop" aria-hidden="true"><img src="/assets/world-promo.webp" alt=""/><span/><i/><b/></div>
  <div className="site-mode-orbit" aria-hidden="true"><span/><span/><span/></div>
  <section className="site-mode-card" aria-labelledby="site-mode-title">
   <a className="site-mode-brand" href="/" aria-label="United Ukraine"><img src="/assets/logo.webp" alt=""/><span>UNITED<small>UKRAINE · ROLEPLAY</small></span></a>
   <div className="site-mode-icon" aria-hidden="true">{restricted?<LockKeyhole size={24}/>:<Wrench size={24}/>}<span/></div>
   <span className="site-mode-eyebrow">{restricted?'ПРИВАТНИЙ ПРОСТІР':'КОРОТКА ПАУЗА'}</span>
   <h1 id="site-mode-title">{checking?'Перевіряємо доступ…':error?'Не вдалося перевірити доступ':restricted?'Вибачте, сайт доступний лише для авторизованих':'Сайт тимчасово на технічному обслуговуванні'}</h1>
   <p>{checking?'Зачекайте, перевіряємо ваш сеанс.':error?'Не вдалося зв’язатися з сервісом авторизації. Оновіть перевірку, щоб продовжити.':restricted?'Увійдіть у свій акаунт, щоб переглядати сторінки та розділи United Ukraine.':message}</p>
   {error?<button className="site-mode-action" type="button" onClick={onRetry}><RefreshCw size={17}/> Перевірити ще раз</button>:checking?<div className="site-mode-progress" role="status"><span/><small>Зачекайте кілька секунд</small></div>:restricted?<a className="site-mode-action" href={loginHref()}><LockKeyhole size={17}/> Увійти до акаунта <ArrowRight size={17}/></a>:<a className="site-mode-action site-mode-admin" href={loginHref()}><ShieldCheck size={17}/> Вхід адміністратора <ArrowRight size={17}/></a>}
   {!checking&&!error&&<div className="site-mode-foot"><span><CheckCircle2 size={14}/> {restricted?'Ваш доступ захищений':'Команда вже працює над оновленням'}</span><Sparkles size={16}/></div>}
  </section>
  <div className="site-mode-bottom"><span>UNITED UKRAINE</span><span>ТВОЯ КРАЇНА. ТВОЯ ІСТОРІЯ.</span></div>
 </main>;
}

export default function SiteModeGate({children}:{children:ReactNode}){
 const {data,loading,error}=useSite(),mode=data.access?.mode||'normal';
 const [check,setCheck]=useState<CheckState>({status:'idle',value:emptyAccess,revision:0});
 const needsAuth=mode!=='normal';
 useEffect(()=>{
  if(loading||error||!needsAuth){setCheck(current=>({...current,status:'idle',value:emptyAccess}));return;}
  let active=true;const controller=new AbortController();setCheck(current=>({...current,status:'checking',value:emptyAccess}));
  const verify=()=>fetch('/api/account?action=access',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}).then(async response=>{const result=await response.json();if(!response.ok||typeof result?.authenticated!=='boolean'||typeof result?.isSiteAdmin!=='boolean')throw new Error('access_check');if(active)setCheck(current=>({...current,status:'done',value:{authenticated:result.authenticated,isSiteAdmin:result.isSiteAdmin}}));}).catch(()=>{if(active&&!controller.signal.aborted)setCheck(current=>({...current,status:'error',value:emptyAccess}));});
  const refresh=()=>{if(active)setCheck(current=>({...current,status:'idle',value:emptyAccess,revision:current.revision+1}));};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  const interval=window.setInterval(refresh,60000);
  void verify();window.addEventListener('site-auth-changed',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;window.clearInterval(interval);controller.abort();window.removeEventListener('site-auth-changed',refresh);document.removeEventListener('visibilitychange',visible);};
 },[loading,error,needsAuth,check.revision]);

 const isLoginEntry=useMemo(()=>window.location.pathname==='/account'&&new URLSearchParams(window.location.search).get('site-login')==='1',[]);
 const permitted=mode==='normal'||check.status==='done'&&(mode==='authenticated'?check.value.authenticated:check.value.isSiteAdmin);
 const loginEntryAllowed=isLoginEntry&&(check.status!=='done'||!check.value.authenticated||permitted);
 useEffect(()=>{
  const path=window.location.pathname;
  if(!loading&&!error&&mode==='normal'&&path==='/site-access'){returnFromGate();return;}
  if(!loading&&!error&&needsAuth&&check.status==='done'&&permitted&&(path==='/site-access'||isLoginEntry)){returnFromGate();return;}
  if(!loading&&!error&&needsAuth&&check.status==='done'&&!permitted&&!loginEntryAllowed&&path!=='/site-access')setAccessUrl();
 },[loading,error,mode,needsAuth,check.status,permitted,loginEntryAllowed,isLoginEntry]);

 if(loading)return <div className="site-mode-wait" role="status"><span/>Завантажуємо налаштування доступу…</div>;
 if(error)return <SiteModeScreen mode="maintenance" message="" error onRetry={()=>window.location.reload()}/>;
 if(!needsAuth&&window.location.pathname==='/site-access')return <div className="site-mode-wait" role="status"><span/>Повертаємося на сайт…</div>;
 if(!needsAuth)return children;
 if(loginEntryAllowed)return children;
 if(check.status==='checking'||check.status==='idle')return <SiteModeScreen mode={mode} message={data.access.maintenanceMessage} checking/>;
 if(check.status==='error')return <SiteModeScreen mode={mode} message={data.access.maintenanceMessage} error onRetry={()=>setCheck(current=>({...current,status:'idle',revision:current.revision+1}))}/>;
 if(permitted)return children;
 return <SiteModeScreen mode={mode} message={data.access.maintenanceMessage}/>;
}
