import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Resolve image literals and ES module aliases only. Never execute game bundles.
export async function carAssets(assetRoot,{rewardCandidates=false}={}) {
  const root=path.resolve(assetRoot), modules=new Map(), references=new Map();
  async function moduleAt(filename) {
    const absolute=path.resolve(filename);
    if(!absolute.startsWith(root+path.sep))throw Error('Asset module outside source directory');
    if(modules.has(absolute))return modules.get(absolute);
    const text=await readFile(absolute,'utf8');
    const ast=ts.createSourceFile(absolute,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const record={absolute,values:new Map(),imports:new Map(),exports:new Map()};
    modules.set(absolute,record);
    for(const statement of ast.statements){
      if(ts.isVariableStatement(statement))for(const decl of statement.declarationList.declarations)if(ts.isIdentifier(decl.name))record.values.set(decl.name.text,decl.initializer);
      if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings)&&ts.isStringLiteral(statement.moduleSpecifier)){
        for(const spec of statement.importClause.namedBindings.elements)record.imports.set(spec.name.text,{file:path.resolve(path.dirname(absolute),statement.moduleSpecifier.text),name:(spec.propertyName||spec.name).text});
      }
      if(ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause))for(const spec of statement.exportClause.elements)record.exports.set(spec.name.text,(spec.propertyName||spec.name).text);
    }
    return record;
  }
  async function resolve(record,name,seen=new Set()) {
    const key=`${record.absolute}:${name}`;if(seen.has(key))throw Error('Cyclic asset binding');seen.add(key);
    const imported=record.imports.get(name);
    if(imported){const next=await moduleAt(imported.file);const local=next.exports.get(imported.name);if(!local)throw Error(`Missing image export ${imported.name}`);return resolve(next,local,seen);}
    async function value(node){
      if(!node)throw Error(`Missing asset binding ${name}`);
      if(ts.isStringLiteral(node))return node.text.startsWith('data:image/png;base64,')?{bytes:Buffer.from(node.text.split(',')[1],'base64')}:node.text;
      if(ts.isIdentifier(node))return resolve(record,node.text,seen);
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken&&ts.isStringLiteral(node.left)&&node.left.text==='')return value(node.right);
      if(ts.isPropertyAccessExpression(node)&&node.name.text==='href')return value(node.expression);
      if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'&&ts.isStringLiteral(node.arguments?.[0])){
        const filename=path.resolve(path.dirname(record.absolute),node.arguments[0].text);
        if(!filename.startsWith(root+path.sep))throw Error('Image outside asset directory');
        return {bytes:await readFile(filename)};
      }
      throw Error(`Unsupported image initializer for ${name}`);
    }
    return value(record.values.get(name));
  }
  for(const file of (await readdir(root)).filter(f=>f.endsWith('.js')).sort()){
    const filename=path.join(root,file),text=await readFile(filename,'utf8');
    const matches=[...text.matchAll(/"(\/src\/assets\/images\/(?:[^"\r\n]+\/cars\/(\d+)\.png|phone\/carsharing\/cars_images\/(\d+)\/(\d+)(_front)?\.png|main-menu\/(?:battle-pass\/prizes|rewards\/items)\/(\d+)\.png))":([\w$]+)/g)];
    if(!matches.length)continue;
    const record=await moduleAt(filename);
    for(const match of matches){
      const id=Number(match[2]||match[3]||match[6]),sharing=Boolean(match[3]);
      // Explicitly reviewed reward images; other numeric prizes may be skins/items.
      if(match[6]&&!rewardCandidates&&![15174,15196,15197,15198,15294,15621,15661,15688,17426,17454,17456,17460].includes(id))continue;
      const filename=sharing?`${id}_carsharing_${match[4]}${match[5]||''}.png`:`${id}.png`;
      if(references.has(filename))continue;
      const image=await resolve(record,match[7]);
      if(!image?.bytes||!image.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error(`Invalid PNG for model ${id}`);
      references.set(filename,{id,file:filename,label:sharing?`Каршеринг · колір ${Number(match[4])+1}${match[5]?' · спереду':''}`:undefined,reference:match[1],bundle:file,bytes:image.bytes});
    }
  }
  return [...references.values()].sort((a,b)=>a.id-b.id);
}
