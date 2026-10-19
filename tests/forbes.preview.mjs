// Explicit local visual QA only. The production Forbes handler contains no demo data.
import {createServer} from 'node:http';
import {forbesDatabase} from './forbes-database.mjs';
import {createForbesHandler} from '../lib/forbes/service.js';
if(process.env.FORBES_TEST_PREVIEW!=='1')throw Error('Set FORBES_TEST_PREVIEW=1 for local synthetic UI QA.');
const db=await forbesDatabase(),handler=createForbesHandler({pool:()=>db.pool});
const server=createServer(async(request,response)=>{response.status=code=>{response.statusCode=code;return response;};response.json=body=>{response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(body));};if(new URL(request.url,'http://localhost').pathname!=='/api/forbes')return response.status(404).json({error:'not_found'});await handler(request,response);});
server.listen(4174,'127.0.0.1',()=>console.log(`LOCAL SYNTHETIC Forbes preview on localhost:4174, database ${db.name}. No real player data. Type quit to stop and remove the test DB.`));
let stopping=false;const close=()=>{if(stopping)return;stopping=true;server.close(async()=>{await db.close();process.exit(0);});};
process.stdin.setEncoding('utf8');process.stdin.on('data',line=>{if(line.trim()==='quit')close();});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,close);
