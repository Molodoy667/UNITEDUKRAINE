import { getMysqlPool } from '../lib/mysql.js';
import { migrateForum } from '../lib/forum/migrate.js';
import { email, hashPassword, id, username } from '../lib/forum/core.js';
import { audit, one, rows, transaction } from '../lib/forum/store.js';

const command = process.argv[2];
try {
  if (command === 'migrate') {
    const names=await migrateForum();
    console.log(`Forum migrations applied: ${names.join(', ')}. No game tables or demo content were changed.`);
  } else if (command === 'owner') {
    const name = username(process.env.FORUM_OWNER_USERNAME), mail = email(process.env.FORUM_OWNER_EMAIL);
    await transaction(async db => {
      const existing = await one("SELECT id FROM forum_users WHERE role_id='owner' LIMIT 1 FOR UPDATE", [], db);
      if (existing) throw new Error('An owner already exists; bootstrap is disabled.');
      const user = await one('SELECT * FROM forum_users WHERE username=? AND email=? FOR UPDATE', [name, mail], db);
      let userId = user?.id;
      if (user) await rows("UPDATE forum_users SET role_id='owner',email_verified=1 WHERE id=?", [userId], db);
      else {
        const password = await hashPassword(process.env.FORUM_OWNER_PASSWORD);
        userId = (await rows("INSERT INTO forum_users(username,email,password_hash,role_id,email_verified) VALUES(?,?,?,'owner',1)", [name, mail, password], db)).insertId;
      }
      await rows('DELETE FROM forum_sessions WHERE user_id=?', [userId], db);
      await audit({ user: { id: userId } }, 'owner_bootstrapped', 'user', userId, {}, db);
    });
    console.log('Owner configured. Enable TOTP in forum security settings before using administration.');
  } else if (command === 'cleanup') {
    // Expired ephemeral records only; discussions and audit history are retained.
    await rows('DELETE FROM forum_limits WHERE expires_at<UTC_TIMESTAMP()');
    await rows('DELETE FROM forum_tokens WHERE expires_at<UTC_TIMESTAMP()');
    await rows('DELETE FROM forum_sessions WHERE expires_at<UTC_TIMESTAMP()');
    await rows('DELETE FROM site_account_sessions WHERE expires_at<UTC_TIMESTAMP()');
    await rows('DELETE FROM site_account_limits WHERE reset_at<UTC_TIMESTAMP()');
    console.log('Expired rate-limit, token and session records removed.');
  } else if (command === 'reset-2fa') {
    const userId = id(process.env.FORUM_RECOVERY_USER_ID);
    await transaction(async db => {
      if (!await one('SELECT id FROM forum_users WHERE id=? FOR UPDATE', [userId], db)) throw new Error('User not found');
      await rows('UPDATE forum_users SET totp_secret=NULL,totp_pending=NULL,totp_last_step=NULL WHERE id=?', [userId], db);
      await rows('DELETE FROM forum_sessions WHERE user_id=?', [userId], db);
      await audit({ user: null }, 'totp_reset_by_operator', 'user', userId, {}, db);
    }); console.log('2FA reset by server operator. All sessions revoked.');
  } else throw new Error('Use migrate | owner | cleanup | reset-2fa');
} catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
finally { await getMysqlPool().end(); }
