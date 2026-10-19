// Synthetic data only. This module is never imported by the production application.
export function testPlayer(overrides = {}) {
  return { id: 73, name: 'Alex_United', email: 'player@example.test', players_password: 'Synthetic-Game-Password', google_auth: 0, google_code: '', skin: 223,
    level: 18, exp: 36, admin: 0, phone: 9374422, phone_balance: 2500, job: 1, team: 0, money: '1250000', bank: '8750000', donate_current: 1450, coins: 15,
    reg_time: 1704067200, last_login: 1780000000, last_exit: 1779990000, premium: 2, premium_time: Math.floor(Date.now()/1000)+864000,
    driving_lic: 1, weapon_lic: 0, warn: 0, car_slots: 5, house_slots: 2, biz_slots: 1, health: 97, law_abiding: 85, game_for_day: 7620, game_for_day_prev: 14400, ...overrides };
}
export class TestDatabase {
  constructor(players = [testPlayer()]) { this.players=players;this.sessions=new Map();this.limits=new Map();this.steps=new Map();this.queries=[];this.failAssets=false;this.assets={
    cars:[{id:41,owner_id:73,model_id:411,number:'AA 7777 UU',region:'UA',mileage:1248.5,fuel:42,health:950,create_time:1705000000,famcar:0},{id:42,owner_id:73,model_id:400,number:'AA 7337 UU',region:'UA',mileage:340,fuel:55,health:1000,create_time:1705000000,famcar:0},{id:500,owner_id:999,model_id:400,number:'PRIVATE',famcar:0},{id:501,owner_id:73,model_id:400,number:'FAMILY',famcar:1}],
    houses:[{id:125,owner_id:73,name:'Дім біля озера',city:7,zone:2,price:3500000,type:2,rent_time:Math.floor(Date.now()/1000)+604800}],
    businesses:[{id:18,owner_id:73,name:'United Coffee',city:7,zone:1,price:8000000,type:1,balance:'375000',products:780,rent_time:Math.floor(Date.now()/1000)+604800}],
    apartments:[{id:52,owner_id:73,app_id:4,floor:7,apt_num:3,price:950000,type:0,paid_days:14}],
  }; }
  async getConnection(){return this;}
  async beginTransaction(){} async commit(){} async rollback(){} release(){}
  async execute(sql,values=[]){
    this.queries.push({sql,values});
    if(sql.startsWith('SELECT s.id session_id')){const session=this.sessions.get(values[0]),player=session&&this.players.find(p=>p.id===session.account_id);return [[...(player?[{...player,...session,session_id:values[0],id:player.id}]:[])]];}
    if(sql.startsWith('SELECT id,name,email'))return [this.players.filter(p=>p.email.toLowerCase()===values[0]).slice(0,2)];
    if(sql.startsWith('INSERT INTO site_account_limits')){this.limits.set(values[0],(this.limits.get(values[0])||0)+1);return [{affectedRows:1}];}
    if(sql.startsWith('SELECT attempts'))return [[{attempts:this.limits.get(values[0])}]];
    if(sql.startsWith('INSERT INTO site_account_sessions')){this.sessions.set(values[0],{account_id:values[1],csrf:values[2],credential_stamp:values[3]});return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM site_account_sessions')){this.sessions.delete(values[0]);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT IGNORE INTO site_account_totp_steps')){if(!this.steps.has(values[0]))this.steps.set(values[0],-1);return [{affectedRows:1}];}
    if(sql.startsWith('SELECT last_step'))return [[{last_step:this.steps.get(values[0])}]];
    if(sql.startsWith('UPDATE site_account_totp_steps')){this.steps.set(values[1],values[0]);return [{affectedRows:1}];}
    for(const [table,key] of [['ownable_cars','cars'],['houses','houses'],['business','businesses'],['appartaments_ap','apartments']])if(sql.includes(`FROM ${table} WHERE owner_id=?`)){
      if(this.failAssets){const error=new Error('Private DB detail must not be returned');error.code='ER_NO_SUCH_TABLE';throw error;}
      return [this.assets[key].filter(p=>p.owner_id===values[0]&&(key!=='cars'||p.famcar===0)).map(({owner_id,famcar,...publicFields})=>publicFields)];
    }
    throw new Error(`Unexpected test query: ${sql.split(' ').slice(0,4).join(' ')}`);
  }
}
