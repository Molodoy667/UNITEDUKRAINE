# United Ukraine forum: setup and operations

## Architecture

The existing React/Vite application serves the forum at `/forum`. Query-string views are navigable with Back/Forward and direct links. Vercel runs `api/forum.js`; every operation uses MySQL and current server-side permissions, not browser storage or demo fixtures. Existing game tables and launcher files are not migrated.

Use `config/forum.env.example` as a list of required configuration. `.env.forum.local` is gitignored. Configure values directly in Vercel's server environment; never add database/R2 keys to `VITE_*` variables.

1. Configure existing MySQL variables and `FORUM_ORIGIN` with the actual HTTPS origin.
2. Generate independent 32-byte random hexadecimal values for `FORUM_IP_SECRET`, `FORUM_ENCRYPTION_KEY` and `FORUM_CRON_SECRET`. Preserve the encryption key in operator backups: changing it without recovery makes existing TOTP secrets unreadable.
3. Configure a verified Resend sender (`RESEND_API_KEY`, `FORUM_MAIL_FROM`). Registration remains unavailable until mail is configured; login and existing verified accounts remain usable.
4. Configure a separate private R2 bucket and server-only credentials. Public access and custom public domains must be disabled for this bucket. Launcher-download buckets are public and unsuitable for forum evidence.
5. Vercel runs `npm run deploy:build`, which applies `npm run forum:migrate` before the production build. The existing server-only MySQL variables must be available to the build. A migration error stops the deployment. An operator can also run the migration command manually. The runner holds an advisory lock, records checksums, applies ordered idempotent SQL and refuses modified applied migrations. Add new migration files for subsequent schema changes. MySQL DDL commits implicitly: back up first and rerun after a partially failed migration.
6. Set `FORUM_OWNER_USERNAME`, `FORUM_OWNER_EMAIL` and a unique `FORUM_OWNER_PASSWORD` locally. Run `npm run forum:owner`, then remove the bootstrap variables. There is no public owner-setup endpoint. A second bootstrap is rejected once an owner exists.
7. Sign in as the owner, open forum settings and enable TOTP before using administration. Record the authenticator securely. A server operator can recover a lost authenticator using `FORUM_RECOVERY_USER_ID=<exact user id>` and `node --env-file-if-exists=.env.forum.local scripts/forum-manage.mjs reset-2fa`; this revokes sessions and writes an audit entry.
8. Build with `npm run build`. After deployment, verify `/api/db-health`, `/api/forum?action=bootstrap`, registration/mail, owner TOTP, a public discussion and a private appeal with two separate test accounts.

The first owner identity must be chosen by the operator. Do not put their real email or bootstrap password into this public repository.

## Private R2 files

Configure CORS to allow exactly the site origin and direct `PUT` uploads with `Content-Type`:

```json
[{"AllowedOrigins":["https://united-rp.com.ua"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":300}]
```

An upload receives a 5-minute URL under `forum/staging/`. The server downloads at most the declared size (maximum 8 MB), checks file signatures and writes a separate immutable key under `forum/published/`. Completing the upload again does not issue a new writable final key. Configure a bucket lifecycle rule to remove `forum/staging/` after one day; final keys must not match that rule.

Reads go through `/api/forum?action=attachment&id=…` for a fresh permission check and a 60-second signed GET URL. Access follows the containing topic, message or profile. Already-issued URLs remain bearer links until their short expiry. Never log signed URLs. The application checks supported file signatures; it does not provide antivirus scanning. Add a scanner before allowing other formats.

Reference: [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## Mail and scheduled maintenance

Verification and password recovery send one-use, expiring tokens. Tokens are stored as hashes. Authenticated writes require the exact configured origin, JSON and a per-session CSRF token. Password changes/recovery invalidate other sessions.

Changing a password also invalidates pending email-change and verification links. Confirming a new email address revokes all sessions and pending links, including recovery links delivered to the old address. Enabling TOTP revokes other sessions and pending account-security links. The active setup session remains available so the owner can finish configuring administration.

Players may opt in to email notifications in profile settings. Forum notifications are stored first; the mail outbox sends generic notices without copying private titles, evidence or message bodies. Current access and preferences are checked again before sending. Resend idempotency keys prevent duplicate delivery on retry. Retry backoff is 30 minutes, up to five attempts. Failed entries remain visible in the database for operator investigation.

Schedule an authenticated GET to `/api/forum-mail` with `Authorization: Bearer <FORUM_CRON_SECRET>` every few minutes using an existing trusted scheduler. The endpoint requires the secret and processes a bounded batch. A trusted operator can instead run `npm run forum:mail`. This repository does not create a paid scheduler or silently enable an external service.

Run `npm run forum:cleanup` daily to remove expired rate-limit buckets, sessions and auth tokens. No discussions, penalties or audit history are purged by this command.

## Local development and checks

Run `npm run forum:api` in one terminal and `npm run dev` in another. Vite proxies `/api` to `127.0.0.1:4174`. The API binds only to loopback. Use a local database, never test fixtures against a live game database.

- `npm run test:forum`: cryptography, ACL/2FA, origin/CSRF and validation unit checks.
- `npm run test:forum:integration`: requires `FORUM_TEST_DB_PORT` (explicit non-3306 port) and `FORUM_TEST_DB_PASSWORD` for a local disposable MySQL/MariaDB root account. Creates a random `forum_test_*` schema, exercises real HTTP handlers and MySQL writes, then drops exactly that schema. Mail and R2 use local in-memory adapters; real service delivery is not proven by this suite.
- `FORUM_TEST_PREVIEW=1` with the integration suite keeps that isolated API available on port 4174 for browser tests after the scenarios pass. Test identities and messages must never be migrated into production. Stop the process with SIGINT/SIGTERM for cleanup.
- `npm run build`: TypeScript and Vite production bundle.

## Backup and restore

Before deploying schema changes, take a transactional dump of the forum tables (including migrations, outbox and audit) using the hosting provider's backup facility or `mariadb-dump --single-transaction`; use a protected client option file instead of putting the password on the command line. Back up the private R2 bucket and the independent encryption key using operator-managed storage.

Restore into a separate empty database first. Run migrations, check row counts and relationships, sign in with a disposable verified test user and confirm public/private topic access. Confirm representative attachment objects are present in the restored private bucket. Do not point production at the restored database until those checks pass. An actual provider backup schedule, retention policy and restoration of real user data still require operator configuration; the application does not claim they already exist.

## Scope and dependencies

Independent forum accounts are implemented. Game-account linking deliberately stays disabled until the real game schema and proof-of-ownership method are verified. Forum bans do not issue game bans. Cosmetic tags do not grant roles. Scoped moderators cannot read entire private conversations; the report queue reveals only the individual reported message. Admin/owner and any custom management role require TOTP for privileged moderation.

The current editor supports safe text formatting, quotes, code, lists, links, spoilers, attachments and previews. It never renders user HTML. Forum and game online statuses are separate; last forum activity can be hidden in privacy settings.
