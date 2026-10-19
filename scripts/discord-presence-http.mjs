// Optional standalone deployment on an operator-controlled HTTP host, NOT Vercel.
// Read-only public mapping, no DB/session/secrets, does not modify the game server.
import {createServer} from 'node:http';
import {createDiscordInfoHandler,DISCORD_INFO_PATH} from '../lib/discord-presence.js';
const host=process.env.DISCORD_INFO_BIND||'127.0.0.1';
const port=Number(process.env.DISCORD_INFO_PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('DISCORD_INFO_PORT must be between 1024 and 65535');
const handler=createDiscordInfoHandler();
createServer((request,response)=>{
 response.status=code=>{response.statusCode=code;return response;};
 const url=new URL(request.url,'http://discord-info.local');
 if(url.pathname!==DISCORD_INFO_PATH){response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end('Not found');return;}
 void handler(request,response).catch(()=>{if(!response.headersSent)response.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end('Unavailable');});
}).listen(port,host,()=>console.log(`Discord XML listening at http://${host}:${port}${DISCORD_INFO_PATH}`));
