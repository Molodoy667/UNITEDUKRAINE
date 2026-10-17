import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export class ForumError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function fail(status, code, message) { throw new ForumError(status, code, message); }
export const token = (bytes = 32) => randomBytes(bytes).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function text(value, label, min = 0, max = 1000) {
  if (typeof value !== 'string') fail(400, 'invalid_field', `Некоректне поле: ${label}`);
  const result = value.normalize('NFC').trim();
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)) fail(400, 'invalid_field', `${label}: від ${min} до ${max} символів`);
  return result;
}
export function email(value) {
  const result = text(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result)) fail(400, 'invalid_email', 'Вкажіть коректний email');
  return result;
}
export function username(value) {
  const result = text(value, 'Нік', 3, 32);
  if (!/^[\p{L}\p{N}_-]+$/u.test(result)) fail(400, 'invalid_username', 'У ніку дозволені літери, цифри, _ та -');
  return result;
}
export function id(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 4294967295) fail(400, 'invalid_id', 'Некоректний ідентифікатор');
  return result;
}
export function page(query) {
  const size = Number(query.get('size') || 20), number = Number(query.get('page') || 1);
  if (![10, 20, 50, 100].includes(size) || !Number.isSafeInteger(number) || number < 1 || number > 100000) fail(400, 'invalid_page', 'Некоректна сторінка');
  return { size, page: number, offset: (number - 1) * size };
}
export function json(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return fallback; }
}
export async function hashPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 192) fail(400, 'invalid_password', 'Пароль: від 12 до 192 символів');
  const salt = token(16);
  const key = await scrypt(value, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function checkPassword(value, encoded) {
  if (typeof value !== 'string' || value.length > 192) return false;
  const parts = String(encoded || '').split('$');
  const salt = parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1]) ? parts[1] : '00000000000000000000000000000000';
  const key = await scrypt(value, salt, 64);
  return parts.length === 3 && equal(key.toString('hex'), parts[2]);
}
export function has(user, permission) { return Boolean(user && (user.permissions.includes('*') || user.permissions.includes(permission))); }
export function higher(actor, target) { return Boolean(actor && target && actor.id !== target.id && actor.rank > target.rank); }
export function boardAllowed(user, board, action = 'view') {
  if (has(user, '*')) return true;
  const access = json(board.access, {}), roles = user?.roles || ['guest'];
  if ((access.deny || []).some(role => roles.includes(role))) return false;
  const allowed = access[action];
  return !Array.isArray(allowed) || roles.some(role => allowed.includes(role));
}
export function needsTwoFactor(user) { return Boolean(user && (user.rank >= 80 || has(user, 'manage'))); }
export function mayModerate(user, board) { return Boolean(user && (!needsTwoFactor(user) || user.totp_secret) && boardAllowed(user, board) && (has(user, 'moderate') || user.moderated.includes(Number(board.id)))); }
export function topicAllowed(user, topic, board, action = 'read') {
  if (!boardAllowed(user, board)) return false;
  const mod = mayModerate(user, board);
  if (topic.deleted_at && !mod) return false;
  if (!topic.approved && !mod && user?.id !== topic.author_id) return false;
  if (topic.private_topic && !mod && user?.id !== topic.author_id) return false;
  if (action === 'reply' && !mod && !(topic.reply_allowed ?? ['open','review','clarification'].includes(topic.status))) return false;
  return action !== 'reply' || (Boolean(user) && boardAllowed(user, board, 'reply') && !board.archived);
}
export function color(value) { if (!/^#[\da-f]{6}$/i.test(value || '')) fail(400, 'invalid_color', 'Колір має бути у форматі #RRGGBB'); return value; }
export const permissions = ['manage', 'moderate', 'penalize', 'reports', 'audit'];
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decodeBase32(input) {
  let bits = 0, value = 0; const bytes = [];
  for (const char of input) { const index = alphabet.indexOf(char); if (index < 0) throw new Error('Invalid base32'); value = (value << 5) | index; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', decodeBase32(secret)).update(counter).digest(), offset = mac[19] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function validTotp(secret, code, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const step = Math.floor(now / 30000);
  for (const delta of [0, -1, 1]) if (step + delta > Number(lastStep ?? -1) && equal(totp(secret, step + delta), String(code))) return step + delta;
  return null;
}
function encryptionKey() {
  const secret = process.env.FORUM_ENCRYPTION_KEY;
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) fail(503, 'encryption_unconfigured', 'Захист 2FA ще не налаштований');
  return Buffer.from(secret, 'hex');
}
export function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return [iv.toString('hex'), Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex'), cipher.getAuthTag().toString('hex')].join('.');
}
export function decrypt(value) {
  const [iv, payload, tag] = value.split('.'), cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex')); return Buffer.concat([cipher.update(Buffer.from(payload, 'hex')), cipher.final()]).toString('utf8');
}
export function validateAccess(value, roleIds) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_access', 'Некоректні права розділу');
  for (const key of ['view','create','reply','deny']) if (value[key] !== undefined) {
    if (!Array.isArray(value[key]) || value[key].length > 50 || value[key].some(role => ![...roleIds, 'guest'].includes(role))) fail(400, 'invalid_access', 'Невідома роль');
    result[key] = [...new Set(value[key])];
  }
  for (const key of ['privateDefault','privateRequired']) if (value[key] !== undefined) result[key] = Boolean(value[key]);
  return result;
}
