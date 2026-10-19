import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {renderSiteHtml} from '../lib/site/render.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('boot handoff happens only after commit and is safe for StrictMode replay or a missing shell',()=>{
 const source=readFileSync(new URL('../src/ui/PagePreloader.tsx',import.meta.url),'utf8');
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 const effects=[],module={exports:{}};let present=true,removed=0;
 const document={getElementById(id){assert.equal(id,'site-boot-preloader');return present?{remove(){present=false;removed++;}}:null;}};
 const context=vm.createContext({document,module,exports:module.exports,require:id=>id==='react'?{useEffect:effect=>effects.push(effect)}:require(id)});
 vm.runInContext(outputText,context);assert.equal(module.exports.BootPreloaderReady(),null);assert.equal(removed,0);assert.equal(effects.length,1);
 effects[0]();assert.equal(removed,1);effects[0]();assert.equal(removed,1);
});
test('actual HTML template retains public readable content and the pre-JavaScript preloader together',()=>{
 const template=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const site={seo:{siteName:'United',title:'Real title',description:'Description',keywords:'',siteUrl:'https://example.test',image:'/assets/logo.png'},home:{headline:'Hello',highlight:'United',description:'Public content'},launcher:{},news:[],pages:[]};
 const html=renderSiteHtml(template,site),document=renderSiteHtml(template,site,{title:'Actual article',body:'Actual article body',url:'/news/test',kind:'news'});
 for(const result of [html,document]){assert.equal((result.match(/id="site-boot-preloader"/g)||[]).length,1);assert.match(result,/<div id="root"><main id="main-content">/);assert.match(result,/id="site-bootstrap"/);assert.match(result,/href="\/preloader.css"/);assert.match(result,/<noscript><style>#site-boot-preloader\{display:none\}/);}
 assert.match(html,/Public content/);assert.match(document,/Actual article body/);
});
test('forum read loading has a bounded timeout while preserving caller cancellation and real response',async()=>{
 const source=readFileSync(new URL('../src/forum/client.ts',import.meta.url),'utf8'),{outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const module={exports:{}},caller={caller:true},timeout={timeout:true},combined={combined:true};let calls=0;
 vm.runInNewContext(outputText,{module,exports:module.exports,URLSearchParams,AbortSignal:{timeout(ms){assert.equal(ms,12000);return timeout;},any(signals){assert.equal(signals[0],caller);assert.equal(signals[1],timeout);return combined;}},fetch:async(url,options)=>{calls++;assert.equal(options.signal,calls===1?combined:timeout);return {ok:true,json:async()=>({loaded:true})};}});
 assert.equal((await module.exports.read('bootstrap',{},caller)).loaded,true);assert.equal((await module.exports.read('bootstrap')).loaded,true);assert.equal(calls,2);
});
