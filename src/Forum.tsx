import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Bell, House, LogIn, LogOut, MessageCircle, Search, Settings as SettingsIcon, ShieldCheck, Users } from 'lucide-react';
import { Header, Footer } from '@/components/site-shell';
import { api, href, read, setCsrf, type RecordData } from './forum/client';
import { ForumContext } from './forum/context';
import { Avatar, Badge, ErrorNotice, Loading, Panel } from './forum/ui';
import { BoardHome, NewTopic, Topic, Topics } from './forum/Discussions';
import { Members, Messages, Notifications, Profile, Settings } from './forum/People';
import Auth from './forum/Auth';
import './forum/forum.css';

const Admin=lazy(()=>import('./forum/Admin'));
const Moderation=lazy(()=>import('./forum/Admin').then(module=>({default:module.Moderation})));
export default function Forum(){
  const [query,setQuery]=useState(()=>new URLSearchParams(window.location.search)),[revision,setRevision]=useState(0),[bootstrap,setBootstrap]=useState<RecordData|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[unread,setUnread]=useState(0);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  const notice=useCallback((value:string)=>{setMessage(value);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),6000);},[]);
  const navigate=useCallback((view:string,values:Record<string,string|number>={})=>{window.history.pushState(null,'',href(view,values));setQuery(new URLSearchParams(window.location.search));window.scrollTo({top:0,behavior:'instant'});},[]);
  useEffect(()=>{const change=()=>setQuery(new URLSearchParams(window.location.search));window.addEventListener('popstate',change);return()=>{window.removeEventListener('popstate',change);clearTimeout(timer.current);};},[]);
  useEffect(()=>{const controller=new AbortController();read('bootstrap',{},controller.signal).then(data=>{setBootstrap(data);setCsrf(data.csrf);setError('');}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[revision]);
  useEffect(()=>{if(!bootstrap?.user){setUnread(0);return;}const controller=new AbortController();const update=()=>read('notifications',{size:10},controller.signal).then(data=>setUnread(data.unread)).catch(()=>{});void update();const interval=setInterval(()=>{if(document.visibilityState==='visible')void update();},60000);return()=>{controller.abort();clearInterval(interval);};},[bootstrap?.user?.id,revision]);
  const view=query.get('view')||'home',user=bootstrap?.user;
  const staff=Boolean(user&&(user.permissions?.some((value:string)=>['*','moderate','manage','reports'].includes(value))||user.moderated?.length)),admin=user?.permissions?.some((value:string)=>['*','manage'].includes(value));
  useEffect(()=>{document.title=`${view==='home'?'Форум':({topics:'Обговорення',settings:'Налаштування',messages:'Повідомлення',notifications:'Сповіщення',admin:'Адміністрування',moderation:'Модерація',login:'Вхід',register:'Реєстрація'} as Record<string,string>)[view]||'Форум'} — United Ukraine`;},[view]);
  let page;
  if(['login','register','recover','confirm'].includes(view))page=<Auth key={view} mode={view} query={query}/>;
  else if(view==='home')page=<BoardHome/>;
  else if(view==='board'||view==='topics')page=<Topics key={`${view}-${query.get('id')}`} query={query} boardMode={view==='board'}/>;
  else if(view==='new')page=<NewTopic key={query.get('board')} query={query}/>;
  else if(view==='topic')page=<Topic key={query.get('id')} query={query}/>;
  else if(view==='members')page=<Members query={query}/>;
  else if(view==='profile')page=<Profile key={query.get('id')} query={query}/>;
  else if(view==='settings')page=<Settings/>;
  else if(view==='notifications')page=<Notifications query={query}/>;
  else if(view==='messages'||view==='conversation')page=<Messages key={`${view}-${query.get('id')}`} query={query} conversation={view==='conversation'}/>;
  else if(view==='admin')page=<Admin query={query}/>;
  else if(view==='moderation')page=<Moderation/>;
  else page=<Panel><h1>Сторінку не знайдено</h1><a href={href()}>На головну форуму</a></Panel>;
  function handleNavigation(event: React.MouseEvent<HTMLElement>) {
    const anchor=(event.target as HTMLElement).closest?.('a');
    if(anchor&&anchor.origin===window.location.origin&&anchor.pathname==='/forum'&&!anchor.hash&&!anchor.target&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&event.button===0){
      event.preventDefault();window.history.pushState(null,'',anchor.href);setQuery(new URLSearchParams(window.location.search));window.scrollTo({top:0,behavior:'instant'});
    }
  }
  async function logout(){try{await api('auth.logout',{});setCsrf(null);setBootstrap({...bootstrap,user:null,csrf:null});refresh();navigate('home');}catch(error){notice((error as Error).message);}}
  return <><Header/><main id="main-content" className="forum-page" onClick={handleNavigation}><div className="forum-masthead"><div><span className="eyebrow"><span className="flag"/> СПІЛЬНОТА UNITED UKRAINE</span><a className="forum-wordmark" href={href()}>FORUM<span> / </span>UNITED</a><p>Історії починаються з розмови.</p></div>{user?<div className="forum-user-menu"><a href={href('profile',{id:user.id})}><Avatar user={user}/><span>{user.username}<small>{user.role.name}</small></span></a><button className="forum-icon" aria-label="Вийти" onClick={()=>{void logout();}}><LogOut size={18}/></button></div>:<div className="forum-actions"><a className="forum-secondary" href={href('login')}><LogIn size={16}/>Увійти</a><a className="btn primary" href={href('register')}>Реєстрація</a></div>}</div>
    <nav className="forum-nav" aria-label="Навігація форуму"><a href={href()} className={view==='home'?'active':''}><House size={16}/>Розділи</a><a href={href('topics')} className={view==='topics'?'active':''}><Search size={16}/>Обговорення</a><a href={href('members')} className={view==='members'?'active':''}><Users size={16}/>Учасники</a>{user&&<><a href={href('notifications')} className={view==='notifications'?'active':''}><Bell size={16}/>Сповіщення{unread>0&&<Badge>{unread}</Badge>}</a><a href={href('messages')} className={['messages','conversation'].includes(view)?'active':''}><MessageCircle size={16}/>Повідомлення</a><a href={href('settings')} className={view==='settings'?'active':''}><SettingsIcon size={16}/>Профіль</a></>}{staff&&<a href={href('moderation')}><ShieldCheck size={16}/>Модерація</a>}{admin&&<a href={href('admin')}>Адмінка</a>}</nav>
    {error?<Panel><ErrorNotice>{error}</ErrorNotice><button className="forum-secondary" onClick={refresh}>Повторити підключення</button></Panel>:!bootstrap?<Loading/>:<ForumContext.Provider value={{bootstrap,revision,refresh,navigate,notice}}>{bootstrap.settings?.announcement&&<Panel className="forum-announcement">{bootstrap.settings.announcement}</Panel>}{user?.needsTwoFactor&&<Panel className="forum-info">Для доступу до керування форумом <a href={href('settings')}>увімкніть 2FA</a>.</Panel>}<Suspense fallback={<Loading/>}>{page}</Suspense></ForumContext.Provider>}
  </main><Footer/>{message&&<div className="forum-toast" role="status">{message}<button aria-label="Закрити сповіщення" onClick={()=>setMessage('')}>×</button></div>}</>;
}
