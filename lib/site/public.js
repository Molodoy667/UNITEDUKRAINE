import {getMysqlPool} from '../mysql.js';
import {AccountError,fail} from '../account/core.js';
import {readPublicSite,readPublicDocument,gameAddress} from './content.js';
export const launcherView=site=>({project:'UNITED UKRAINE',siteUrl:site.seo.siteUrl,launcher:site.launcher,server:{address:gameAddress.host,port:gameAddress.port},news:site.news.map(({title,excerpt,image,url,published_at})=>({title,excerpt,image:image?new URL(image,site.seo.siteUrl).href:'',url:new URL(url,site.seo.siteUrl).href,publishedAt:published_at}))});
export function createSiteHandler({pool=getMysqlPool,launcherOnly=false}={}){
 return async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(request.method!=='GET'&&request.method!=='HEAD'){response.setHeader('Allow','GET, HEAD');fail(405,'method_not_allowed','Доступне лише читання.');}
   const params=new URL(request.url,'http://site.local').searchParams,action=launcherOnly?'launcher':params.get('action')||'bootstrap';let data;
   if(action==='document')data=await readPublicDocument(pool(),params.get('kind'),params.get('slug'));
   else if(action==='bootstrap'||action==='launcher'){const site=await readPublicSite(pool());data=action==='launcher'?launcherView(site):site;}
   else fail(404,'not_found','Невідомий запит.');
   if(request.method==='HEAD')return response.status(200).end();return response.status(200).json(data);
  }catch(error){const known=error instanceof AccountError;return response.status(known?error.status:503).json({error:known?error.code:'site_unavailable',message:known?error.message:'Контент сайту недоступний. Перевірте базу та міграції.'});}
 };
}
