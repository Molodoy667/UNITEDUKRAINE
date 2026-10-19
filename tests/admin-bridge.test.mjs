// SQL protocol verification, NOT a running SA-MP/AMX simulation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {rouletteDatabase} from './roulette-database.mjs';
import {entities} from '../lib/admin/catalog.js';
const source=await readFile(new URL('../tools/server-bridge/united_web_bridge.inc',import.meta.url),'utf8');
const strings=[...source.matchAll(/"(?:\\.|[^"\\])*"/g)].map(m=>{try{return JSON.parse(m[0]);}catch{return '';}});
const sql=prefix=>{const found=strings.find(s=>s.startsWith(prefix));assert.ok(found,`Missing actual Pawn SQL: ${prefix}`);return found;};
const render=(query,values,db)=>{let index=0;const result=query.replace(/%[eds]/g,token=>{const value=values[index++];if(token==='%d'){assert.ok(Number.isSafeInteger(value));return String(value);}if(token==='%s'){assert.match(value,/^[a-z0-9_]+$/);return value;}return db.escape(String(value)).slice(1,-1);});assert.equal(index,values.length);return result;};
const where=entity=>entities[entity].columns.map(key=>render(sql(' AND JSON_CONTAINS_PATH'),[key,key,key,key],{escape:s=>`'${s}'`})).join('');

