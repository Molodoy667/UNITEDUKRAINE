import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,FileText,Layers3,Newspaper,Server} from 'lucide-react';
import type {Catalog} from '../wiki/catalog';
import ControlPanel from './ControlPanel';
import ContentAdmin from './ContentAdmin';
import './control-panel.css';
import './content-admin.css';
const modules=[{id:'game',title:'Управління сервером',description:'Гравці, майно, статистика та журнал ігрових змін',icon:Server},{id:'seo',title:'SEO та статичні сторінки',description:'Пошукові налаштування, головна та редактор сторінок',icon:FileText},{id:'api',title:'API та новини',description:'Новини з фото та API для Electron і Unity',icon:Newspaper},{id:'empty',title:'Вільний блок',description:'Місце для наступного розділу',icon:Layers3}] as const;
export default function AdminHub({catalog,csrf}:{catalog:Catalog|null;csrf:string}){
 const [selected,setSelected]=useState<'game'|'seo'|'api'|null>(null);
 return <section className="site-admin"><header className="sa-heading"><span className="cp-eyebrow">UNITED ADMINISTRATION</span><h2>Адміністрація сайту</h2><p>Чотири модулі. Контент сайту та керування грою розділені.</p></header><div className="sa-modules">{modules.map(module=><button key={module.id} disabled={module.id==='empty'} aria-pressed={selected===module.id} onClick={()=>{if(module.id!=='empty')setSelected(module.id);}}><module.icon size={26}/><ArrowUpRight size={17}/><strong>{module.title}</strong><span>{module.description}</span></button>)}</div>{selected&&<div className="sa-workspace"><button className="sa-back" onClick={()=>setSelected(null)}><ArrowLeft size={16}/>До всіх блоків</button>{selected==='game'?<ControlPanel catalog={catalog} csrf={csrf}/>:<ContentAdmin key={selected} mode={selected} csrf={csrf}/>}</div>}</section>;
}
