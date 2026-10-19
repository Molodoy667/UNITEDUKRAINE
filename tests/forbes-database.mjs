// Only disposable loopback MariaDB. No production env files or player dump is loaded.
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
export const forbesFixtures=[
  ['Dmytro_Koval',223,'1400000000','4880000000'],['Artem_Shevchenko',21,'825000000','2950000000'],['Sofia_Voloshyna',190,'460000000','2020000000'],
  ['Maksym_Bondar',7,'310000000','1540000000'],['Nazar_Melnyk',60,'220000000','1310000000'],['Andrii_Tkachenko',46,'250000000','1140000000'],
  ['Ivan_Kravets',240,'185000000','965000000'],['Kateryna_Romanova',195,'174000000','806000000'],['Bohdan_Savchenko',29,'98000000','752000000'],
  ['Denys_Honchar',170,'64000000','676000000'],['Vladyslav_Moroz',230,'51000000','589000000'],['Roman_Petrenko',59,'26000000','464000000'],
  ['Mykhailo_Lysenko',47,'22000000','348000000'],['Oleh_Danyliuk',32,'100','1000'],['Taras_Polishchuk',68,'50','450'],
].map(([name,skin,money,bank],index)=>({id:index+1,name,skin,money,bank}));
export async function forbesDatabase(){
  const port=Number(process.env.FORBES_TEST_DB_PORT),password=process.env.FORBES_TEST_DB_PASSWORD;
  if(process.env.NODE_ENV==='production'||process.env.VERCEL||!Number.isInteger(port)||port<1024||port>65535||port===3306||!password)throw new Error('Configure FORBES_TEST_DB_PORT (non-3306) and FORBES_TEST_DB_PASSWORD for a disposable loopback database. Production is prohibited.');
  const name=`forbes_test_${randomBytes(8).toString('hex')}`,root=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password});
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const pool=mysql.createPool({host:'127.0.0.1',port,user:'root',password,database:name,timezone:'Z',connectionLimit:2});
  await pool.query("CREATE TABLE accounts_1101(id INT PRIMARY KEY,name VARCHAR(21) NOT NULL,skin INT,money VARCHAR(21),bank VARCHAR(21),email VARCHAR(61) DEFAULT 'private@example.test',players_password VARCHAR(85) DEFAULT 'Private-Test-Password',donate_current INT DEFAULT 999999999) ENGINE=InnoDB");
  const replace=async players=>{await pool.execute('DELETE FROM accounts_1101');for(const player of players)await pool.execute('INSERT INTO accounts_1101(id,name,skin,money,bank) VALUES(?,?,?,?,?)',[player.id,player.name,player.skin??null,player.money,player.bank]);};
  await replace(forbesFixtures);
  return {pool,name,replace,async close(){await pool.end();if(!/^forbes_test_[a-f0-9]{16}$/.test(name))throw Error('Unexpected test database');await root.query(`DROP DATABASE \`${name}\``);await root.end();}};
}
