import dgram from 'node:dgram';
export const ADDRESS='51.75.44.14:2219';
const HOST='51.75.44.14',PORT=2219;
export function parseServerInfo(data){
 if(!Buffer.isBuffer(data)||data.length<20||data.toString('ascii',0,4)!=='SAMP'||data[10]!==0x69)throw Error('Invalid query response');
 const players=data.readUInt16LE(12),maxPlayers=data.readUInt16LE(14);if(!maxPlayers||maxPlayers>10000||players>maxPlayers)throw Error('Invalid player count');
 let offset=16;const strings=[];
 for(let i=0;i<3;i++){if(offset+4>data.length)throw Error('Truncated length');const size=data.readUInt32LE(offset);offset+=4;if(size>1024||offset+size>data.length)throw Error('Truncated text');strings.push(new TextDecoder('windows-1251').decode(data.subarray(offset,offset+size)));offset+=size;}
 if(offset!==data.length)throw Error('Unexpected trailing data');
 return {status:'online',address:ADDRESS,players,maxPlayers,name:strings[0],source:'game-query',updatedAt:new Date().toISOString()};
}
export function queryServerInfo(){return new Promise(resolve=>{
 const socket=dgram.createSocket('udp4');let done=false;const packet=Buffer.alloc(11);packet.write('SAMP');HOST.split('.').forEach((value,index)=>packet[4+index]=Number(value));packet.writeUInt16LE(PORT,8);packet[10]=0x69;
 const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{socket.close();}catch{}resolve(value);};
 const timer=setTimeout(()=>finish(null),1800);
 socket.on('error',()=>finish(null));socket.on('message',(data,remote)=>{if(remote.address!==HOST||remote.port!==PORT||data.length<11||!data.subarray(0,11).equals(packet))return;try{finish(parseServerInfo(data));}catch{finish(null);}});
 socket.send(packet,PORT,HOST,error=>{if(error)finish(null);});
});}
const valid=data=>data?.status==='online'&&data.address===ADDRESS&&Number.isInteger(data.players)&&Number.isInteger(data.maxPlayers)&&data.players>=0&&data.maxPlayers>0&&data.maxPlayers<=10000&&data.players<=data.maxPlayers;
export function createServerHandler({query=queryServerInfo,request=fetch,clock=()=>Date.now()}={}){
 let cached=null,pending=null;
 async function read(){
  let direct;try{direct=await query();}catch{}if(valid(direct))return direct;
  try{
   const custom=process.env.MONITOR_API_URL;
   const response=await request(custom||'https://api.open.mp/servers',{signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'}});if(!response.ok)throw Error();const body=await response.json();
   const item=custom?body:Array.isArray(body)?body.find(server=>server?.ip===ADDRESS):null;
   const value=custom?item:{status:'online',address:ADDRESS,players:item?.pc,maxPlayers:item?.pm,name:item?.hn};
   if(!valid(value))throw Error();
   return {status:'online',address:ADDRESS,players:value.players,maxPlayers:value.maxPlayers,name:typeof value.name==='string'?value.name.slice(0,1024):'',source:custom?'configured-monitor':'open.mp',updatedAt:new Date(clock()).toISOString()};
  }catch{return {status:'unavailable',address:ADDRESS,source:'game-query',updatedAt:new Date(clock()).toISOString()};}
 }
 return async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=15');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  if(!cached||clock()-cached.at>15000){pending??=read().then(value=>{cached={value,at:clock()};}).finally(()=>pending=null);await pending;}
  return res.status(200).json(cached.value);
 };
}
