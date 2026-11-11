// Vehicle classes from CarShopInfo.js are inconsistent for utility vehicles,
// so explicit model IDs and names take precedence over the source class number.
export const imageNameHints = {
  419: {name:'Ford-хетчбек (модель не підтверджена)', nameNote:'Прев’ю показує Ford, але назва Opel Astra GTC у довіднику суперечить зображенню.'},
  470: {name:'Військовий позашляховик', nameNote:'Опис за зображенням; точну модель неможливо підтвердити за довідником.'},
  15661: {name:'Спортивне купе Bugatti', nameNote:'Марку визначено візуально; точну модель довідник не підтверджує.'},
  15688: {name:'Гоночний Porsche 911', nameNote:'Опис за зображенням; точну модифікацію довідник не підтверджує.'},
  17404: {name:'Спортивне купе Audi', nameNote:'Марку визначено візуально; точну модель довідник не підтверджує.'},
  17405: {name:'Позашляховик Mercedes-Benz G-Class', nameNote:'Модель визначено візуально; довідник ресурсу її не підтверджує.'},
  17426: {name:'Porsche 911 GT3', nameNote:'Модель визначено за зображенням; довідник ресурсу її не підтверджує.'},
  17433: {name:'BMW M4 GT3', nameNote:'Модель визначено за зображенням; довідник ресурсу її не підтверджує.'},
  17437: {name:'Dodge Viper', nameNote:'Модель визначено за зображенням; довідник ресурсу її не підтверджує.'},
  17438: {name:'Chevrolet Impala', nameNote:'Назва прочитана на зображенні; довідник ресурсу її не підтверджує.'},
  17444: {name:'Спортивний автомобіль Ford GT', nameNote:'Марку й тип визначено візуально; точну модель довідник не підтверджує.'},
  17445: {name:'Позашляховик Mercedes-Benz G-Class', nameNote:'Модель визначено візуально; довідник ресурсу її не підтверджує.'},
  17454: {name:'Toyota GR Yaris', nameNote:'Модель визначено за зображенням; довідник ресурсу її не підтверджує.'},
  17456: {name:'Електричний седан Xiaomi SU7', nameNote:'Модель визначено візуально; емблему та назву довідник ресурсу не підтверджує.'},
  17460: {name:'Audi RS6 Avant', nameNote:'Модель визначено за зображенням; довідник ресурсу її не підтверджує.'},
  17462: {name:'LADA 2109', nameNote:'Назву прочитано на зображенні; довідник ресурсу її не підтверджує.'},
  17463: {name:'Пікап BMW', nameNote:'Марку й тип визначено візуально; точну модель довідник не підтверджує.'},
};

// Render these vehicle previews mirrored so their fronts face the same way as
// the rest of the catalog without changing the source image files.
export const flippedVehicleIds = [15661,15688,17404,17405,17426,17433,17437,17438,17444,17445,17454,17460,17462,17463];

const overrides = new Map();
const set = (type, ids) => ids.forEach(id => overrides.set(id, type));
set('helicopter',[417,425,447,465,469,487,488,497,498,501,548,563,15285,15291]);
set('airplane',[460,464,476,511,512,513,519,520,553,577,592,593,609]);
set('boat',[430,453,472,473,484,493,539,583]);
set('yacht',[15243,15244,15646]);
set('bus',[413,414,431,437,483,595,15641]);
set('trailer',[435,450,591,606,607,611]);
set('camper',[15279,15649]);
set('car',[15292]); // This source class is wrong: the preview is a station wagon.
set('bicycle',[481,509,510]);
set('moped',[448,462]);
set('atv',[424]);
set('motorcycle',[461,463,468,471,521,522,523,581,582,586,15127,15129,15130,15132,15133,15134,15135,15136,15139,15610]);
set('truck',[403,406,443,449,515,517,524,525,578,15083,15095,15096,15097,15098,15099,15100,15101,15102,15103,15147,15218,15232,15260,15268,15277,15278,15612,15618,15629,15635,15647,556,557]);
set('truck',[15275,15284]); // Pickups with truck bodies.
set('construction',[455,486,530,531,532,572,610,15245]);
set('special',[407,408,416,423,427,428,432,433,441,444,457,470,485,528,538,564,568,569,570,571,574,575,588,590,594,596,598,599,601,608,611,15117,15143,15186,15239,15242,15604,15615,15616,15620]);

const name = value => String(value ?? '').toLocaleLowerCase('uk-UA');
export function classifyVehicle(id, classType, modelName='') {
  if (overrides.has(id)) return overrides.get(id);
  const n=name(modelName);
  if (/гелікоптер|heli|polmav|leviath/.test(n)) return 'helicopter';
  if (/літак|гідролітак|авіація|aircraft|plane|cropdast|stunt|\bat\s?400\b|androm|dodo|shamal/.test(n)) return 'airplane';
  if (/катер|човен|яхт|теплохід|судно|predator|reefer|coastg|tug|squalo|speeder|tropic|dinghy|jetmax/.test(n)) return 'boat';
  if (/автобус|ікарус|liaz|паз/.test(n)) return 'bus';
  if (/причіп|трейлер/.test(n)) return 'trailer';
  if (/пожежн|швидк|поліц|інкас|військов|танк|брдм|сміттєвоз|прибиральник|мійн|рем\.дорог|dsns|rccar|rcplane|rcheli|rctank|rccam|rcgobl/.test(n)) return 'special';
  if (/бульдозер|грейдер|навантажувач|трактор|комбайн|плуг|газонокосар/.test(n)) return 'construction';
  if (/тягач|вантаж|цистерн|цементовоз|евакуатор|автовоз|пікап|\bpickup\b|\btransit\b|\bsprinter\b|\bvito\b|\bactros\b|\bprostar\b|\btgs\b|\bxf 105\b|\bfm12\b|\b5410\b|\b54115\b|\b66 "шишиг/.test(n)) return 'truck';
  if (/кемпер|camper|будинок на колес/.test(n)) return 'camper';
  if (classType === 4) return /scooter/i.test(modelName) ? 'moped' : 'motorcycle';
  if (classType === 5) return 'helicopter';
  if (classType === 6) return 'boat';
  if (classType === 8) return 'truck';
  if (classType === 9) return 'camper';
  return 'car';
}
