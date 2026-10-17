import { fail, id, json, page, text } from './core.js';
import { boardsFor, limited, notify, one, publicUser, requireBoard, requireTopic, requireUser, rows, settings, topicFilter, transaction, userById } from './store.js';
import { imageTypes, newObjectKey, objectUrl, sealAttachment, storageConfigured } from './integrations.js';

export async function conversationAccess(user, conversationId, db) {
  if (!user || !await one('SELECT user_id FROM forum_participants WHERE conversation_id=? AND user_id=?', [conversationId, user.id], db)) fail(404, 'not_found', 'Діалог не знайдено');
}
export async function notifications(ctx, query) {
  const user = requireUser(ctx), paging = page(query);
  // Apply current audience restrictions before both pagination and unread counting.
  const filter = topicFilter(user, await boardsFor(user));
  const from = `FROM forum_notifications n LEFT JOIN forum_topics t ON t.id=n.topic_id
    WHERE n.user_id=? AND (n.topic_id IS NULL OR (t.id IS NOT NULL AND ${filter.sql}))
    AND (n.post_id IS NULL OR EXISTS(SELECT 1 FROM forum_posts p WHERE p.id=n.post_id AND p.topic_id=n.topic_id AND p.deleted_at IS NULL AND (p.approved=1 OR p.author_id=?)))
    AND (n.conversation_id IS NULL OR EXISTS(SELECT 1 FROM forum_participants cp WHERE cp.conversation_id=n.conversation_id AND cp.user_id=?))`;
  const values = [user.id, ...filter.values, user.id, user.id];
  const counts = await one(`SELECT COUNT(*) total,COALESCE(SUM(n.read_at IS NULL),0) unread ${from}`, values);
  return { notifications: await rows(`SELECT n.* ${from} ORDER BY n.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`, values), total: counts.total, unread: Number(counts.unread), ...paging };
}
export async function socialRead(ctx, action, query) {
  if (action === 'profile') {
    const user = await userById(id(query.get('id')));
    if (!user) fail(404, 'not_found', 'Гравця не знайдено');
    const profile = publicUser(user), prefs = json(user.preferences, {});
    const filter=topicFilter(ctx.user,await boardsFor(ctx.user));
    profile.stats=await one(`SELECT COUNT(DISTINCT p.id) posts,COUNT(DISTINCT r.post_id,r.user_id) reactions
      FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id LEFT JOIN forum_reactions r ON r.post_id=p.id
      WHERE p.author_id=? AND p.approved=1 AND p.deleted_at IS NULL AND ${filter.sql}`,[user.id,...filter.values]);
    if (prefs.hideOnline) profile.lastSeenAt = null;
    if (ctx.user?.id === user.id) { profile.penalties = user.penalties; profile.preferences = prefs; }
    return { profile };
  }
  const user = requireUser(ctx);
  if (action === 'notifications') return notifications(ctx, query);
  if (action === 'draft') {
    const key = text(query.get('key'), 'Чернетка', 1, 80), parts = /^(board|topic):(\d+)$/.exec(key);
    if (!parts) fail(400, 'invalid_draft', 'Некоректна чернетка');
    if (parts[1] === 'topic') await requireTopic(user, id(parts[2]));
    else await requireBoard(user, id(parts[2]));
    return { draft: await one('SELECT title,body,updated_at FROM forum_drafts WHERE user_id=? AND draft_key=?', [user.id, key]) };
  }
  if (action === 'conversations') {
    const paging = page(query), total = await one('SELECT COUNT(*) total FROM forum_participants WHERE user_id=?', [user.id]);
    const conversations = await rows(`SELECT c.*,p.last_read_id,(SELECT COUNT(*) FROM forum_messages m WHERE m.conversation_id=c.id AND m.id>p.last_read_id AND m.author_id<>?) unread,
      (SELECT GROUP_CONCAT(u.username SEPARATOR ', ') FROM forum_participants cp JOIN forum_users u ON u.id=cp.user_id WHERE cp.conversation_id=c.id) participants
      FROM forum_conversations c JOIN forum_participants p ON p.conversation_id=c.id WHERE p.user_id=? ORDER BY c.updated_at DESC,c.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`, [user.id, user.id]);
    return { conversations, total: total.total, ...paging };
  }
  if (action === 'conversation') {
    const conversationId = id(query.get('id')), paging = page(query); await conversationAccess(user, conversationId);
    return { conversation: await one('SELECT * FROM forum_conversations WHERE id=?', [conversationId]), participants: await rows('SELECT u.id,u.username FROM forum_users u JOIN forum_participants p ON p.user_id=u.id WHERE p.conversation_id=?', [conversationId]),
      messages: await rows(`SELECT m.*,u.username FROM forum_messages m JOIN forum_users u ON u.id=m.author_id WHERE m.conversation_id=? ORDER BY m.id LIMIT ${paging.size} OFFSET ${paging.offset}`, [conversationId]),
      total: (await one('SELECT COUNT(*) total FROM forum_messages WHERE conversation_id=?', [conversationId])).total, ...paging };
  }
  if (action === 'blocks') return { blocks: await rows('SELECT u.id,u.username FROM forum_blocks b JOIN forum_users u ON u.id=b.blocked_id WHERE b.user_id=?', [user.id]) };
  fail(404, 'not_found', 'Операцію не знайдено');
}
export async function attachmentRead(ctx, query) {
  const attachment = await one('SELECT * FROM forum_attachments WHERE id=? AND ready=1', [id(query.get('id'))]);
  if (!attachment) fail(404, 'not_found', 'Файл не знайдено');
  if (attachment.post_id) {
    const post = await one('SELECT * FROM forum_posts WHERE id=? AND deleted_at IS NULL', [attachment.post_id]);
    if (!post || (!post.approved && post.author_id !== ctx.user?.id)) fail(404, 'not_found', 'Файл не знайдено');
    await requireTopic(ctx.user, post.topic_id);
  } else if (attachment.conversation_id) await conversationAccess(ctx.user, attachment.conversation_id);
  else if (['avatar','cover'].includes(attachment.purpose)) {
    const profile = await one('SELECT id FROM forum_users WHERE avatar_id=? OR cover_id=?', [attachment.id, attachment.id]);
    if (!profile && ctx.user?.id !== attachment.owner_id) fail(404, 'not_found', 'Файл не знайдено');
  } else if (ctx.user?.id !== attachment.owner_id) fail(404, 'not_found', 'Файл не знайдено');
  return { url: objectUrl(attachment.object_key), filename: attachment.filename, mime: attachment.mime };
}
export async function socialAction(ctx, action, body) {
  const user = requireUser(ctx, !['notification.read','conversation.read','profile.save','block.toggle'].includes(action));
  if (action === 'profile.save') {
    const prefs = {};
    for (const key of ['reply','mention','message','moderation','hideOnline','allowMessages','emailNotifications']) if (typeof body.preferences?.[key] === 'boolean') prefs[key] = body.preferences[key];
    const media = {};
    for (const purpose of ['avatar','cover']) {
      const attachmentId = body[`${purpose}Id`] ? id(body[`${purpose}Id`]) : null;
      if (attachmentId && !await one('SELECT id FROM forum_attachments WHERE id=? AND owner_id=? AND purpose=? AND ready=1', [attachmentId, user.id, purpose])) fail(400, 'invalid_attachment', 'Некоректне зображення профілю');
      media[purpose] = attachmentId;
    }
    await rows('UPDATE forum_users SET bio=?,signature=?,preferences=?,avatar_id=?,cover_id=? WHERE id=?', [text(body.bio || '', 'Про себе', 0, 1000), text(body.signature || '', 'Підпис', 0, 300), JSON.stringify(prefs), media.avatar, media.cover, user.id]);
    return { user: publicUser(await userById(user.id), true) };
  }
  if (action === 'notification.read') {
    if (body.id) await rows('UPDATE forum_notifications SET read_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?', [id(body.id), user.id]);
    else await rows('UPDATE forum_notifications SET read_at=UTC_TIMESTAMP() WHERE user_id=? AND read_at IS NULL', [user.id]);
    return { ok: true };
  }
  if (action === 'block.toggle') {
    const targetId = id(body.userId); if (targetId === user.id) fail(400, 'invalid_target', 'Не можна заблокувати себе');
    if (body.blocked) await rows('INSERT IGNORE INTO forum_blocks(user_id,blocked_id) VALUES(?,?)', [user.id, targetId]);
    else await rows('DELETE FROM forum_blocks WHERE user_id=? AND blocked_id=?', [user.id, targetId]);
    return { ok: true };
  }
  if (action === 'conversation.create' || action === 'message.create') {
    await limited(ctx, `messages:${user.id}`, 12, 600);
    const content = text(body.body, 'Повідомлення', 1, 10000);
    if (action === 'conversation.create' && Date.now() - new Date(user.created_at).getTime() < 3600000 && user.rank < 40) fail(403, 'account_too_new', 'Нові акаунти можуть писати приватно через годину після реєстрації');
    return transaction(async db => {
      let conversationId, recipients;
      if (action === 'conversation.create') {
        const target = await one('SELECT id,preferences FROM forum_users WHERE username=?', [text(body.recipient, 'Одержувач', 3, 32)], db);
        if (!target || target.id === user.id || json(target.preferences, {}).allowMessages === false) fail(400, 'recipient_unavailable', 'Одержувач недоступний');
        recipients = [user.id, target.id];
        if (await one('SELECT user_id FROM forum_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)', [target.id, user.id, user.id, target.id], db)) fail(403, 'blocked', 'Приватне спілкування недоступне');
        const result = await rows('INSERT INTO forum_conversations(title) VALUES(?)', [text(body.title, 'Тема діалогу', 2, 120)], db); conversationId = result.insertId;
        for (const recipientId of recipients) await rows('INSERT INTO forum_participants(conversation_id,user_id) VALUES(?,?)', [conversationId, recipientId], db);
      } else {
        conversationId = id(body.conversationId); await conversationAccess(user, conversationId, db);
        recipients = (await rows('SELECT user_id FROM forum_participants WHERE conversation_id=?', [conversationId], db)).map(row => row.user_id);
        for (const recipientId of recipients.filter(value => value !== user.id)) if (await one('SELECT user_id FROM forum_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)', [recipientId, user.id, user.id, recipientId], db)) fail(403, 'blocked', 'Приватне спілкування недоступне');
      }
      await rows('INSERT INTO forum_messages(conversation_id,author_id,body) VALUES(?,?,?)', [conversationId, user.id, content], db);
      await rows('UPDATE forum_conversations SET updated_at=UTC_TIMESTAMP() WHERE id=?', [conversationId], db);
      for (const recipientId of recipients) await notify(recipientId, user.id, 'message', `Нове приватне повідомлення від ${user.username}`, { conversationId }, db);
      return { conversationId };
    });
  }
  if (action === 'conversation.read') {
    const conversationId = id(body.conversationId); await conversationAccess(user, conversationId);
    const messageId = id(body.messageId);
    if (!await one('SELECT id FROM forum_messages WHERE id=? AND conversation_id=?', [messageId, conversationId])) fail(404, 'not_found', 'Повідомлення не знайдено');
    await rows('UPDATE forum_participants SET last_read_id=GREATEST(last_read_id,?) WHERE conversation_id=? AND user_id=?', [messageId, conversationId, user.id]); return { ok: true };
  }
  if (action === 'attachment.prepare') {
    await limited(ctx, `upload:${user.id}`, 20, 3600);
    if (!storageConfigured()) fail(503, 'storage_unconfigured', 'Завантаження файлів ще не налаштоване');
    const mime = text(body.mime, 'Тип файлу', 3, 80), purpose = body.purpose || 'post', size = Number(body.size);
    if (![...imageTypes, 'application/pdf'].includes(mime) || !['post','avatar','cover'].includes(purpose) || (purpose !== 'post' && !imageTypes.includes(mime))) fail(400, 'unsupported_file', 'Дозволені PNG, JPEG, WEBP, GIF та PDF');
    const config = await settings();
    if (!Number.isSafeInteger(size) || size < 1 || size > Math.min(8, config.maxAttachmentMB) * 1048576) fail(400, 'file_too_large', 'Файл перевищує дозволений розмір');
    const filename = text(body.filename, 'Назва файлу', 1, 150).replace(/[\r\n"\\/]/g, '_'), key = newObjectKey(user.id);
    const result = await rows('INSERT INTO forum_attachments(owner_id,object_key,filename,mime,size_bytes,purpose) VALUES(?,?,?,?,?,?)', [user.id, key, filename, mime, size, purpose]);
    return { attachmentId: result.insertId, url: objectUrl(key, 'PUT', mime) };
  }
  if (action === 'attachment.complete') {
    await limited(ctx, `complete:${user.id}`, 25, 3600);
    return transaction(async db => {
      const attachment = await one('SELECT * FROM forum_attachments WHERE id=? AND owner_id=? FOR UPDATE', [id(body.attachmentId), user.id], db);
      if (!attachment) fail(404, 'not_found', 'Файл не знайдено');
      if (!attachment.ready) {
        const key = await sealAttachment(attachment);
        await rows('UPDATE forum_attachments SET ready=1,object_key=? WHERE id=?', [key, attachment.id], db);
      }
      return { attachment: { id: attachment.id, filename: attachment.filename, mime: attachment.mime, size_bytes: attachment.size_bytes } };
    });
  }
  if (action === 'report.create') {
    await limited(ctx, `report:${user.id}`, 6, 3600);
    let postId = null, targetId = null, messageId = null;
    if (body.postId) { postId = id(body.postId); const post = await one('SELECT * FROM forum_posts WHERE id=? AND approved=1 AND deleted_at IS NULL', [postId]); if (!post) fail(404, 'not_found', 'Повідомлення не знайдено'); await requireTopic(user, post.topic_id); }
    else if (body.messageId) { messageId = id(body.messageId); const message = await one('SELECT * FROM forum_messages WHERE id=?', [messageId]); if (!message) fail(404, 'not_found', 'Повідомлення не знайдено'); await conversationAccess(user, message.conversation_id); }
    else targetId = id(body.userId);
    await rows('INSERT INTO forum_reports(reporter_id,post_id,user_id,message_id,reason) VALUES(?,?,?,?,?)', [user.id, postId, targetId, messageId, text(body.reason, 'Причина скарги', 5, 1000)]); return { message: 'Скаргу надіслано модераторам' };
  }
  fail(404, 'not_found', 'Операцію не знайдено');
}
