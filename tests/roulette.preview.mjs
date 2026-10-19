// UI QA on real, disposable LOCAL MariaDB; all accounts/balances are synthetic.
import {createServer} from 'node:http';
import {rouletteDatabase} from './roulette-database.mjs';
import {createAccountHandler} from '../lib/account/service.js';
import {createRouletteHandler} from '../lib/roulette/service.js';
if(process.env.ROULETTE_TEST_PREVIEW!=='1')throw new Error('Enable ROULETTE_TEST_PREVIEW=1 for local UI QA only.');
const system=await rouletteDatabase(),getPresence=async()=>({online:false,checkedAt:new Date().toISOString(),source:'synthetic-test'});
const account=createAccountHandler({pool:()=>system.pool,getPresence}),roulette=createRouletteHandler({pool:()=>system.pool,getPresence});
const server=createServer(async(request,response)=>{
  response.status=code=>{response.statusCode=code;return response;};response.json=body=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(body));};
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>4096)return response.status(413).json({error:'too_large'});chunks.push(chunk);}if(size)request.body=Buffer.concat(chunks).toString('utf8');
  const handler=request.url.startsWith('/api/roulette')?roulette:request.url.startsWith('/api/account')?account:null;
  if(!handler)return response.status(404).json({error:'not_found'});await handler(request,response);
});
server.listen(4174,'127.0.0.1',()=>console.log('LOCAL SYNTHETIC roulette QA on 127.0.0.1:4174. No live DB or real money.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await system.close();process.exit(0);});});
