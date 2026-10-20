import {GAME_SERVER,confirmedOnline,createServerStatusReader} from './server-status.js';

export const ONLINE_PATH='/online.json';
export function clientOnlineJson(status){
 // This legacy client expects JObject -> crmp_new -> server ID, not an array.
 // Unknown counts must not become a fabricated zero or an invented capacity.
 return {crmp_new:confirmedOnline(status)?{[String(GAME_SERVER.id)]:{players:status.players,maxPlayers:status.maxPlayers}}:{}};
}
export function createOnlineHandler({getStatus=createServerStatusReader()}={}){
 return async(request,response)=>{
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Access-Control-Allow-Origin','*');
  response.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers','Accept, Content-Type, X-Unity-Version');
  response.setHeader('Cache-Control','no-store');
  if(request.method==='OPTIONS')return response.status(204).end();
  if(!['GET','HEAD'].includes(request.method)){
   response.setHeader('Allow','GET, HEAD, OPTIONS');
   return response.status(405).end(JSON.stringify({error:'method_not_allowed'}));
  }
  let status;try{status=await getStatus();}catch{/* Return a valid empty catalogue, never HTML or fake numbers. */}
  const available=confirmedOnline(status),body=JSON.stringify(clientOnlineJson(status));
  if(available)response.setHeader('Cache-Control','public, max-age=0, s-maxage=15, must-revalidate');
  response.setHeader('X-Server-Status',available?'online':'unavailable');
  response.setHeader('X-Online-Source',available?status.source:'unavailable');
  response.setHeader('Content-Length',String(Buffer.byteLength(body,'utf8')));
  return response.status(200).end(request.method==='HEAD'?undefined:body);
 };
}
