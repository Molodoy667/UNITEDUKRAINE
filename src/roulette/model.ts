export type Rarity={id:string;name:string;color:string};
export type Prize={id:string;title:string;type:string;rarity:string;image:string;weight:number;sellPrice:number;test:boolean};
export type Spin={id:string;prize:Prize;status:'pending'|'kept'|'sold';payment:'free'|'donate';cost:number;createdAt:string;resolvedAt:string|null};
export type RouletteState={user:{id:number;nickname:string};csrf:string;balance:number;freeSpins:number;prizes:Prize[];rarities:Rarity[];spinPrice:number;salePrice:number;testMode:boolean;history:Spin[];pending:Spin|null;moneyAvailable:boolean;moneyReason:string|null};
export class RouletteError extends Error {constructor(public code:string,message:string,public status:number){super(message);}}
export async function rouletteApi<T>(action='state',body?:Record<string,unknown>,csrf?:string):Promise<T>{
  let response:Response;
  try{response=await fetch(`/api/roulette?action=${action}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-Account-Csrf':csrf||''}:undefined,body:body?JSON.stringify(body):undefined});}
  catch{throw new RouletteError('network','З’єднання перервано. Оновіть дані перед наступною дією.',0);}
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)throw new RouletteError(result?.error||'unavailable',result?.message||'Рулетка тимчасово недоступна.',response.status);
  return result as T;
}
// Monotonic integrated velocity: acceleration, full speed, then a long smooth deceleration.
export function spinProgress(t:number){t=Math.max(0,Math.min(1,t));return (t<.1?5*t*t:t<.7?t-.05:.65+.06*(1-Math.pow(1-(t-.7)/.3,5)))/.71;}
function random(max:number){const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]%max;}
export function createTape(prizes:Prize[],winner:Prize,winnerIndex=96){
  const total=prizes.reduce((sum,p)=>sum+p.weight,0),tape:Prize[]=[];
  for(let index=0;index<116;index++){let draw=random(total);tape.push(prizes.find(prize=>(draw-=prize.weight)<0)||prizes[0]);}
  // Guarantee that all six prizes occur in the visible journey, while filler favours common/blue.
  const mixed=[...prizes];for(let i=mixed.length-1;i>0;i--){const j=random(i+1);[mixed[i],mixed[j]]=[mixed[j],mixed[i]];}
  mixed.forEach((prize,index)=>{tape[12+index*11+random(5)]=prize;});tape[winnerIndex]=winner;return tape;
}
