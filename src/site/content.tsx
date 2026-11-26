import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import './content.css';
export type Seo={siteName:string;title:string;description:string;keywords:string;siteUrl:string;image:string};
export type HomeSettings={headline:string;highlight:string;description:string;aboutTitle:string;aboutText:string;discordUrl:string;trailerUrl:string};
export type LauncherSettings={version:string;downloadUrl:string;resourcesEnabled:boolean;resourcesUrl:string;resourcesVersion:string;resourcesUpdateUrl:string;maintenance:boolean;maintenanceMessage:string};
export type SiteMenuLink={id:string;label:string;href:string};
export type SiteAccessSettings={mode:'normal'|'authenticated'|'maintenance';maintenanceMessage:string};
export type BuilderFeature={number:string;title:string;text:string};
export type GalleryScene={title:string;subtitle:string;label:string;position:string};
export type SiteSections={
 visibility:{hero:boolean;server:boolean;world:boolean;ticker:boolean;news:boolean;start:boolean;gallery:boolean;community:boolean;footer:boolean};
 hero:{eyebrow:string;topline:string;brandLine:string;captionNumber:string;captionLabel:string;captionTitle:string;bottomLine:string;bottomLink:string;startButton:string;trailerButton:string;imageAlt:string};
 server:{label:string;name:string;suffix:string;playersLabel:string;loadingLabel:string;onlineLabel:string;offlineLabel:string;monitorOnline:string;monitorOffline:string};
 world:{label:string;linkLabel:string;location:string;imageTitle:string;imageHighlight:string;imageCaption:string;features:BuilderFeature[]};
 ticker:{text:string};
 news:{label:string;title:string;highlight:string;allFilter:string;loading:string;empty:string;published:string;readMore:string};
 start:{label:string;titleLine1:string;titleLine2:string;titleHighlight:string;intro:string;orbitCaption:string;steps:{number:string;title:string;text:string;buttonLabel:string;note:string}[]};
 gallery:{label:string;title:string;highlight:string;note:string;scenes:GalleryScene[]};
 community:{eyebrow:string;title:string;highlight:string;description:string;buttonLabel:string};
 footer:{brandCaption:string;description:string;descriptionSecond:string;madeBy:string};
};
export type SiteBuilderSettings={logo:string;navigation:SiteMenuLink[];images:{hero:string;world:string;gallery1:string;gallery2:string;gallery3:string};projectBackground:string;androidLogo:string;access:SiteAccessSettings;sections:SiteSections};
export type SiteDocument={id:number;kind:'page'|'news';slug:string;title:string;excerpt:string;body:string;image:string;video?:string|null;placement?:number|null;category:string;seo_title:string;seo_description:string;url:string;published_at:string|null;updated_at:string};
export type SiteData={seo:Seo;home:HomeSettings;launcher:LauncherSettings;access:SiteAccessSettings;builder:SiteBuilderSettings;news:SiteDocument[];pages:{id:number;kind:'page';slug:string;title:string;url:string}[]};
export const defaultSections:SiteSections={
 visibility:{hero:true,server:true,world:true,ticker:true,news:true,start:true,gallery:true,community:true,footer:true},
 hero:{eyebrow:'УКРАЇНСЬКИЙ ROLEPLAY / UNITED UKRAINE',topline:'ВІДКРИЙ СВІЙ СВІТ',brandLine:'UNITED UKRAINE / ROLEPLAY',captionNumber:'01',captionLabel:'ТВОЯ НАСТУПНА ПРИГОДА',captionTitle:'Починається тут.',bottomLine:'UNITED BY FREEDOM. CONNECTED BY PLAY.',bottomLink:'ГОРТАЙ, ЩОБ ВІДКРИТИ',startButton:'Почати гру',trailerButton:'Трейлер',imageAlt:'United Ukraine на комп’ютері та телефоні на тлі вечірнього українського міста'},
 server:{label:'ТВІЙ ІГРОВИЙ СВІТ',name:'United Ukraine',suffix:'#01',playersLabel:'ГРАВЦІВ',loadingLabel:'Оновлення…',onlineLabel:'Сервер онлайн',offlineLabel:'Статус недоступний',monitorOnline:'Живий статус · оновлюється щохвилини',monitorOffline:'Моніторинг сервера · очікуємо доступні дані'},
 world:{label:'БІЛЬШЕ, НІЖ ГРА',linkLabel:'Відчути атмосферу',location:'НАТХНЕННО УКРАЇНОЮ',imageTitle:'ВПІЗНАВАЙ СВОЄ.',imageHighlight:'ВІДКРИВАЙ НОВЕ.',imageCaption:'КОНЦЕПТ-АРТ ПРОЄКТУ',features:[{number:'01',title:'Своя атмосфера',text:'Український характер у кожній деталі. Місця, у яких відчуваєш себе вдома.'},{number:'02',title:'Твій власний шлях',text:'Створи персонажа, знаходь можливості та вирішуй, ким стане твій герой.'},{number:'03',title:'Люди, які поруч',text:'Нові знайомства, спільні пригоди й моменти, які хочеться згадувати.'}]},
 ticker:{text:'ТВОЯ КРАЇНА · ТВОЯ ІСТОРІЯ · UNITED UKRAINE'},
 news:{label:'НА ЗВ’ЯЗКУ З ПРОЄКТОМ',title:'У ЦЕНТРІ',highlight:'ПОДІЙ.',allFilter:'Усі матеріали',loading:'Завантажуємо новини…',empty:'Опублікованих новин поки немає.',published:'Опубліковано адміністрацією проєкту',readMore:'Читати новину'},
 start:{label:'НОВА ІСТОРІЯ ЗА ТРИ КРОКИ',titleLine1:'ТВІЙ СВІТ.',titleLine2:'ТВОЇ ПРАВИЛА.',titleHighlight:'ТВІЙ СТАРТ.',intro:'Не спостерігай за чужими історіями.\nПочни свою.',orbitCaption:'YOUR NEXT CHAPTER',steps:[{number:'01',title:'Завантаж лаунчер',text:'Твій ключ до світу United Ukraine.\nУсе необхідне для початку гри.',buttonLabel:'Завантажити лаунчер',note:'Для Windows'},{number:'02',title:'Встанови гру',text:'Відкрий лаунчер і виконай прості інструкції встановлення.',buttonLabel:'',note:''},{number:'03',title:'Увійди у свій світ',text:'Приєднуйся до сервера та напиши перший розділ своєї історії.',buttonLabel:'Скопіювати IP сервера',note:''}]},
 gallery:{label:'ПОБАЧ. ВІДЧУЙ. ЗАЛИШСЯ.',title:'АТМОСФЕРА,',highlight:'ЯКУ ВІДЧУВАЄШ.',note:'Концепт-арт United Ukraine',scenes:[{title:'Місто, яке надихає',subtitle:'Київ · атмосфера проєкту',position:'15% 25%',label:'МІСТО'},{title:'Твій власний маршрут',subtitle:'Дороги · атмосфера проєкту',position:'15% 85%',label:'СВОБОДА'},{title:'Знайди своїх',subtitle:'Спільнота · атмосфера проєкту',position:'90% 30%',label:'ЛЮДИ'}]},
 community:{eyebrow:'СВОЇ ЗАВЖДИ ПОРУЧ',title:'ВЕЛИКИЙ СВІТ.',highlight:'ТВОЯ СПІЛЬНОТА.',description:'Знайди друзів ще до першого входу у гру.\nЗнайомства, новини й підтримка — в нашому Discord.',buttonLabel:'Приєднатися до Discord'},
 footer:{brandCaption:'ROLEPLAY',description:'Твоя країна. Твої правила гри.',descriptionSecond:'Твоя нова історія.',madeBy:'З любов’ю до України'},
};
export const defaultBuilder:SiteBuilderSettings={logo:'/assets/logo.webp',navigation:[{id:'home',label:'Головна',href:'/'},{id:'forum',label:'Форум',href:'/forum'},{id:'wiki',label:'Вікі',href:'/wiki'},{id:'roulette',label:'Рулетка',href:'/roulette'},{id:'forbes',label:'Forbes',href:'/forbes'},{id:'donate',label:'Донат',href:'/donate'}],images:{hero:'/assets/world-promo.webp',world:'/assets/world.webp',gallery1:'/assets/world.webp',gallery2:'/assets/world.webp',gallery3:'/assets/world.webp'},projectBackground:'/Project/background.png',androidLogo:'/assets/logo.webp',access:{mode:'normal',maintenanceMessage:'Наразі ми оновлюємо сайт. Скоро повернемося з новими можливостями.'},sections:defaultSections};
export const defaultSite:SiteData={seo:{siteName:'United Ukraine Roleplay',title:'United Ukraine — Твоя країна. Твоя історія.',description:'United Ukraine Roleplay — українська ігрова платформа КРМП. Почни свою історію.',keywords:'',siteUrl:'https://united-rp.com.ua',image:'/assets/world-promo.webp'},home:{headline:'ТВОЯ КРАЇНА.',highlight:'ТВОЯ ІСТОРІЯ.',description:'Знайомі вулиці. Нові можливості.\nЦілий світ, щоб стати собою.',aboutTitle:'ЗНАЙОМІ МІСЦЯ. БЕЗМЕЖНІ МОЖЛИВОСТІ.',aboutText:'Тут кожна дорога — початок історії.\nА головний герой — ти.',discordUrl:'https://discord.gg/GyJnWJXdJ',trailerUrl:''},launcher:{version:'',downloadUrl:'',resourcesEnabled:false,resourcesUrl:'',resourcesVersion:'',resourcesUpdateUrl:'',maintenance:false,maintenanceMessage:''},access:defaultBuilder.access,news:[],pages:[],builder:defaultBuilder};
const SiteContext=createContext({data:defaultSite,loading:true,error:''});
export const useSite=()=>useContext(SiteContext);
function normalizeSite(value:SiteData):SiteData{
 const builder={...defaultBuilder,...value.builder,access:{...defaultBuilder.access,...value.builder?.access},sections:{...defaultSections,...value.builder?.sections}};
 return {...value,builder,access:{...defaultBuilder.access,...value.access,...builder.access}};
}
function initialSite(){try{const raw=document.getElementById('site-bootstrap')?.textContent;if(raw){const data=JSON.parse(raw);if(data?.seo&&data?.home&&data?.launcher&&data?.builder&&Array.isArray(data.news)&&Array.isArray(data.pages))return normalizeSite(data as SiteData);}}catch{}return null;}
export function SiteProvider({children}:{children:ReactNode}){
 const [initial]=useState(initialSite),[data,setData]=useState<SiteData>(initial||defaultSite),[loading,setLoading]=useState(!initial),[error,setError]=useState('');
 useEffect(()=>{
  let request:AbortController|null=null;
  const load=()=>{
   request?.abort();const controller=new AbortController();request=controller;
   fetch('/api/site',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!value?.seo||!value?.home||!value?.launcher||!value?.builder||!Array.isArray(value.news)||!Array.isArray(value.pages))throw Error();if(!controller.signal.aborted){setData(normalizeSite(value));setError('');}}).catch(()=>{if(!controller.signal.aborted)setError('Контент сайту або його режим доступу не вдалося перевірити.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  };
  load();window.addEventListener('site-content-updated',load);
  return()=>{window.removeEventListener('site-content-updated',load);request?.abort();};
 },[]);
 return <SiteContext.Provider value={{data,loading,error}}>{children}</SiteContext.Provider>;
}
export function SiteMetadata({document:page}:{document?:SiteDocument}){
 const {data}=useSite();
 useEffect(()=>{
  const title=page?(page.seo_title||`${page.title} | ${data.seo.siteName}`):data.seo.title;
  const description=page?(page.seo_description||page.excerpt||data.seo.description):data.seo.description;
  document.title=title;
  const meta=(key:string,value:string,property=false)=>{let item=document.head.querySelector<HTMLMetaElement>(`meta[${property?'property':'name'}="${key}"]`);if(!item){item=document.createElement('meta');item.setAttribute(property?'property':'name',key);document.head.append(item);}item.content=value;};
  meta('description',description);meta('keywords',data.seo.keywords);meta('og:title',title,true);meta('og:description',description,true);meta('og:image',new URL(page?.image||data.seo.image||'/assets/world-promo.webp',data.seo.siteUrl).href,true);
  const url=data.seo.siteUrl+(page?.url||window.location.pathname);meta('og:url',url,true);
  let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=url;
 },[data.seo,page]);
 return null;
}
