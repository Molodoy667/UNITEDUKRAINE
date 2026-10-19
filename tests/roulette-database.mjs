// Disposable local MariaDB only. Never loads the project's .env or production data.
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {testPlayer} from './account-fixtures.mjs';
import {getMysqlPool} from '../lib/mysql.js';
import {migrateForum} from '../lib/forum/migrate.js';
export async function rouletteDatabase(){
  const port=Number(process.env.ROULETTE_TEST_DB_PORT),password=process.env.ROULETTE_TEST_DB_PASSWORD;
  if(process.env.NODE_ENV==='production'||process.env.VERCEL||!Number.isInteger(port)||port<1024||port>65535||port===3306||!password)throw new Error('Set ROULETTE_TEST_DB_PORT (non-3306) and ROULETTE_TEST_DB_PASSWORD for an isolated loopback MariaDB. Production is prohibited.');
  const name=`roulette_test_${randomBytes(8).toString('hex')}`;
  const root=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password});
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  Object.assign(process.env,{NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:name,DB_USER:'root',DB_PASSWORD:password,ACCOUNT_RATE_SECRET:randomBytes(32).toString('hex'),FORUM_IP_SECRET:randomBytes(32).toString('hex'),ACCOUNT_ORIGIN:'http://127.0.0.1:5173'});
  const pool=getMysqlPool(),fixture=testPlayer({google_code:''});
  await pool.query(`CREATE TABLE accounts_1101 (${Object.entries(fixture).map(([key,value])=>`\`${key}\` ${key==='id'?'INT PRIMARY KEY':typeof value==='string'?'VARCHAR(255) NOT NULL': 'BIGINT NOT NULL DEFAULT 0'}`).join(',')}) ENGINE=MyISAM`);
  for(const player of [fixture,testPlayer({id:999,name:'Other_Player',email:'other@example.test',google_code:''})])await pool.query('INSERT INTO accounts_1101 SET ?',[player]);
  // Empty synthetic ownership tables let the existing account dashboard load too.
  await pool.query('CREATE TABLE ownable_cars(id INT,owner_id INT,model_id INT,number VARCHAR(32),region VARCHAR(8),mileage INT,fuel INT,health INT,color_1 INT,color_2 INT,create_time INT,famcar INT)');
  await pool.query('CREATE TABLE houses(id INT,owner_id INT,name VARCHAR(128),city INT,zone INT,price INT,type INT,rent_time INT)');
  await pool.query('CREATE TABLE business(id INT,owner_id INT,name VARCHAR(128),city INT,zone INT,price INT,type INT,balance INT,products INT,rent_time INT)');
  await pool.query('CREATE TABLE appartaments_ap(id INT,owner_id INT,app_id INT,floor INT,apt_num INT,price INT,type INT,paid_days INT)');
  const [before]=await pool.query('SELECT * FROM accounts_1101 ORDER BY id');
  await migrateForum();
  const [after]=await pool.query('SELECT * FROM accounts_1101 ORDER BY id');
  return {pool,root,name,before,after,async close(){await pool.end();if(!/^roulette_test_[a-f0-9]{16}$/.test(name))throw new Error('Invalid disposable DB');await root.query(`DROP DATABASE \`${name}\``);await root.end();}};
}
