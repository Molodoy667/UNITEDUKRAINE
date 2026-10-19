import {getMysqlPool} from '../mysql.js';
import {AccountError,fail} from '../account/core.js';
import {readPublicSite,readPublicDocument,gameAddress} from './content.js';
export const newsView=site=>({schemaVersion:1,news:site.news.map(({id,title,excerpt,image,url,published_at})=>({id,title,excerpt,image:image?new URL(image,site.seo.siteUrl).href:'',url:new URL(url,site.seo.siteUrl).href,publishedAt:published_at}))});
export const launcherView=site=>({project:'UNITED UKRAINE',siteUrl:site.seo.siteUrl,launcher:site.launcher,server:{address:gameAddress.host,port:gameAddress.port},news:newsView(site).news});
export function createSiteHandler({pool=getMysqlPool,launcherOnly=false}={}){
 return async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers','Accept, Content-Type, X-Unity-Version');
  try{
   if(request.method==='OPTIONS')return response.status(204).end();
   if(request.method!=='GET'&&request.method!=='HEAD'){response.setHeader('Allow','GET, HEAD, OPTIONS');fail(405,'method_not_allowed','Доступне лише читання.');}
   const params=new URL(request.url,'http://site.local').searchParams,action=params.get('action')||(launcherOnly?'launcher':'bootstrap');let data;
   if(launcherOnly&&!['launcher','news'].includes(action))fail(404,'not_found','Невідомий запит.');
   if(action==='document')data=await readPublicDocument(pool(),params.get('kind'),params.get('slug'));
   else if(['bootstrap','launcher','news'].includes(action)){const site=await readPublicSite(pool());data=action==='news'?newsView(site):action==='launcher'?launcherView(site):site;}
   else fail(404,'not_found','Невідомий запит.');
   if(request.method==='HEAD')return response.status(200).end();return response.status(200).json(data);
  }catch(error){const known=error instanceof AccountError;return response.status(known?error.status:503).json({error:known?error.code:'site_unavailable',message:known?error.message:'Контент сайту недоступний. Перевірте базу та міграції.'});}
 };
}
