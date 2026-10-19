import { randomInt } from 'node:crypto';
export const SPIN_PRICE = 100;
export const SALE_PRICE = 100;
export const rarities = [
  { id:'common',name:'Звичайна',color:'#bdc8d8' },
  { id:'rare',name:'Рідкісна',color:'#689fff' },
  { id:'epic',name:'Епічна',color:'#ad7bff' },
  { id:'mythic',name:'Міфічна',color:'#ed82cc' },
  { id:'legendary',name:'Легендарна',color:'#ff746c' },
  { id:'exclusive',name:'Ексклюзивна',color:'#f2cc77' },
];
export const prizes = [
  {id:'skin-21',title:'Скін #21',type:'Скін',rarity:'common',image:'/wiki/skins/21.png',weight:6000},
  {id:'kia-rio',title:'KIA Rio',type:'Автомобіль',rarity:'rare',image:'/wiki/cars/436.png',weight:2400},
  {id:'skin-223',title:'Скін #223',type:'Скін',rarity:'epic',image:'/wiki/skins/223.png',weight:1000},
  {id:'bmw-g30',title:'BMW G30',type:'Автомобіль',rarity:'mythic',image:'/wiki/cars/466_1.png',weight:400},
  // Variant 1 in the source bundle is a BMW image; variant 2 visually matches the Maybach.
  {id:'maybach-x222',title:'Maybach X222',type:'Автомобіль',rarity:'legendary',image:'/wiki/cars/429_2.png',weight:160},
  {id:'aurora-gt',title:'Aurora GT',type:'Концепт-кар',rarity:'exclusive',image:'/roulette/aurora-gt.png',weight:40},
].map(prize=>({...prize,sellPrice:SALE_PRICE,test:true}));
export function selectPrize(draw = randomInt) {
  let choice=draw(prizes.reduce((sum,p)=>sum+p.weight,0));
  for(const prize of prizes){choice-=prize.weight;if(choice<0)return {...prize};}
  throw new Error('Invalid prize distribution');
}
