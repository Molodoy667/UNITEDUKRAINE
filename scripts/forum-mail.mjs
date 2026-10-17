import { getMysqlPool } from '../lib/mysql.js';
import { deliverForumMail } from '../lib/forum/mail-worker.js';
try{console.log(JSON.stringify(await deliverForumMail(20)));}catch(error){console.error(error.code||error.name);process.exitCode=1;}finally{await getMysqlPool().end();}
