import {getMysqlPool} from '../mysql.js';

export const FORBES_LIMIT=13;
// The game stores money and bank as VARCHAR(21). DECIMAL avoids lexical sorting,
// unsigned debt wraparound, BIGINT overflow, and JavaScript floating-point loss.
const balance=column=>`CASE WHEN COALESCE(${column},'') REGEXP '^-?[0-9]{1,21}$' THEN CAST(${column} AS DECIMAL(30,0)) ELSE 0 END`;
export const rankingSql=`SELECT id,name,skin,(${balance('money')}+${balance('bank')}) AS wealth FROM accounts_1101 ORDER BY wealth DESC,id ASC LIMIT ${FORBES_LIMIT}`;

export function publicRanking(rows,updatedAt){
  return {basis:'cash_plus_bank',limit:FORBES_LIMIT,updatedAt,players:rows.slice(0,FORBES_LIMIT).map((row,index)=>{
    const id=Number(row.id),skin=Number(row.skin),wealth=String(row.wealth);
    if(!Number.isSafeInteger(id)||id<1||typeof row.name!=='string'||!row.name.trim()||! /^-?\d{1,31}$/.test(wealth)||(typeof row.wealth==='number'&&!Number.isSafeInteger(row.wealth)))throw new Error('Invalid ranking row');
    return {rank:index+1,id,nickname:row.name,skinId:row.skin!==null&&Number.isSafeInteger(skin)&&skin>=0?skin:null,wealth:BigInt(wealth).toString()};
  })};
}

export function createForbesHandler({pool=getMysqlPool,now=()=>Date.now(),cacheMs=60000}={}){
  let cached=null,expires=0,inflight=null;
  return async(request,response)=>{
    response.setHeader('X-Content-Type-Options','nosniff');
    if(request.method!=='GET'){
      response.setHeader('Cache-Control','no-store');response.setHeader('Allow','GET');
      return response.status(405).json({error:'method_not_allowed',message:'Метод не підтримується.'});
    }
    try{
      if(!cached||now()>=expires){
        inflight??=(async()=>{
          const [rows]=await pool().execute(rankingSql);
          const next=publicRanking(rows,new Date(now()).toISOString());cached=next;expires=now()+cacheMs;return next;
        })().finally(()=>{inflight=null;});
        await inflight;
      }
      response.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=30');
      return response.status(200).json(cached);
    }catch(error){
      response.setHeader('Cache-Control','no-store');
      console.error('Forbes API failed',/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'RANKING_UNAVAILABLE');
      return response.status(503).json({error:'forbes_unavailable',message:'Рейтинг тимчасово недоступний. Спробуйте пізніше.'});
    }
  };
}
