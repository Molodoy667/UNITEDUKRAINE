import {useState} from 'react';
import {ArrowLeft,ArrowUpRight,BookOpen,FileText,Newspaper,Server} from 'lucide-react';
import type {Catalog} from '../wiki/catalog';
import ControlPanel from './ControlPanel';
import ContentAdmin from './ContentAdmin';
import KnowledgeAdmin from './KnowledgeAdmin';
import './control-panel.css';
import './content-admin.css';
const modules=[{id:'game',title:'Управління сервером',description:'Гравці, майно, статистика та журнал ігрових змін',icon:Server},{id:'seo',title:'SEO та статичні сторінки',description:'Пошукові налаштування, головна та редактор сторінок',icon:FileText},{id:'api',title:'API та новини',description:'Новини з фото та API для Electron і Unity',icon:Newspaper},{id:'knowledge',title:'База знань',description:'Категорії, статті, переклади та API для гри',icon:BookOpen}] as const;
export default function AdminHub({catalog,csrf}:{catalog:Catalog|null;csrf:string}){
 type Module=typeof modules[number]['id'];
 const [selected,setSelected]=useState<Module|null>(()=>{const value=new URLSearchParams(window.location.search).get('module');return modules.some(m=>m.id===value)?value as Module:null;});
 function select(value:Module|null){setSelected(value);const url=new URL(window.location.href);if(value)url.searchParams.set('module',value);else url.searchParams.delete('module');window.history.replaceState(null,'',url);}
 return <section className="site-admin"><header className="sa-heading"><span className="cp-eyebrow">UNITED ADMINISTRATION</span><h2>Адміністрація сайту</h2><p>Чотири модулі. Контент сайту та керування грою розділені.</p></header><div className="sa-modules">{modules.map(module=><button key={module.id} aria-pressed={selected===module.id} onClick={()=>select(module.id)}><module.icon size={26}/><ArrowUpRight size={17}/><strong>{module.title}</strong><span>{module.description}</span></button>)}</div>{selected&&<div className="sa-workspace"><button className="sa-back" onClick={()=>select(null)}><ArrowLeft size={16}/>До всіх блоків</button>{selected==='game'?<ControlPanel catalog={catalog} csrf={csrf}/>:selected==='knowledge'?<KnowledgeAdmin csrf={csrf}/>:<ContentAdmin key={selected} mode={selected} csrf={csrf}/>}</div>}</section>;
}
