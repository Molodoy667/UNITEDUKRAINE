export type RecordData = Record<string, any>;
let csrf = '';
export function setCsrf(value?: string | null) { csrf = value || ''; }
export async function api(action: string, body?: unknown, signal?: AbortSignal): Promise<RecordData> {
  const response = await fetch(`/api/forum?action=${encodeURIComponent(action)}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Forum-Csrf': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: RecordData;
  try { data = await response.json(); } catch { throw new Error('Сервер повернув некоректну відповідь'); }
  if (!response.ok) throw Object.assign(new Error(data.message || 'Не вдалося виконати запит'), { code: data.error, status: response.status });
  return data;
}
export async function read(action: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<RecordData> {
  const query = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])) });
  const response = await fetch(`/api/forum?${query}`, { credentials: 'same-origin', signal });
  let data: RecordData;
  try { data = await response.json(); } catch { throw new Error('Не вдалося прочитати відповідь форуму'); }
  if (!response.ok) throw Object.assign(new Error(data.message || 'Форум недоступний'), { status: response.status, code: data.error });
  return data;
}
export function href(view = 'home', values: Record<string, string | number> = {}) { return `/forum?${new URLSearchParams({ view, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])) })}`; }
export function date(value?: string | null) { if (!value) return '—'; return new Date(value).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }); }
