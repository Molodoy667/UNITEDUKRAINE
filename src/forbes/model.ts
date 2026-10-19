export type ForbesPlayer={id:number;rank:number;nickname:string;skinId:number|null;wealth:string};
export type ForbesRanking={basis:'cash_plus_bank';limit:number;updatedAt:string;players:ForbesPlayer[]};
export function parseRanking(value:unknown):ForbesRanking{
  if(!value||typeof value!=='object')throw Error('Некоректні дані рейтингу. Спробуйте оновити сторінку.');
  const data=value as Record<string,unknown>;
  if(data.basis!=='cash_plus_bank'||data.limit!==13||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt))||!Array.isArray(data.players)||data.players.length>13)throw Error('Некоректні дані рейтингу. Спробуйте оновити сторінку.');
  const ids=new Set<number>();
  const players=data.players.map((row:unknown,index:number)=>{
    if(!row||typeof row!=='object')throw Error('Некоректні дані гравця.');
    const p=row as Record<string,unknown>;
    if(typeof p.id!=='number'||!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||p.rank!==index+1||typeof p.nickname!=='string'||!p.nickname.trim()||typeof p.wealth!=='string'||! /^-?\d{1,31}$/.test(p.wealth)||(p.skinId!==null&&(typeof p.skinId!=='number'||!Number.isSafeInteger(p.skinId)||p.skinId<0)))throw Error('Некоректні дані гравця.');
    ids.add(p.id);
    return {id:p.id,rank:index+1,nickname:p.nickname,skinId:p.skinId as number|null,wealth:p.wealth};
  });
  return {basis:'cash_plus_bank',limit:13,updatedAt:data.updatedAt,players};
}
const whole=new Intl.NumberFormat('uk-UA');
export const fullWealth=(value:string)=>`${whole.format(BigInt(value))} ₴`;
// Only the compact podium label is abbreviated. Full values remain accessible.
export function compactWealth(value:string){
  const amount=BigInt(value),absolute=amount<0n?-amount:amount;
  const units:[[bigint,string],...[bigint,string][]]=[[1000000000000000000n,'квінт'],[1000000000000000n,'квадр'],[1000000000000n,'трлн'],[1000000000n,'млрд'],[1000000n,'млн'],[1000n,'тис.']];
  const unit=units.find(([base])=>absolute>=base);if(!unit)return fullWealth(value);
  const [base,label]=unit,hundredths=absolute*100n/base,decimal=String(hundredths%100n).padStart(2,'0').replace(/0+$/,'');
  return `${amount<0n?'−':''}${whole.format(hundredths/100n)}${decimal?`,${decimal}`:''} ${label} ₴`;
}