test('packaged Pawn bridge field map and opt-in / dedicated-connection guards match the website',()=>{
  const block=source.match(/UUW_Columns\[5\]\[\] = \{([\s\S]*?)\};/)[1],columns=[...block.matchAll(/"([^"]+)"/g)].map(m=>m[1].split(','));
  assert.deepEqual(columns,Object.values(entities).map(e=>e.columns));
  for(const guard of ['DUPLICATE_CONNECTIONS,true','DUPLICATE_CONNECTIONS,false',',3306,false,1','UUW_DB==mysql','START TRANSACTION','ROLLBACK','COMMIT','GetPlayerAccountID(p)==recordid','IsPlayerConnected(p)','IsValidSkin(skin)','cache_mismatch','engine_blocked','fexist("united_web_bridge.cfg")'])assert.ok(source.includes(guard),guard);
  assert.doesNotMatch(source,/ALTER TABLE|DROP TABLE|SendRconCommand|HTTP\(/);
  assert.doesNotMatch(strings.filter(s=>s.startsWith('SELECT ')).join('\n'),/SELECT\s+\*|players_password|google_code|credential_stamp/);
  const longest=Math.max(...Object.keys(entities).map(k=>where(k).length));assert.ok(longest<13000);
  assert.ok(source.indexOf('if(!UUW_Finish(id,actor,"applied"))')<source.indexOf('case 1:format(g_house[index][H_NAME]'));
});

test('actual Pawn SQL runs against disposable MariaDB, including CP1251, conflicts, atomic audit and exclusive ownership',async t=>{
  const database=await rouletteDatabase(),{pool}=database;
  let db;
  try{
    for(const entity of Object.values(entities)){
      const [columns]=await pool.query(`SHOW COLUMNS FROM \`${entity.table}\``),found=new Set(columns.map(c=>c.Field));
      for(const column of entity.columns)if(!found.has(column))await pool.query(`ALTER TABLE \`${entity.table}\` ADD COLUMN \`${column}\` ${['name','number','region'].includes(column)?"VARCHAR(60) DEFAULT ''":'BIGINT DEFAULT 0'}`);
      if(entity.table!=='accounts_1101')await pool.query(`INSERT INTO \`${entity.table}\` SET ?`,{id:1,owner_id:73,...(entity.table==='ownable_cars'?{famcar:0}:{}),...(['houses','business'].includes(entity.table)?{name:'Початкова назва'}:{})});
    }
    await pool.execute('UPDATE accounts_1101 SET admin=12 WHERE id=73');
    db=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.ROULETTE_TEST_DB_PORT),user:'root',password:process.env.ROULETTE_TEST_DB_PASSWORD,database:database.name,charset:'CP1251_GENERAL_CI'});
    const execute=(query,values=[])=>db.query(render(query,values,db));
    const current=async entity=>(await pool.query(`SELECT ${entities[entity].columns.map(c=>`\`${c}\``).join(',')} FROM \`${entities[entity].table}\` WHERE id=?`,[entity==='players'?999:1]))[0][0];
    const setExpected=async(entity,override={})=>{const row=await current(entity),snapshot={...Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===null?null:String(v)])),...override};await db.query('SET @uu_expected=?',[JSON.stringify(snapshot)]);return row;};
    await t.test('per-table engine check rejects MyISAM without converting it',async()=>{
      await pool.query('ALTER TABLE houses ENGINE=MyISAM');
      const [[engine]]=await execute(sql("SELECT ENGINE='InnoDB'"),['houses']);assert.equal(engine.ok,0);
      await pool.query('ALTER TABLE houses ENGINE=InnoDB');assert.equal((await execute(sql("SELECT ENGINE='InnoDB'"),['houses']))[0][0].ok,1);
    });
    await t.test('full snapshot predicate is charset-safe, case-sensitive and rejects missing/changed columns',async()=>{
      const row=await setExpected('houses'),query='SELECT id FROM houses WHERE id=1'+where('houses');
      assert.equal((await db.query(query))[0].length,1);
      await setExpected('houses',{name:'початкова назва'});assert.equal((await db.query(query))[0].length,0);
      const incomplete=Object.fromEntries(Object.entries(row).filter(([k])=>k!=='x').map(([k,v])=>[k,v===null?null:String(v)]));await db.query('SET @uu_expected=?',[JSON.stringify(incomplete)]);assert.equal((await db.query(query))[0].length,0);
      await setExpected('houses',{price:'999'});assert.equal((await db.query(query))[0].length,0);
    });
    await t.test('payload type checks and CP1251/CEF-safe name checks reject coercions and Unicode loss',async()=>{
      const nameCheck=sql('SELECT BINARY CONVERT(CONVERT('),skinCheck=sql("SELECT JSON_LENGTH(@uu_changes)=1 AND JSON_TYPE(JSON_EXTRACT(@uu_changes,'$.skin.after'))");
      for(const [name,expected] of [['Нова назва',1],['bad"name',0],['bad\\name',0],['bad{FFAA00}',0]]){await db.query('SET @uu_changes=?',[JSON.stringify({name:{after:name}})]);assert.equal((await db.query(nameCheck))[0][0].ok,expected);}
      // Send emoji JSON as ASCII escapes so the cp1251 client cannot substitute
      // it before the server-side round-trip check being tested.
      await db.query('SET @uu_changes=?',['{"name":{"after":"emoji\\ud83d\\ude00"}}']);assert.equal((await db.query(nameCheck))[0][0].ok,0);
      for(const [skin,expected] of [[224,1],['224',0],[null,0]]){await db.query('SET @uu_changes=?',[JSON.stringify({skin:{after:skin}})]);assert.equal(Number((await db.query(skinCheck))[0][0].ok),expected);}
    });
    const finish=async(id,code='applied')=>{
      await execute(sql('UPDATE site_admin_changes SET status='),[code==='applied'?'applied':'rejected',id]);
      await execute(sql('UPDATE site_admin_dispatch SET finished_at='),[code,'synthetic-instance',id]);
      await execute(sql('INSERT INTO site_admin_audit(change_id,actor_id,event,reason) VALUES('),[id,73,code==='applied'?'applied':'rejected',code]);
    };
    const prepare=async(entity,changes)=>{
      const id=randomUUID(),snapshot=await setExpected(entity);
      await pool.execute('INSERT INTO site_admin_changes(id,actor_id,request_id,payload_hash,entity,record_id,record_version,changes,reason,status,active_target) VALUES(?,73,?,REPEAT(\'a\',64),?,?,REPEAT(\'b\',64),?,\'Synthetic SQL protocol test\',\'queued\',?)',[id,randomUUID(),entity,snapshot.id,JSON.stringify(changes),`${entity}:${snapshot.id}`]);
      await pool.execute("INSERT INTO site_admin_dispatch(change_id,bridge_id,dispatched_by,snapshot,expires_at) VALUES(?,'sql-test',73,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))",[id,JSON.stringify(Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,v===null?null:String(v)])))]);
      return {id,snapshot};
    };
    await t.test('all five fixed UPDATE statements and final receipt/audit commit atomically',async()=>{
      for(const [entity,changes,update,values,key,expected] of [
        ['players',{skin:{before:223,after:224}},sql('UPDATE accounts_1101 SET skin='),[224,999],'skin',224],
        ['houses',{name:{before:'Початкова назва',after:'Новий будинок'}},sql('UPDATE `%s` SET name='),['houses','Новий будинок',1],'name','Новий будинок'],
        ['businesses',{name:{before:'Початкова назва',after:'Новий бізнес'}},sql('UPDATE `%s` SET name='),['business','Новий бізнес',1],'name','Новий бізнес'],
        ['vehicles',{color_1:{before:0,after:23}},sql('UPDATE ownable_cars SET color_1='),[23,44,1],'color_1',23],
        ['apartments',{locked:{before:0,after:1}},sql('UPDATE appartaments_ap SET locked='),[1,1],'locked',1],
      ]){
        await pool.query(`ALTER TABLE \`${entities[entity].table}\` ENGINE=InnoDB`);
        const {id}=await prepare(entity,changes);await db.beginTransaction();
        try{
        const [selected]=await execute(sql('SELECT c.id,c.entity,c.record_id,'),['sql-test']);assert.equal(selected[0].id,id);assert.equal(selected[0].actor_admin,12);assert.equal(selected[0].expired,0);
        const [matches]=await db.query(`SELECT id FROM \`${entities[entity].table}\` WHERE id=${entity==='players'?999:1}${where(entity)} FOR UPDATE`);assert.equal(matches.length,1);
        const [updated]=await execute(update,values);assert.equal(updated.affectedRows,1,entity);await finish(id);await db.commit();
        assert.equal((await current(entity))[key],expected);const [[receipt]]=await pool.execute('SELECT status FROM site_admin_changes WHERE id=?',[id]);assert.equal(receipt.status,'applied');
        }finally{await db.rollback();}
      }
    });
    await t.test('failure after game UPDATE but before audit commit rolls game and receipt back',async()=>{
      const {id,snapshot}=await prepare('apartments',{locked:{before:1,after:0}});
      await pool.query("CREATE TRIGGER bridge_audit_failure BEFORE INSERT ON site_admin_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic failure'");
      await db.beginTransaction();
      try{await execute(sql('UPDATE appartaments_ap SET locked='),[0,1]);await assert.rejects(finish(id));await db.rollback();}
      finally{await pool.query('DROP TRIGGER bridge_audit_failure');}
      assert.equal((await current('apartments')).locked,snapshot.locked);const [[receipt]]=await pool.execute('SELECT status FROM site_admin_changes WHERE id=?',[id]);assert.equal(receipt.status,'queued');
      const [[events]]=await pool.execute('SELECT COUNT(*) n FROM site_admin_audit WHERE change_id=?',[id]);assert.equal(events.n,0);
    });
    await t.test('dispatch selection exposes expiry and revoked admin before any UPDATE',async()=>{
      await pool.query('UPDATE accounts_1101 SET admin=0 WHERE id=73');await pool.query('UPDATE site_admin_dispatch SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE finished_at IS NULL');
      await db.beginTransaction();const [jobs]=await execute(sql('SELECT c.id,c.entity,c.record_id,'),['sql-test']);assert.equal(jobs.length,1);assert.equal(jobs[0].actor_admin,0);assert.equal(jobs[0].expired,1);await db.rollback();
    });
    await t.test('a second connection cannot acquire the lifetime database ownership lock',async()=>{
      const query=sql("SELECT GET_LOCK(CONCAT('uu-web-'");assert.equal((await db.query(query))[0][0].ok,1);
      const other=await pool.getConnection();try{assert.equal((await other.query(query))[0][0].ok,0);}finally{other.release();}
      await db.query("SELECT RELEASE_LOCK(CONCAT('uu-web-',LEFT(SHA2(DATABASE(),256),32)))");
    });
  }finally{if(db)await db.end();await database.close();}
});
