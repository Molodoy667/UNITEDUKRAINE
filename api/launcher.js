import {createSiteHandler} from '../lib/site/public.js';
import {createResourceReleaseHandler,PROJECT_CONFIG_PATH,RELEASE_PREFIX} from '../lib/resource-release/http.js';
export function createLauncherApi(options={}){
 const site=createSiteHandler({...options,launcherOnly:true}),resources=createResourceReleaseHandler(options);
 return (request,response)=>{
  const url=new URL(request.url,'https://launcher.local');
  return url.pathname===PROJECT_CONFIG_PATH||url.pathname===RELEASE_PREFIX||url.pathname.startsWith(RELEASE_PREFIX+'/')||url.searchParams.has('resourceAction')?resources(request,response):site(request,response);
 };
}
export default createLauncherApi();
