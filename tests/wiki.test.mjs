import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/wiki/catalog.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {selection,sliceCatalog,categories}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const catalog=JSON.parse(readFileSync(new URL('../public/wiki/catalog.json',import.meta.url),'utf8'));
test('wiki has all three populated categories and every referenced preview exists',()=>{
  for(const category of categories){assert.ok(catalog[category].length>0);const keys=new Set();for(const item of catalog[category]){assert.ok(Number.isSafeInteger(item.id)&&item.id>=0);const key=`${item.id}:${item.variant||0}`;assert.equal(keys.has(key),false);keys.add(key);for(const image of [...(item.images||[]).map(v=>v.src),...(item.image?[item.image]:[])]){assert.match(image,/^\/wiki\/(skins|cars|accessories)\/\d+(?:[_-]\d+)?\.png$/);assert.ok(existsSync(new URL(`../public${image}`,import.meta.url)),image);}}}
});
test('10, 50 and 100 items per page work without duplicate or missing records',()=>{
  for(const size of [10,50,100])for(const category of categories){const entries=catalog[category],all=[];const first=sliceCatalog(entries,'',1,size);for(let page=1;page<=first.pages;page++){const result=sliceCatalog(entries,'',page,size);assert.ok(result.items.length<=size);all.push(...result.items);}assert.deepEqual(all,entries);}
});
test('URL defaults and invalid page sizes are safe',()=>{
  assert.deepEqual(selection('?tab=bad&size=999&page=-4'),{tab:'skins',size:10,page:1,q:''});
  assert.deepEqual(selection('?tab=cars&size=100&page=3&q=BMW'),{tab:'cars',size:100,page:3,q:'BMW'});
  assert.equal(sliceCatalog(catalog.skins,'',999999,10).current,74);
});
test('ID and case-insensitive model search work; empty results have one safe page',()=>{
  assert.ok(sliceCatalog(catalog.skins,'78',1,10).items.some(item=>item.id===78));
  const result=sliceCatalog(catalog.cars,'bMw',1,100);assert.ok(result.total>0);assert.ok(result.items.every(item=>item.name.toLowerCase().includes('bmw')));
  assert.deepEqual(sliceCatalog(catalog.cars,'NOT-A-REAL-MODEL-XYZ',8,10),{items:[],total:0,pages:1,current:1});
});
test('unknown skin/accessory names are not fabricated and missing car previews remain explicit',()=>{
  assert.ok(catalog.skins.every(item=>item.name===null));assert.ok(catalog.accessories.every(item=>item.name===null));
  assert.ok(catalog.cars.some(item=>item.name&&item.images.length===0));
});
test('production build contains the same catalog and preview assets',()=>{
  assert.deepEqual(JSON.parse(readFileSync(new URL('../dist/wiki/catalog.json',import.meta.url),'utf8')),catalog);
  for(const category of categories)for(const item of catalog[category])for(const image of [...(item.images||[]).map(v=>v.src),...(item.image?[item.image]:[])])assert.ok(existsSync(new URL(`../dist${image}`,import.meta.url)));
});
