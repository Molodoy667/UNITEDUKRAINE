const ADDRESS='51.75.44.14:2219';
// open.mp is an HTTP index of SA-MP-compatible UDP query results.
// A CRMP server may not be indexed. Never interpret missing data as offline.
export async function GET(){
 const updatedAt=new Date().toISOString();
 try{
  const custom=process.env.MONITOR_API_URL;
  if(custom){
   const r=await fetch(custom,{signal:AbortSignal.timeout(5000)});
   if(!r.ok)throw new Error('Monitor unavailable');
   const d=await r.json() as {status?:string;address?:string;players?:number;maxPlayers?:number;updatedAt?:string};
   if(d.status!=='online'||d.address!==ADDRESS||!Number.isInteger(d.players)||!Number.isInteger(d.maxPlayers)||Number(d.players)<0||Number(d.maxPlayers)<1||Number(d.players)>Number(d.maxPlayers))throw new Error('No verified status');
   return Response.json({...d,source:'direct-query',updatedAt:d.updatedAt??updatedAt},{headers:{'Cache-Control':'public,max-age=30,s-maxage=30'}});
  }
  const response=await fetch('https://api.open.mp/servers',{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Monitoring provider unavailable');
  const data:unknown=await response.json();
  if(!Array.isArray(data))throw new Error('Invalid provider response');
  const server=data.find(s=>s&&s.ip===ADDRESS);
  if(!server||!Number.isInteger(server.pc)||!Number.isInteger(server.pm)||server.pc<0||server.pm<=0)throw new Error('Server not indexed');
  return Response.json({status:'online',address:ADDRESS,name:server.hn,players:server.pc,maxPlayers:server.pm,source:'open.mp',updatedAt},{headers:{'Cache-Control':'public, max-age=30, s-maxage=60'}});
 }catch{return Response.json({status:'unavailable',address:ADDRESS,source:'open.mp',updatedAt},{headers:{'Cache-Control':'public, max-age=15, s-maxage=30'}})}
}
