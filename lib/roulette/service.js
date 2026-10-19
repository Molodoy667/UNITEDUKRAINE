import { randomUUID } from 'node:crypto';
import { getMysqlPool } from '../mysql.js';
import { readAccountSession,verifyAccountWrite } from '../account/service.js';
import { AccountError,fail } from '../account/core.js';
import { presence } from '../account/presence.js';
import { prizes,rarities,selectPrize,SPIN_PRICE,SALE_PRICE } from './catalog.js';

const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
function publicSpin(row){return {id:row.id,prize:typeof row.prize==='string'?JSON.parse(row.prize):row.prize,status:row.status,payment:row.payment,cost:Number(row.cost),createdAt:row.created_at,resolvedAt:row.resolved_at};}
export function createRouletteHandler({pool=getMysqlPool,getSession=readAccountSession,getPresence=presence,pick=selectPrize}={}) {
  const rows=async(db,sql,values=[])=>(await db.execute(sql,values))[0];
  const engine=async(db)=>String((await rows(db,"SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts_1101'"))[0]?.ENGINE||'').toUpperCase();
  // Acquire an exclusive row lock directly. INSERT IGNORE can take shared duplicate-key
  // locks and deadlock when two transactions subsequently upgrade to FOR UPDATE.
  async function ensurePlayer(db,id){await rows(db,'INSERT INTO site_roulette_players(account_id) VALUES(?) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id)',[id]);}
  async function requireMoneyReady(db,user){
    if(await engine(db)!=='INNODB')fail(503,'wallet_not_ready','Платні дії ще не готові: потрібна міграція бази. Донат не списано.');
    // The Pawn server caches donate_current. Avoid the normal in-game overwrite path.
    const state=await getPresence(user.name,{fresh:true});
    if(state.online!==false)fail(409,'leave_game',state.online?'Перед операцією з донатом вийдіть з гри та повторіть дію.':'Не вдалося перевірити вихід із гри. Донат не змінено.');
  }
  async function wallet(db,id,delta,spinId,kind){
    const account=(await rows(db,'SELECT donate_current FROM accounts_1101 WHERE id=? FOR UPDATE',[id]))[0];
    const before=Number(account?.donate_current);
    if(!Number.isSafeInteger(before)||before<0||before+delta>2147483647)fail(409,'invalid_balance','Баланс потребує перевірки адміністрацією.');
    if(before+delta<0)fail(402,'insufficient_funds','Недостатньо донату для обертання.');
    await rows(db,'UPDATE accounts_1101 SET donate_current=donate_current+? WHERE id=?',[delta,id]);
    await rows(db,'INSERT INTO site_roulette_ledger(spin_id,account_id,kind,delta,balance_before,balance_after) VALUES(?,?,?,?,?,?)',[spinId,id,kind,delta,before,before+delta]);
  }
  async function state(db,user){
    await ensurePlayer(db,user.id);
    const [player,balance,history,storage,status]=await Promise.all([
      rows(db,'SELECT free_spins FROM site_roulette_players WHERE account_id=?',[user.id]),
      rows(db,'SELECT donate_current FROM accounts_1101 WHERE id=?',[user.id]),
      rows(db,'SELECT * FROM site_roulette_spins WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 50',[user.id]),
      engine(db),getPresence(user.name),
    ]);
    const spins=history.map(publicSpin);
    return {user:{id:user.id,nickname:user.name},csrf:user.csrf,balance:Number(balance[0]?.donate_current)||0,freeSpins:Number(player[0]?.free_spins)||0,prizes,rarities,spinPrice:SPIN_PRICE,salePrice:SALE_PRICE,testMode:true,history:spins,pending:spins.find(s=>s.status==='pending')||null,
      moneyAvailable:storage==='INNODB'&&status.online===false,moneyReason:storage!=='INNODB'?'Платні дії стануть доступні після міграції бази.':status.online===true?'Для платних дій потрібно вийти з гри.':status.online===null?'Чекаємо підтвердження виходу з гри.':null};
  }
  return async function handler(request,response){
    response.setHeader('Cache-Control','private, no-store');response.setHeader('Vary','Cookie');response.setHeader('X-Content-Type-Options','nosniff');
    let db;
    try{
      if(!['GET','POST'].includes(request.method)){response.setHeader('Allow','GET, POST');fail(405,'method_not_allowed','Метод не підтримується.');}
      const action=new URL(request.url,'http://roulette.local').searchParams.get('action')||'state';
      if(request.method==='GET'?action!=='state':!['spin','resolve'].includes(action))fail(404,'not_found','Операцію не знайдено.');
      const user=await getSession(request,pool());if(!user)fail(401,'login_required','Рулетка доступна після входу в ігровий акаунт.');
      if(request.method==='GET')return response.status(200).json(await state(pool(),user));
      verifyAccountWrite(request,user);
      let body;try{body=typeof request.body==='string'?JSON.parse(request.body):request.body;}catch{fail(400,'invalid_body','Некоректний запит.');}
      if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>1024)fail(400,'invalid_body','Некоректний запит.');
      if(action==='spin'&&(!uuid(body.requestId)||!['free','donate'].includes(body.payment)))fail(400,'invalid_spin','Некоректний запит обертання.');
      if(action==='resolve'&&(!uuid(body.spinId)||!['keep','sell'].includes(body.decision)))fail(400,'invalid_prize','Некоректна дія з призом.');
      db=await pool().getConnection();await db.beginTransaction();await ensurePlayer(db,user.id);
      const player=(await rows(db,'SELECT free_spins FROM site_roulette_players WHERE account_id=? FOR UPDATE',[user.id]))[0];
      let result;
      if(action==='spin'){
        const existing=(await rows(db,'SELECT * FROM site_roulette_spins WHERE account_id=? AND request_id=?',[user.id,body.requestId]))[0];
        if(existing){if(existing.payment!==body.payment)fail(409,'request_conflict','Цей запит уже використано.');result=existing;}
        else{
          const pending=(await rows(db,"SELECT id FROM site_roulette_spins WHERE account_id=? AND status='pending' LIMIT 1",[user.id]))[0];
          if(pending)fail(409,'prize_pending','Спочатку заберіть або продайте попередній приз.');
          if(body.payment==='free'&&Number(player.free_spins)<1)fail(409,'no_free_spins','Безкоштовних обертань більше немає.');
          if(body.payment==='donate')await requireMoneyReady(db,user);
          const prize=pick(),id=randomUUID(),cost=body.payment==='donate'?SPIN_PRICE:0;
          await rows(db,'INSERT INTO site_roulette_spins(id,account_id,request_id,payment,cost,prize) VALUES(?,?,?,?,?,?)',[id,user.id,body.requestId,body.payment,cost,JSON.stringify(prize)]);
          if(cost)await wallet(db,user.id,-cost,id,'spin');else await rows(db,'UPDATE site_roulette_players SET free_spins=free_spins-1 WHERE account_id=?',[user.id]);
          result=(await rows(db,'SELECT * FROM site_roulette_spins WHERE id=? AND account_id=?',[id,user.id]))[0];
        }
      }else{
        result=(await rows(db,'SELECT * FROM site_roulette_spins WHERE id=? AND account_id=? FOR UPDATE',[body.spinId,user.id]))[0];
        if(!result)fail(404,'prize_not_found','Приз не знайдено.');
        const wanted=body.decision==='keep'?'kept':'sold';
        if(result.status!=='pending'&&result.status!==wanted)fail(409,'prize_resolved','Дію з цим призом уже виконано.');
        if(result.status==='pending'){
          if(wanted==='sold'){await requireMoneyReady(db,user);await wallet(db,user.id,SALE_PRICE,result.id,'sale');}
          await rows(db,'UPDATE site_roulette_spins SET status=?,resolved_at=UTC_TIMESTAMP() WHERE id=? AND account_id=?',[wanted,result.id,user.id]);
          result=(await rows(db,'SELECT * FROM site_roulette_spins WHERE id=? AND account_id=?',[result.id,user.id]))[0];
        }
      }
      await db.commit();return response.status(200).json({spin:publicSpin(result)});
    }catch(error){
      if(db)try{await db.rollback();}catch{}
      if(error instanceof AccountError)return response.status(error.status).json({error:error.code,message:error.message});
      console.error('Roulette API failed',/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'REQUEST_FAILED');
      return response.status(503).json({error:'roulette_unavailable',message:'Рулетка тимчасово недоступна. Якщо операція завершилась, приз з’явиться після оновлення сторінки.'});
    }finally{db?.release();}
  };
}
