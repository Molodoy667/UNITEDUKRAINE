import { readFile, readdir } from 'node:fs/promises';
import { digest } from './core.js';
import { getMysqlPool } from '../mysql.js';
import {seedKnowledge} from '../knowledge/seed.js';

export async function migrateForum() {
  const db=await getMysqlPool().getConnection();let locked=false;
  try {
    const [lock]=await db.query("SELECT GET_LOCK(CONCAT(DATABASE(),':forum_migrations'),20) acquired");
    if(lock[0].acquired!==1)throw new Error('Could not acquire migration lock');locked=true;
    await db.query('CREATE TABLE IF NOT EXISTS forum_migrations (name VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    const directory=new URL('../../migrations/',import.meta.url),names=(await readdir(directory)).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for(const name of names){
      const source=await readFile(new URL(name,directory),'utf8'),checksum=digest(source.replaceAll('\r\n','\n'));
      const [existing]=await db.execute('SELECT checksum FROM forum_migrations WHERE name=?',[name]);
      if(existing.length){if(existing[0].checksum!==checksum)throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);continue;}
      // Numbered idempotent DDL/configuration; 005 includes the operator-approved
      // accounts_1101 storage-engine conversion (backup/maintenance window advised).
      for(const statement of source.split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(Boolean))await db.query(statement);
      await db.execute('INSERT INTO forum_migrations(name,checksum) VALUES(?,?)',[name,checksum]);
    }
    await seedKnowledge(db);
    return names;
  } finally {if(locked)await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':forum_migrations'))");db.release();}
}
