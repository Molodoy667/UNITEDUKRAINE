import {createHash} from 'node:crypto';
import {presence} from '../account/presence.js';
import {AccountError,fail} from '../account/core.js';
import {safeUrl} from '../site/content.js';

const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const operationId=value=>typeof value==='string'&&/^[a-f\d]{64}$/.test(value);
const rows=async(db,sql,values=[])=> (await db.execute(sql,values))[0];
const json=value=>typeof value==='string'?JSON.parse(value):value;
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const whole=(value,min,max,field)=>{const number=Number(value);if(!Number.isSafeInteger(number)||number<min||number>max)fail(400,'invalid_donation_input',`Перевірте поле «${field}».`);return number;};
const text=(value,max,field,{required=false,multiline=false}={})=>{
 if(typeof value!=='string')fail(400,'invalid_donation_input',`Перевірте поле «${field}».`);
 const clean=(multiline?value.replace(/\r\n?/g,'\n'):value).trim();
 if(clean.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(clean)||(required&&!clean))fail(400,'invalid_donation_input',`Перевірте поле «${field}».`);
 return clean;
};
const expected=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function settingsView(row){return row?{bankName:row.bank_name,recipientName:row.recipient_name,iban:row.iban,cardNumber:row.card_number,taxId:row.tax_id,paymentInstruction:row.payment_instruction,rulesText:row.rules_text,donatePerUah:Number(row.donate_per_uah),minAmountUah:Number(row.min_amount_uah),maxAmountUah:Number(row.max_amount_uah),version:Number(row.version),updatedAt:row.updated_at}:null;}
function packageView(row){return {...row,id:Number(row.id),contents:json(row.contents_json)||[],priceUah:Number(row.price_uah),active:Boolean(row.active),sortOrder:Number(row.sort_order),version:Number(row.version),updatedAt:row.updated_at};}
function operationView(row){return {id:row.id,accountId:Number(row.account_id),nickname:row.nickname,kind:row.kind,packageId:row.package_id===null?null:Number(row.package_id),packageTitle:row.package_title,packageImage:row.package_image,packageContents:json(row.package_contents_json)||[],amountUah:Number(row.amount_uah),donateAmount:Number(row.donate_amount),payment:json(row.payment_snapshot_json)||{},status:row.status,expiresAt:row.expires_at,paidAt:row.paid_at,resolvedAt:row.resolved_at,resolvedBy:row.resolved_by===null?null:Number(row.resolved_by),rejectReason:row.reject_reason,balanceBefore:row.balance_before===null?null:Number(row.balance_before),balanceAfter:row.balance_after===null?null:Number(row.balance_after),version:Number(row.version),createdAt:row.created_at};}

export const donationReads=['donation-settings','donation-packages','donation-operations'];
export const donationWrites=['donation-settings-save','donation-pack-save','donation-operation-approve','donation-operation-reject'];

