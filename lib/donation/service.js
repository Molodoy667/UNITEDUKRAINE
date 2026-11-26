import {createHash,createHmac,randomBytes} from 'node:crypto';
import {getMysqlPool} from '../mysql.js';
import {AccountError,fail} from '../account/core.js';
import {readAccountSession} from '../account/service.js';
import {readSettings} from '../site/content.js';

const requestIdPattern=/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const operationIdPattern=/^[a-f\d]{64}$/;
const nicknameValue=value=>{
 if(typeof value!=='string')fail(400,'invalid_nickname','Введіть нікнейм ігрового акаунта.');
 const nickname=value.trim();
 if(!nickname||Buffer.byteLength(nickname,'utf8')>24||/[\x00-\x1f\x7f]/u.test(nickname))fail(400,'invalid_nickname','Нікнейм має містити до 24 байтів і не містити керівних символів.');
 return nickname;
};
const json=value=>typeof value==='string'?JSON.parse(value):value;
const iso=value=>{
 if(!value)return null;
 if(value instanceof Date)return value.toISOString();
 const source=String(value),date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(source)?source:`${source.replace(' ','T')}Z`);
 return Number.isFinite(date.getTime())?date.toISOString():null;
};
const hash=value=>createHash('sha256').update(value).digest('hex');
const rows=async(db,sql,values=[])=> (await db.execute(sql,values))[0];
const secure=()=>process.env.NODE_ENV==='production'||Boolean(process.env.VERCEL);

