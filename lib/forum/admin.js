import { color, fail, has, higher, id, json, mayModerate, needsTwoFactor, page, permissions, text, validateAccess } from './core.js';
import { audit, boardsFor, notify, one, requireBoard, requirePermission, requireTopic, requireUser, rows, settings, topicFilter, transaction, userById } from './store.js';
import { boardIcons } from './defaults.js';
import { postNotifications } from './discussions.js';

function staffGate(ctx) {
  const user = requireUser(ctx, true);
  if (!has(user, 'moderate') && !has(user, 'reports') && !has(user, 'manage') && !user.moderated.length) fail(403, 'forbidden', 'Недостатньо прав');
  if (needsTwoFactor(user) && !user.totp_secret) fail(403, 'two_factor_required', 'Увімкніть 2FA в налаштуваннях');
  return user;
}
async function reportedItem(ctx, report, db) {
  if (report.post_id) {
    const post = await one('SELECT * FROM forum_posts WHERE id=?', [report.post_id], db);
    if (!post) return null;
    const { topic, board } = await requireTopic(ctx.user, post.topic_id, db);
    if (!mayModerate(ctx.user, board)) fail(404, 'not_found', 'Скаргу не знайдено');
    return { post, topic };
  }
  if (!has(ctx.user, 'moderate') && !has(ctx.user, 'manage')) fail(404, 'not_found', 'Скаргу не знайдено');
  if (report.message_id) return { reportedMessage: await one('SELECT m.id,m.author_id,m.body,m.created_at,u.username FROM forum_messages m JOIN forum_users u ON u.id=m.author_id WHERE m.id=?', [report.message_id], db) };
  return { user: await one('SELECT id,username FROM forum_users WHERE id=?', [report.user_id], db) };
}
export async function adminRead(ctx, action, query) {
  if (action === 'revisions') {
    const user = requireUser(ctx), post = await one('SELECT * FROM forum_posts WHERE id=?', [id(query.get('postId'))]);
    if (!post) fail(404, 'not_found', 'Повідомлення не знайдено');
    const { board } = await requireTopic(user, post.topic_id);
    if (!mayModerate(user, board) && post.author_id !== user.id) fail(403, 'forbidden', 'Історія недоступна');
    return { revisions: await rows('SELECT r.*,u.username editor FROM forum_revisions r JOIN forum_users u ON u.id=r.editor_id WHERE r.post_id=? ORDER BY r.id DESC LIMIT 100', [post.id]) };
  }
  const user = staffGate(ctx), paging = page(query);
  if (action === 'moderation') {
    const boards = (await boardsFor(user)).filter(board => mayModerate(user, board));
    const filter = topicFilter(user, boards);
    const topicWhere=`${filter.sql} AND (t.approved=0 OR t.deleted_at IS NOT NULL)`;
    const postWhere=`${filter.sql} AND (p.approved=0 OR p.deleted_at IS NOT NULL)`;
    const suffix=`LIMIT ${paging.size} OFFSET ${paging.offset}`;
    const topics = await rows(`SELECT t.*,u.username,b.title board_title FROM forum_topics t JOIN forum_users u ON u.id=t.author_id JOIN forum_boards b ON b.id=t.board_id WHERE ${topicWhere} ORDER BY t.id DESC ${suffix}`, filter.values);
    const posts = await rows(`SELECT p.*,u.username,t.title FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id JOIN forum_users u ON u.id=p.author_id WHERE ${postWhere} ORDER BY p.id DESC ${suffix}`, filter.values);
    const reportFrom=`FROM forum_reports r JOIN forum_users u ON u.id=r.reporter_id LEFT JOIN forum_posts rp ON rp.id=r.post_id LEFT JOIN forum_topics t ON t.id=rp.topic_id WHERE r.status=? AND ((r.post_id IS NOT NULL AND ${filter.sql}) OR (r.post_id IS NULL AND ?=1))`;
    const reportParams=[query.get('resolved') === '1' ? 'resolved' : 'open',...filter.values,has(user,'moderate')||has(user,'manage')?1:0];
    const allReports = await rows(`SELECT r.*,u.username reporter ${reportFrom} ORDER BY r.id DESC ${suffix}`,reportParams), reports = [];
    for (const report of allReports) { try { reports.push({ ...report, item: await reportedItem(ctx, report) }); } catch (error) { if (error.status !== 404) throw error; } }
    return { topics, posts, reports, ...paging, totals:{topics:(await one(`SELECT COUNT(*) total FROM forum_topics t WHERE ${topicWhere}`,filter.values)).total,posts:(await one(`SELECT COUNT(*) total FROM forum_posts p JOIN forum_topics t ON t.id=p.topic_id WHERE ${postWhere}`,filter.values)).total,reports:(await one(`SELECT COUNT(*) total ${reportFrom}`,reportParams)).total} };
  }
  requirePermission(ctx, 'manage');
  if (action === 'admin') return {
    boards: await rows('SELECT * FROM forum_boards ORDER BY position,id'), moderators: await rows('SELECT m.*,u.username FROM forum_moderators m JOIN forum_users u ON u.id=m.user_id'),
    roles: (await rows('SELECT * FROM forum_roles ORDER BY rank_value DESC')).map(role => ({ ...role, permissions: json(role.permissions, []) })),
    tags: await rows('SELECT * FROM forum_tags ORDER BY position,id'), settings: await settings(),
    stats: await one('SELECT (SELECT COUNT(*) FROM forum_users) users,(SELECT COUNT(*) FROM forum_topics WHERE deleted_at IS NULL) topics,(SELECT COUNT(*) FROM forum_posts WHERE deleted_at IS NULL) posts'),
  };
  if (action === 'admin.users') {
    const q = `%${text(query.get('q') || '', 'Пошук', 0, 80).replace(/[!%_\\]/g, char => `!${char}`)}%`;
    return { users: await rows(`SELECT u.id,u.username,u.email,u.role_id,u.email_verified,u.created_at,r.name role_name,r.rank_value FROM forum_users u JOIN forum_roles r ON r.id=u.role_id WHERE u.username LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!' ORDER BY u.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`, [q, q]), total: (await one("SELECT COUNT(*) total FROM forum_users WHERE username LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!'", [q, q])).total, ...paging };
  }
  if (action === 'admin.user') {
    const target = await userById(id(query.get('id')));
    if (!target) fail(404, 'not_found', 'Гравця не знайдено');
    return { user: { id: target.id, username: target.username, role_id: target.role_id, roles: target.roles, email_verified: target.email_verified, tags: target.tags },
      penalties: await rows('SELECT p.*,u.username actor FROM forum_penalties p JOIN forum_users u ON u.id=p.actor_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100', [target.id]),
      notes: await rows('SELECT n.*,u.username actor FROM forum_notes n JOIN forum_users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100', [target.id]) };
  }
  if (action === 'admin.audit') {
    requirePermission(ctx, 'audit');
    return { entries: await rows(`SELECT a.*,u.username actor FROM forum_audit a LEFT JOIN forum_users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT ${paging.size} OFFSET ${paging.offset}`), total: (await one('SELECT COUNT(*) total FROM forum_audit')).total, ...paging };
  }
  fail(404, 'not_found', 'Операцію не знайдено');
}
export async function adminAction(ctx, action, body) {
  const user = staffGate(ctx);
  if (action === 'topic.moderate') {
    const reason = text(body.reason, 'Причина', 3, 300);
    return transaction(async db => {
      const { topic, board } = await requireTopic(user, id(body.topicId), db, true);
      if (!mayModerate(user, board)) fail(403, 'forbidden', 'Недостатньо прав');
      if (body.operation === 'move') {
        const destination = await requireBoard(user, id(body.boardId), db);
        if (destination.is_category || !mayModerate(user, destination)) fail(403, 'forbidden', 'Немає прав у цільовому розділі');
        await rows('UPDATE forum_topics SET board_id=?,private_topic=? WHERE id=?', [destination.id, Boolean(topic.private_topic || destination.access.privateRequired), topic.id], db);
      } else if (body.operation === 'status') {
        if (!(await settings(db)).statuses.some(status => status.id === body.status)) fail(400, 'invalid_status', 'Невідомий статус');
        await rows('UPDATE forum_topics SET status=? WHERE id=?', [body.status, topic.id], db);
      } else if (body.operation === 'pin') await rows('UPDATE forum_topics SET pinned=? WHERE id=?', [Boolean(body.value), topic.id], db);
      else if (body.operation === 'private') {
        if (board.access.privateRequired && !body.value) fail(400, 'privacy_required', 'Цей розділ вимагає приватності');
        await rows('UPDATE forum_topics SET private_topic=? WHERE id=?', [Boolean(body.value), topic.id], db);
      } else if (body.operation === 'assign') {
        const target = body.userId ? await userById(id(body.userId), db) : null;
        if (target && (!(await boardsFor(target, db)).some(item => item.id === board.id) || !mayModerate(target, board))) fail(400, 'invalid_assignee', 'Співробітник не має доступу');
        await rows('UPDATE forum_topics SET assigned_to=? WHERE id=?', [target?.id || null, topic.id], db);
      } else if (body.operation === 'rename') {
        const config = await settings(db), prefix = text(body.prefix || '', 'Префікс', 0, 40);
        if (prefix && !config.prefixes.includes(prefix)) fail(400, 'invalid_prefix', 'Невідомий префікс');
        await rows('UPDATE forum_topics SET title=?,prefix=? WHERE id=?', [text(body.title, 'Заголовок', 4, 160), prefix, topic.id], db);
      } else if (body.operation === 'hide') await rows('UPDATE forum_topics SET deleted_at=UTC_TIMESTAMP() WHERE id=?', [topic.id], db);
      else if (body.operation === 'restore') await rows('UPDATE forum_topics SET deleted_at=NULL WHERE id=?', [topic.id], db);
      else if (body.operation === 'approve') { await rows('UPDATE forum_topics SET approved=1 WHERE id=?', [topic.id], db); await rows('UPDATE forum_posts SET approved=1 WHERE topic_id=? ORDER BY id LIMIT 1', [topic.id], db); }
      else fail(400, 'invalid_operation', 'Невідома дія');
      await audit(ctx, `topic_${body.operation}`, 'topic', topic.id, { reason, boardId: body.boardId || null, status: body.status || null }, db);
      await notify(topic.author_id, user.id, 'moderation', `Тему «${topic.title}» оновлено: ${reason}`, { topicId: topic.id }, db);
      return { ok: true };
    });
  }
  if (action === 'post.moderate') return transaction(async db => {
    const post = await one('SELECT * FROM forum_posts WHERE id=? FOR UPDATE', [id(body.postId)], db);
    if (!post) fail(404, 'not_found', 'Повідомлення не знайдено');
    const { board, topic } = await requireTopic(user, post.topic_id, db);
    if (!mayModerate(user, board)) fail(403, 'forbidden', 'Недостатньо прав');
    const reason = text(body.reason, 'Причина', 3, 300);
    if (body.operation === 'hide') await rows('UPDATE forum_posts SET deleted_at=UTC_TIMESTAMP() WHERE id=?', [post.id], db);
    else if (body.operation === 'restore') await rows('UPDATE forum_posts SET deleted_at=NULL WHERE id=?', [post.id], db);
    else if (body.operation === 'approve') {
      await rows('UPDATE forum_posts SET approved=1 WHERE id=?', [post.id], db);
      await rows('UPDATE forum_topics SET updated_at=UTC_TIMESTAMP() WHERE id=?', [topic.id], db);
      if(!post.approved&&topic.approved&&!post.deleted_at) await postNotifications(await userById(post.author_id,db),topic,post.id,post.body,db);
    }
    else fail(400, 'invalid_operation', 'Невідома дія');
    await audit(ctx, `post_${body.operation}`, 'post', post.id, { reason }, db); return { ok: true };
  });
  if (action === 'topic.merge') return transaction(async db => {
    const sourceId = id(body.sourceId), targetId = id(body.targetId);
    if (sourceId === targetId) fail(400, 'invalid_target', 'Оберіть іншу тему');
    // Deterministic lock order avoids reciprocal-merge deadlocks.
    await rows('SELECT id FROM forum_topics WHERE id IN (?,?) ORDER BY id FOR UPDATE', [sourceId, targetId], db);
    const source = await requireTopic(user, sourceId, db), target = await requireTopic(user, targetId, db);
    if (!mayModerate(user, source.board) || !mayModerate(user, target.board) || source.topic.deleted_at || target.topic.deleted_at) fail(403, 'forbidden', 'Об’єднання недоступне');
    if (source.topic.board_id !== target.topic.board_id || Boolean(source.topic.private_topic) !== Boolean(target.topic.private_topic) || (source.topic.private_topic && source.topic.author_id !== target.topic.author_id)) fail(400, 'merge_privacy', 'Об’єднувати можна теми одного розділу з однаковою аудиторією');
    if (await one('SELECT id FROM forum_polls WHERE topic_id=?', [sourceId], db)) fail(400, 'merge_poll', 'Тему з опитуванням не можна об’єднати');
    await rows('UPDATE forum_posts SET topic_id=? WHERE topic_id=?', [targetId, sourceId], db);
    await rows('UPDATE forum_topics SET deleted_at=UTC_TIMESTAMP(),status=\'closed\' WHERE id=?', [sourceId], db);
    await rows('UPDATE forum_topics SET updated_at=UTC_TIMESTAMP() WHERE id=?', [targetId], db);
    await audit(ctx, 'topic_merged', 'topic', sourceId, { targetId, reason: text(body.reason, 'Причина', 3, 300) }, db); return { topicId: targetId };
  });
  if (action === 'topic.split') return transaction(async db => {
    const { topic, board } = await requireTopic(user, id(body.topicId), db, true);
    if (!mayModerate(user, board)) fail(403, 'forbidden', 'Недостатньо прав');
    if (!Array.isArray(body.postIds) || !body.postIds.length || body.postIds.length > 100) fail(400, 'invalid_posts', 'Оберіть від 1 до 100 повідомлень');
    const ids = [...new Set(body.postIds.map(id))], matches = await rows(`SELECT * FROM forum_posts WHERE topic_id=? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, [topic.id, ...ids], db);
    const first = await one('SELECT MIN(id) id FROM forum_posts WHERE topic_id=?', [topic.id], db);
    if (matches.length !== ids.length || ids.includes(first.id)) fail(400, 'invalid_posts', 'Перший допис має залишитися в початковій темі');
    const result = await rows('INSERT INTO forum_topics(board_id,author_id,title,private_topic,approved) VALUES(?,?,?,?,?)', [board.id, topic.private_topic ? topic.author_id : matches[0].author_id, text(body.title, 'Заголовок', 4, 160), topic.private_topic, topic.approved], db);
    await rows(`UPDATE forum_posts SET topic_id=? WHERE id IN (${ids.map(() => '?').join(',')})`, [result.insertId, ...ids], db);
    await audit(ctx, 'topic_split', 'topic', topic.id, { topicId: result.insertId, postIds: ids, reason: text(body.reason, 'Причина', 3, 300) }, db); return { topicId: result.insertId };
  });
  if (action === 'report.resolve') return transaction(async db => {
    const report = await one('SELECT * FROM forum_reports WHERE id=? FOR UPDATE', [id(body.reportId)], db);
    if (!report) fail(404, 'not_found', 'Скаргу не знайдено');
    await reportedItem(ctx, report, db);
    const resolution = text(body.resolution, 'Рішення', 3, 1000);
    await rows("UPDATE forum_reports SET status='resolved',resolution=?,resolved_by=? WHERE id=?", [resolution, user.id, report.id], db);
    await notify(report.reporter_id, user.id, 'moderation', `Скаргу розглянуто: ${resolution}`, {}, db);
    await audit(ctx, 'report_resolved', 'report', report.id, { resolution }, db); return { ok: true };
  });
  if (action === 'penalty.create' || action === 'penalty.revoke' || action === 'note.create') {
    requirePermission(ctx, 'penalize');
    return transaction(async db => {
      const target = await userById(id(body.userId), db);
      if (!higher(user, target)) fail(403, 'hierarchy', 'Не можна змінювати обмеження цього користувача');
      await rows('SELECT id FROM forum_users WHERE id=? FOR UPDATE', [target.id], db);
      if (action === 'note.create') await rows('INSERT INTO forum_notes(user_id,actor_id,body) VALUES(?,?,?)', [target.id, user.id, text(body.body, 'Нотатка', 3, 3000)], db);
      else if (action === 'penalty.revoke') await rows('UPDATE forum_penalties SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?', [id(body.penaltyId), target.id], db);
      else {
        if (!['warning','mute','ban'].includes(body.kind)) fail(400, 'invalid_penalty', 'Невідоме обмеження');
        const hours = Number(body.hours || 0), points = Number(body.points || 0), reason = text(body.reason, 'Причина', 3, 500);
        if (!Number.isInteger(hours) || hours < 0 || hours > 87600 || !Number.isInteger(points) || points < 0 || points > 100) fail(400, 'invalid_penalty', 'Некоректний термін або бали');
        await rows('INSERT INTO forum_penalties(user_id,actor_id,kind,reason,points,expires_at) VALUES(?,?,?,?,?,?)', [target.id, user.id, body.kind, reason, points, hours ? new Date(Date.now() + hours * 3600000) : null], db);
        if (body.kind === 'ban') await rows('DELETE FROM forum_sessions WHERE user_id=?', [target.id], db);
        const config = await settings(db);
        if (body.kind === 'warning' && config.warningThreshold > 0 && (await one("SELECT COALESCE(SUM(points),0) points FROM forum_penalties WHERE user_id=? AND kind='warning' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())", [target.id], db)).points >= config.warningThreshold) {
          await rows("INSERT INTO forum_penalties(user_id,actor_id,kind,reason,expires_at) VALUES(?,?,'mute',?,?)", [target.id, user.id, 'Автоматичне обмеження за сумою попереджень', new Date(Date.now() + config.warningMuteHours * 3600000)], db);
        }
        await notify(target.id, user.id, 'moderation', `Застосовано обмеження: ${reason}`, {}, db);
      }
      await audit(ctx, action, 'user', target.id, { reason: body.reason || '', kind: body.kind || null }, db); return { ok: true };
    });
  }
  requirePermission(ctx, 'manage');
  if (action === 'admin.board') {
    const boardId = body.id ? id(body.id) : null, parentId = body.parentId ? id(body.parentId) : null;
    const all = await rows('SELECT id,parent_id FROM forum_boards');
    if (parentId && !all.some(board => board.id === parentId)) fail(400, 'invalid_parent', 'Батьківський розділ не знайдено');
    let ancestor = parentId; const seen = new Set(boardId ? [boardId] : []);
    while (ancestor) { if (seen.has(ancestor)) fail(400, 'cycle', 'Розділи не можуть утворювати цикл'); seen.add(ancestor); ancestor = all.find(board => board.id === ancestor)?.parent_id; }
    const access = validateAccess(body.access || {}, (await rows('SELECT id FROM forum_roles')).map(role => role.id));
    if (!Array.isArray(body.formFields || []) || (body.formFields || []).length > 15) fail(400, 'invalid_form', 'Максимум 15 полів');
    const fields = (body.formFields || []).map(field => ({ key: text(field.key, 'Ключ поля', 1, 40), label: text(field.label, 'Назва поля', 1, 100), required: Boolean(field.required) }));
    if (fields.some(field => !/^[a-z][a-z0-9_]*$/.test(field.key)) || new Set(fields.map(field => field.key)).size !== fields.length) fail(400, 'invalid_form', 'Ключі полів мають бути унікальними латинськими ідентифікаторами');
    const position = Number(body.position || 0); if (!Number.isInteger(position) || Math.abs(position) > 100000) fail(400, 'invalid_position', 'Некоректний порядок');
    const icon = body.icon || 'messages'; if (!boardIcons.includes(icon)) fail(400, 'invalid_icon', 'Невідома іконка');
    const values = [parentId, text(body.title, 'Назва', 2, 120), text(body.description || '', 'Опис', 0, 600), text(body.rules || '', 'Правила', 0, 10000), position, Boolean(body.isCategory), JSON.stringify(access), JSON.stringify(fields), Boolean(body.requireApproval), Boolean(body.archived), icon];
    return transaction(async db => {
      const result = boardId ? await rows('UPDATE forum_boards SET parent_id=?,title=?,description=?,rules=?,position=?,is_category=?,access=?,form_fields=?,require_approval=?,archived=?,icon=? WHERE id=?', [...values, boardId], db) : await rows('INSERT INTO forum_boards(parent_id,title,description,rules,position,is_category,access,form_fields,require_approval,archived,icon) VALUES(?,?,?,?,?,?,?,?,?,?,?)', values, db);
      if (boardId && access.privateRequired) await rows('UPDATE forum_topics SET private_topic=1 WHERE board_id=?', [boardId], db);
      if (boardId && !result.affectedRows && !all.some(board => board.id === boardId)) fail(404, 'not_found', 'Розділ не знайдено');
      if (boardId && body.isCategory && await one('SELECT id FROM forum_topics WHERE board_id=? LIMIT 1', [boardId], db)) fail(400, 'board_has_topics', 'Спочатку перенесіть теми з розділу');
      const targetId = boardId || result.insertId; await audit(ctx, 'board_saved', 'board', targetId, {}, db); return { boardId: targetId };
    });
  }
  if (action === 'admin.moderator') {
    const board = await requireBoard(user, id(body.boardId)), target = await userById(id(body.userId));
    if (!higher(user, target)) fail(403, 'hierarchy', 'Не можна призначити цього користувача');
    if (body.enabled) await rows('INSERT IGNORE INTO forum_moderators(board_id,user_id) VALUES(?,?)', [board.id, target.id]);
    else await rows('DELETE FROM forum_moderators WHERE board_id=? AND user_id=?', [board.id, target.id]);
    await audit(ctx, 'moderator_changed', 'user', target.id, { boardId: board.id, enabled: Boolean(body.enabled) }); return { ok: true };
  }
  if (action === 'admin.role') {
    if (!has(user, '*')) fail(403, 'owner_required', 'Налаштування ролей доступне власнику');
    const roleId = text(body.id, 'Код ролі', 2, 32);
    if (!/^[a-z][a-z0-9_]*$/.test(roleId) || ['owner','admin','global_mod','moderator','player'].includes(roleId)) fail(400, 'system_role', 'Системні ролі захищені від зміни');
    const rank = Number(body.rank); if (!Number.isInteger(rank) || rank < 1 || rank >= 80) fail(400, 'invalid_rank', 'Ранг додаткової ролі: 1–79');
    if (!Array.isArray(body.permissions) || body.permissions.some(value => !permissions.includes(value))) fail(400, 'invalid_permissions', 'Невідоме право');
    await rows('INSERT INTO forum_roles(id,name,color,rank_value,permissions) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),color=VALUES(color),rank_value=VALUES(rank_value),permissions=VALUES(permissions)', [roleId, text(body.name, 'Роль', 2, 80), color(body.color), rank, JSON.stringify(body.permissions)]);
    await audit(ctx, 'role_saved', 'role', roleId); return { ok: true };
  }
  if (action === 'admin.userRoles') return transaction(async db => {
    const targetId = id(body.userId); await rows('SELECT id FROM forum_users WHERE id=? FOR UPDATE', [targetId], db);
    const target = await userById(targetId, db);
    if (!higher(user, target)) fail(403, 'hierarchy', 'Не можна змінювати ролі цього користувача');
    const all = await rows('SELECT * FROM forum_roles', [], db), primary = all.find(role => role.id === body.roleId), extra = body.extraRoles || [];
    if (!primary || !Array.isArray(extra) || extra.length > 15 || extra.some(value => !all.some(role => role.id === value))) fail(400, 'invalid_role', 'Невідома роль');
    const assigned = [primary, ...all.filter(role => extra.includes(role.id))];
    if (assigned.some(role => role.rank_value >= user.rank || json(role.permissions, []).includes('*')) && !has(user, '*')) fail(403, 'hierarchy', 'Не можна призначати ці ролі');
    if (assigned.some(role => role.id === 'owner')) fail(403, 'owner_cli_required', 'Власника призначають тільки локальною командою налаштування');
    await rows('UPDATE forum_users SET role_id=? WHERE id=?', [primary.id, target.id], db);
    await rows('DELETE FROM forum_user_roles WHERE user_id=?', [target.id], db);
    for (const roleId of new Set(extra.filter(value => value !== primary.id))) await rows('INSERT INTO forum_user_roles(user_id,role_id) VALUES(?,?)', [target.id, roleId], db);
    await rows('DELETE FROM forum_sessions WHERE user_id=?', [target.id], db);
    await audit(ctx, 'user_roles_changed', 'user', target.id, { primary: primary.id, extra }, db); return { ok: true };
  });
  if (action === 'admin.tag') {
    const tagId = body.id ? id(body.id) : null;
    if (body.remove) { if (!tagId) fail(400, 'invalid_id', 'Оберіть тег'); await rows('DELETE FROM forum_tags WHERE id=?', [tagId]); }
    else {
      const values = [text(body.name, 'Тег', 1, 50), color(body.color), Number.isInteger(Number(body.position)) ? Math.max(-10000, Math.min(10000, Number(body.position))) : 0];
      if (tagId) await rows('UPDATE forum_tags SET name=?,color=?,position=? WHERE id=?', [...values, tagId]); else await rows('INSERT INTO forum_tags(name,color,position) VALUES(?,?,?)', values);
    }
    await audit(ctx, 'tag_changed', 'tag', tagId || 'new'); return { ok: true };
  }
  if (action === 'admin.userTags') return transaction(async db => {
    const target = await userById(id(body.userId), db); if (!higher(user, target)) fail(403, 'hierarchy', 'Не можна змінювати теги цього користувача');
    if (!Array.isArray(body.tags) || body.tags.length > 20) fail(400, 'invalid_tags', 'Максимум 20 тегів');
    await rows('DELETE FROM forum_user_tags WHERE user_id=?', [target.id], db);
    for (const tagId of new Set(body.tags.map(id))) await rows('INSERT INTO forum_user_tags(user_id,tag_id) VALUES(?,?)', [target.id, tagId], db);
    await audit(ctx, 'user_tags_changed', 'user', target.id, { tags: body.tags }, db); return { ok: true };
  });
  if (action === 'admin.settings') {
    const config = { title: text(body.title, 'Назва', 3, 100), announcement: text(body.announcement || '', 'Оголошення', 0, 2000), registrationOpen: Boolean(body.registrationOpen), editMinutes: Number(body.editMinutes), maxAttachmentMB: Number(body.maxAttachmentMB), warningThreshold: Number(body.warningThreshold || 0), warningMuteHours: Number(body.warningMuteHours || 24), prefixes: body.prefixes };
    if (!Number.isInteger(config.editMinutes) || config.editMinutes < 0 || config.editMinutes > 10080 || !Number.isInteger(config.maxAttachmentMB) || config.maxAttachmentMB < 1 || config.maxAttachmentMB > 8 || !Number.isInteger(config.warningThreshold) || config.warningThreshold < 0 || config.warningThreshold > 1000 || !Number.isInteger(config.warningMuteHours) || config.warningMuteHours < 1 || config.warningMuteHours > 8760 || !Array.isArray(config.prefixes) || config.prefixes.length > 30) fail(400, 'invalid_settings', 'Некоректні налаштування');
    config.prefixes = [...new Set(config.prefixes.map(value => text(value, 'Префікс', 1, 40)))];
    config.statuses = body.statuses || (await settings()).statuses;
    if (!Array.isArray(config.statuses) || config.statuses.length < 2 || config.statuses.length > 20) fail(400, 'invalid_statuses', 'Від 2 до 20 статусів');
    config.statuses = config.statuses.map(status => ({ id:text(status.id,'Код статусу',2,20), label:text(status.label,'Назва статусу',2,50), replies:Boolean(status.replies) }));
    const codes = config.statuses.map(status => status.id);
    if (!codes.includes('open') || !codes.includes('closed') || new Set(codes).size !== codes.length || codes.some(code => !/^[a-z][a-z0-9_]*$/.test(code))) fail(400,'invalid_statuses','Потрібні унікальні коди статусів, зокрема open та closed');
    const existingStatuses = await rows('SELECT DISTINCT status FROM forum_topics');
    if (existingStatuses.some(value => !codes.includes(value.status))) fail(400,'status_in_use','Не можна прибрати статус, який використовується темами');
    await rows("UPDATE forum_settings SET setting_value=? WHERE setting_key='general'", [JSON.stringify(config)]);
    await audit(ctx, 'settings_saved', 'settings', 'general'); return { ok: true };
  }
  fail(404, 'not_found', 'Операцію не знайдено');
}
