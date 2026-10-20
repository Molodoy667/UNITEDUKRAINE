import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>JSON.stringify(value);
const immutable=text=>({numbers:text.match(/\d+(?:[.,]\d+)?/g)||[],urls:text.match(/https?:\/\/[^\s<>"»]+/g)||[],commands:text.match(/(?<![\w/:])\/[a-zA-Z][\w-]*/g)||[],latin:(text.match(/[A-Za-z][A-Za-z0-9_+.-]*/g)||[]).map(t=>t.replace(/\.+$/,'')).sort()});
export function validateCorpus(categories,posts,originalCategories,originalPosts){
 if(categories.length!==55||posts.length!==256||new Set(categories.map(c=>c.id)).size!==55||new Set(posts.map(p=>p.id)).size!==256)throw Error('Expected all 55 categories and 256 unique translated posts');
 const originalC=new Map(originalCategories.map(c=>[c.id,c])),originalP=new Map(originalPosts.map(p=>[p.id,p])),ids=new Set(categories.map(c=>c.id));
 for(const c of categories){const source=originalC.get(c.id);if(!source||c.parent!==source.parent||c.position!==source.position||!c.title?.trim()||c.title.length>180||c.parent&&!ids.has(c.parent))throw Error(`Invalid translated category ${c.id}`);}
 for(const p of posts){const source=originalP.get(p.id);if(!source||p.category_id!==source.category_id||p.client!==source.client||p.position!==source.position||!ids.has(p.category_id)||!p.title?.trim()||!p.content?.trim()||p.title.length>240||p.content.length>30000)throw Error(`Invalid translated post ${p.id}`);
  for(const field of ['title','content']){
   const a=immutable(source[field]),b=immutable(p[field]);if(encode(a)!==encode(b))throw Error(`Changed numeric value, URL or command in translated post ${p.id} (${field})`);
   if(encode(source[field].match(/\r\n|\r|\n/g)||[])!==encode(p[field].match(/\r\n|\r|\n/g)||[]))throw Error(`Changed line breaks in translated post ${p.id} (${field})`);
  }
 }
 // Walk every ancestor chain to catch missing parents/cycles before any DB write.
 const byId=new Map(categories.map(c=>[c.id,c]));for(const c of categories){let current=c;const seen=new Set();while(current.parent){if(seen.has(current.id))throw Error('Category seed cycle');seen.add(current.id);current=byId.get(current.parent);if(!current)throw Error('Missing seed parent');}}
 return {categories:categories.length,posts:posts.length};
}
export async function loadKnowledgeSeed(){
 const base=new URL('../../data/knowledge/',import.meta.url),load=async path=>JSON.parse(await readFile(new URL(path,base),'utf8'));
 const [categories,parts,originalCategories,originalPosts]=await Promise.all([load('ua/categories.json'),Promise.all([1,2,3,4,5,6].map(i=>load(`ua/posts-${i}.json`))),load('source/categories.original.json'),load('source/posts.original.json')]);
 const posts=parts.flat().sort((a,b)=>a.id-b.id),counts=validateCorpus(categories,posts,originalCategories,originalPosts);
 return {categories,posts,counts,checksum:sha(encode({categories,posts}))};
}
// Called under the deploy migration advisory lock, after numbered schema migrations.
export async function seedKnowledge(db){
 const seed=await loadKnowledgeSeed(),key='hassle-ua-20261020-v1';
 await db.beginTransaction();
 try{
  await db.execute('SELECT id FROM site_knowledge_lock WHERE id=1 FOR UPDATE');
  const [[previous]]=await db.execute('SELECT checksum,categories,posts FROM site_kb_imports WHERE seed_key=?',[key]);
  if(previous){if(previous.checksum!==seed.checksum)throw Error('Applied knowledge seed changed; create a new explicit import instead');await db.commit();return {...seed.counts,replayed:true};}
  for(const [kind,table,items,fields]of [['category','site_kb_categories',seed.categories,['parent','title','position']],['post','site_kb_posts',seed.posts,['category_id','client','title','content','position']]]){
   for(const item of items){const [[existing]]=await db.execute(`SELECT source_id FROM ${table} WHERE id=?`,[item.id]);if(existing){if(existing.source_id!==item.id)throw Error(`Knowledge ${kind} ID collision: ${item.id}`);continue;}
    await db.execute(`INSERT INTO ${table}(id,${fields.join(',')},published,source_id,source_hash) VALUES(?,${fields.map(()=>'?').join(',')},1,?,?)`,[item.id,...fields.map(k=>item[k]),item.id,sha(encode(item))]);
   }
  }
  await db.execute('INSERT INTO site_kb_imports(seed_key,checksum,categories,posts) VALUES(?,?,?,?)',[key,seed.checksum,seed.counts.categories,seed.counts.posts]);
  await db.commit();return {...seed.counts,replayed:false};
 }catch(error){await db.rollback();throw error;}
}
