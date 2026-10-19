import { getMysqlPool } from '../mysql.js';
import { boardAllowed, digest, fail, has, json, mayModerate, needsTwoFactor, topicAllowed } from './core.js';
import { defaultStatuses } from './defaults.js';

export async function rows(sql, params = [], db = getMysqlPool()) { const [result] = await db.execute(sql, params); return result; }
export async function one(sql, params = [], db) { return (await rows(sql, params, db))[0] || null; }
export async function transaction(work) {
  const db = await getMysqlPool().getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); return result; }
  catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function settings(db) {
  const value = await one("SELECT setting_value FROM forum_settings WHERE setting_key='general'", [], db);
  return { title: 'United Ukraine · Форум', announcement: '', editMinutes: 30, maxAttachmentMB: 8, prefixes: [], registrationOpen: true, warningThreshold: 0, warningMuteHours: 24, statuses:defaultStatuses, ...json(value?.setting_value, {}) };
}
export async function userById(userId, db) {
  const user = await one(`SELECT u.*,r.name role_name,r.color role_color,r.rank_value,r.permissions role_permissions FROM forum_users u JOIN forum_roles r ON r.id=u.role_id WHERE u.id=?`, [userId], db);
  if (!user) return null;
  const extra = await rows('SELECT r.* FROM forum_user_roles ur JOIN forum_roles r ON r.id=ur.role_id WHERE ur.user_id=?', [userId], db);
  user.roles = [...new Set([user.role_id, ...extra.map(role => role.id)])];
  user.rank = Math.max(user.rank_value, ...extra.map(role => role.rank_value));
  user.permissions = [...new Set([...json(user.role_permissions, []), ...extra.flatMap(role => json(role.permissions, []))])];
  user.moderated = (await rows('SELECT board_id FROM forum_moderators WHERE user_id=?', [userId], db)).map(value => value.board_id);
  user.penalties = await rows('SELECT id,kind,reason,points,expires_at,created_at FROM forum_penalties WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())', [userId], db);
  user.tags = await rows('SELECT t.* FROM forum_tags t JOIN forum_user_tags ut ON t.id=ut.tag_id WHERE ut.user_id=? ORDER BY t.position,t.id', [userId], db);
  return user;
}
export function publicUser(user, self = false) {
  const result = { id: user.id, username: user.username, role: { id: user.role_id, name: user.role_name, color: user.role_color }, tags: user.tags || [], bio: user.bio, signature: user.signature, avatarId: user.avatar_id, coverId: user.cover_id, createdAt: user.created_at, lastSeenAt: user.last_seen_at, rank: user.rank };
  if (self) Object.assign(result, { email: user.email, verified: Boolean(user.email_verified), roles: user.roles, permissions: user.permissions, moderated: user.moderated, penalties: user.penalties, preferences: json(user.preferences, {}), twoFactor: Boolean(user.totp_secret), needsTwoFactor: needsTwoFactor(user) && !user.totp_secret });
  return result;
}
export async function boardsFor(user, db) {
  const boards = await rows('SELECT * FROM forum_boards ORDER BY position,id', [], db), map = new Map(boards.map(board => [board.id, board]));
  function allowed(board, seen = new Set()) {
    if (seen.has(board.id) || !boardAllowed(user, board)) return false;
    seen.add(board.id);
    return !board.parent_id || (map.has(board.parent_id) && allowed(map.get(board.parent_id), seen));
  }
  return boards.filter(board => allowed(board)).map(board => ({ ...board, access: json(board.access, {}), form_fields: json(board.form_fields, []), canModerate: mayModerate(user, board), canCreate: Boolean(user && !board.archived && !board.is_category && boardAllowed(user, board, 'create')) }));
}
export async function requireBoard(user, boardId, db) {
  const board = (await boardsFor(user, db)).find(item => item.id === boardId);
  if (!board) fail(404, 'not_found', 'Розділ не знайдено');
  return board;
}
export async function requireTopic(user, topicId, db, lock = false) {
  const topic = await one(`SELECT * FROM forum_topics WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [topicId], db);
  if (!topic) fail(404, 'not_found', 'Тему не знайдено');
  const board = await requireBoard(user, topic.board_id, db);
  topic.reply_allowed = Boolean((await settings(db)).statuses.find(status => status.id === topic.status)?.replies);
  if (!topicAllowed(user, topic, board)) fail(404, 'not_found', 'Тему не знайдено');
  return { topic, board };
}
export function requireUser(ctx, write = false) {
  if (!ctx.user) fail(401, 'login_required', 'Увійдіть до форуму');
  if (ctx.user.penalties.some(p => p.kind === 'ban')) fail(403, 'banned', 'Обліковий запис заблоковано');
  if (write && ctx.user.penalties.some(p => p.kind === 'mute')) fail(403, 'muted', 'Публікації тимчасово обмежені');
  return ctx.user;
}
export function requirePermission(ctx, permission) {
  requireUser(ctx, true);
  if (!has(ctx.user, permission)) fail(403, 'forbidden', 'Недостатньо прав');
  if (needsTwoFactor(ctx.user) && !ctx.user.totp_secret) fail(403, 'two_factor_required', 'Увімкніть 2FA перед керуванням форумом');
}
export function topicFilter(user, boards, alias = 't') {
  if (!boards.length) return { sql: '0=1', values: [] };
  const allowed = boards.map(board => board.id), moderated = boards.filter(board => mayModerate(user, board)).map(board => board.id);
  const modSql = moderated.length ? `${alias}.board_id IN (${moderated.map(() => '?').join(',')})` : '0=1';
  return {
    sql: `${alias}.board_id IN (${allowed.map(() => '?').join(',')}) AND (${alias}.deleted_at IS NULL OR ${modSql}) AND (${alias}.approved=1 OR ${alias}.author_id=? OR ${modSql}) AND (${alias}.private_topic=0 OR ${alias}.author_id=? OR ${modSql})`,
    values: [...allowed, ...moderated, user?.id || 0, ...moderated, user?.id || 0, ...moderated],
  };
}
export async function audit(ctx, action, targetType, targetId, details = {}, db) {
  await rows('INSERT INTO forum_audit(actor_id,action,target_type,target_id,details) VALUES(?,?,?,?,?)', [ctx.user?.id || null, action, targetType, String(targetId), JSON.stringify(details)], db);
}
export async function notify(userId, actorId, kind, message, refs = {}, db) {
  if (userId === actorId) return;
  const prefs = await one('SELECT preferences FROM forum_users WHERE id=?', [userId], db);
  if (json(prefs?.preferences, {})[kind] === false) return;
  const notification=await rows('INSERT INTO forum_notifications(user_id,actor_id,kind,message,topic_id,post_id,conversation_id) VALUES(?,?,?,?,?,?,?)', [userId, actorId, kind, message.slice(0, 300), refs.topicId || null, refs.postId || null, refs.conversationId || null], db);
  if(json(prefs?.preferences,{}).emailNotifications===true)await rows('INSERT INTO forum_mail_outbox(notification_id) VALUES(?)',[notification.insertId],db);
}
export async function limited(ctx, bucket, maximum = 20, seconds = 60) {
  const key = digest(`${ctx.ipKey}:${bucket}:${Math.floor(Date.now() / (seconds * 1000))}`);
  await rows('INSERT INTO forum_limits(id,hits,expires_at) VALUES(?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=hits+1', [key, seconds * 2]);
  const count = await one('SELECT hits FROM forum_limits WHERE id=?', [key]);
  if (count.hits > maximum) fail(429, 'rate_limit', 'Забагато запитів. Спробуйте пізніше');
}
