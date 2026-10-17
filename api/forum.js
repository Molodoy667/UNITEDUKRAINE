import { context, authAction, checkOrigin, requireCsrf } from '../lib/forum/auth.js';
import { ForumError, has, id, page, text } from '../lib/forum/core.js';
import { adminAction, adminRead } from '../lib/forum/admin.js';
import { discussionAction, listPosts, listTopics, topicDetail } from '../lib/forum/discussions.js';
import { attachmentRead, socialAction, socialRead } from '../lib/forum/social.js';
import { boardsFor, limited, one, publicUser, requireBoard, requireUser, rows, settings, topicFilter } from '../lib/forum/store.js';
import { mailConfigured, storageConfigured } from '../lib/forum/integrations.js';

const reads = new Set(['bootstrap','boards','topics','topic','posts','profile','members','notifications','draft','conversations','conversation','blocks','attachment','moderation','revisions','admin','admin.users','admin.user','admin.audit']);
const authWrites = new Set(['auth.register','auth.login','auth.logout','auth.recover','auth.confirm','auth.resend','auth.password','auth.email','auth.sessions','auth.revoke','auth.totp.prepare','auth.totp.enable','auth.totp.disable']);
const discussionWrites = new Set(['topic.create','post.create','post.edit','reaction.toggle','topic.follow','topic.read','poll.vote','draft.save']);
const adminWrites = new Set(['topic.moderate','post.moderate','topic.merge','topic.split','report.resolve','penalty.create','penalty.revoke','note.create','admin.board','admin.moderator','admin.role','admin.userRoles','admin.tag','admin.userTags','admin.settings']);
const socialWrites = new Set(['profile.save','notification.read','block.toggle','conversation.create','message.create','conversation.read','attachment.prepare','attachment.complete','report.create']);

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Vary', 'Cookie');
  try {
    if (!['GET','POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST'); throw new ForumError(405, 'method_not_allowed', 'Метод не підтримується'); }
    const query = new URL(request.url, 'http://forum.local').searchParams, action = query.get('action') || 'bootstrap';
    if (request.method === 'GET' ? !reads.has(action) : ![...authWrites, ...discussionWrites, ...adminWrites, ...socialWrites].includes(action)) throw new ForumError(404, 'not_found', 'Операцію не знайдено');
    if (request.method === 'POST') checkOrigin(request);
    const ctx = await context(request, response);
    await limited(ctx, 'requests', 240, 60);
    let result;
    if (request.method === 'POST') {
      requireCsrf(ctx);
      const raw = request.body;
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 100000) throw new ForumError(400, 'invalid_body', 'Некоректний або завеликий запит');
      if (authWrites.has(action)) result = await authAction(ctx, action, body);
      else if (discussionWrites.has(action)) result = await discussionAction(ctx, action, body);
      else if (adminWrites.has(action)) result = await adminAction(ctx, action, body);
      else result = await socialAction(ctx, action, body);
    } else if (action === 'bootstrap') {
      const config = await settings(), boards = await boardsFor(ctx.user), filter = topicFilter(ctx.user, boards);
      result = { user: ctx.user ? publicUser(ctx.user, true) : null, csrf: ctx.session?.csrf || null, boards, settings: config,
        capabilities: { email: mailConfigured(), attachments: storageConfigured(), gameLink: false },
        stats: { users: (await one('SELECT COUNT(*) total FROM forum_users WHERE email_verified=1')).total, topics: (await one(`SELECT COUNT(*) total FROM forum_topics t WHERE ${filter.sql}`, filter.values)).total } };
    } else if (action === 'boards') result = { boards: await boardsFor(ctx.user) };
    else if (action === 'topics') result = await listTopics(ctx, query);
    else if (action === 'posts') result = await listPosts(ctx, query);
    else if (action === 'topic') result = await topicDetail(ctx, query);
    else if (action === 'members') {
      const paging = page(query), search = `%${text(query.get('q') || '', 'Пошук', 0, 32).replace(/[!%_\\]/g, char => `!${char}`)}%`;
      const members = await rows(`SELECT u.id,u.username,u.avatar_id,u.created_at,r.name role_name,r.color role_color,IF(JSON_EXTRACT(u.preferences,'$.hideOnline')=TRUE,NULL,u.last_seen_at) last_seen_at FROM forum_users u JOIN forum_roles r ON r.id=u.role_id WHERE u.email_verified=1 AND u.username LIKE ? ESCAPE '!' ORDER BY u.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`, [search]);
      result = { members, total: (await one("SELECT COUNT(*) total FROM forum_users WHERE email_verified=1 AND username LIKE ? ESCAPE '!'", [search])).total, ...paging };
    } else if (action === 'attachment') result = await attachmentRead(ctx, query);
    else if (action.startsWith('admin') || ['moderation','revisions'].includes(action)) result = await adminRead(ctx, action, query);
    else result = await socialRead(ctx, action, query);
    return response.status(200).json(result);
  } catch (error) {
    if (error instanceof ForumError) return response.status(error.status).json({ error: error.code, message: error.message });
    if (error instanceof SyntaxError) return response.status(400).json({ error: 'invalid_json', message: 'Некоректний JSON' });
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'already_exists', message: 'Такі дані вже використовуються' });
    if (['ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2'].includes(error.code)) return response.status(400).json({ error: 'invalid_reference', message: 'Пов’язаний запис недоступний. Оновіть сторінку та повторіть дію.' });
    const databaseCodes = ['ER_NO_SUCH_TABLE','DB_CONFIG_MISSING','ER_ACCESS_DENIED_ERROR','ECONNREFUSED','ETIMEDOUT','ENOTFOUND'];
    console.error('Forum request failed', error.code || error.name);
    return response.status(503).json({ error: databaseCodes.includes(error.code) ? 'forum_unavailable' : 'request_failed', message: 'Форум тимчасово недоступний. Спробуйте пізніше.' });
  }
}
