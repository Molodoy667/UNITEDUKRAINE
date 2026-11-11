export const categories = ['skins','cars','accessories'] as const;
export type Category = typeof categories[number];
export const vehicleTypes = ['all','car','truck','motorcycle','moped','bicycle','atv','helicopter','airplane','boat','yacht','bus','trailer','camper','construction','special'] as const;
export type VehicleType = typeof vehicleTypes[number];
export const vehicleTypeLabels:Record<VehicleType,string> = {all:'Усі типи',car:'Автомобілі',truck:'Вантажні авто',motorcycle:'Мотоцикли',moped:'Мопеди',bicycle:'Велосипеди',atv:'Квадроцикли',helicopter:'Гелікоптери',airplane:'Літаки',boat:'Катери та човни',yacht:'Яхти',bus:'Автобуси',trailer:'Причепи',camper:'Кемпери',construction:'Спецтехніка',special:'Спеціальний транспорт'};
export type Entry = {id:number;name?:string|null;nameNote?:string;image?:string;imageFlipX?:boolean;variant?:number|null;year?:number|null;vehicleType?:Exclude<VehicleType,'all'>;images?:{src:string;variant:number|null;label?:string}[]};
export type Catalog = Record<Category,Entry[]>;
export const labels = {skins:'Скіни',cars:'Автомобілі',accessories:'Аксесуари'};
export const singular = {skins:'Скін',cars:'Автомобіль',accessories:'Аксесуар'};
export function selection(search:string) {
  const params=new URLSearchParams(search);
  const tab=categories.includes(params.get('tab') as Category)?params.get('tab') as Category:'skins';
  const size=[10,50,100].includes(Number(params.get('size')))?Number(params.get('size')):10;
  const requested=Number(params.get('page'));
  const page=Number.isSafeInteger(requested)&&requested>0?requested:1;
  const requestedType=params.get('type') as VehicleType|null;
  const type=tab==='cars'&&requestedType&&vehicleTypes.includes(requestedType)?requestedType:'all';
  return {tab,size,page,q:(params.get('q')||'').slice(0,100),type};
}
export function sliceCatalog(entries:Entry[],q:string,page:number,size:number,type:VehicleType='all') {
  const term=q.trim().toLocaleLowerCase('uk-UA');
  const filtered=entries.filter(item=>(type==='all'||item.vehicleType===type)&&(!term||`${item.id} ${item.name||''}`.toLocaleLowerCase('uk-UA').includes(term)));
  const pages=Math.max(1,Math.ceil(filtered.length/size));
  const current=Math.min(Math.max(1,page),pages);
  return {items:filtered.slice((current-1)*size,current*size),total:filtered.length,pages,current};
}