function trustedOrigins(request){
 const configured=[process.env.DONATION_ORIGIN,process.env.ACCOUNT_ORIGIN,process.env.FORUM_ORIGIN,...[process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host=>`https://${host}`)];
 const host=String(request.headers['x-forwarded-host']||request.headers.host||'').split(',')[0].trim(),protocol=String(request.headers['x-forwarded-proto']||(secure()?'https':'http')).split(',')[0].trim();
 if(host&&/^[a-z\d.-]+(?::\d{1,5})?$/i.test(host)&&['https','http'].includes(protocol))configured.push(`${protocol}://${host}`);
 if(!secure())configured.push('http://localhost:5173','http://127.0.0.1:5173');
 return configured.map(value=>{try{return new URL(value).origin;}catch{return '';}}).filter(Boolean);
}
function checkOrigin(request){
 const origin=request.headers.origin;
 if(typeof origin!=='string'||!trustedOrigins(request).includes(origin))fail(403,'origin_rejected','Оновіть сторінку та повторіть запит.');
 if(!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type']||'')))fail(415,'json_required','Очікується JSON.');
}
function parseBody(request){
 let body;if(typeof request.body==='string'&&Buffer.byteLength(request.body)>8192)fail(413,'body_too_large','Завеликий запит.');
 try{body=typeof request.body==='string'?JSON.parse(request.body):request.body;}catch{fail(400,'invalid_body','Некоректний JSON.');}
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>8192)fail(400,'invalid_body','Завеликий або некоректний запит.');
 return body;
}
function currentIp(request){
 const ip=process.env.VERCEL?String(request.headers['x-vercel-forwarded-for']||request.socket?.remoteAddress||'unknown').split(',')[0].trim():request.socket?.remoteAddress||'local';
 return ip.slice(0,128);
}
async function rateLimit(db,request,scope,max){
 const secret=process.env.ACCOUNT_RATE_SECRET||process.env.FORUM_IP_SECRET;
 if(secure()&&(!secret||secret.length<32))fail(503,'donation_unconfigured','Захист платежів не налаштовано. Зверніться до адміністрації.');
 const bucket=createHmac('sha256',secret||'local-donation-development').update(`${scope}:${currentIp(request)}`).digest('hex');
 await rows(db,'INSERT INTO site_donation_limits(bucket,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[bucket]);
 const [limit]=await rows(db,'SELECT attempts FROM site_donation_limits WHERE bucket=?',[bucket]);
 if(Number(limit?.attempts)>max)fail(429,'rate_limited','Забагато спроб. Повторіть через 15 хвилин.');
}
function publicSettings(row){
 if(!row)return null;
 return {bankName:row.bank_name,recipientName:row.recipient_name,iban:row.iban,cardNumber:row.card_number,taxId:row.tax_id,paymentInstruction:row.payment_instruction,rulesText:row.rules_text,donatePerUah:Number(row.donate_per_uah),minAmountUah:Number(row.min_amount_uah),maxAmountUah:Number(row.max_amount_uah),version:Number(row.version)};
}
function publicPack(row,settings){
 return {id:Number(row.id),title:row.title,description:row.description,image:row.image_url,contents:json(row.contents_json)||[],priceUah:Number(row.price_uah),donateAmount:Number(row.price_uah)*Number(settings.donate_per_uah)};
}
function paymentSnapshot(settings){
 return {bankName:settings.bank_name,recipientName:settings.recipient_name,iban:settings.iban,cardNumber:settings.card_number,taxId:settings.tax_id,paymentInstruction:settings.payment_instruction,donatePerUah:Number(settings.donate_per_uah)};
}
function publicOperation(row){
 return {id:row.id,nickname:row.nickname,kind:row.kind,packageTitle:row.package_title,packageImage:row.package_image,packageContents:json(row.package_contents_json)||[],amountUah:Number(row.amount_uah),donateAmount:Number(row.donate_amount),payment:json(row.payment_snapshot_json)||{},status:row.status,expiresAt:iso(row.expires_at),createdAt:iso(row.created_at),paidAt:iso(row.paid_at),resolvedAt:iso(row.resolved_at),rejectReason:row.reject_reason,balanceAfter:row.balance_after===null?null:Number(row.balance_after),version:Number(row.version),serverNow:new Date().toISOString()};
}
async function readOperation(db,id){
 await rows(db,"UPDATE site_donation_operations SET status='expired',version=version+1 WHERE id=? AND status='awaiting_payment' AND expires_at<=UTC_TIMESTAMP()",[id]);
 const [operation]=await rows(db,'SELECT * FROM site_donation_operations WHERE id=?',[id]);
 if(!operation)fail(404,'operation_not_found','Платіжну інструкцію не знайдено.');
 return publicOperation(operation);
}
async function findAccount(db,nickname){
 const matches=await rows(db,'SELECT id,name FROM accounts_1101 WHERE LOWER(name)=LOWER(?) ORDER BY id LIMIT 2',[nickname]);
 if(matches.length>1)fail(409,'nickname_ambiguous','Знайдено кілька схожих нікнеймів. Зверніться до адміністрації.');
 return matches[0]||null;
}
function amount(value){
 const parsed=Number(value);
 if(!Number.isSafeInteger(parsed)||parsed<1||parsed>1_000_000)fail(400,'invalid_amount','Вкажіть суму від 1 до 1 000 000 грн.');
 return parsed;
}
function checkoutInput(body){
 if(!requestIdPattern.test(body.requestId||'')||body.acceptedRules!==true||!body.selection||typeof body.selection!=='object'||Array.isArray(body.selection))fail(400,'invalid_checkout','Підтвердьте правила та перевірте дані замовлення.');
 const nickname=nicknameValue(body.nickname),selection=body.selection;
 let kind,amountUah,packageId=null;
 if(selection.kind==='topup'&&Object.keys(selection).length===2&&Object.hasOwn(selection,'amountUah')){kind='topup';amountUah=amount(selection.amountUah);}
 else if(selection.kind==='package'&&Object.keys(selection).length===2&&Object.hasOwn(selection,'packageId')&&Number.isSafeInteger(selection.packageId)&&selection.packageId>0){kind='package';packageId=selection.packageId;}
 else fail(400,'invalid_checkout','Некоректний тип поповнення.');
 const canonical={nickname:nickname.toLocaleLowerCase('en-US'),kind,amountUah:kind==='topup'?amountUah:null,packageId};
 return {requestId:body.requestId.toLowerCase(),requestHash:hash(JSON.stringify(canonical)),nickname,kind,amountUah,packageId};
}

export function createDonationHandler({pool=getMysqlPool,getSession=readAccountSession}={}){
 return async function handler(request,response){
  response.setHeader('Cache-Control','no-store');response.setHeader('Vary','Cookie');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
  let connection;
  try{
   const url=new URL(request.url,'http://donation.local'),action=url.searchParams.get('action')||'bootstrap',db=pool();
   const settings=await readSettings(db),mode=settings.builder.value.access.mode;
   if(mode!=='normal'){
    const user=await getSession(request,db),allowed=mode==='authenticated'?Boolean(user):Number(user?.admin)===12;
    if(!allowed)fail(403,'site_access_restricted','Доступ до розділу донату тимчасово обмежено.');
   }
   if(request.method==='GET'&&action==='bootstrap'){
    connection=await db.getConnection();await connection.beginTransaction();const [donationSettings]=await rows(connection,'SELECT * FROM site_donation_settings WHERE id=1'),packs=await rows(connection,'SELECT * FROM site_donation_packages WHERE active=1 ORDER BY sort_order,id');
    if(!donationSettings)fail(503,'donation_unconfigured','Розділ поповнення тимчасово недоступний.');
    const config=publicSettings(donationSettings),configured=Boolean(config.bankName&&(config.iban||config.cardNumber)&&config.rulesText.trim());
    await connection.commit();connection.release();connection=null;
    return response.status(200).json({settings:{...config,configured},packages:packs.map(pack=>publicPack(pack,donationSettings)),serverNow:new Date().toISOString()});
   }
   if(request.method==='GET'&&action==='operation'){
    const id=url.searchParams.get('id')||'';if(!operationIdPattern.test(id))fail(404,'operation_not_found','Платіжну інструкцію не знайдено.');
    return response.status(200).json(await readOperation(db,id));
   }
   if(request.method!=='POST'){response.setHeader('Allow','GET, POST');fail(405,'method_not_allowed','Метод не підтримується.');}
   checkOrigin(request);const body=parseBody(request);
   if(action==='lookup'){
    if(Object.keys(body).length!==1||!Object.hasOwn(body,'nickname'))fail(400,'invalid_body','Некоректні дані гравця.');
    const nickname=nicknameValue(body.nickname);await rateLimit(db,request,'lookup',20);
    const account=await findAccount(db,nickname);
    return response.status(200).json({found:Boolean(account),nickname:account?.name||nickname,message:account?'Гравця знайдено. Можна перейти до оплати.':'Такого нікнейму немає в базі сервера.'});
   }
   if(action==='create'){
    if(Object.keys(body).length!==4||!['requestId','nickname','selection','acceptedRules'].every(key=>Object.hasOwn(body,key)))fail(400,'invalid_body','Перевірте дані платіжного запиту.');
    const input=checkoutInput(body);
    const [previous]=await rows(db,'SELECT id,request_hash FROM site_donation_operations WHERE request_id=?',[input.requestId]);
    if(previous){if(previous.request_hash!==input.requestHash)fail(409,'request_conflict','Цей запит уже використаний з іншими даними.');return response.status(200).json(await readOperation(db,previous.id));}
    await rateLimit(db,request,'create',8);
    connection=await db.getConnection();await connection.beginTransaction();
    const [duplicate]=await rows(connection,'SELECT id,request_hash FROM site_donation_operations WHERE request_id=? FOR UPDATE',[input.requestId]);
    if(duplicate){if(duplicate.request_hash!==input.requestHash)fail(409,'request_conflict','Цей запит уже використаний з іншими даними.');await connection.commit();const result=await readOperation(db,duplicate.id);connection.release();connection=null;return response.status(200).json(result);}
    const [settings]=await rows(connection,'SELECT * FROM site_donation_settings WHERE id=1 FOR UPDATE');
    if(!settings)fail(503,'donation_unconfigured','Розділ поповнення тимчасово недоступний.');
    const config=publicSettings(settings);
    if(!config.bankName||!(config.iban||config.cardNumber)||!config.rulesText.trim())fail(503,'donation_unconfigured','Оплата ще не налаштована. Спробуйте пізніше.');
    const account=await findAccount(connection,input.nickname);if(!account)fail(404,'nickname_not_found','Такого нікнейму немає в базі сервера. Перевірте написання.');
    let packageTitle='',packageImage='',packageContents=[],amountUah=input.amountUah;
    if(input.kind==='package'){
     const [pack]=await rows(connection,'SELECT * FROM site_donation_packages WHERE id=? AND active=1 FOR UPDATE',[input.packageId]);
     if(!pack)fail(404,'package_unavailable','Цей донат-пак більше не доступний. Оновіть сторінку.');
     amountUah=Number(pack.price_uah);packageTitle=pack.title;packageImage=pack.image_url;packageContents=json(pack.contents_json)||[];
    }
    if(!Number.isSafeInteger(amountUah)||amountUah<1||amountUah>1_000_000||(input.kind==='topup'&&(amountUah<config.minAmountUah||amountUah>config.maxAmountUah)))fail(400,'amount_out_of_range',input.kind==='topup'?`Сума має бути від ${config.minAmountUah} до ${config.maxAmountUah} грн.`:'Ціна донат-паку виходить за дозволені межі.');
    const donateAmount=amountUah*config.donatePerUah;
    if(!Number.isSafeInteger(donateAmount)||donateAmount<1||donateAmount>2147483647)fail(400,'amount_out_of_range','Сума поповнення виходить за дозволені межі.');
    const id=randomBytes(32).toString('hex'),snapshot=paymentSnapshot(settings);
    await rows(connection,'INSERT INTO site_donation_operations(id,request_id,request_hash,account_id,nickname,kind,package_id,package_title,package_image,package_contents_json,amount_uah,donate_amount,payment_snapshot_json,rules_version,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,? ,\'awaiting_payment\',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))',[id,input.requestId,input.requestHash,account.id,account.name,input.kind,input.packageId,packageTitle,packageImage,packageContents.length?JSON.stringify(packageContents):null,amountUah,donateAmount,JSON.stringify(snapshot),settings.version]);
    await connection.commit();connection.release();connection=null;
    return response.status(200).json(await readOperation(db,id));
   }
   if(action==='paid'){
    if(Object.keys(body).length!==1||typeof body.id!=='string'||!operationIdPattern.test(body.id))fail(400,'invalid_operation','Некоректний номер операції.');
    const db=pool();await rateLimit(db,request,'paid',12);
    connection=await db.getConnection();await connection.beginTransaction();
    const [operation]=await rows(connection,'SELECT * FROM site_donation_operations WHERE id=? FOR UPDATE',[body.id]);
    if(!operation)fail(404,'operation_not_found','Платіжну інструкцію не знайдено.');
    const [expired]=await rows(connection,"UPDATE site_donation_operations SET status='expired',version=version+1 WHERE id=? AND status='awaiting_payment' AND expires_at<=UTC_TIMESTAMP()",[operation.id]);
    if(Number(expired?.affectedRows)>0){
     await connection.commit();connection.release();connection=null;return response.status(200).json(await readOperation(db,operation.id));
    }
    if(operation.status==='awaiting_payment')await rows(connection,"UPDATE site_donation_operations SET status='awaiting_admin',paid_at=UTC_TIMESTAMP(),version=version+1 WHERE id=?",[operation.id]);
    else if(!['awaiting_admin','approved','rejected','expired'].includes(operation.status))fail(409,'invalid_operation_state','Цей платіж уже завершений.');
    await connection.commit();connection.release();connection=null;
    return response.status(200).json(await readOperation(db,operation.id));
   }
   fail(404,'not_found','Операцію не знайдено.');
  }catch(error){
   if(connection)try{await connection.rollback();}catch{}
   if(error instanceof AccountError)return response.status(error.status).json({error:error.code,message:error.message});
   if(error.code==='ER_DUP_ENTRY'&&request.method==='POST')return response.status(409).json({error:'request_conflict',message:'Запит уже обробляється. Оновіть платіжний розділ.'});
   console.error('Donation API failed',/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:'REQUEST_FAILED');
   return response.status(503).json({error:'donation_unavailable',message:'Розділ донату тимчасово недоступний. Спробуйте пізніше.'});
  }finally{connection?.release();}
 };
}
