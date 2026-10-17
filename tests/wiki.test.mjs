import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import {carAssets} from '../scripts/wiki-car-assets.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const code=ts.transpileModule(readFileSync(new URL('../src/wiki/catalog.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {selection,sliceCatalog,categories}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const catalog=JSON.parse(readFileSync(new URL('../public/wiki/catalog.json',import.meta.url),'utf8'));
test('wiki has all three populated categories and every referenced preview exists',()=>{
  for(const category of categories){assert.ok(catalog[category].length>0);const keys=new Set();for(const item of catalog[category]){assert.ok(Number.isSafeInteger(item.id)&&item.id>=0);const key=`${item.id}:${item.variant||0}`;assert.equal(keys.has(key),false);keys.add(key);for(const image of [...(item.images||[]).map(v=>v.src),...(item.image?[item.image]:[])]){assert.match(image,/^\/wiki\/(skins|cars|accessories)\/\d+(?:[_-]\d+|_carsharing_\d+(?:_front)?)?\.png$/);assert.ok(existsSync(new URL(`../public${image}`,import.meta.url)),image);}}}
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
test('all imported bundle car references have explicit ID provenance and valid PNGs',()=>{
  const sources=JSON.parse(readFileSync(new URL('../public/wiki/car-sources.json',import.meta.url),'utf8'));
  assert.equal(sources.length,178);
  for(const source of sources){
    assert.ok(source.reference.endsWith(`/cars/${source.id}.png`)||source.reference.includes(`/cars_images/${source.id}/`)||new RegExp(`/main-menu/(battle-pass/prizes|rewards/items)/${source.id}\\.png$`).test(source.reference));
    const entry=catalog.cars.find(item=>item.id===source.id);
    assert.ok(entry.images.some(image=>image.src===`/wiki/cars/${source.file}`));
    const bytes=readFileSync(new URL(`../public/wiki/cars/${source.file}`,import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0);
  }
  assert.equal(catalog.cars.filter(item=>item.images.length).length,75);
  for(const id of [15661,15688,17426,17454,17456,17460])assert.ok(catalog.cars.find(item=>item.id===id)?.images.length);
  const mismatch=catalog.cars.find(item=>item.id===419);
  assert.equal(mismatch.name,null);assert.ok(mismatch.nameNote);
});
test('car importer resolves alias and embedded PNG literals without executing source code',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'wiki-car-test-'));
  try{
    const png=Buffer.from('89504e470d0a1a0a','hex');
    await writeFile(path.join(directory,'image.js'),`throw new Error('NEVER EXECUTE'); const p='data:image/png;base64,${png.toString('base64')}'; export {p as x};`);
    await writeFile(path.join(directory,'bundle.js'),`import{x as local}from './image.js';const ignored={"/src/assets/images/test/cars/419.png":local};`);
    const results=await carAssets(directory);assert.equal(results.length,1);assert.equal(results[0].id,419);assert.deepEqual(results[0].bytes,png);
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('production build contains the same catalog and preview assets',()=>{
  assert.deepEqual(JSON.parse(readFileSync(new URL('../dist/wiki/catalog.json',import.meta.url),'utf8')),catalog);
  for(const category of categories)for(const item of catalog[category])for(const image of [...(item.images||[]).map(v=>v.src),...(item.image?[item.image]:[])])assert.ok(existsSync(new URL(`../dist${image}`,import.meta.url)));
});
