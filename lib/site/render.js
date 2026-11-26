import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {getMysqlPool} from '../mysql.js';
import {AccountError,fail} from '../account/core.js';
import {readAccountSession} from '../account/service.js';
import {readPublicSite,readPublicDocument} from './content.js';
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeJson=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`);
export function renderSiteModeHtml(template,access,returnTo='/'){
 const restricted=access.mode==='authenticated',title=restricted?'Доступ лише для авторизованих':'Технічні роботи · United Ukraine',safePath=typeof returnTo==='string'&&returnTo.startsWith('/')&&!returnTo.startsWith('//')?returnTo:'/',login=`/account?site-login=1&returnTo=${encodeURIComponent(safePath)}`;
 const body=`<main class="site-mode-page ${restricted?'site-mode-private':'site-mode-maintenance'}"><div class="site-mode-backdrop" aria-hidden="true"><img src="/assets/world-promo.webp" alt=""><span></span><i></i><b></b></div><section class="site-mode-card"><a class="site-mode-brand" href="/"><img src="/assets/logo.webp" alt=""><span>UNITED<small>UKRAINE · ROLEPLAY</small></span></a><div class="site-mode-icon" aria-hidden="true">${restricted?'⌑':'✳'}<span></span></div><span class="site-mode-eyebrow">${restricted?'ПРИВАТНИЙ ПРОСТІР':'КОРОТКА ПАУЗА'}</span><h1>${restricted?'Вибачте, сайт доступний лише для авторизованих':'Сайт тимчасово на технічному обслуговуванні'}</h1><p>${restricted?'Увійдіть у свій акаунт, щоб переглядати сторінки та розділи United Ukraine.':escapeHtml(access.maintenanceMessage)}</p><a class="site-mode-action" href="${escapeHtml(login)}">${restricted?'Увійти до акаунта':'Вхід адміністратора'} <span aria-hidden="true">→</span></a><div class="site-mode-foot"><span>UNITED UKRAINE · ROLEPLAY</span><span>ТВОЯ КРАЇНА. ТВОЯ ІСТОРІЯ.</span></div></section></main>`;
 return template.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escapeHtml(title)}</title>`).replace('</head>',`<meta name="robots" content="noindex,nofollow"></head>`).replace('<div id="root"></div>',`<div id="root">${body}</div>`);
}
export function renderSiteHtml(template,site,document=null){
 const title=document?(document.seo_title||`${document.title} | ${site.seo.siteName}`):site.seo.title;
 const description=document?(document.seo_description||document.excerpt||site.seo.description):site.seo.description;
 const url=site.seo.siteUrl+(document?.url||'/'),image=new URL(document?.image||site.seo.image||'/assets/world-promo.webp',site.seo.siteUrl).href;
 const head=`<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="keywords" content="${escapeHtml(site.seo.keywords)}"><link rel="canonical" href="${escapeHtml(url)}"><meta property="og:type" content="${document?.kind==='news'?'article':'website'}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image">`;
 const body=document?`<main id="main-content"><h1>${escapeHtml(document.title)}</h1>${document.body.split(/\n\s*\n/).map(p=>`<p>${escapeHtml(p)}</p>`).join('')}</main>`:`<main id="main-content"><h1>${escapeHtml(site.home.headline)} ${escapeHtml(site.home.highlight)}</h1><p>${escapeHtml(site.home.description)}</p>${site.news.map(n=>{const title=`<h2>${escapeHtml(n.title)}</h2>`;return `<article>${n.placement!=null?title:`<a href="${escapeHtml(n.url)}">${title}</a>`}<p>${escapeHtml(n.excerpt)}</p></article>`;}).join('')}</main>`;
 return template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\s+name="description"[^>]*>/i,'').replace('</head>',()=>`${head}</head>`).replace('<div id="root"></div>',()=>`<div id="root">${body}</div><script id="site-bootstrap" type="application/json">${safeJson(site)}</script>`);
}
export function createRenderHandler({pool=getMysqlPool,template=()=>readFile(path.join(process.cwd(),'dist','index.html'),'utf8')}={}){
 return async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');fail(405,'method_not_allowed','Метод не підтримано.');}
   const pathname=new URL(request.url,'http://render.local').searchParams.get('path')||'/';
   const match=pathname.match(/^\/(p|news)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/),builtin=pathname.match(/^\/(contacts|terms|privacy)\/?$/);
   if(pathname!=='/'&&!match&&!builtin)fail(404,'not_found','Сторінку не знайдено.');
   const db=pool(),site=await readPublicSite(db,{audience:pathname==='/'?'home':'shared'});
   if(site.access.mode!=='normal'){
    const user=await readAccountSession(request,db),allowed=site.access.mode==='authenticated'?Boolean(user):Number(user?.admin)===12;
    if(!allowed){const html=renderSiteModeHtml(await template(),site.access,pathname);return response.status(200).end(request.method==='HEAD'?'':html);}
   }
   let document=null;
   if(match||builtin)document=await readPublicDocument(pool(),match?.[1]==='news'?'news':'page',match?.[2]||builtin[1]);
   const html=renderSiteHtml(await template(),site,document);return response.status(200).end(request.method==='HEAD'?'':html);
  }catch(error){const status=error instanceof AccountError?error.status:503;return response.status(status).end(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${status}</title></head><body><h1>${status===404?'Сторінку не знайдено':'Сторінка тимчасово недоступна'}</h1><a href="/">На головну</a></body></html>`);}
 };
}
