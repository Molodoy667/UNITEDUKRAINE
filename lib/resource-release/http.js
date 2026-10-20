import {getMysqlPool} from '../mysql.js';
import {AccountError,fail,equal} from '../account/core.js';
import {activationBody,uuid} from './policy.js';
import {publicConfig,releaseState,publicationState,activateRelease} from './service.js';

export const PROJECT_CONFIG_PATH='/Project/info.json';
export const RELEASE_PREFIX='/api/android-resources';
function authorize(request,token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(503,'publisher_unconfigured','Publisher authentication is not configured.');
 // Only the trusted Vercel ingress supplies x-forwarded-proto. No cookie/session fallback.
 if(request.headers?.['x-forwarded-proto']!=='https'&&!request.url?.startsWith('https://'))fail(400,'https_required','HTTPS is required.');
 if(request.headers?.origin)fail(403,'browser_origin_forbidden','This endpoint is for the native publisher, not browser JavaScript.');
 const authorization=request.headers?.authorization;
 if(typeof authorization!=='string'||!/^Bearer [a-f0-9]{64}$/.test(authorization)||!equal(authorization.slice(7),token))fail(401,'unauthorized','Publisher authentication required.');
}
export function createResourceReleaseHandler({pool=getMysqlPool,secret=()=>process.env.ANDROID_RESOURCE_PUBLISH_TOKEN,verify,clock}={}){
 return async(request,response)=>{
  response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Cache-Control','no-store');response.setHeader('Vercel-CDN-Cache-Control','no-store');response.setHeader('CDN-Cache-Control','no-store');
  try{
   const url=new URL(request.url,'https://release.local'),route=url.pathname===PROJECT_CONFIG_PATH?'config':url.pathname.startsWith(RELEASE_PREFIX+'/')?url.pathname.slice(RELEASE_PREFIX.length+1):url.searchParams.get('resourceAction')||'';
   if(route==='config'){
    response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
    if(request.method==='OPTIONS')return response.status(204).end();
    if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD, OPTIONS');fail(405,'method_not_allowed','Read only.');}
    const config=await publicConfig(pool());return request.method==='HEAD'?response.status(200).end():response.status(200).json(config);
   }
   authorize(request,secret());
   if(route==='state'){
    if(request.method!=='GET'){response.setHeader('Allow','GET');fail(405,'method_not_allowed','Use GET.');}
    return response.status(200).json(await releaseState(pool()));
   }
   if(route.startsWith('publications/')){
    if(request.method!=='GET'){response.setHeader('Allow','GET');fail(405,'method_not_allowed','Use GET.');}
    const id=route.slice('publications/'.length);if(!uuid(id))fail(400,'invalid_publication_id','Expected a lowercase UUID v4.');
    return response.status(200).json(await publicationState(pool(),id));
   }
   if(route==='activate'){
    if(request.method!=='POST'){response.setHeader('Allow','POST');fail(405,'method_not_allowed','Use POST.');}
    if(!/^application\/json(?:;|$)/i.test(request.headers?.['content-type']||''))fail(415,'json_required','Content-Type must be application/json.');
    const body=activationBody(request.body);return response.status(200).json(await activateRelease(pool(),body,{verify,clock}));
   }
   fail(404,'not_found','Unknown resource release route.');
  }catch(error){
   const known=error instanceof AccountError,status=known?error.status:503;
   if(!known)console.error('Resource release API failed',/^ER_[A-Z_]+$/.test(error?.code||'')?error.code:'internal_error');
   response.status(status);return request.method==='HEAD'?response.end():response.json({error:known?error.code:'release_unavailable',message:known?error.message:'Resource release service unavailable. Retry the same publicationId or check its status.'});
  }
 };
}
