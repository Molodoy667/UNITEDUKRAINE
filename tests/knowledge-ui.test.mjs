import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/admin/knowledge-retry.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {createKnowledgeRetry,UnresolvedKnowledgeWrite}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('uncertain creation reuses request UUID and blocks replacement payload even after panel remount',async()=>{
 const requests=[];let fail=true;
 const submit=async(action,body)=>{requests.push({action,body});if(fail)throw Error('Response lost after commit');return {id:261};};
 const first=createKnowledgeRetry('synthetic-session',submit,()=> 'same-uuid');
 const body={id:null,version:0,post:{title:'Initial'}};
 await assert.rejects(()=>first('kb-post-save',body));
 const remounted=createKnowledgeRetry('synthetic-session',submit,()=> 'must-not-be-used');
 await assert.rejects(()=>remounted('kb-post-save',{...body,post:{title:'Changed'}}),UnresolvedKnowledgeWrite);assert.equal(requests.length,1);
 fail=false;assert.deepEqual(await remounted('kb-post-save',body),{id:261});assert.equal(requests[1].body.requestId,'same-uuid');
 await remounted('kb-post-save',{...body,post:{title:'New'}});assert.equal(requests[2].body.requestId,'must-not-be-used');
});

test('definitive validation rejection allows corrected payload and separate actor scope',async()=>{
 const submit=async()=>{const error=Error('Rejected');error.status=400;throw error;};
 const retry=createKnowledgeRetry('validation-session',submit,()=> 'validation-uuid');
 await assert.rejects(()=>retry('kb-category-save',{title:'Invalid'}));
 await assert.rejects(()=>retry('kb-category-save',{title:'Corrected'}),error=>!(error instanceof UnresolvedKnowledgeWrite));
 const other=createKnowledgeRetry('different-actor',async()=>({id:58}),()=> 'other-uuid');assert.deepEqual(await other('kb-post-save',{}),{id:58});
});

test('editor remount key includes server version, preventing stale form/new version pairing',()=>{
 const ui=readFileSync(new URL('../src/admin/KnowledgeAdmin.tsx',import.meta.url),'utf8');
 assert.ok(ui.includes("key={`cat:${editor.item?.id || 'new'}:${editor.item?.version || 0}`}"));
 assert.ok(ui.includes("key={`post:${editor.item?.id || 'new'}:${editor.item?.version || 0}`}"));
});