export function createDonationAdminService({getPresence=presence}={}){
 async function read(db,action,params){
  if(action==='donation-settings'){
   const [row]=await rows(db,'SELECT * FROM site_donation_settings WHERE id=1');
   return {settings:settingsView(row)};
  }
  if(action==='donation-packages'){
   const items=await rows(db,'SELECT * FROM site_donation_packages ORDER BY sort_order,id');
   return {items:items.map(packageView)};
  }
  if(action==='donation-operations'){
   const status=params.get('status')||'all',query=(params.get('q')||'').trim(),page=Number(params.get('page')||1);
   if(!['all','awaiting_payment','awaiting_admin','approved','rejected','expired'].includes(status)||!Number.isInteger(page)||page<1||page>100000||query.length>80)fail(400,'invalid_filter','Непідтримуваний фільтр операцій.');
   await rows(db,"UPDATE site_donation_operations SET status='expired',version=version+1 WHERE status='awaiting_payment' AND expires_at<=UTC_TIMESTAMP()");
   const where=[],values=[];
   if(status!=='all'){where.push('status=?');values.push(status);}
   if(query){where.push('(nickname LIKE ? OR package_title LIKE ? OR id LIKE ?)');values.push(`%${query}%`,`%${query}%`,`%${query}%`);}
   const predicate=where.length?` WHERE ${where.join(' AND ')}`:'',[count]=await rows(db,`SELECT COUNT(*) AS total FROM site_donation_operations${predicate}`,values),total=Number(count.total),pages=Math.max(1,Math.ceil(total/20)),current=Math.min(page,pages);
   const items=await rows(db,`SELECT * FROM site_donation_operations${predicate} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ${(current-1)*20}`,values);
   return {items:items.map(operationView),total,page:current,pages};
  }
  fail(404,'not_found','Розділ донату не знайдено.');
 }
 async function write(pool,user,action,body){
  if(!donationWrites.includes(action)||!uuid(body?.requestId))fail(400,'invalid_request','Некоректний запит адміністратора.');
  const payloadHash=hash(stable({action,...body})),db=await pool.getConnection();
  try{
   await db.beginTransaction();
   const [actor]=await rows(db,'SELECT admin FROM accounts_1101 WHERE id=? FOR UPDATE',[user.id]);
   if(Number(actor?.admin)!==12)fail(403,'forbidden','Потрібен актуальний рівень адміністратора 12.');
   const [previous]=await rows(db,'SELECT payload_hash,result_json FROM site_donation_audit WHERE actor_id=? AND request_id=?',[user.id,body.requestId]);
   if(previous){if(previous.payload_hash!==payloadHash)fail(409,'request_conflict','ID запиту вже використаний.');await db.commit();return {...json(previous.result_json),replayed:true};}
   await rows(db,'INSERT INTO site_admin_limits(actor_id,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)',[user.id]);
   const [limit]=await rows(db,'SELECT attempts FROM site_admin_limits WHERE actor_id=?',[user.id]);if(Number(limit.attempts)>120)fail(429,'rate_limited','Забагато змін. Повторіть через 15 хвилин.');
   let before=null,after=null,target='',result;
   if(action==='donation-settings-save'){
    if(!expected(body,['requestId','version','settings'])||!Number.isSafeInteger(body.version)||!expected(body.settings,['bankName','recipientName','iban','cardNumber','taxId','paymentInstruction','rulesText','donatePerUah','minAmountUah','maxAmountUah']))fail(400,'invalid_donation_input','Перевірте параметри донату.');
    const input=body.settings,clean={bankName:text(input.bankName,120,'Банк'),recipientName:text(input.recipientName,160,'Отримувач'),iban:text(input.iban,64,'IBAN'),cardNumber:text(input.cardNumber,40,'Номер картки'),taxId:text(input.taxId,32,'РНОКПП'),paymentInstruction:text(input.paymentInstruction,500,'Інструкція',{multiline:true}),rulesText:text(input.rulesText,12000,'Правила поповнення',{multiline:true}),donatePerUah:whole(input.donatePerUah,1,1000,'Курс донату'),minAmountUah:whole(input.minAmountUah,1,1000000,'Мінімальна сума'),maxAmountUah:whole(input.maxAmountUah,1,1000000,'Максимальна сума')};
    if(clean.maxAmountUah<clean.minAmountUah)fail(400,'invalid_amount_range','Максимальна сума має бути не меншою за мінімальну.');
    const [record]=await rows(db,'SELECT * FROM site_donation_settings WHERE id=1 FOR UPDATE');
    if(!record||Number(record.version)!==body.version)fail(409,'stale_donation_settings','Налаштування вже змінено. Оновіть сторінку.');
    before=settingsView(record);
    await rows(db,'UPDATE site_donation_settings SET bank_name=?,recipient_name=?,iban=?,card_number=?,tax_id=?,payment_instruction=?,rules_text=?,donate_per_uah=?,min_amount_uah=?,max_amount_uah=?,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=1',[clean.bankName,clean.recipientName,clean.iban,clean.cardNumber,clean.taxId,clean.paymentInstruction,clean.rulesText,clean.donatePerUah,clean.minAmountUah,clean.maxAmountUah,user.id]);
    after={...clean,version:body.version+1};target='settings';result={saved:true,version:body.version+1};
   }else if(action==='donation-pack-save'){
    if(!expected(body,['requestId','id','version','pack'])||!expected(body.pack,['title','description','image','contents','priceUah','active','sortOrder']))fail(400,'invalid_donation_pack','Перевірте поля донат-паку.');
    const pack=body.pack,title=text(pack.title,120,'Назва паку',{required:true}),description=text(pack.description,300,'Опис паку',{multiline:true}),image=safeUrl(text(pack.image,2048,'Зображення'), 'image');
    if(!Array.isArray(pack.contents)||!pack.contents.length||pack.contents.length>20)fail(400,'invalid_donation_pack','Додайте від 1 до 20 пунктів наповнення паку.');
    const contents=pack.contents.map(item=>text(item,160,'Пункт наповнення',{required:true}));
    if(typeof pack.active!=='boolean')fail(400,'invalid_donation_pack','Перевірте стан паку.');
    const price=whole(pack.priceUah,1,1000000,'Ціна паку'),sortOrder=whole(pack.sortOrder,-10000,10000,'Порядок паків');
    let record=null;
    if(body.id!==null){if(!Number.isSafeInteger(body.id)||body.id<1||!Number.isSafeInteger(body.version))fail(400,'invalid_id','Некоректний ID паку.');[record]=await rows(db,'SELECT * FROM site_donation_packages WHERE id=? FOR UPDATE',[body.id]);if(!record)fail(404,'package_not_found','Донат-пак не знайдено.');if(Number(record.version)!==body.version)fail(409,'stale_donation_package','Пак уже змінено. Оновіть список.');before=packageView(record);}
    else if(body.version!==0)fail(400,'invalid_version','Некоректна версія нового паку.');
    if(record)await rows(db,'UPDATE site_donation_packages SET title=?,description=?,image_url=?,contents_json=?,price_uah=?,active=?,sort_order=?,version=version+1,updated_by=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[title,description,image,JSON.stringify(contents),price,pack.active,sortOrder,user.id,record.id]);
    else {const inserted=await rows(db,'INSERT INTO site_donation_packages(title,description,image_url,contents_json,price_uah,active,sort_order,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)',[title,description,image,JSON.stringify(contents),price,pack.active,sortOrder,user.id,user.id]);body.id=Number(inserted.insertId);}
    const [saved]=await rows(db,'SELECT * FROM site_donation_packages WHERE id=?',[record?.id||body.id]);after=packageView(saved);target=`package:${saved.id}`;result={saved:true,id:Number(saved.id),version:Number(saved.version)};
   }else{
    if(action==='donation-operation-approve'){
     if(!expected(body,['requestId','operationId','version'])||!operationId(body.operationId)||!Number.isSafeInteger(body.version))fail(400,'invalid_operation','Некоректний запит підтвердження.');
    }else if(!expected(body,['requestId','operationId','version','reason'])||!operationId(body.operationId)||!Number.isSafeInteger(body.version))fail(400,'invalid_operation','Некоректний запит відхилення.');
    const [operation]=await rows(db,'SELECT * FROM site_donation_operations WHERE id=? FOR UPDATE',[body.operationId]);
    if(!operation)fail(404,'operation_not_found','Фінансову операцію не знайдено.');
    before={id:operation.id,accountId:Number(operation.account_id),nickname:operation.nickname,kind:operation.kind,amountUah:Number(operation.amount_uah),donateAmount:Number(operation.donate_amount),status:operation.status,version:Number(operation.version)};
     if(operation.status==='approved'&&action==='donation-operation-approve'){
     const [ledger]=await rows(db,'SELECT balance_before,balance_after FROM site_donation_ledger WHERE operation_id=?',[operation.id]);
     after={...before,status:'approved',balanceBefore:Number(ledger?.balance_before??operation.balance_before),balanceAfter:Number(ledger?.balance_after??operation.balance_after)};result={approved:true,status:'approved',donateAmount:Number(operation.donate_amount),balanceAfter:after.balanceAfter,alreadyApproved:true};target=`operation:${operation.id}`;
     }else if(operation.status==='rejected'&&action==='donation-operation-reject'){
      after={...before,status:'rejected',reason:operation.reject_reason};result={rejected:true,status:'rejected',alreadyRejected:true};target=`operation:${operation.id}`;
    }else{
     if(Number(operation.version)!==body.version)fail(409,'stale_donation_operation','Операцію вже змінено. Оновіть список.');
     if(operation.status!=='awaiting_admin')fail(409,'invalid_operation_state','Підтверджувати або відхиляти можна лише заявку після натискання «Я оплатив».');
     if(action==='donation-operation-reject'){
      const reason=text(body.reason,500,'Причина відхилення',{required:true});
      await rows(db,"UPDATE site_donation_operations SET status='rejected',reject_reason=?,resolved_by=?,resolved_at=UTC_TIMESTAMP(),version=version+1 WHERE id=?",[reason,user.id,operation.id]);
      after={...before,status:'rejected',reason,version:before.version+1};result={rejected:true,status:'rejected',version:before.version+1};target=`operation:${operation.id}`;
     }else{
      const [engineRow]=await rows(db,"SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts_1101'");
      if(String(engineRow?.ENGINE||'').toUpperCase()!=='INNODB')fail(503,'wallet_not_ready','Ігрова база ще не підтримує безпечне нарахування. Баланс не змінено.');
      const [account]=await rows(db,'SELECT name,donate_current FROM accounts_1101 WHERE id=? FOR UPDATE',[operation.account_id]);
      if(!account)fail(404,'account_not_found','Ігровий акаунт не знайдено. Зарахування не виконано.');
      const presenceState=await getPresence(account.name,{fresh:true});
      if(presenceState.online!==false)fail(409,'player_must_exit','Гравець має вийти з гри. Після цього підтвердьте заявку повторно.');
      const balanceBefore=Number(account.donate_current),delta=Number(operation.donate_amount),balanceAfter=balanceBefore+delta;
      if(!Number.isSafeInteger(balanceBefore)||balanceBefore<0||!Number.isSafeInteger(delta)||delta<1||balanceAfter>2147483647)fail(409,'invalid_balance','Баланс гравця потребує перевірки. Нарахування не виконано.');
      await rows(db,'UPDATE accounts_1101 SET donate_current=donate_current+? WHERE id=?',[delta,operation.account_id]);
      await rows(db,'INSERT INTO site_donation_ledger(operation_id,account_id,donate_amount,balance_before,balance_after,approved_by) VALUES(?,?,?,?,?,?)',[operation.id,operation.account_id,delta,balanceBefore,balanceAfter,user.id]);
      await rows(db,"UPDATE site_donation_operations SET status='approved',resolved_by=?,resolved_at=UTC_TIMESTAMP(),balance_before=?,balance_after=?,version=version+1 WHERE id=?",[user.id,balanceBefore,balanceAfter,operation.id]);
      after={...before,status:'approved',balanceBefore,balanceAfter,version:before.version+1};result={approved:true,status:'approved',donateAmount:delta,balanceBefore,balanceAfter,alreadyApproved:false};target=`operation:${operation.id}`;
     }
    }
   }
   await rows(db,'INSERT INTO site_donation_audit(actor_id,request_id,payload_hash,event,target,before_json,after_json,result_json) VALUES(?,?,?,?,?,?,?,?)',[user.id,body.requestId,payloadHash,action,target,before?JSON.stringify(before):null,JSON.stringify(after),JSON.stringify(result)]);
   await db.commit();return {...result,replayed:false};
  }catch(error){
   await db.rollback();if(error.code==='ER_DUP_ENTRY')fail(409,'donation_conflict','Запит уже оброблено. Оновіть розділ операцій.');throw error;
  }finally{db.release();}
 }
 return {read,write};
}
