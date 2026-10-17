import { equal } from '../lib/forum/core.js';
import { deliverForumMail } from '../lib/forum/mail-worker.js';
export default async function handler(request,response){
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='GET'){response.setHeader('Allow','GET');return response.status(405).json({error:'method_not_allowed'});}
  const secret=process.env.FORUM_CRON_SECRET;
  if(!secret||secret.length<32||!equal(request.headers.authorization,`Bearer ${secret}`))return response.status(401).json({error:'unauthorized'});
  try{return response.status(200).json(await deliverForumMail(10));}catch{return response.status(503).json({error:'mail_queue_unavailable'});}
}
