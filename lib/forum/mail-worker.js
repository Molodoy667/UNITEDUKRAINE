import { json } from './core.js';
import { mailConfigured, sendMail } from './integrations.js';
import { one, requireTopic, rows, userById } from './store.js';

export async function deliverForumMail(limit=10) {
  if(!mailConfigured())return {configured:false,sent:0};
  let sent=0;const deadline=Date.now()+25000;
  const candidates=await rows("SELECT id FROM forum_mail_outbox WHERE state='pending' AND available_at<=UTC_TIMESTAMP() ORDER BY id LIMIT ?",[Math.max(1,Math.min(20,limit))]);
  for(const candidate of candidates){
    if(Date.now()>deadline)break;
    const claimed=await rows("UPDATE forum_mail_outbox SET available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),attempts=attempts+1 WHERE id=? AND state='pending' AND available_at<=UTC_TIMESTAMP()",[candidate.id]);
    if(!claimed.affectedRows)continue;
    try{
      const notification=await one('SELECT n.*,o.attempts FROM forum_notifications n JOIN forum_mail_outbox o ON o.notification_id=n.id WHERE o.id=?',[candidate.id]);
      const user=await userById(notification.user_id),prefs=json(user?.preferences,{});
      let allowed=Boolean(user?.email_verified&&prefs.emailNotifications===true&&prefs[notification.kind]!==false&&!notification.read_at&&!user.penalties.some(p=>p.kind==='ban'));
      if(allowed&&notification.topic_id){try{await requireTopic(user,notification.topic_id);}catch(error){if(error.status!==404)throw error;allowed=false;}}
      if(allowed&&notification.post_id)allowed=Boolean(await one('SELECT id FROM forum_posts WHERE id=? AND topic_id=? AND approved=1 AND deleted_at IS NULL',[notification.post_id,notification.topic_id]));
      if(allowed&&notification.conversation_id)allowed=Boolean(await one('SELECT user_id FROM forum_participants WHERE conversation_id=? AND user_id=?',[notification.conversation_id,user.id]));
      if(!allowed){await rows("UPDATE forum_mail_outbox SET state='skipped' WHERE id=?",[candidate.id]);continue;}
      // No private subject, message body or evidence is copied into an email.
      await sendMail(user.email,'United Ukraine: нова подія на форумі',`На форумі United Ukraine є нове сповіщення для вас.\n\nВідкрити сповіщення: ${new URL(process.env.FORUM_ORIGIN).origin}/forum?view=notifications\n\nКерувати листами: ${new URL(process.env.FORUM_ORIGIN).origin}/forum?view=settings`,`forum-notification-${notification.id}`);
      await rows("UPDATE forum_mail_outbox SET state='sent',sent_at=UTC_TIMESTAMP() WHERE id=?",[candidate.id]);sent++;
    }catch{
      await rows("UPDATE forum_mail_outbox SET state=IF(attempts>=5,'failed','pending'),available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) WHERE id=?",[candidate.id]);
    }
  }
  return {configured:true,sent};
}
