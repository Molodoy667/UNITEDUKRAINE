import {useEffect,useState} from 'react';
import {Header,Footer} from '../../components/site-shell';
import {SiteMetadata,type SiteDocument} from './content';
import PagePreloader from '../ui/PagePreloader';
export default function ContentPage({kind,slug}:{kind:'page'|'news';slug:string}){
 const [item,setItem]=useState<SiteDocument|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setItem(null);fetch(`/api/site?${new URLSearchParams({action:'document',kind,slug})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(response.status===404?'Сторінку не знайдено.':'Не вдалося завантажити сторінку.');if(!controller.signal.aborted)setItem(data);}).catch(error=>{if(!controller.signal.aborted)setError(error.message||'З’єднання перервано.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[kind,slug]);
 return <><Header/><main id="main-content" className="subpage">{item?<><SiteMetadata document={item}/><div className="eyebrow">{item.category||'UNITED UKRAINE'}</div><h1>{item.title}</h1>{item.excerpt&&<p>{item.excerpt}</p>}{item.image&&<img className="site-document-image" src={item.image} alt=""/>}<article className="document">{item.body.split(/\n\s*\n/).map((paragraph,index)=><p key={index} style={{whiteSpace:'pre-wrap'}}>{paragraph}</p>)}</article></>:<>{loading?<><h1 className="sr-only">Завантаження сторінки</h1><PagePreloader/></>:<><h1>Сторінка недоступна</h1><p role="alert">{error}</p></>}</>}<a className="text-link" href="/">← На головну</a></main><Footer/></>;
}
