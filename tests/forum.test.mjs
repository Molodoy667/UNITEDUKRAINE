import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base32, boardAllowed, checkPassword, decrypt, digest, encrypt, equal, hashPassword, higher, mayModerate, needsTwoFactor, page, topicAllowed, totp, validTotp, validateAccess } from '../lib/forum/core.js';
import { checkOrigin, requireCsrf } from '../lib/forum/auth.js';
import { fileMatches, objectUrl } from '../lib/forum/integrations.js';
import mailHandler from '../api/forum-mail.js';

const player = { id:1,roles:['player'],permissions:[],rank:10,moderated:[],totp_secret:null };
const mod = { ...player,id:2,roles:['moderator'],rank:40,moderated:[5] };
const admin = { ...player,id:3,roles:['admin'],rank:80,permissions:['manage','moderate'],totp_secret:'encrypted' };
const board = { id:5,access:{},archived:false };
const topic = { id:1,author_id:1,approved:true,status:'open',private_topic:false,deleted_at:null };

test('password hashes use unique salts and reject invalid passwords',async()=>{
  const password='Коректний-пароль-12345';
  const first=await hashPassword(password),second=await hashPassword(password);
  assert.notEqual(first,second); assert.equal(await checkPassword(password,first),true);
  assert.equal(await checkPassword('інший-пароль',first),false);
  assert.equal(await checkPassword(password,null),false);
  await assert.rejects(hashPassword('short'),{code:'invalid_password'});
  assert.equal(equal('123','1234'),false); assert.equal(equal(null,'x'),false);
});
test('TOTP matches RFC 6238 six-digit vectors and prevents replay',()=>{
  const secret=base32(Buffer.from('12345678901234567890'));
  for(const [seconds,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037']]){
    const step=Math.floor(seconds/30); assert.equal(totp(secret,step),code);
    assert.equal(validTotp(secret,code,-1,seconds*1000),step);
    assert.equal(validTotp(secret,code,step,seconds*1000),null);
  }
  assert.equal(validTotp(secret,'123',-1,59000),null);
});
test('2FA encryption rejects tampering and missing server key',()=>{
  const previous=process.env.FORUM_ENCRYPTION_KEY;
  try{process.env.FORUM_ENCRYPTION_KEY='31'.repeat(32);const encoded=encrypt('sensitive-key');assert.equal(decrypt(encoded),'sensitive-key');const pieces=encoded.split('.');pieces[1]='00'+pieces[1].slice(2);assert.throws(()=>decrypt(pieces.join('.')));delete process.env.FORUM_ENCRYPTION_KEY;assert.throws(()=>encrypt('x'),{code:'encryption_unconfigured'});}
  finally{if(previous===undefined)delete process.env.FORUM_ENCRYPTION_KEY;else process.env.FORUM_ENCRYPTION_KEY=previous;}
});
test('board ACL, scoped moderation, topic privacy and hierarchy are enforced',()=>{
  const closed={...board,access:{view:['admin','moderator'],reply:['admin']}};
  assert.equal(boardAllowed(null,closed),false);assert.equal(boardAllowed(player,closed),false);assert.equal(boardAllowed(mod,closed),true);
  assert.equal(mayModerate(mod,board),true);assert.equal(mayModerate(mod,{...board,id:6}),false);
  assert.equal(topicAllowed(player,{...topic,private_topic:true},board),true);
  assert.equal(topicAllowed({...player,id:9},{...topic,private_topic:true},board),false);
  assert.equal(topicAllowed(null,{...topic,private_topic:true},board),false);
  assert.equal(topicAllowed(mod,{...topic,private_topic:true},board),true);
  assert.equal(topicAllowed(player,{...topic,deleted_at:new Date()},board),false);
  assert.equal(topicAllowed(player,{...topic,status:'closed'},board,'reply'),false);
  assert.equal(topicAllowed(mod,{...topic,status:'closed'},board,'reply'),true);
  assert.equal(topicAllowed(mod,topic,{...board,archived:true},'reply'),false);
  assert.equal(higher(admin,mod),true);assert.equal(higher(mod,admin),false);assert.equal(higher(admin,admin),false);
  assert.equal(boardAllowed({...player,roles:['player','restricted']},{...board,access:{deny:['restricted']}}),false);
});
test('any management role requires 2FA before moderation, including custom low-rank roles',()=>{
  const noTotp={...admin,totp_secret:null};
  assert.equal(needsTwoFactor(noTotp),true);assert.equal(mayModerate(noTotp,board),false);
  const custom={...player,rank:20,permissions:['manage','moderate']};
  assert.equal(needsTwoFactor(custom),true);assert.equal(mayModerate(custom,board),false);
  assert.equal(mayModerate({...custom,totp_secret:'encrypted'},board),true);
});
test('ACL validation rejects unknown roles and pagination caps at 100',()=>{
  assert.throws(()=>validateAccess({view:['nonexistent']},['player']),{code:'invalid_access'});
  assert.deepEqual(validateAccess({view:['player','player']},['player']),{view:['player']});
  assert.deepEqual(page(new URLSearchParams('page=2&size=50')),{page:2,size:50,offset:50});
  for(const query of ['size=101','size=0','page=0','page=1.2','page=100001'])assert.throws(()=>page(new URLSearchParams(query)),{code:'invalid_page'});
});
test('mutations require exact trusted origin, JSON and matching CSRF for active sessions',()=>{
  const origin=process.env.FORUM_ORIGIN;process.env.FORUM_ORIGIN='https://united.example';
  try{
    const request={headers:{origin:'https://united.example','content-type':'application/json'}};
    assert.doesNotThrow(()=>checkOrigin(request));assert.throws(()=>checkOrigin({headers:{...request.headers,origin:'https://attacker.example'}}),{code:'origin_rejected'});
    assert.throws(()=>checkOrigin({headers:{...request.headers,'content-type':'text/plain'}}),{code:'json_required'});
    assert.throws(()=>requireCsrf({session:{csrf:'expected'},request:{headers:{'x-forum-csrf':'wrong'}}}),{code:'csrf_rejected'});
    assert.doesNotThrow(()=>requireCsrf({session:{csrf:'expected'},request:{headers:{'x-forum-csrf':'expected'}}}));
  }finally{if(origin===undefined)delete process.env.FORUM_ORIGIN;else process.env.FORUM_ORIGIN=origin;}
});
test('attachment type checks reject HTML and signatures limit operation and expiration',()=>{
  assert.equal(fileMatches(Buffer.from('<svg onload=alert(1)>'),'image/png'),false);
  assert.equal(fileMatches(Buffer.from([137,80,78,71,13,10,26,10]),'image/png'),true);
  const keys=['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_FORUM_BUCKET'],old=keys.map(key=>process.env[key]);
  try{
    for(const [index,key] of keys.entries())process.env[key]=['testaccount','testaccess','testsecret','private-forum'][index];
    const date=new Date('2026-10-17T00:00:00Z'),put=new URL(objectUrl('forum/1/test key','PUT','image/png',date)),get=new URL(objectUrl('forum/1/test key','GET',undefined,date));
    assert.equal(put.searchParams.get('X-Amz-Expires'),'300');assert.equal(get.searchParams.get('X-Amz-Expires'),'60');
    assert.equal(put.searchParams.get('X-Amz-SignedHeaders'),'content-type;host');assert.notEqual(put.searchParams.get('X-Amz-Signature'),get.searchParams.get('X-Amz-Signature'));
    assert.equal(put.pathname,'/private-forum/forum/1/test%20key');assert.equal(put.href.includes('testsecret'),false);
    assert.equal(digest('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  }finally{keys.forEach((key,index)=>{if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];});}
});
test('mail worker HTTP endpoint rejects public and unconfigured requests before DB access',async()=>{
  const previous=process.env.FORUM_CRON_SECRET;
  const response=()=>({code:0,headers:{},body:null,setHeader(key,value){this.headers[key]=value;},status(value){this.code=value;return this;},json(value){this.body=value;return this;}});
  try{
    delete process.env.FORUM_CRON_SECRET;let res=response();await mailHandler({method:'GET',headers:{}},res);assert.equal(res.code,401);
    process.env.FORUM_CRON_SECRET='x'.repeat(64);res=response();await mailHandler({method:'GET',headers:{authorization:'Bearer incorrect'}},res);assert.equal(res.code,401);
    res=response();await mailHandler({method:'POST',headers:{}},res);assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET');
  }finally{if(previous===undefined)delete process.env.FORUM_CRON_SECRET;else process.env.FORUM_CRON_SECRET=previous;}
});
