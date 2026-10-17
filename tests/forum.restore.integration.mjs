import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';

const port=Number(process.env.FORUM_TEST_DB_PORT),source=process.env.FORUM_TEST_SOURCE_DB,dumpBin=process.env.FORUM_TEST_DUMP_BIN;
if(!Number.isInteger(port)||port<1024||port===3306||!/^forum_test_[a-f0-9]{16}$/.test(source||'')||!dumpBin||!process.env.FORUM_TEST_DB_PASSWORD)throw new Error('Explicit loopback test port, test password, forum_test_* source and official dump executable are required.');
const restored=`forum_test_${randomBytes(8).toString('hex')}`;
const config={host:'127.0.0.1',port,user:'root',password:process.env.FORUM_TEST_DB_PASSWORD,timezone:'Z'};
const admin=await mysql.createConnection(config);let connection,created=false;
try{
  const dump=spawnSync(dumpBin,['--host=127.0.0.1',`--port=${port}`,'--user=root','--single-transaction','--skip-comments','--skip-add-locks','--default-character-set=utf8mb4',source],{env:{...process.env,MYSQL_PWD:process.env.FORUM_TEST_DB_PASSWORD},encoding:'utf8',maxBuffer:32*1048576,timeout:30000});
  assert.equal(dump.status,0,dump.stderr);assert.ok(dump.stdout.includes('forum_topics'));
  await admin.query(`CREATE DATABASE \`${restored}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;
  connection=await mysql.createConnection({...config,database:restored,multipleStatements:true});
  await connection.query(dump.stdout);
  const [tables]=await admin.execute('SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[source]);
  let total=0;
  for(const table of tables){
    assert.match(table.name,/^forum_[a-z_]+$/);
    const [[original]]=await admin.query(`SELECT COUNT(*) count FROM \`${source}\`.\`${table.name}\``);
    const [[copy]]=await connection.query(`SELECT COUNT(*) count FROM \`${table.name}\``);
    assert.equal(copy.count,original.count,`${table.name} row count`);total+=copy.count;
  }
  const [[orphanPosts]]=await connection.query('SELECT COUNT(*) count FROM forum_posts p LEFT JOIN forum_topics t ON t.id=p.topic_id LEFT JOIN forum_users u ON u.id=p.author_id WHERE t.id IS NULL OR u.id IS NULL');
  assert.equal(orphanPosts.count,0);
  // Revocation is part of a recovery runbook, to avoid restoring old authentication grants.
  await connection.query('DELETE FROM forum_sessions');await connection.query('DELETE FROM forum_tokens');
  Object.assign(process.env,{NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:restored,DB_USER:'root',DB_PASSWORD:config.password,FORUM_ORIGIN:'https://restore.example.test'});
  const {default:handler}=await import('../api/forum.js');
  async function invoke(action,body){let status,result;const request={method:body?'POST':'GET',url:`/api/forum?action=${action}`,headers:body?{origin:process.env.FORUM_ORIGIN,'content-type':'application/json'}:{},socket:{remoteAddress:'127.0.0.1'},body};const response={setHeader(){},status(value){status=value;return this;},json(value){result=value;}};await handler(request,response);assert.equal(status,200,JSON.stringify(result));return result;}
  const bootstrap=await invoke('bootstrap');assert.ok(bootstrap.boards.length>0);assert.ok(bootstrap.stats.topics>0);
  const login=await invoke('auth.login',{login:'Alice_Player',password:'Replaced-Test-Password-456'});assert.equal(login.user.username,'Alice_Player');
  const {getMysqlPool}=await import('../lib/mysql.js');await getMysqlPool().end();
  console.log(`Restore verified: ${tables.length} forum tables, ${total} rows, intact post relationships, public API and account login. Only disposable local databases were used.`);
}finally{
  await connection?.end();
  if(created){assert.match(restored,/^forum_test_[a-f0-9]{16}$/);await admin.query(`DROP DATABASE \`${restored}\``);}
  await admin.end();
}
