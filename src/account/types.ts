export type Player = {
  id:number; nickname:string; email:string; skinId:number; level:number;
  experience:{current:number;required:number;remaining:number;percent:number};
  adminLevel:number;isSiteAdmin:boolean;role:string;
  employment:{id:number;name:string;organization:string;rank:string|null};
  phone:string|null;phoneBalance:number;
  balances:{cash:string;bank:string;donate:string;coins:string};
  registeredAt:string|null;lastActivityAt:string|null;lastExitAt:string|null;
  premium:{tier:number;expiresAt:string|null;active:boolean};
  drivingLicense:boolean;weaponLicense:boolean;warnings:number;twoFactor:boolean;
  playtime:{todaySeconds:number;yesterdaySeconds:number};health:number;lawAbiding:number;
  slots:{cars:number;houses:number;businesses:number};
};
export type Vehicle = {id:number;model_id:number;number:string;region:string;mileage:number;fuel:number;health:number;create_time:number};
export type Property = {id:number;name?:string;city?:number;cityName?:string|null;zone?:number;price:number;type:number;rent_time?:number;balance?:string;products?:number;app_id?:number;floor?:number;apt_num?:number;apartmentNumber?:number;paid_days?:number};
export type Dashboard = {account:Player;csrf:string;assets:{cars:Vehicle[];houses:Property[];businesses:Property[];apartments:Property[]};presence:{online:boolean|null;checkedAt:string;source:string};updatedAt:string};
export class ApiError extends Error {constructor(public code:string,message:string){super(message);}}
export async function accountApi<T>(action='session',body?:Record<string,unknown>,csrf?:string):Promise<T> {
  let response:Response;
  try {response=await fetch(`/api/account?action=${action}`,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json',...(csrf?{'X-Account-Csrf':csrf}:{})}:undefined,body:body?JSON.stringify(body):undefined});}
  catch {throw new ApiError('network_error','Не вдалося з’єднатися із сервером. Перевірте інтернет і повторіть спробу.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result)throw new ApiError(result?.error||'unavailable',result?.message||'Кабінет тимчасово недоступний. Спробуйте пізніше.');
  return result as T;
}
