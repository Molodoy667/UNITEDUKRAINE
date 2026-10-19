import { createHmac, randomBytes } from 'node:crypto';
import { base32, checkPassword, decrypt, digest, email, encrypt, equal, fail, hashPassword, id, needsTwoFactor, text, token, username, validTotp } from './core.js';
import { audit, limited, one, publicUser, requireUser, rows, settings, transaction, userById } from './store.js';
import { mailConfigured, sendMail } from './integrations.js';

export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-uu_forum' : 'uu_forum';
const cookieOptions = () => `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
export function checkOrigin(request) {
  const origin = request.headers.origin;
  const expected = process.env.FORUM_ORIGIN || (process.env.NODE_ENV !== 'production' ? `http://${request.headers.host}` : null);
  if (!expected || origin !== new URL(expected).origin) fail(403, 'origin_rejected', 'Оновіть сторінку та повторіть запит');
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) fail(415, 'json_required', 'Очікується JSON');
}
export async function context(request, response) {
  const secret = process.env.FORUM_IP_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) fail(503, 'forum_unconfigured', 'Форум ще налаштовується');
  const ip = process.env.VERCEL ? String(request.headers['x-vercel-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim() : request.socket?.remoteAddress || 'local';
  const ctx = { request, response, user: null, session: null, ipKey: createHmac('sha256', secret || 'local-development-only').update(ip).digest('hex') };
  const cookies = String(request.headers.cookie || '').split(';').map(value => value.trim()), cookie = cookies.find(value => value.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  if (/^[a-f0-9]{64}$/.test(cookie || '')) {
    const session = await one('SELECT * FROM forum_sessions WHERE id=? AND expires_at>UTC_TIMESTAMP()', [digest(cookie)]);
    if (session) {
      ctx.user = await userById(session.user_id); ctx.session = session;
      if (ctx.user?.penalties.some(p => p.kind === 'ban')) { ctx.user = null; ctx.session = null; }
      else if (ctx.user) {
        await rows('UPDATE forum_users SET last_seen_at=UTC_TIMESTAMP() WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE))', [ctx.user.id]);
        await rows('UPDATE forum_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=? AND last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)', [session.id]);
      }
    }
  }
  return ctx;
}
export function requireCsrf(ctx) { if (ctx.session && !equal(ctx.request.headers['x-forum-csrf'], ctx.session.csrf)) fail(403, 'csrf_rejected', 'Оновіть сторінку та повторіть запит'); }
async function createSession(ctx, userId) {
  const raw = token(), csrf = token(24);
  await rows('INSERT INTO forum_sessions(id,user_id,csrf,expires_at,agent) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY),?)', [digest(raw), userId, csrf, String(ctx.request.headers['user-agent'] || '').slice(0, 200)]);
  if (ctx.session) await rows('DELETE FROM forum_sessions WHERE id=?', [ctx.session.id]);
  ctx.response.setHeader('Set-Cookie', `${cookieName()}=${raw}; Max-Age=1209600; ${cookieOptions()}`);
  return { user: publicUser(await userById(userId), true), csrf };
}
async function issueToken(user, purpose, payload = null) {
  const raw = token();
  await transaction(async db => {
    await rows('DELETE FROM forum_tokens WHERE user_id=? AND purpose=?', [user.id, purpose], db);
    await rows('INSERT INTO forum_tokens(id,user_id,purpose,payload,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))', [digest(raw), user.id, purpose, payload], db);
  });
  const link = `${new URL(process.env.FORUM_ORIGIN).origin}/forum?view=confirm&purpose=${purpose}&token=${raw}`;
  await sendMail(payload || user.email, purpose === 'reset' ? 'United Ukraine: відновлення доступу' : 'United Ukraine: підтвердження email', `Вітаємо, ${user.username}!\n\nВідкрийте посилання, щоб ${purpose === 'reset' ? 'змінити пароль' : 'підтвердити email'}:\n${link}\n\nПосилання дійсне 30 хвилин. Якщо ви не робили цей запит, проігноруйте лист.`);
}
export async function authAction(ctx, action, body) {
  if (action === 'auth.register') {
    await limited(ctx, 'register', 5, 3600);
    if (!(await settings()).registrationOpen) fail(403, 'registration_closed', 'Реєстрація тимчасово закрита');
    const name = username(body.username), mail = email(body.email), password = await hashPassword(body.password);
    const result = await rows('INSERT INTO forum_users(username,email,password_hash) VALUES(?,?,?)', [name, mail, password]);
    const user = await userById(result.insertId);
    await audit({ user }, 'register', 'user', user.id);
    return createSession(ctx, user.id);
  }
  if (action === 'auth.login') {
    await limited(ctx, 'login', 10, 900);
    const login = text(body.login, 'Нік або email', 3, 254);
    const found = await one('SELECT id,password_hash FROM forum_users WHERE username=? OR email=? LIMIT 1', [login, login.toLowerCase()]);
    if (!await checkPassword(body.password, found?.password_hash)) fail(401, 'invalid_login', 'Некоректний нік, email або пароль');
    const user = await userById(found.id);
    if (user.penalties.some(p => p.kind === 'ban')) fail(403, 'banned', 'Обліковий запис заблоковано');
    if (user.totp_secret) {
      const step = validTotp(decrypt(user.totp_secret), body.code, user.totp_last_step);
      if (step === null) fail(401, 'totp_required', 'Вкажіть актуальний код із застосунку 2FA');
      const result = await rows('UPDATE forum_users SET totp_last_step=? WHERE id=? AND (totp_last_step IS NULL OR totp_last_step<?)', [step, user.id, step]);
      if (!result.affectedRows) fail(401, 'totp_reused', 'Цей код уже використаний');
    }
    return createSession(ctx, user.id);
  }
  if (action === 'auth.logout') {
    if (ctx.session) await rows('DELETE FROM forum_sessions WHERE id=?', [ctx.session.id]);
    ctx.response.setHeader('Set-Cookie', `${cookieName()}=; Max-Age=0; ${cookieOptions()}`);
    return { ok: true };
  }
  if (action === 'auth.recover') {
    await limited(ctx, 'recover', 4, 3600);
    if (!mailConfigured()) fail(503, 'mail_unconfigured', 'Поштовий сервіс ще не налаштований');
    const user = await one('SELECT id,email,username FROM forum_users WHERE email=?', [email(body.email)]);
    if (user) { try { await issueToken(user, 'reset'); } catch { /* Do not disclose whether an address exists. */ } }
    return { message: 'Якщо обліковий запис існує, лист надіслано на його email.' };
  }
  if (action === 'auth.resend') {
    const user = requireUser(ctx); await limited(ctx, `resend:${user.id}`, 3, 3600);
    if (!user.email_verified) await issueToken(user, 'verify');
    return { message: 'Лист підтвердження надіслано' };
  }
  if (action === 'auth.confirm') {
    await limited(ctx, 'confirm', 10, 900);
    const raw = text(body.token, 'Токен', 64, 64), purpose = text(body.purpose, 'Тип підтвердження', 4, 12);
    if (!['verify','reset','email'].includes(purpose)) fail(400, 'invalid_token', 'Некоректне посилання');
    const password = purpose === 'reset' ? await hashPassword(body.password) : null;
    await transaction(async db => {
      const entry = await one('SELECT * FROM forum_tokens WHERE id=? AND purpose=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE', [digest(raw), purpose], db);
      if (!entry) fail(400, 'invalid_token', 'Посилання недійсне або вже використане');
      if (purpose === 'reset') {
        const user = await one('SELECT totp_secret,totp_last_step FROM forum_users WHERE id=? FOR UPDATE', [entry.user_id], db);
        if (user.totp_secret) {
          const step = validTotp(decrypt(user.totp_secret), body.code, user.totp_last_step);
          if (step === null) fail(401, 'totp_required', 'Для відновлення потрібен код 2FA');
          await rows('UPDATE forum_users SET totp_last_step=? WHERE id=?', [step, entry.user_id], db);
        }
        await rows('UPDATE forum_users SET password_hash=? WHERE id=?', [password, entry.user_id], db);
        await rows('DELETE FROM forum_sessions WHERE user_id=?', [entry.user_id], db);
        await rows('DELETE FROM forum_tokens WHERE user_id=?', [entry.user_id], db);
        await audit({user:{id:entry.user_id}}, 'password_recovered', 'user', entry.user_id, {}, db);
      } else if (purpose === 'email') {
        await rows('UPDATE forum_users SET email=?,email_verified=1 WHERE id=?', [entry.payload, entry.user_id], db);
        // Links sent to the previous address must not remain a way back into the account.
        await rows('DELETE FROM forum_tokens WHERE user_id=?', [entry.user_id], db);
        await rows('DELETE FROM forum_sessions WHERE user_id=?', [entry.user_id], db);
        await audit({user:{id:entry.user_id}}, 'email_changed', 'user', entry.user_id, {}, db);
      }
      else await rows('UPDATE forum_users SET email_verified=1 WHERE id=?', [entry.user_id], db);
      await rows('DELETE FROM forum_tokens WHERE id=?', [entry.id], db);
    });
    return { message: purpose === 'reset' ? 'Пароль змінено. Увійдіть знову.' : purpose === 'email' ? 'Email змінено. Увійдіть знову.' : 'Email підтверджено' };
  }
  const user = requireUser(ctx);
  if (action === 'auth.password' || action === 'auth.email' || action === 'auth.totp.prepare' || action === 'auth.totp.disable') {
    await limited(ctx, `security:${user.id}`, 8, 900);
    if (!await checkPassword(body.password, user.password_hash)) fail(403, 'invalid_password', 'Невірний поточний пароль');
    if (user.totp_secret) {
      const step = validTotp(decrypt(user.totp_secret), body.code, user.totp_last_step);
      if (step === null) fail(403, 'totp_required', 'Потрібен актуальний код 2FA');
      const changed = await rows('UPDATE forum_users SET totp_last_step=? WHERE id=? AND (totp_last_step IS NULL OR totp_last_step<?)', [step, user.id, step]);
      if (!changed.affectedRows) fail(403, 'totp_reused', 'Цей код уже використаний');
    }
  }
  if (action === 'auth.password') {
    const password = await hashPassword(body.newPassword);
    await transaction(async db => {
      await rows('UPDATE forum_users SET password_hash=? WHERE id=?', [password, user.id], db);
      await rows('DELETE FROM forum_sessions WHERE user_id=? AND id<>?', [user.id, ctx.session.id], db);
      await rows('DELETE FROM forum_tokens WHERE user_id=?', [user.id], db);
      await audit(ctx, 'password_changed', 'user', user.id, {}, db);
    });
    return { message: 'Пароль змінено, інші сеанси завершено' };
  }
  if (action === 'auth.email') { await issueToken(user, 'email', email(body.email)); return { message: 'Підтвердіть новий email за посиланням у листі' }; }
  if (action === 'auth.sessions') return { sessions: await rows('SELECT id,created_at,last_seen_at,expires_at,agent FROM forum_sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC', [user.id]), current: ctx.session.id };
  if (action === 'auth.revoke') {
    const sessionId = text(body.sessionId, 'Сеанс', 64, 64);
    await rows('DELETE FROM forum_sessions WHERE id=? AND user_id=?', [sessionId, user.id]); return { ok: true };
  }
  if (action === 'auth.totp.prepare') {
    if (user.totp_secret) fail(409, 'totp_enabled', '2FA вже увімкнено');
    const secret = base32(randomBytes(20));
    await rows('UPDATE forum_users SET totp_pending=? WHERE id=?', [encrypt(secret), user.id]);
    return { secret, uri: `otpauth://totp/${encodeURIComponent(`United Ukraine:${user.username}`)}?secret=${secret}&issuer=United%20Ukraine&algorithm=SHA1&digits=6&period=30` };
  }
  if (action === 'auth.totp.enable') {
    await limited(ctx, `totp:${user.id}`, 6, 900);
    await transaction(async db => {
      const fresh = await one('SELECT totp_pending,totp_secret FROM forum_users WHERE id=? FOR UPDATE', [user.id], db);
      if (!fresh.totp_pending || fresh.totp_secret) fail(409, 'totp_setup_required', 'Почніть налаштування 2FA');
      const step = validTotp(decrypt(fresh.totp_pending), body.code);
      if (step === null) fail(400, 'invalid_totp', 'Невірний код 2FA');
      await rows('UPDATE forum_users SET totp_secret=totp_pending,totp_pending=NULL,totp_last_step=? WHERE id=?', [step, user.id], db);
      await rows('DELETE FROM forum_sessions WHERE user_id=? AND id<>?', [user.id, ctx.session.id], db);
      await rows('DELETE FROM forum_tokens WHERE user_id=?', [user.id], db);
      await audit(ctx, 'totp_enabled', 'user', user.id, {}, db);
    }); return { message: '2FA увімкнено' };
  }
  if (action === 'auth.totp.disable') {
    if (needsTwoFactor(user)) fail(403, 'totp_required', 'Для адміністрації 2FA є обов’язковою');
    await rows('UPDATE forum_users SET totp_secret=NULL,totp_pending=NULL,totp_last_step=NULL WHERE id=?', [user.id]);
    return { message: '2FA вимкнено' };
  }
  fail(404, 'not_found', 'Операцію не знайдено');
}
