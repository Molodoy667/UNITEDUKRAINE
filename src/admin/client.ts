export type Entity='players'|'houses'|'businesses'|'vehicles'|'apartments';
export type Section=Entity|'online';
export type Row=Record<string,string|number|null>;
export type Overview={operator:{id:number;nickname:string};stats:Record<Entity,{available:boolean;total:number|null;free?:number|null;admins?:number}>;online:{available:boolean;count:number|null;checkedAt:string};updatedAt:string;capabilities:{read:boolean;edit:boolean;propose:boolean;ai:boolean};source:string};
export type Listing={entity:Section;items:Row[];total:number;page?:number;size?:number;pages?:number;onlineCount?:number;unmatched?:string[];updatedAt:string};
export type FieldRule={label:string;kind:'text'|'integer';min?:number;max?:number;maxLength?:number};
export type Detail={entity:Entity;item:Row;version:string;proposalFields:Record<string,FieldRule>;updatedAt:string;editable:boolean};
export type Difference=Record<string,{before:string|number|null;after:string|number}>;
export type ChangePreview={entity:Entity;id:number;changes:Difference;reason:string;expiresAt:string;token:string;applied:false};
export type ChangeStatus='awaiting_bridge'|'queued'|'applied'|'rejected'|'cancelled';
export type ChangeResult={id:string;status:ChangeStatus;applied:boolean;replayed:boolean};
export type ChangeRecord={id:string;actor_id:number;actor_name:string|null;entity:Entity;record_id:number;changes:Difference;reason:string;status:ChangeStatus;result_code:string|null;created_at:string;events:{id:string;actor_id:number;actor_name:string|null;event:string;reason:string;created_at:string}[]};
export type ChangeHistory={items:ChangeRecord[];total:number;page:number;pages:number};
export type BridgeState={configured:boolean;available:boolean;reason:string;bridgeId?:string;checkedAt?:string;capabilities:Partial<Record<Entity,number|boolean>>};
export class AdminError extends Error{constructor(public status:number,message:string){super(message);}}
export async function adminRead<T>(action:string,params:Record<string,string|number>={},signal?:AbortSignal):Promise<T>{
  const query=new URLSearchParams({action,...Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)]))});
  const timeout=AbortSignal.timeout(12000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetch(`/api/admin?${query}`,{signal:combined,credentials:'same-origin',cache:'no-store'}),data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw new AdminError(response.status,data?.message||'Не вдалося отримати дані панелі.');
  return data as T;
}
export async function adminWrite<T>(action:'preview'|'confirm'|'cancel'|'dispatch',body:Record<string,unknown>,csrf:string):Promise<T>{
  const response=await fetch(`/api/admin?action=${action}`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-Account-Csrf':csrf},body:JSON.stringify(body)}),data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw new AdminError(response.status,data?.message||'Не вдалося завершити запит. Перевірте журнал або повторіть підтвердження.');
  return data as T;
}
export const format=(value:unknown)=>value===null||value===undefined?'—':typeof value==='string'&&/^-?\d+$/.test(value)?new Intl.NumberFormat('uk-UA').format(BigInt(value)):String(value);
export const money=(value:unknown)=>`${format(value)} ₴`;
export const sections={
  players:{title:'Гравці',description:'Акаунти, рівні, баланс і доступ',sorts:{id:'Нові акаунти',name:'За нікнеймом',wealth:'Найбільший капітал',level:'За рівнем'},filters:{all:'Усі гравці',admins:'Адміністратори',premium:'Активний преміум'}},
  online:{title:'Гравці онлайн',description:'Підтверджений список із сервера',sorts:{id:'Онлайн'},filters:{all:'Онлайн'}},
  houses:{title:'Будинки',description:'Власники, ціни та вільні будинки',sorts:{id:'За ID',name:'За назвою',price:'Найдорожчі'},filters:{all:'Усі будинки',free:'Без власника',owned:'З власником'}},
  businesses:{title:'Бізнеси',description:'Власники, баланс, товари та ціни',sorts:{id:'За ID',name:'За назвою',price:'Найдорожчі',balance:'За балансом'},filters:{all:'Усі бізнеси',free:'Без власника',owned:'З власником'}},
  vehicles:{title:'Автомобілі',description:'Моделі, номери та власники',sorts:{id:'За ID',model:'За моделлю',mileage:'За пробігом'},filters:{all:'Усі автомобілі',free:'Без власника',owned:'Особисті',family:'Сімейні'}},
  apartments:{title:'Квартири',description:'Будівлі, поверхи та власники',sorts:{id:'За ID',price:'Найдорожчі',floor:'За поверхом'},filters:{all:'Усі квартири',free:'Без власника',owned:'З власником'}},
};
export const fieldLabels:Record<string,string>={id:'ID',name:'Назва / нікнейм',skin:'ID скіна',level:'Рівень',exp:'Досвід',admin:'Рівень адміністратора',money:'Готівка',bank:'Банківський рахунок',wealth:'Готівка + банк',donate_current:'Донат',coins:'Монети',phone:'Телефон',phone_balance:'Баланс SIM',team:'ID фракції',job:'ID роботи / рангу',premium:'Тип преміуму',premium_time:'Преміум до',last_login:'Остання активність',last_exit:'Останній вихід',reg_time:'Реєстрація',warn:'Попередження',owner_id:'ID власника',owner_name:'Нікнейм власника',city:'ID міста',zone:'ID зони',price:'Вартість',rent_price:'Орендна плата',rent_time:'Оплачено до',type:'Тип',improvements:'Покращення',balance:'Каса бізнесу',products:'Товари',prod_price:'Ціна товару',enter_price:'Вартість входу',model_id:'ID моделі',number:'Номер',region:'Регіон',mileage:'Пробіг',fuel:'Пальне',health:'Стан / здоров’я',color_1:'Колір 1',color_2:'Колір 2',create_time:'Створено',famcar:'ID сім’ї',status:'Статус транспорту',app_id:'ID будівлі',floor:'Поверх',apt_num:'Позиція квартири (з 0)',paid_days:'Оплачені дні',locked:'Замкнено',lock:'Замкнено',upgrade_level:'Рівень покращень',x:'Координата X',y:'Координата Y',z:'Координата Z',pos_x:'Координата X',pos_y:'Координата Y',pos_z:'Координата Z'};
export function fieldValue(key:string,value:unknown){
  if(['premium_time','last_login','last_exit','reg_time','rent_time','create_time'].includes(key)){const date=new Date(Number(value)*1000);return Number(value)>0&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('uk-UA',{dateStyle:'medium',timeStyle:'short'}).format(date):'Не встановлено';}
  if(['money','bank','wealth','price','rent_price','balance','prod_price','enter_price','phone_balance'].includes(key))return money(value);
  return format(value);
}
