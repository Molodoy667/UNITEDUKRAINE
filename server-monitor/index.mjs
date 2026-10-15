// Run on a host with UDP access: node server-monitor/index.mjs
// Reverse-proxy localhost:3081 over HTTPS and set MONITOR_API_URL on the Site.
import dgram from 'node:dgram';
import http from 'node:http';
const host='51.75.44.14',port=2219;
function query(){return new Promise(resolve=>{
 const socket=dgram.createSocket('udp4');let done=false;
 const finish=value=>{if(done)return;done=true;clearTimeout(timeout);socket.close();resolve({...value,address:`${host}:${port}`,updatedAt:new Date().toISOString(),source:'direct-query'})};
 const timeout=setTimeout(()=>finish({status:'unavailable'}),3000);
 socket.on('error',()=>finish({status:'unavailable'}));
 const packet=Buffer.alloc(11);packet.write('SAMP');host.split('.').forEach((v,i)=>packet[4+i]=Number(v));packet.writeUInt16LE(port,8);packet[10]='i'.charCodeAt(0);
 socket.on('message',(data,rinfo)=>{try{
  if(rinfo.address!==host||rinfo.port!==port||data.length<20||!data.subarray(0,11).equals(packet))return;
  const players=data.readUInt16LE(12),maxPlayers=data.readUInt16LE(14),len=data.readUInt32LE(16);
  if(maxPlayers<1||players>maxPlayers||len>512||20+len>data.length)return;
  finish({status:'online',players,maxPlayers,name:data.subarray(20,20+len).toString('utf8')});
 }catch{finish({status:'unavailable'})}});
 socket.send(packet,port,host);
})}
let cached=null,checked=0,pending=null;
http.createServer(async(req,res)=>{
 if(req.method!=='GET'||req.url!=='/status'){res.writeHead(404);res.end();return}
 if(!cached||Date.now()-checked>30000){pending??=query().then(value=>{cached=value;checked=Date.now();pending=null});await pending}
 res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public,max-age=30'});res.end(JSON.stringify(cached));
}).listen(3081,'127.0.0.1',()=>console.log('Fixed-server UDP monitor listening on 127.0.0.1:3081/status'));
