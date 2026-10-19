import {ADDRESS,GAME_SERVER,createServerStatusReader} from './server-status.js';

export const DISCORD_INFO_PATH='/projects/crmp/v2/info.xml';
const sources=new Set(['game-query','configured-monitor','open.mp']);
export const xmlText=value=>Array.from(String(value??'')).filter(char=>{
 const code=char.codePointAt(0);return code===9||code===10||code===13||code>=32&&code<=0xd7ff||code>=0xe000&&code<=0xfffd||code>=0x10000&&code<=0x10ffff;
}).join('').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function confirmedOnline(status){
 return status?.status==='online'&&status.address===ADDRESS&&sources.has(status.source)&&Number.isInteger(status.players)&&status.players>=0&&Number.isInteger(status.maxPlayers)&&status.maxPlayers>0&&status.maxPlayers<=10000&&status.players<=status.maxPlayers;
}
export function discordInfoXml(status,server=GAME_SERVER){
 const name=server.name+(confirmedOnline(status)?` | Онлайн: ${status.players}`:'');
 // No wrapper above servers: the legacy ASI searches for it at document level.
 return `<?xml version="1.0" encoding="UTF-8"?>\n<servers>\n  <server id="${xmlText(server.id)}">\n    <name>${xmlText(name)}</name>\n    <ip>${xmlText(server.ip)}</ip>\n    <port>${xmlText(server.port)}</port>\n  </server>\n</servers>\n`;
}
export function createDiscordInfoHandler({getStatus=createServerStatusReader()}={}){
 return async(request,response)=>{
  response.setHeader('Content-Type','application/xml; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Cache-Control','public, max-age=0, s-maxage=15, must-revalidate');
  if(!['GET','HEAD'].includes(request.method)){
   response.setHeader('Allow','GET, HEAD');response.setHeader('Cache-Control','no-store');
   return response.status(405).end('<?xml version="1.0" encoding="UTF-8"?>\n<error>method_not_allowed</error>\n');
  }
  let status;try{status=await getStatus();}catch{/* Mapping remains available without a fabricated count. */}
  const available=confirmedOnline(status);
  response.setHeader('X-Server-Status',available?'online':'unavailable');
  response.setHeader('X-Online-Source',available?status.source:'unavailable');
  const xml=discordInfoXml(status);response.setHeader('Content-Length',String(Buffer.byteLength(xml,'utf8')));
  return response.status(200).end(request.method==='HEAD'?undefined:xml);
 };
}
