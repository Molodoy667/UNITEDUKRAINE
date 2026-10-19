import {createServerHandler,createServerStatusReader} from '../lib/server-status.js';
import {createDiscordInfoHandler,DISCORD_INFO_PATH} from '../lib/discord-presence.js';
export function createServerApi({getStatus=createServerStatusReader()}={}){
 const serverJson=createServerHandler({getStatus}),discordXml=createDiscordInfoHandler({getStatus});
 return function handler(request,response){
  const url=new URL(request.url,'http://server.local');
  return (url.pathname===DISCORD_INFO_PATH||url.searchParams.get('format')==='discord'?discordXml:serverJson)(request,response);
 };
}
export default createServerApi();
