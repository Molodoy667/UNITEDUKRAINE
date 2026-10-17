import { createHmac } from 'node:crypto';
import { digest, fail, token } from './core.js';

export function mailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.FORUM_MAIL_FROM && process.env.FORUM_ORIGIN); }
export async function sendMail(to, subject, body, idempotencyKey) {
  if (!mailConfigured()) fail(503, 'mail_unconfigured', 'Поштовий сервіс ще не налаштований');
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{}) }, body: JSON.stringify({ from: process.env.FORUM_MAIL_FROM, to: [to], subject, text: body }) });
  if (!response.ok) fail(503, 'mail_unavailable', 'Не вдалося надіслати лист. Спробуйте пізніше');
}
export function storageConfigured() { return ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_FORUM_BUCKET'].every(key => Boolean(process.env[key])); }
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
export function objectUrl(key, method = 'GET', contentType, now = new Date()) {
  if (!storageConfigured()) fail(503, 'storage_unconfigured', 'Сховище файлів ще не налаштоване');
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = stamp.slice(0, 8);
  const scope = `${date}/auto/s3/aws4_request`, pathname = `/${encode(process.env.R2_FORUM_BUCKET)}/${key.split('/').map(encode).join('/')}`;
  const headers = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`, signed = contentType ? 'content-type;host' : 'host';
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${process.env.R2_ACCESS_KEY_ID}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': method === 'PUT' ? '300' : '60', 'X-Amz-SignedHeaders': signed };
  const query = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&');
  const canonical = `${method}\n${pathname}\n${query}\n${headers}\n${signed}\nUNSIGNED-PAYLOAD`;
  const keyDate = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, date), keyRegion = hmac(keyDate, 'auto'), keyService = hmac(keyRegion, 's3'), keySigning = hmac(keyService, 'aws4_request');
  const signature = hmac(keySigning, `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${digest(canonical)}`).toString('hex');
  return `https://${host}${pathname}?${query}&X-Amz-Signature=${signature}`;
}
export function newObjectKey(userId) { return `forum/staging/${userId}/${token(24)}`; }
export const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export function fileMatches(buffer, mime) {
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mime === 'image/gif') return ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString());
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  return false;
}

// Validate the entire bounded object, then write a new key never exposed by an upload URL.
// A still-valid staging PUT URL can therefore never replace a published attachment.
export async function sealAttachment(attachment) {
  const limit = attachment.size_bytes;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8 * 1048576) fail(400, 'file_invalid', 'Некоректний розмір файлу');
  const response = await fetch(objectUrl(attachment.object_key), { signal: AbortSignal.timeout(20000) });
  if (!response.ok || Number(response.headers.get('content-length')) !== limit || response.headers.get('content-type')?.split(';')[0] !== attachment.mime || !response.body) fail(400, 'file_invalid', 'Не вдалося перевірити файл');
  const chunks = []; let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail(400, 'file_invalid', 'Файл перевищує заявлений розмір'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks, size);
  if (size !== limit || !fileMatches(buffer, attachment.mime)) fail(400, 'file_invalid', 'Вміст файлу не відповідає його типу');
  const finalKey = `forum/published/${attachment.owner_id}/${token(24)}`;
  const saved = await fetch(objectUrl(finalKey, 'PUT', attachment.mime), { method: 'PUT', headers: { 'Content-Type': attachment.mime }, body: buffer, signal: AbortSignal.timeout(20000) });
  if (!saved.ok) fail(503, 'storage_unavailable', 'Не вдалося зберегти перевірений файл');
  return finalKey;
}
