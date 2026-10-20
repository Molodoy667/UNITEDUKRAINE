import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKnowledgeSeed} from '../lib/knowledge/seed.js';
// Offline validation only; never opens a DB connection or loads environment secrets.
const seed=await loadKnowledgeSeed(),root=new URL('../data/knowledge/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('source/source-manifest.json',root),'utf8'));
for(const file of ['categories.original.json','posts.original.json']){
 const bytes=await readFile(new URL(`source/${file}`,root));
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[file].sha256)throw Error(`Original checksum mismatch: ${file}`);
}
const reviews=(await Promise.all([1,2,3,4,5,6].map(async i=>JSON.parse(await readFile(new URL(`ua/review-${i}.json`,root),'utf8'))))).flat();
for(const post of seed.posts)if(!reviews.some(note=>note.id===post.id&&typeof note.issue==='string'&&note.issue.trim()))throw Error(`Missing source review note for post ${post.id}`);
console.log(JSON.stringify({valid:true,...seed.counts,reviewNotes:reviews.length,checksum:seed.checksum,seed:'hassle-ua-20261020-v1',publishOnImport:true},null,2));
