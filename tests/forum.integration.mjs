import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import mysql from 'mysql2/promise';
import { test } from 'node:test';
import handler from '../api/forum.js';
import { digest, totp } from '../lib/forum/core.js';
import { getMysqlPool } from '../lib/mysql.js';
import { deliverForumMail } from '../lib/forum/mail-worker.js';

// Uses a fresh disposable database on an explicitly configured loopback test server only.
// Never reads DB_HOST / DB_NAME from production or a developer's normal environment.
const port = Number(process.env.FORUM_TEST_DB_PORT);
if (!Number.isInteger(port) || port < 1024 || port === 3306 || !process.env.FORUM_TEST_DB_PASSWORD) throw new Error('Set FORUM_TEST_DB_PORT (non-3306) and FORUM_TEST_DB_PASSWORD for an isolated local test database.');
const name = `forum_test_${randomBytes(8).toString('hex')}`;
Object.assign(process.env, {
  NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:name,DB_USER:'root',DB_PASSWORD:process.env.FORUM_TEST_DB_PASSWORD,
  FORUM_IP_SECRET:randomBytes(32).toString('hex'),FORUM_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
  RESEND_API_KEY:'local-test-provider',FORUM_MAIL_FROM:'forum@example.test',
  R2_ACCOUNT_ID:'forumtest',R2_ACCESS_KEY_ID:'test-access',R2_SECRET_ACCESS_KEY:'test-secret',R2_FORUM_BUCKET:'test-private',
});
const root = await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:process.env.FORUM_TEST_DB_PASSWORD});
await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const realFetch=globalThis.fetch, mails=[], objects=new Map();
globalThis.fetch=async(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.href==='https://api.resend.com/emails') { mails.push(JSON.parse(options.body)); return Response.json({id:'test-message'}); }
  if(url.hostname==='forumtest.r2.cloudflarestorage.com'){
    const method=options.method||'GET',key=decodeURIComponent(url.pathname);
    if(method==='PUT'){objects.set(key,{body:Buffer.from(options.body),type:options.headers['Content-Type']});return new Response(null,{status:200});}
    const object=objects.get(key);if(!object)return new Response(null,{status:404});
    return new Response(method==='HEAD'?null:object.body,{status:200,headers:{'Content-Type':object.type,'Content-Length':String(object.body.length)}});
  }
  return realFetch(input,options);
};
const preview = process.env.FORUM_TEST_PREVIEW === '1';
const server=createServer(async(request,response)=>{
  response.status=value=>{response.statusCode=value;return response;};
  response.json=value=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
  try{const chunks=[];for await(const chunk of request)chunks.push(chunk);request.body=chunks.length?Buffer.concat(chunks).toString():undefined;await handler(request,response);}catch(error){response.status(500).json({message:error.message});}
});
server.listen(preview ? 4174 : 0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;process.env.FORUM_ORIGIN=origin;
const db=getMysqlPool();
const client=()=>({cookie:'',csrf:'',user:null});
async function call(actor,action,body,expected=200,extra={}){
  const response=await realFetch(`${origin}/api/forum?action=${encodeURIComponent(action)}${extra.query?'&'+new URLSearchParams(extra.query):''}`,{
    method:body===undefined?'GET':'POST',headers:{...(actor.cookie?{Cookie:actor.cookie}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Forum-Csrf':actor.csrf}),...extra.headers},body:body===undefined?undefined:JSON.stringify(body),
  });
  const result=await response.json();assert.equal(response.status,expected,`${action}: ${JSON.stringify(result)}`);
  if(response.headers.get('set-cookie'))actor.cookie=response.headers.get('set-cookie').split(';')[0];
  if(result.csrf)actor.csrf=result.csrf;
  if(result.user && ['auth.login','auth.register','bootstrap','profile.save'].includes(action))actor.user=result.user;
  return result;
}
function cli(command,env={}){
  const result=spawnSync(process.execPath,['scripts/forum-manage.mjs',command],{cwd:new URL('../',import.meta.url),env:{...process.env,...env},encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,`${command}: ${result.stdout} ${result.stderr}`);return result.stdout;
}
function confirmation(mail){const match=mail.text.match(/http:\/\/[^\s]+/);assert.ok(match);const url=new URL(match[0]);return{token:url.searchParams.get('token'),purpose:url.searchParams.get('purpose')};}
async function register(username){const actor=client();await call(actor,'auth.register',{username,email:`${username}@example.test`,password:'Local-Test-Password-123'});await db.execute('UPDATE forum_users SET email_verified=1 WHERE id=?',[actor.user.id]);await call(actor,'bootstrap');return actor;}
const guest=client(),owner=client();let alice,bob,moderator,ownerTotpSecret;
try{
  await test('forum persists and enforces permissions against a real local MariaDB',async t=>{
    await t.test('migration is repeatable and owner bootstrap is explicit',async()=>{
      cli('migrate');cli('migrate');
      cli('owner',{FORUM_OWNER_USERNAME:'ForumOwner',FORUM_OWNER_EMAIL:'owner@example.test',FORUM_OWNER_PASSWORD:'Local-Owner-Password-123'});
      const initial=await call(guest,'bootstrap');assert.equal(initial.boards.length,15);assert.equal(initial.stats.topics,0);
      await call(owner,'auth.login',{login:'ForumOwner',password:'Local-Owner-Password-123'});
      const previousSession=client();
      await call(previousSession,'auth.login',{login:'ForumOwner',password:'Local-Owner-Password-123'});
      await call(owner,'admin',undefined,403);
      const setup=await call(owner,'auth.totp.prepare',{password:'Local-Owner-Password-123'});
      ownerTotpSecret=setup.secret;
      await call(owner,'auth.totp.enable',{code:totp(setup.secret)});
      assert.equal((await call(previousSession,'bootstrap')).user,null);
      await call(owner,'admin');assert.equal((await call(owner,'bootstrap')).user.twoFactor,true);
    });
    await t.test('registration works without email confirmation while CSRF and origin checks remain enforced',async()=>{
      const previousMailCount=mails.length;
      alice=client();await call(alice,'auth.register',{username:'Alice_Player',email:'alice@example.test',password:'Local-Test-Password-123'});
      assert.equal(mails.length,previousMailCount,'registration must not send a verification email');
      await call(alice,'bootstrap');assert.equal(alice.user.verified,false);
      await call(alice,'topic.create',{boardId:5,title:'No email confirmation needed',body:'Registration grants normal forum access'});
      await call(alice,'topic.create',{boardId:5,title:'Invalid CSRF topic',body:'No write'},403,{headers:{'X-Forum-Csrf':'wrong'}});
      await call(alice,'topic.create',{boardId:5,title:'Invalid origin topic',body:'No write'},403,{headers:{Origin:'https://attacker.test'}});
      bob=await register('Bob_Player');moderator=await register('Section_Mod');
      await call(guest,'auth.login',{login:'Alice_Player',password:'wrong'},401);
    });
    let publicId,privateId,postId;
    await t.test('topics, replies, drafts, reactions, polls and pagination persist',async()=>{
      await call(alice,'draft.save',{key:'board:5',title:'Draft title',body:'Stored draft'});
      assert.equal((await call(alice,'draft',undefined,200,{query:{key:'board:5'}})).draft.body,'Stored draft');
      const created=await call(alice,'topic.create',{boardId:5,title:'Public Ukrainian discussion',body:'First persisted post',poll:{question:'Ваш вибір?',options:['Так','Ні']}});publicId=created.topicId;postId=created.postId;
      assert.equal((await call(alice,'draft',undefined,200,{query:{key:'board:5'}})).draft,null);
      await call(bob,'post.create',{topicId:publicId,body:'Reply with @Alice_Player'});
      const detail=await call(guest,'topic',undefined,200,{query:{id:publicId}});assert.equal(detail.posts.length,2);assert.equal(detail.posts[0].body,'First persisted post');
      await call(bob,'reaction.toggle',{postId,reaction:'heart'});
      await call(bob,'poll.vote',{pollId:detail.poll.id,choice:0});
      const updated=await call(guest,'topic',undefined,200,{query:{id:publicId}});assert.equal(updated.posts[0].reactions[0].count,1);assert.equal(updated.poll.votes[0].count,1);
      await call(bob,'poll.vote',{pollId:detail.poll.id,choice:50},400);
      await call(alice,'post.edit',{postId,body:'Edited persisted post',reason:'Correction'});
      assert.equal((await call(alice,'revisions',undefined,200,{query:{postId}})).revisions[0].body,'First persisted post');
      await call(bob,'post.edit',{postId,body:'Unauthorized edit'},403);
      const list=await call(guest,'topics',undefined,200,{query:{size:10,q:'persisted'}});assert.equal(list.total,1);
      await call(guest,'topics',undefined,400,{query:{size:101}});
      await call(bob,'topic.follow',{topicId:publicId,bookmarked:true,subscribed:true});
      assert.equal((await call(bob,'topics',undefined,200,{query:{scope:'bookmarks'}})).total,1);
      await call(bob,'topic.read',{topicId:publicId,postId});
    });
    await t.test('private appeals, parent ACLs and moderator scoping reject direct and search access',async()=>{
      const created=await call(alice,'topic.create',{boardId:11,title:'Private appeal unique secret',body:'Confidential evidence',formData:{nickname:'Alice',server:'1',date:'2026-10-17',participants:'Bob',evidence:'https://example.test/evidence'}});privateId=created.topicId;
      await call(bob,'topic',undefined,404,{query:{id:privateId}});await call(guest,'topic',undefined,404,{query:{id:privateId}});
      assert.equal((await call(bob,'topics',undefined,200,{query:{q:'unique secret'}})).total,0);
      assert.equal((await call(alice,'topic',undefined,200,{query:{id:privateId}})).topic.private_topic,1);
      await call(owner,'admin.moderator',{boardId:5,userId:moderator.user.id,enabled:true});
      await call(moderator,'topic.moderate',{topicId:publicId,operation:'status',status:'closed',reason:'Close discussion'});
      await call(moderator,'topic',undefined,404,{query:{id:privateId}});
      await call(alice,'post.create',{topicId:publicId,body:'Should be closed'},403);
      await call(owner,'topic.moderate',{topicId:publicId,operation:'status',status:'open',reason:'Reopen discussion'});
      const hiddenParent=await call(owner,'admin.board',{title:'Hidden parent',isCategory:true,access:{view:['owner']}});
      const child=await call(owner,'admin.board',{title:'Hidden child',parentId:hiddenParent.boardId,access:{}});
      assert.equal((await call(bob,'boards')).boards.some(board=>board.id===child.boardId),false);
      await call(bob,'topics',undefined,404,{query:{board:child.boardId}});
      await call(owner,'admin.board',{id:hiddenParent.boardId,title:'Hidden parent',parentId:child.boardId,isCategory:true,access:{view:['owner']}},400);
    });
    await t.test('notifications and unread lists recheck access after topic moves and hidden posts',async()=>{
      const notices=await call(alice,'notifications');assert.ok(notices.notifications.some(item=>item.topic_id===publicId));
      await call(owner,'topic.moderate',{topicId:publicId,operation:'move',boardId:15,reason:'Move to private team section'});
      await call(alice,'topic',undefined,404,{query:{id:publicId}});
      assert.equal((await call(alice,'notifications')).notifications.some(item=>item.topic_id===publicId),false);
      assert.equal((await call(alice,'topics',undefined,200,{query:{scope:'bookmarks'}})).total,0);
      await call(owner,'topic.moderate',{topicId:publicId,operation:'move',boardId:5,reason:'Return public discussion'});
      const reply=await call(bob,'post.create',{topicId:publicId,body:'New mention @Alice_Player after move'});
      await call(owner,'post.moderate',{postId:reply.postId,operation:'hide',reason:'Hide this reply'});
      assert.equal((await call(alice,'notifications')).notifications.some(item=>item.post_id===reply.postId),false);
      await call(owner,'post.moderate',{postId:reply.postId,operation:'restore',reason:'Restore reply'});
    });
    await t.test('private conversations, blocking and message reports do not expose entire dialogs',async()=>{
      await db.execute('UPDATE forum_users SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 HOUR) WHERE id IN (?,?)',[alice.user.id,bob.user.id]);
      const conversation=await call(alice,'conversation.create',{recipient:'Bob_Player',title:'Private conversation',body:'Private message to Bob'});
      const read=await call(bob,'conversation',undefined,200,{query:{id:conversation.conversationId}});assert.equal(read.messages.length,1);
      await call(owner,'conversation',undefined,404,{query:{id:conversation.conversationId}});
      await call(moderator,'conversation',undefined,404,{query:{id:conversation.conversationId}});
      await call(bob,'report.create',{messageId:read.messages[0].id,reason:'Review just this message'});
      const moderation=await call(owner,'moderation');assert.equal(moderation.reports.at(-1).item.reportedMessage.body,'Private message to Bob');assert.equal(moderation.reports.at(-1).item.reportedMessage.conversation_id,undefined);
      await call(bob,'block.toggle',{userId:alice.user.id,blocked:true});
      await call(alice,'message.create',{conversationId:conversation.conversationId,body:'Blocked reply'},403);
      await call(bob,'block.toggle',{userId:alice.user.id,blocked:false});
      await call(alice,'message.create',{conversationId:conversation.conversationId,body:'Allowed reply'});
    });
    await t.test('attachments are sealed under immutable keys and preserve topic access',async()=>{
      const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
      const prepared=await call(alice,'attachment.prepare',{filename:'evidence.png',mime:'image/png',size:bytes.length});
      await fetch(prepared.url,{method:'PUT',headers:{'Content-Type':'image/png'},body:bytes});
      await call(alice,'attachment.complete',{attachmentId:prepared.attachmentId});
      const attached=await call(alice,'post.create',{topicId:privateId,body:'Attached private evidence',attachments:[prepared.attachmentId]});
      const file=await call(alice,'attachment',undefined,200,{query:{id:prepared.attachmentId}});assert.match(file.url,/published/);
      await fetch(prepared.url,{method:'PUT',headers:{'Content-Type':'image/png'},body:Buffer.from('replaced')});
      assert.deepEqual(Buffer.from(await(await fetch(file.url)).arrayBuffer()),bytes);
      await call(bob,'attachment',undefined,404,{query:{id:prepared.attachmentId}});
      await call(owner,'post.moderate',{postId:attached.postId,operation:'hide',reason:'Hide private evidence'});
      await call(alice,'attachment',undefined,404,{query:{id:prepared.attachmentId}});
      const bad=await call(alice,'attachment.prepare',{filename:'not-an-image.png',mime:'image/png',size:4});
      await fetch(bad.url,{method:'PUT',headers:{'Content-Type':'image/png'},body:Buffer.from('html')});
      await call(alice,'attachment.complete',{attachmentId:bad.attachmentId},400);
    });
    await t.test('role assignment, tags, warning hierarchy and session revocation are persisted',async()=>{
      await call(bob,'admin',undefined,403);
      await call(owner,'admin.tag',{name:'Ветеран',color:'#60a5fa',position:1});
      const tags=(await call(owner,'admin')).tags;await call(owner,'admin.userTags',{userId:alice.user.id,tags:[tags[0].id]});
      assert.equal((await call(bob,'profile',undefined,200,{query:{id:alice.user.id}})).profile.tags[0].name,'Ветеран');
      await call(owner,'admin.role',{id:'police',name:'Поліція',color:'#60a5fa',rank:20,permissions:[]});
      await call(owner,'admin.userRoles',{userId:moderator.user.id,roleId:'moderator',extraRoles:['police']});
      assert.equal((await call(moderator,'bootstrap')).user,null);
      await call(moderator,'auth.login',{login:'Section_Mod',password:'Local-Test-Password-123'});
      await call(moderator,'penalty.create',{userId:owner.user.id,kind:'ban',hours:1,reason:'Invalid escalation'},403);
      await call(owner,'penalty.create',{userId:bob.user.id,kind:'mute',hours:1,points:0,reason:'Temporary test mute'});
      await call(bob,'post.create',{topicId:privateId,body:'Muted write'},403);
      const penalties=(await call(owner,'admin.user',undefined,200,{query:{id:bob.user.id}})).penalties;
      await call(owner,'penalty.revoke',{userId:bob.user.id,penaltyId:penalties[0].id});
      await call(owner,'note.create',{userId:bob.user.id,body:'Private staff note'});
      assert.equal((await call(bob,'profile',undefined,200,{query:{id:bob.user.id}})).profile.notes,undefined);
      assert.ok((await call(owner,'admin.audit')).entries.length>0);
    });
    await t.test('recovery tokens are one-use and password changes revoke existing sessions',async()=>{
      await call(guest,'auth.recover',{email:'alice@example.test'});
      const link=confirmation(mails.at(-1));
      await call(guest,'auth.confirm',{...link,password:'Replaced-Test-Password-456'});
      assert.equal((await call(alice,'bootstrap')).user,null);
      await call(guest,'auth.confirm',{...link,password:'Replaced-Test-Password-456'},400);
      await call(alice,'auth.login',{login:'Alice_Player',password:'Local-Test-Password-123'},401);
      await call(alice,'auth.login',{login:'Alice_Player',password:'Replaced-Test-Password-456'});
    });
    await t.test('approval queues, revisions and notifications survive editing and reapproval',async()=>{
      const board=await call(owner,'admin.board',{title:'Approval required',requireApproval:true,access:{},icon:'support'});
      const created=await call(alice,'topic.create',{boardId:board.boardId,title:'Topic awaiting approval',body:'Original queued content'});
      await call(bob,'topic',undefined,404,{query:{id:created.topicId}});
      assert.ok((await call(owner,'moderation')).topics.some(topic=>topic.id===created.topicId));
      await call(owner,'topic.moderate',{topicId:created.topicId,operation:'approve',reason:'Reviewed topic'});
      await call(bob,'topic',undefined,200,{query:{id:created.topicId}});
      await call(alice,'post.edit',{postId:created.postId,body:'Edited content requires another review',reason:'Changed message'});
      await call(bob,'topic',undefined,404,{query:{id:created.topicId}});
      await call(owner,'topic.moderate',{topicId:created.topicId,operation:'approve',reason:'Reviewed edited topic'});
      const reply=await call(bob,'post.create',{topicId:created.topicId,body:'Queued reply @Alice_Player'});
      assert.equal((await call(alice,'notifications')).notifications.some(item=>item.post_id===reply.postId),false);
      await call(owner,'post.moderate',{postId:reply.postId,operation:'approve',reason:'Approved reply'});
      assert.equal((await call(alice,'notifications')).notifications.some(item=>item.post_id===reply.postId),true);
      await call(owner,'post.moderate',{postId:reply.postId,operation:'hide',reason:'Hide reply'});
      await call(owner,'post.moderate',{postId:reply.postId,operation:'restore',reason:'Restore reply'});
      await call(owner,'topic.moderate',{topicId:created.topicId,operation:'hide',reason:'Hide topic'});
      await call(bob,'topic',undefined,404,{query:{id:created.topicId}});
      await call(owner,'topic.moderate',{topicId:created.topicId,operation:'restore',reason:'Restore topic'});
    });
    await t.test('topic split and merge preserve messages and private audiences',async()=>{
      // Reset only this test actor's topic flood bucket between independent scenarios.
      await db.execute('DELETE FROM forum_limits');
      const first=await call(alice,'topic.create',{boardId:5,title:'Split source topic',body:'Source opening post'});
      const reply=await call(bob,'post.create',{topicId:first.topicId,body:'Reply to split into a new topic'});
      await call(owner,'topic.split',{topicId:first.topicId,title:'Invalid split',postIds:[first.postId],reason:'Must retain first post'},400);
      const split=await call(owner,'topic.split',{topicId:first.topicId,title:'Split destination topic',postIds:[reply.postId],reason:'Separate discussion'});
      assert.equal((await call(guest,'topic',undefined,200,{query:{id:split.topicId}})).posts[0].id,reply.postId);
      await call(owner,'topic.merge',{sourceId:split.topicId,targetId:first.topicId,reason:'Combine related discussion'});
      assert.equal((await call(guest,'topic',undefined,200,{query:{id:first.topicId}})).posts.length,2);
      await call(guest,'topic',undefined,404,{query:{id:split.topicId}});
      await call(owner,'topic.merge',{sourceId:privateId,targetId:first.topicId,reason:'Must not expose private appeal'},400);
    });
    await t.test('custom statuses, board icons, forced privacy and assigned staff persist',async()=>{
      const config=await call(owner,'admin');
      await call(owner,'admin.settings',{...config.settings,statuses:[...config.settings.statuses,{id:'waiting_team',label:'Очікує команди',replies:false}]});
      await call(owner,'topic.moderate',{topicId:publicId,operation:'status',status:'waiting_team',reason:'Wait for the team'});
      assert.equal((await call(alice,'topic',undefined,200,{query:{id:publicId}})).canReply,false);
      await call(alice,'post.create',{topicId:publicId,body:'Cannot answer under custom closed status'},403);
      await call(owner,'admin.settings',{...config.settings},400);
      await call(owner,'topic.moderate',{topicId:publicId,operation:'status',status:'open',reason:'Allow replies again'});
      await call(owner,'admin.settings',{...config.settings});
      await call(owner,'topic.moderate',{topicId:privateId,operation:'assign',userId:owner.user.id,reason:'Owner handles appeal'});
      await call(owner,'topic.moderate',{topicId:privateId,operation:'status',status:'clarification',reason:'Please provide clarification'});
      assert.equal((await call(alice,'topic',undefined,200,{query:{id:privateId}})).topic.assigned_to,owner.user.id);
      const board=await call(owner,'admin.board',{title:'Private board conversion',access:{},icon:'shield'});
      const created=await call(alice,'topic.create',{boardId:board.boardId,title:'Topic before private conversion',body:'Must become private'});
      await call(owner,'admin.board',{id:board.boardId,title:'Private board conversion',access:{privateRequired:true},icon:'shield'});
      assert.equal((await call(owner,'admin')).boards.find(item=>item.id===board.boardId).icon,'shield');
      await call(bob,'topic',undefined,404,{query:{id:created.topicId}});
    });
    await t.test('profile statistics and publication lists never count inaccessible content',async()=>{
      const own=await call(alice,'profile',undefined,200,{query:{id:alice.user.id}}),publicProfile=await call(guest,'profile',undefined,200,{query:{id:alice.user.id}});
      assert.ok(own.profile.stats.posts>publicProfile.profile.stats.posts);
      const posts=await call(guest,'posts',undefined,200,{query:{authorId:alice.user.id,size:10}});
      assert.equal(posts.posts.some(post=>post.topic_id===privateId),false);
      await call(alice,'profile.save',{bio:'Persistent biography',signature:'United Ukraine',preferences:{hideOnline:true,reply:false},avatarId:null,coverId:null});
      const updated=await call(bob,'profile',undefined,200,{query:{id:alice.user.id}});
      assert.equal(updated.profile.bio,'Persistent biography');assert.equal(updated.profile.lastSeenAt,null);
    });
    await t.test('warning thresholds, ban revocation and flood prevention are enforced',async()=>{
      const config=(await call(owner,'admin')).settings;
      await call(owner,'admin.settings',{...config,warningThreshold:2,warningMuteHours:1});
      await call(owner,'penalty.create',{userId:bob.user.id,kind:'warning',hours:24,points:2,reason:'Automatic mute threshold'});
      const penalties=(await call(owner,'admin.user',undefined,200,{query:{id:bob.user.id}})).penalties;
      assert.ok(penalties.some(p=>p.kind==='mute'&&!p.revoked_at));
      for(const penalty of penalties.filter(p=>!p.revoked_at))await call(owner,'penalty.revoke',{userId:bob.user.id,penaltyId:penalty.id});
      await call(owner,'penalty.create',{userId:bob.user.id,kind:'ban',hours:1,reason:'Test account ban'});
      assert.equal((await call(bob,'bootstrap')).user,null);
      await call(bob,'auth.login',{login:'Bob_Player',password:'Local-Test-Password-123'},403);
      const active=(await call(owner,'admin.user',undefined,200,{query:{id:bob.user.id}})).penalties.find(p=>p.kind==='ban'&&!p.revoked_at);
      await call(owner,'penalty.revoke',{userId:bob.user.id,penaltyId:active.id});
      await call(bob,'auth.login',{login:'Bob_Player',password:'Local-Test-Password-123'});
      await db.execute('DELETE FROM forum_limits');
      for(let i=0;i<6;i++)await call(alice,'report.create',{userId:bob.user.id,reason:`Flood check ${i}`});
      await call(alice,'report.create',{userId:bob.user.id,reason:'Exceeds report limit'},429);
    });
    await t.test('database defaults use UTC consistently with session expiration',async()=>{
      const [values]=await db.execute('SELECT TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),CURRENT_TIMESTAMP()) delta');assert.equal(values[0].delta,0);
      const [sessions]=await db.execute('SELECT TIMESTAMPDIFF(HOUR,created_at,expires_at) hours FROM forum_sessions WHERE user_id=?',[alice.user.id]);
      assert.equal(sessions[0].hours,336);
    });
    await t.test('credential changes revoke outstanding email links and previous-address recovery',async()=>{
      await db.execute('DELETE FROM forum_limits');
      await call(bob,'auth.email',{password:'Local-Test-Password-123',email:'bob-next@example.test'});
      const staleChange=confirmation(mails.at(-1));
      await call(bob,'auth.password',{password:'Local-Test-Password-123',newPassword:'Changed-Bob-Password-456'});
      await call(guest,'auth.confirm',staleChange,400);
      await call(guest,'auth.recover',{email:'Bob_Player@example.test'});
      const previousAddressReset=confirmation(mails.at(-1));
      await call(bob,'auth.email',{password:'Changed-Bob-Password-456',email:'bob-next@example.test'});
      const emailChange=confirmation(mails.at(-1));
      await call(guest,'auth.confirm',emailChange);
      assert.equal((await call(bob,'bootstrap')).user,null);
      await call(guest,'auth.confirm',{...previousAddressReset,password:'Must-Not-Be-Accepted-789'},400);
      await call(bob,'auth.login',{login:'bob-next@example.test',password:'Changed-Bob-Password-456'});
    });
    await t.test('opt-in mail outbox sends generic notices and rechecks private access',async()=>{
      await db.execute('DELETE FROM forum_limits');
      await call(alice,'profile.save',{bio:'Persistent biography',signature:'United Ukraine',preferences:{emailNotifications:true},avatarId:null,coverId:null});
      const created=await call(alice,'topic.create',{boardId:5,title:'Mail notification example',body:'Opening notification topic'});
      await call(bob,'post.create',{topicId:created.topicId,body:'Reply with sensitive details not for email'});
      const before=mails.length;assert.equal((await deliverForumMail()).sent,1);
      assert.equal(mails.length,before+1);assert.equal(mails.at(-1).text.includes('sensitive'),false);assert.equal(mails.at(-1).text.includes('Mail notification example'),false);
      assert.equal((await deliverForumMail()).sent,0);
      await call(bob,'post.create',{topicId:created.topicId,body:'Another private update'});
      await call(owner,'topic.moderate',{topicId:created.topicId,operation:'move',boardId:15,reason:'Revoke public audience before mail'});
      const after=mails.length;assert.equal((await deliverForumMail()).sent,0);assert.equal(mails.length,after);
      const [queued]=await db.execute("SELECT COUNT(*) count FROM forum_mail_outbox WHERE state='skipped'");assert.ok(queued[0].count>=1);
    });
  });
}finally{
  const cleanup=async()=>{
    globalThis.fetch=realFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.end();
    // Exact, freshly-created test database; loopback connection and prefix were fixed above.
    assert.match(name,/^forum_test_[a-f0-9]{16}$/);await root.query(`DROP DATABASE \`${name}\``);await root.end();
  };
  if(preview && !process.exitCode){
    await db.execute('DELETE FROM forum_limits');
    process.env.FORUM_ORIGIN='http://127.0.0.1:5173';
    console.log(`Isolated fixture API listening at ${origin}; browser origin ${process.env.FORUM_ORIGIN}. Local test email/R2 adapters only.`);
    console.log(`Disposable fixture database: ${name}. Test-only owner authenticator: ${ownerTotpSecret}`);
    let closing=false;
    const stop=()=>{if(closing)return;closing=true;void cleanup().then(()=>process.exit(0));};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
  }else await cleanup();
}
