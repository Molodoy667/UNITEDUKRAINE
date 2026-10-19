// Explicit, loopback-only synthetic API for visual QA. Never loads production database settings.
import {createServer} from 'node:http';
import {createAccountHandler} from '../lib/account/service.js';
import {TestDatabase,testPlayer} from './account-fixtures.mjs';
if(process.env.ACCOUNT_TEST_PREVIEW!=='1')throw new Error('Enable ACCOUNT_TEST_PREVIEW=1 for local synthetic UI checks only.');
if(process.env.NODE_ENV==='production'||process.env.VERCEL)throw new Error('Synthetic preview cannot run in production.');
const db=new TestDatabase([testPlayer({admin:12})]);
const handler=createAccountHandler({pool:()=>db,getPresence:async()=>({online:true,checkedAt:new Date().toISOString(),source:'synthetic-test'})});
createServer(async(request,response)=>{
  response.status=status=>{response.statusCode=status;return response;};response.json=data=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(data));};
  if(!request.url.startsWith('/api/account'))return response.status(404).json({error:'not_found'});
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>4096)return response.status(413).json({error:'too_large'});chunks.push(chunk);}if(size)request.body=Buffer.concat(chunks).toString('utf8');
  await handler(request,response);
}).listen(4174,'127.0.0.1',()=>console.log('Synthetic account QA API listening on loopback:4174. No live DB is used.'));
