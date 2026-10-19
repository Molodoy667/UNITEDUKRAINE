import { randomBytes, createHmac } from 'node:crypto';
import { getMysqlPool } from '../mysql.js';
import { validTotp } from '../forum/core.js';
import { AccountError, credentials, digest, equal, fail, profile, propertyView, stamp } from './core.js';
import { presence } from './presence.js';

const fields = 'id,name,email,skin,level,exp,admin,phone,phone_balance,job,team,money,bank,donate_current,coins,reg_time,last_login,last_exit,premium,premium_time,driving_lic,weapon_lic,warn,google_auth,car_slots,house_slots,biz_slots,game_for_day,game_for_day_prev,health,law_abiding';
const secure = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const cookieName = () => secure() ? '__Host-uu_account' : 'uu_account';
const cookie = (value, age) => `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure() ? '; Secure' : ''}`;
function readCookie(request) {
  const raw = String(request.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  return /^[a-f0-9]{64}$/.test(raw || '') ? raw : null;
}
function checkOrigin(request) {
  const origins = [process.env.ACCOUNT_ORIGIN, process.env.FORUM_ORIGIN, ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)];
  if (!secure()) origins.push(`http://${request.headers.host}`, 'http://localhost:5173', 'http://127.0.0.1:5173');
  if (!request.headers.origin || !origins.filter(Boolean).some(value => { try { return new URL(value).origin === request.headers.origin; } catch { return false; } })) fail(403, 'origin_rejected', 'Оновіть сторінку та повторіть запит.');
  if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) fail(415, 'json_required', 'Очікується JSON.');
}
export async function readAccountSession(request, db = getMysqlPool()) {
  const raw = readCookie(request); if (!raw) return null;
  const [foundRows] = await db.execute(`SELECT s.id session_id,s.csrf,s.credential_stamp,${fields.split(',').map(f => `a.${f}`).join(',')},a.players_password,a.google_code FROM site_account_sessions s JOIN accounts_1101 a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>UTC_TIMESTAMP()`, [digest(raw)]);
  const found = foundRows[0]; if (!found) return null;
  if (!equal(found.credential_stamp, stamp(raw, found))) { await db.execute('DELETE FROM site_account_sessions WHERE id=?', [digest(raw)]); return null; }
  return found;
}
export function verifyAccountWrite(request, current) {
  checkOrigin(request);
  if (!current) fail(401, 'login_required', 'Увійдіть до ігрового акаунта.');
  if (!equal(request.headers['x-account-csrf'], current.csrf)) fail(403, 'csrf_rejected', 'Оновіть сторінку та повторіть запит.');
}
export function createAccountHandler({ pool = getMysqlPool, getPresence = presence } = {}) {
  const rows = async (sql, values = [], db = pool()) => (await db.execute(sql, values))[0];
  async function session(request) {
    return readAccountSession(request, pool());
  }
  async function limit(request, email) {
    const secret = process.env.ACCOUNT_RATE_SECRET || process.env.FORUM_IP_SECRET;
    if (secure() && (!secret || secret.length < 32)) fail(503, 'account_unconfigured', 'Вхід тимчасово недоступний. Спробуйте пізніше.');
    const ip = process.env.VERCEL ? String(request.headers['x-vercel-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim() : request.socket?.remoteAddress || 'local';
    for (const [scope, value, max] of [['ip', ip, 30], ['email', email, 10]]) {
      const key = createHmac('sha256', secret || 'local-account-development').update(`${scope}:${value}`).digest('hex');
      await rows('INSERT INTO site_account_limits(bucket,attempts,reset_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE attempts=IF(reset_at<=UTC_TIMESTAMP(),1,attempts+1),reset_at=IF(reset_at<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),reset_at)', [key]);
      if (Number((await rows('SELECT attempts FROM site_account_limits WHERE bucket=?', [key]))[0]?.attempts) > max) fail(429, 'rate_limited', 'Забагато спроб входу. Спробуйте через 15 хвилин.');
    }
  }
  async function dashboard(account) {
    const id = Number(account.id);
    // These owner_id relations are also used by the Pawn property modules. Client IDs are never used.
    const [cars, houses, businesses, apartments, status] = await Promise.all([
      rows('SELECT id,model_id,number,region,mileage,fuel,health,color_1,color_2,create_time FROM ownable_cars WHERE owner_id=? AND famcar=0 ORDER BY id', [id]),
      rows('SELECT id,name,city,zone,price,type,rent_time FROM houses WHERE owner_id=? ORDER BY id', [id]),
      rows('SELECT id,name,city,zone,price,type,balance,products,rent_time FROM business WHERE owner_id=? ORDER BY id', [id]),
      rows('SELECT id,app_id,floor,apt_num,price,type,paid_days FROM appartaments_ap WHERE owner_id=? ORDER BY id', [id]),
      getPresence(account.name),
    ]);
    return { account: profile(account), assets: { cars, houses: houses.map(row => propertyView(row)), businesses: businesses.map(row => propertyView(row)), apartments: apartments.map(row => propertyView(row, true)) }, presence: status, updatedAt: new Date().toISOString() };
  }
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('Vary', 'Cookie'); response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const action = new URL(request.url, 'http://account.local').searchParams.get('action') || 'session';
      if (!['GET', 'POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST'); fail(405, 'method_not_allowed', 'Метод не підтримується.'); }
      if (!(request.method === 'GET' ? ['session','admin'] : ['login','logout']).includes(action)) fail(404, 'not_found', 'Операцію не знайдено.');
      if (request.method === 'POST') checkOrigin(request);
      const current = await session(request);
      if (request.method === 'GET') {
        if (!current) { if (action === 'admin') fail(401, 'login_required', 'Увійдіть до акаунта.'); return response.status(200).json({ account: null }); }
        if (action === 'admin') {
          if (Number(current.admin) !== 12) fail(403, 'forbidden', 'Доступ лише для адміністратора рівня 12.');
          return response.status(200).json({ allowed: true, nickname: current.name });
        }
        return response.status(200).json({ ...await dashboard(current), csrf: current.csrf });
      }
      let body;
      try { body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body; } catch { fail(400, 'invalid_body', 'Некоректний запит.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 2048) fail(400, 'invalid_body', 'Некоректний запит.');
      if (current && !equal(request.headers['x-account-csrf'], current.csrf)) fail(403, 'csrf_rejected', 'Оновіть сторінку та повторіть запит.');
      if (action === 'logout') {
        if (current) await rows('DELETE FROM site_account_sessions WHERE id=?', [current.session_id]);
        response.setHeader('Set-Cookie', cookie('', 0)); return response.status(200).json({ ok: true });
      }
      const { email, password } = credentials(body); await limit(request, email);
      const matches = await rows(`SELECT ${fields},players_password,google_code FROM accounts_1101 WHERE email=? LIMIT 2`, [email]);
      const account = matches.length === 1 ? matches[0] : null;
      // OnAuthorizationStart in senior.pwn compares the stored game password literally, case-sensitive.
      const passwordMatches = equal(password, account?.players_password || randomBytes(32).toString('hex'));
      if (!account || !passwordMatches) fail(401, 'invalid_login', 'Неправильний email або пароль.');
      let totpStep = null;
      if (Number(account.google_auth) > 0) {
        if (!/^[A-Z2-7]{16,64}$/.test(String(account.google_code || ''))) fail(403, 'totp_unavailable', 'Зверніться до адміністрації щодо захисту цього акаунта.');
        totpStep = validTotp(account.google_code, body.code);
        if (totpStep === null) fail(401, 'totp_required', 'Введіть актуальний код Google Authenticator.');
      }
      const raw = randomBytes(32).toString('hex'), csrf = randomBytes(24).toString('hex'), db = await pool().getConnection();
      try {
        await db.beginTransaction();
        if (totpStep !== null) {
          await rows('INSERT IGNORE INTO site_account_totp_steps(account_id,last_step) VALUES(?,-1)', [account.id], db);
          const step = (await rows('SELECT last_step FROM site_account_totp_steps WHERE account_id=? FOR UPDATE', [account.id], db))[0];
          if (Number(step.last_step) >= totpStep) fail(401, 'totp_reused', 'Зачекайте на новий код Google Authenticator.');
          await rows('UPDATE site_account_totp_steps SET last_step=? WHERE account_id=?', [totpStep, account.id], db);
        }
        await rows('INSERT INTO site_account_sessions(id,account_id,csrf,credential_stamp,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))', [digest(raw), account.id, csrf, stamp(raw, account)], db);
        if (current) await rows('DELETE FROM site_account_sessions WHERE id=?', [current.session_id], db);
        await db.commit();
      } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
      response.setHeader('Set-Cookie', cookie(raw, 604800));
      // Load the private dashboard in a separate GET, so a property/query outage cannot lose a successful login.
      return response.status(200).json({ account: profile(account), csrf });
    } catch (error) {
      if (error instanceof AccountError) { if (error.status === 429) response.setHeader('Retry-After', '900'); return response.status(error.status).json({ error: error.code, message: error.message }); }
      console.error('Account API failed', /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'REQUEST_FAILED');
      return response.status(503).json({ error: 'account_unavailable', message: 'Кабінет тимчасово недоступний. Спробуйте пізніше.' });
    }
  };
}
