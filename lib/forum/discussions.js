import { fail, id, json, mayModerate, page, text, topicAllowed } from './core.js';
import { audit, boardsFor, limited, notify, one, requireBoard, requireTopic, requireUser, rows, settings, topicFilter, transaction, userById } from './store.js';

export async function listTopics(ctx, query, extra = {}) {
  const boards = await boardsFor(ctx.user), filter = topicFilter(ctx.user, boards), paging = page(query);
  const where = [filter.sql], values = [...filter.values];
  if (query.get('board')) { await requireBoard(ctx.user, id(query.get('board'))); where.push('t.board_id=?'); values.push(id(query.get('board'))); }
  if (extra.authorId) { where.push('t.author_id=?'); values.push(extra.authorId); }
  const scope = query.get('scope');
  if (['mine','bookmarks','unread','subscriptions'].includes(scope)) requireUser(ctx);
  if (scope === 'mine') { where.push('t.author_id=?'); values.push(ctx.user.id); }
  if (scope === 'bookmarks') where.push('s.bookmarked=1');
  if (scope === 'subscriptions') where.push('s.subscribed=1');
  if (scope === 'unread') where.push('EXISTS(SELECT 1 FROM forum_posts rp WHERE rp.topic_id=t.id AND rp.approved=1 AND rp.deleted_at IS NULL AND rp.id>COALESCE(s.last_read_post_id,0))');
  if (query.get('prefix')) { where.push('t.prefix=?'); values.push(text(query.get('prefix'), 'Префікс', 1, 40)); }
  if (query.get('author')) { where.push('u.username=?'); values.push(text(query.get('author'), 'Автор', 1, 32)); }
  for (const [key, comparator] of [['after','>='],['before','<=']]) if (query.get(key)) {
    const value = query.get(key); if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'invalid_date', 'Некоректна дата');
    where.push(`t.created_at${comparator}?`); values.push(`${value} ${key === 'before' ? '23:59:59' : '00:00:00'}`);
  }
  if (query.get('q')) {
    const search = text(query.get('q'), 'Пошук', 2, 100).replace(/[!%_\\]/g, char => `!${char}`);
    where.push("(t.title LIKE ? ESCAPE '!' OR EXISTS(SELECT 1 FROM forum_posts sp WHERE sp.topic_id=t.id AND sp.approved=1 AND sp.deleted_at IS NULL AND sp.body LIKE ? ESCAPE '!'))"); values.push(`%${search}%`, `%${search}%`);
  }
  const sql = where.join(' AND '), joins = 'JOIN forum_users u ON u.id=t.author_id JOIN forum_boards b ON b.id=t.board_id LEFT JOIN forum_subscriptions s ON s.topic_id=t.id AND s.user_id=?';
  const count = await one(`SELECT COUNT(*) total FROM forum_topics t ${joins} WHERE ${sql}`, [ctx.user?.id || 0, ...values]);
  const topics = await rows(`SELECT t.*,u.username,b.title board_title,COALESCE(s.bookmarked,0) bookmarked,COALESCE(s.subscribed,0) subscribed,COALESCE(s.last_read_post_id,0) last_read_post_id,
    (SELECT COUNT(*) FROM forum_posts p WHERE p.topic_id=t.id AND p.approved=1 AND p.deleted_at IS NULL) post_count,
    (SELECT MAX(p.id) FROM forum_posts p WHERE p.topic_id=t.id AND p.approved=1 AND p.deleted_at IS NULL) last_post_id
    FROM forum_topics t ${joins} WHERE ${sql} ORDER BY t.pinned DESC,t.updated_at DESC,t.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`, [ctx.user?.id || 0, ...values]);
  return { topics, total: count.total, ...paging };
}
export async function listPosts(ctx, query) {
  const filter=topicFilter(ctx.user,await boardsFor(ctx.user)),paging=page(query),authorId=id(query.get('authorId'));
  const from=`FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id JOIN forum_users u ON u.id=p.author_id WHERE p.author_id=? AND p.approved=1 AND p.deleted_at IS NULL AND ${filter.sql}`;
  const params=[authorId,...filter.values];
  return {posts:await rows(`SELECT p.id,p.topic_id,p.created_at,LEFT(p.body,1000) excerpt,t.title,u.username ${from} ORDER BY p.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`,params),total:(await one(`SELECT COUNT(*) total ${from}`,params)).total,...paging};
}
export async function topicDetail(ctx, query) {
  const topicId = id(query.get('id')), { topic, board } = await requireTopic(ctx.user, topicId), paging = page(query), mod = mayModerate(ctx.user, board);
  const showDeleted = mod && query.get('deleted') === '1';
  const condition = `p.topic_id=? ${showDeleted ? '' : 'AND p.deleted_at IS NULL'} AND (p.approved=1 OR p.author_id=? OR ?=1)`;
  const params = [topicId, ctx.user?.id || 0, mod ? 1 : 0], total = (await one(`SELECT COUNT(*) total FROM forum_posts p WHERE ${condition}`, params)).total;
  let offset = paging.offset, currentPage = paging.page;
  if (query.get('post') || query.get('firstUnread') === '1') {
    let target = query.get('post') ? id(query.get('post')) : 0;
    if (!target && ctx.user) {
      const subscription = await one('SELECT last_read_post_id FROM forum_subscriptions WHERE user_id=? AND topic_id=?', [ctx.user.id, topicId]);
      const first = await one(`SELECT MIN(p.id) id FROM forum_posts p WHERE ${condition} AND p.id>?`, [...params, subscription?.last_read_post_id || 0]); target = first?.id || 0;
    }
    if (target) {
      if (!await one(`SELECT p.id FROM forum_posts p WHERE ${condition} AND p.id=?`, [...params, target])) fail(404, 'not_found', 'Повідомлення не знайдено');
      const count = await one(`SELECT COUNT(*) total FROM forum_posts p WHERE ${condition} AND p.id<?`, [...params, target]); currentPage = Math.floor(count.total / paging.size) + 1; offset = (currentPage - 1) * paging.size;
    }
  }
  const posts = await rows(`SELECT p.*,u.username,u.avatar_id,u.signature,r.name role_name,r.color role_color,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('name',ft.name,'color',ft.color)) FROM forum_user_tags ut JOIN forum_tags ft ON ft.id=ut.tag_id WHERE ut.user_id=u.id) tags
    FROM forum_posts p JOIN forum_users u ON u.id=p.author_id JOIN forum_roles r ON r.id=u.role_id WHERE ${condition} ORDER BY p.id LIMIT ${paging.size} OFFSET ${offset}`, params);
  for (const post of posts) {
    post.tags = json(post.tags, []);
    post.reactions = await rows('SELECT reaction,COUNT(*) count,MAX(user_id=?) mine FROM forum_reactions WHERE post_id=? GROUP BY reaction', [ctx.user?.id || 0, post.id]);
    post.attachments = await rows('SELECT id,filename,mime,size_bytes FROM forum_attachments WHERE post_id=? AND ready=1', [post.id]);
  }
  const poll = await one('SELECT * FROM forum_polls WHERE topic_id=?', [topicId]);
  if (poll) { poll.options = json(poll.options, []); poll.votes = await rows('SELECT choice,COUNT(*) count FROM forum_votes WHERE poll_id=? GROUP BY choice', [poll.id]); poll.mine = ctx.user ? (await one('SELECT choice FROM forum_votes WHERE poll_id=? AND user_id=?', [poll.id, ctx.user.id]))?.choice ?? null : null; }
  const subscription = ctx.user ? await one('SELECT * FROM forum_subscriptions WHERE topic_id=? AND user_id=?', [topicId, ctx.user.id]) : null;
  return { topic: { ...topic, form_data: json(topic.form_data, {}) }, board, posts, poll, subscription, canModerate: mod, canReply: topicAllowed(ctx.user, topic, board, 'reply'), total, page: currentPage, size: paging.size };
}
export async function attachToPost(user, attachmentIds, postId, db) {
  if (!attachmentIds?.length) return;
  if (!Array.isArray(attachmentIds) || attachmentIds.length > 8) fail(400, 'invalid_attachments', 'Максимум 8 вкладень');
  for (const attachmentId of new Set(attachmentIds.map(id))) {
    const result = await rows("UPDATE forum_attachments SET post_id=? WHERE id=? AND owner_id=? AND ready=1 AND purpose='post' AND post_id IS NULL AND conversation_id IS NULL", [postId, attachmentId, user.id], db);
    if (!result.affectedRows) fail(400, 'invalid_attachment', 'Вкладення недоступне');
  }
}
export async function postNotifications(user, topic, postId, body, db) {
  const board = await requireBoard(user, topic.board_id, db), candidates = new Set();
  const subscribers = await rows('SELECT user_id FROM forum_subscriptions WHERE topic_id=? AND subscribed=1', [topic.id], db);
  subscribers.forEach(row => candidates.add(row.user_id)); candidates.add(topic.author_id);
  const mentions = [...new Set([...body.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]{3,32})/gu)].map(match => match[1]))].slice(0, 20);
  const mentioned = mentions.length ? await rows(`SELECT id FROM forum_users WHERE username IN (${mentions.map(() => '?').join(',')})`, mentions, db) : [];
  mentioned.forEach(row => candidates.add(row.id));
  for (const userId of candidates) {
    const recipient = await userById(userId, db);
    if (recipient && (await boardsFor(recipient, db)).some(item => item.id === board.id) && topicAllowed(recipient, topic, board)) {
      const kind = mentioned.some(row => row.id === userId) ? 'mention' : 'reply';
      await notify(userId, user.id, kind, `${user.username}: ${topic.title}`, { topicId: topic.id, postId }, db);
    }
  }
}
export async function discussionAction(ctx, action, body) {
  const user = requireUser(ctx, true);
  if (action === 'topic.create') {
    await limited(ctx, `topic:${user.id}`, 6, 600);
    const boardId = id(body.boardId), title = text(body.title, 'Заголовок', 4, 160), content = text(body.body, 'Повідомлення', 2, 30000), board = await requireBoard(user, boardId), config = await settings();
    if (!board.canCreate) fail(403, 'forbidden', 'Створення тем у цьому розділі недоступне');
    const prefix = text(body.prefix || '', 'Префікс', 0, 40);
    if (prefix && !config.prefixes.includes(prefix)) fail(400, 'invalid_prefix', 'Невідомий префікс');
    const form = {};
    for (const field of board.form_fields) form[field.key] = text(body.formData?.[field.key] || '', field.label, field.required ? 1 : 0, 1000);
    const privateTopic = Boolean(board.access.privateRequired || body.private || board.access.privateDefault), approved = !board.require_approval || mayModerate(user, board);
    return transaction(async db => {
      const result = await rows('INSERT INTO forum_topics(board_id,author_id,title,prefix,private_topic,approved,form_data) VALUES(?,?,?,?,?,?,?)', [boardId, user.id, title, prefix, privateTopic, approved, JSON.stringify(form)], db), topicId = result.insertId;
      const post = await rows('INSERT INTO forum_posts(topic_id,author_id,body,approved) VALUES(?,?,?,?)', [topicId, user.id, content, approved], db);
      await attachToPost(user, body.attachments, post.insertId, db);
      await rows('INSERT INTO forum_subscriptions(topic_id,user_id) VALUES(?,?)', [topicId, user.id], db);
      if (body.poll?.question) {
        const question = text(body.poll.question, 'Питання опитування', 4, 200);
        if (!Array.isArray(body.poll.options) || body.poll.options.length < 2 || body.poll.options.length > 10) fail(400, 'invalid_poll', 'Від 2 до 10 варіантів відповіді');
        const options = body.poll.options.map(value => text(value, 'Варіант', 1, 100));
        if (new Set(options).size !== options.length) fail(400, 'invalid_poll', 'Варіанти не мають повторюватися');
        const closes = body.poll.closesAt ? new Date(body.poll.closesAt) : null;
        if (closes && (!Number.isFinite(closes.getTime()) || closes < new Date() || closes > new Date(Date.now() + 365 * 86400000))) fail(400, 'invalid_poll', 'Некоректний термін опитування');
        await rows('INSERT INTO forum_polls(topic_id,question,options,closes_at) VALUES(?,?,?,?)', [topicId, question, JSON.stringify(options), closes], db);
      }
      await rows('DELETE FROM forum_drafts WHERE user_id=? AND draft_key=?', [user.id, `board:${boardId}`], db);
      await audit(ctx, 'topic_created', 'topic', topicId, { approved }, db);
      return { topicId, postId: post.insertId, approved };
    });
  }
  if (action === 'post.create') {
    await limited(ctx, `post:${user.id}`, 15, 300);
    const topicId = id(body.topicId), content = text(body.body, 'Повідомлення', 2, 30000);
    return transaction(async db => {
      const { topic, board } = await requireTopic(user, topicId, db, true);
      if (!topicAllowed(user, topic, board, 'reply') || topic.deleted_at) fail(403, 'topic_closed', 'Відповіді у цій темі недоступні');
      const approved = !board.require_approval || mayModerate(user, board);
      const post = await rows('INSERT INTO forum_posts(topic_id,author_id,body,approved) VALUES(?,?,?,?)', [topicId, user.id, content, approved], db);
      await attachToPost(user, body.attachments, post.insertId, db);
      if (approved) {
        await rows('UPDATE forum_topics SET updated_at=UTC_TIMESTAMP() WHERE id=?', [topicId], db);
        await postNotifications(user, topic, post.insertId, content, db);
      }
      await rows('DELETE FROM forum_drafts WHERE user_id=? AND draft_key=?', [user.id, `topic:${topicId}`], db);
      return { topicId, postId: post.insertId, approved };
    });
  }
  if (action === 'post.edit') {
    await limited(ctx, `edit:${user.id}`, 20, 300);
    const content = text(body.body, 'Повідомлення', 2, 30000), config = await settings();
    return transaction(async db => {
      const post = await one('SELECT * FROM forum_posts WHERE id=? FOR UPDATE', [id(body.postId)], db);
      if (!post) fail(404, 'not_found', 'Повідомлення не знайдено');
      const { topic, board } = await requireTopic(user, post.topic_id, db), mod = mayModerate(user, board);
      if (post.deleted_at || (!mod && (post.author_id !== user.id || !topicAllowed(user, topic, board, 'reply') || Date.now() - new Date(post.created_at).getTime() > config.editMinutes * 60000))) fail(403, 'edit_forbidden', 'Редагування недоступне');
      await rows('INSERT INTO forum_revisions(post_id,editor_id,body,reason) VALUES(?,?,?,?)', [post.id, user.id, post.body, text(body.reason || '', 'Причина', 0, 300)], db);
      const needsApproval = Boolean(board.require_approval && !mod);
      await rows('UPDATE forum_posts SET body=?,edited_at=UTC_TIMESTAMP(),approved=? WHERE id=?', [content, !needsApproval, post.id], db);
      if (needsApproval) {
        const first=await one('SELECT MIN(id) id FROM forum_posts WHERE topic_id=?',[topic.id],db);
        if(first.id===post.id) await rows('UPDATE forum_topics SET approved=0 WHERE id=?',[topic.id],db);
      }
      await audit(ctx, 'post_edited', 'post', post.id, { reason: body.reason || '' }, db);
      return { ok: true, approved: !needsApproval };
    });
  }
  if (action === 'reaction.toggle') {
    await limited(ctx, `reaction:${user.id}`, 50, 60);
    const post = await one('SELECT * FROM forum_posts WHERE id=? AND approved=1 AND deleted_at IS NULL', [id(body.postId)]);
    if (!post) fail(404, 'not_found', 'Повідомлення не знайдено');
    const { topic } = await requireTopic(user, post.topic_id);
    if (!['like','thanks','heart'].includes(body.reaction) || post.author_id === user.id) fail(400, 'invalid_reaction', 'Реакція недоступна');
    return transaction(async db => {
      const existing = await one('SELECT reaction FROM forum_reactions WHERE post_id=? AND user_id=? FOR UPDATE', [post.id, user.id], db);
      if (existing?.reaction === body.reaction) await rows('DELETE FROM forum_reactions WHERE post_id=? AND user_id=?', [post.id, user.id], db);
      else await rows('INSERT INTO forum_reactions(post_id,user_id,reaction) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reaction=VALUES(reaction)', [post.id, user.id, body.reaction], db);
      return { ok: true, topicId: topic.id };
    });
  }
  if (action === 'topic.follow' || action === 'topic.read') {
    const { topic } = await requireTopic(user, id(body.topicId));
    if (action === 'topic.read') {
      const post = await one('SELECT id FROM forum_posts WHERE id=? AND topic_id=? AND deleted_at IS NULL AND (approved=1 OR author_id=?)', [id(body.postId), topic.id, user.id]);
      if (!post) fail(404, 'not_found', 'Повідомлення не знайдено');
      await rows('INSERT INTO forum_subscriptions(topic_id,user_id,subscribed,last_read_post_id) VALUES(?,?,0,?) ON DUPLICATE KEY UPDATE last_read_post_id=GREATEST(last_read_post_id,VALUES(last_read_post_id))', [topic.id, user.id, post.id]);
    } else await rows('INSERT INTO forum_subscriptions(topic_id,user_id,bookmarked,subscribed) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE bookmarked=VALUES(bookmarked),subscribed=VALUES(subscribed)', [topic.id, user.id, Boolean(body.bookmarked), Boolean(body.subscribed)]);
    return { ok: true };
  }
  if (action === 'poll.vote') return transaction(async db => {
    const poll = await one('SELECT * FROM forum_polls WHERE id=? FOR UPDATE', [id(body.pollId)], db);
    if (!poll) fail(404, 'not_found', 'Опитування не знайдено');
    const { topic, board } = await requireTopic(user, poll.topic_id, db);
    const choice = Number(body.choice), options = json(poll.options, []);
    if (!topicAllowed(user, topic, board, 'reply') || (poll.closes_at && new Date(poll.closes_at) <= new Date()) || !Number.isInteger(choice) || choice < 0 || choice >= options.length) fail(400, 'poll_closed', 'Голосування недоступне');
    await rows('INSERT INTO forum_votes(poll_id,user_id,choice) VALUES(?,?,?) ON DUPLICATE KEY UPDATE choice=VALUES(choice)', [poll.id, user.id, choice], db); return { ok: true };
  });
  if (action === 'draft.save') {
    const key = text(body.key, 'Чернетка', 1, 80);
    if (!/^(board|topic):\d+$/.test(key)) fail(400, 'invalid_draft', 'Некоректна чернетка');
    const [kind, value] = key.split(':');
    if (kind === 'topic') await requireTopic(user, id(value)); else await requireBoard(user, id(value));
    await rows('INSERT INTO forum_drafts(user_id,draft_key,title,body) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),updated_at=UTC_TIMESTAMP()', [user.id, key, text(body.title || '', 'Заголовок', 0, 160), text(body.body || '', 'Чернетка', 0, 30000)]);
    return { ok: true };
  }
  fail(404, 'not_found', 'Операцію не знайдено');
}
