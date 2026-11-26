import {ArrowUpRight,BookOpen,FileText,LayoutTemplate,Newspaper,Server,Smartphone} from 'lucide-react';
import type {Catalog} from '../wiki/catalog';
import ControlPanel from './ControlPanel';
import ContentAdmin from './ContentAdmin';
import KnowledgeAdmin from './KnowledgeAdmin';
import ProjectMediaAdmin from './ProjectMediaAdmin';
import SiteBuilder from './SiteBuilder';
import './control-panel.css';
import './content-admin.css';
import './site-builder.css';
const modules=[{id:'game',title:'Ігровий сервер',icon:Server},{id:'builder',title:'Редагування сайту',icon:LayoutTemplate},{id:'seo',title:'SEO та сторінки',icon:FileText},{id:'api',title:'Новини та API',icon:Newspaper},{id:'knowledge',title:'База знань',icon:BookOpen},{id:'project',title:'Project / Android',icon:Smartphone}] as const;
export default function AdminHub({catalog,csrf}:{catalog:Catalog|null;csrf:string}){
 const requested=new URLSearchParams(window.location.search).get('module'),selected=modules.find(module=>module.id===requested)?.id??null;
 function moduleUrl(id:typeof modules[number]['id']){const url=new URL(window.location.href);url.searchParams.set('tab','admin');url.searchParams.set('module',id);url.hash='';return `${url.pathname}${url.search}`;}
 return <section className="site-admin"><header className="sa-heading"><span className="cp-eyebrow">UNITED ADMINISTRATION</span><h2>Адміністрування сайту</h2><p>Кожен розділ відкривається в окремій вкладці.</p></header><nav className="sa-modules" aria-label="Розділи адміністрації">{modules.map(module=>{const active=selected===module.id;return <a key={module.id} className={active?'is-active':''} href={moduleUrl(module.id)} target="_blank" rel="noopener noreferrer" aria-current={active?'page':undefined}><module.icon size={17}/><strong>{module.title}</strong><ArrowUpRight size={14}/></a>;})}</nav><main className="sa-workspace">{selected==='game'?<ControlPanel catalog={catalog} csrf={csrf}/>:selected==='knowledge'?<KnowledgeAdmin csrf={csrf}/>:selected==='builder'?<SiteBuilder csrf={csrf}/>:selected==='project'?<ProjectMediaAdmin csrf={csrf}/>:selected?<ContentAdmin key={selected} mode={selected} csrf={csrf}/>:<p className="sa-note">Виберіть розділ у верхньому меню. Він відкриється в новій вкладці.</p>}</main></section>;
}
