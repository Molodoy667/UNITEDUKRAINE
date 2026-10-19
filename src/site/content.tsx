import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import './content.css';
export type Seo={siteName:string;title:string;description:string;keywords:string;siteUrl:string;image:string};
export type HomeSettings={headline:string;highlight:string;description:string;aboutTitle:string;aboutText:string;discordUrl:string;trailerUrl:string};
export type LauncherSettings={version:string;downloadUrl:string;resourcesEnabled:boolean;resourcesUrl:string;resourcesVersion:string;resourcesUpdateUrl:string;maintenance:boolean;maintenanceMessage:string};
export type SiteDocument={id:number;kind:'page'|'news';slug:string;title:string;excerpt:string;body:string;image:string;category:string;seo_title:string;seo_description:string;url:string;published_at:string|null;updated_at:string};
export type SiteData={seo:Seo;home:HomeSettings;launcher:LauncherSettings;news:SiteDocument[];pages:{id:number;kind:'page';slug:string;title:string;url:string}[]};
export const defaultSite:SiteData={seo:{siteName:'United Ukraine Roleplay',title:'United Ukraine — Твоя країна. Твоя історія.',description:'United Ukraine Roleplay — українська ігрова платформа КРМП. Почни свою історію.',keywords:'',siteUrl:'https://united-rp.com.ua',image:'/assets/world-promo.png'},home:{headline:'ТВОЯ КРАЇНА.',highlight:'ТВОЯ ІСТОРІЯ.',description:'Знайомі вулиці. Нові можливості.\nЦілий світ, щоб стати собою.',aboutTitle:'ЗНАЙОМІ МІСЦЯ. БЕЗМЕЖНІ МОЖЛИВОСТІ.',aboutText:'Тут кожна дорога — початок історії.\nА головний герой — ти.',discordUrl:'https://discord.gg/GyJnWJXdJ',trailerUrl:''},launcher:{version:'',downloadUrl:'',resourcesEnabled:false,resourcesUrl:'',resourcesVersion:'',resourcesUpdateUrl:'',maintenance:false,maintenanceMessage:''},news:[],pages:[]};
const SiteContext=createContext({data:defaultSite,loading:true,error:''});
export const useSite=()=>useContext(SiteContext);
function initialSite(){try{const raw=document.getElementById('site-bootstrap')?.textContent;if(raw){const data=JSON.parse(raw);if(data?.seo&&data?.home&&data?.launcher&&Array.isArray(data.news)&&Array.isArray(data.pages))return data as SiteData;}}catch{}return null;}
export function SiteProvider({children}:{children:ReactNode}){
 const [initial]=useState(initialSite),[data,setData]=useState<SiteData>(initial||defaultSite),[loading,setLoading]=useState(!initial),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/site',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!value?.seo||!value?.home||!value?.launcher||!Array.isArray(value.news)||!Array.isArray(value.pages))throw Error();if(!controller.signal.aborted){setData(value);setError('');}}).catch(()=>{if(!controller.signal.aborted)setError('Контент із бази зараз недоступний.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
 return <SiteContext.Provider value={{data,loading,error}}>{children}</SiteContext.Provider>;
}
export function SiteMetadata({document:page}:{document?:SiteDocument}){
 const {data}=useSite();
 useEffect(()=>{
  const title=page?(page.seo_title||`${page.title} | ${data.seo.siteName}`):data.seo.title;
  const description=page?(page.seo_description||page.excerpt||data.seo.description):data.seo.description;
  document.title=title;
  const meta=(key:string,value:string,property=false)=>{let item=document.head.querySelector<HTMLMetaElement>(`meta[${property?'property':'name'}="${key}"]`);if(!item){item=document.createElement('meta');item.setAttribute(property?'property':'name',key);document.head.append(item);}item.content=value;};
  meta('description',description);meta('keywords',data.seo.keywords);meta('og:title',title,true);meta('og:description',description,true);meta('og:image',new URL(page?.image||data.seo.image||'/assets/world-promo.png',data.seo.siteUrl).href,true);
  const url=data.seo.siteUrl+(page?.url||window.location.pathname);meta('og:url',url,true);
  let canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=url;
 },[data.seo,page]);
 return null;
}
