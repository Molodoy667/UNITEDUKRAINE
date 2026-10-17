import { readdir, readFile, mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {carAssets} from './wiki-car-assets.mjs';

// Explicit local import; never run against an unreviewed download or execute game JS.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-wiki.mjs <uiresources directory>');
const output = new URL('../public/wiki/', import.meta.url);
const ast = ts.createSourceFile('CarShopInfo.js', await readFile(path.join(source, 'assets/CarShopInfo.js'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const arrays = new Map();
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(ast).replace(/^['"]|['"]$/g, ''), literal(p.initializer)]));
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && ts.isNumericLiteral(node.operand)) return !Number(node.operand.text);
  throw new Error(`Unsupported data expression: ${node.getText(ast).slice(0,80)}`);
}
for (const statement of ast.statements) if (ts.isVariableStatement(statement)) for (const decl of statement.declarationList.declarations) if (decl.initializer && ts.isArrayLiteralExpression(decl.initializer)) arrays.set(decl.name.getText(ast), literal(decl.initializer));
const brands = [...arrays.values()].find(a => Array.isArray(a[0]) && a[0][0] === 'None');
const models = [...arrays.values()].find(a => a[0]?.modelid);
if (!brands || !models) throw new Error('Car reference structure changed; review the source before importing.');
const manifest = { version: 1, source: 'RADMIR CRMP / uiresources', skins: [], cars: [], accessories: [] };
for (const kind of ['skins','cars','accessories']) {
  await mkdir(new URL(`${kind}/`, output), { recursive: true });
  const directory = path.join(source, 'images', kind);
  for (const file of (await readdir(directory)).filter(name => /^\d+(?:[_-]\d+)?\.png$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))) {
    const [id, variant] = file.slice(0,-4).split(/[_-]/).map(Number);
    let input = kind==='cars'?path.join(directory,file):path.join(directory, 'small', file);
    try { await access(input); } catch { input = path.join(directory,file); }
    await copyFile(input, new URL(`${kind}/${file}`, output));
    const image = `/wiki/${kind}/${file}`;
    if (kind === 'cars') {
      let entry = manifest.cars.find(item=>item.id===id);
      if (!entry) { entry={id,images:[]}; manifest.cars.push(entry); }
      entry.images.push({src:image,variant:variant||null});
    } else manifest[kind].push({id,name:null,image,variant:variant||null});
  }
}
const embeddedCars=await carAssets(path.join(source,'assets'));
for(const asset of embeddedCars){
  const filename=asset.file;
  await writeFile(new URL(`cars/${filename}`,output),asset.bytes);
  let entry=manifest.cars.find(item=>item.id===asset.id);
  if(!entry){entry={id:asset.id,images:[]};manifest.cars.push(entry);}
  if(!entry.images.some(image=>image.src===`/wiki/cars/${filename}`))entry.images.push({src:`/wiki/cars/${filename}`,variant:null,...(asset.label?{label:asset.label}:{})});
}
await writeFile(new URL('car-sources.json',output),JSON.stringify(embeddedCars.map(({id,file,reference,bundle})=>({id,file,reference,bundle})),null,2)+'\n');
for (const model of models) {
  let entry = manifest.cars.find(item=>item.id===model.modelid);
  if (!entry) { entry={id:model.modelid,images:[]}; manifest.cars.push(entry); }
  const brand = brands[model.brand]?.[0];
  entry.name = [brand && brand!=='None'?brand:'', String(model.name||'')].filter(Boolean).join(' ') || null;
  entry.year = model.year_issue || null;
  // Visual audit: resource cars/419.png is Ford-branded, not the Opel in this reference.
  // Preserve the resource ID, but do not publish the contradictory label as fact.
  if(model.modelid===419){entry.name=null;entry.year=null;entry.nameNote='Назва у довіднику не відповідає прев’ю';}
}
for (const kind of ['skins','cars','accessories']) manifest[kind].sort((a,b)=>a.id-b.id);
await writeFile(new URL('catalog.json',output), JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(['skins','cars','accessories'].map(k=>[k,{count:manifest[k].length,withPreview:manifest[k].filter(x=>x.image||x.images?.length).length}]))));
