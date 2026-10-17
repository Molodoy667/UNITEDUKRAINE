# United Ukraine forum implementation

Approved scope: persistent MySQL forum, independent verified accounts with a future verified game link, scoped moderation, profiles/tags, topics/posts, appeals, polls, search, notifications, private conversations, protected attachments, administration and responsive UI.

## Stages
- [x] 1. MySQL migration, migration runner, permission model and secure sessions.
- [x] 2. Registration, email verification/recovery, profiles, sessions and TOTP.
- [x] 3. Boards/topics/posts, editor, drafts, search, reactions, polls, subscriptions and unread tracking.
- [x] 4. Appeals, reports, moderation, revisions, penalties, audit and administration.
- [x] 5. Notifications, conversations, blocking and private R2 attachment integration.
- [x] 6. Responsive forum UI and navigation integration.
- [x] 7. Local security/integration tests, production build and deployment/setup documentation.
- [ ] 8. Production deployment, secrets, real email/R2 checks and owner onboarding.

Operator decision: email-service configuration is deferred for now. Public registration and email recovery are explicitly unavailable without it; this is not a tested production mail setup.

## Verification boundary
Local integration tests use a disposable real MariaDB database and the actual HTTP handlers. Email and object-storage services use test adapters: this does not confirm real email delivery or production R2 permissions. A dump/restore drill verified 31 forum tables, 176 fixture rows, post relationships and account login. Browser checks covered login, preview, draft restoration, publication and the 390px layout. No fixture users or discussions are deployed.

Vercel runs `npm run deploy:build`: versioned SQL migrations run before type-checking and the Vite build. A failed migration stops the deployment; existing applied migrations are checksum-checked. Production migrations have not yet been executed by this implementation session. See `docs/FORUM_OPERATIONS.md` for configuration, backups and recovery.

## Required external configuration
- Existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `FORUM_ORIGIN`: canonical HTTPS origin; `FORUM_IP_SECRET`: random server-only secret for pseudonymous rate-limit keys; `FORUM_ENCRYPTION_KEY`: 64 hexadecimal characters for encrypted TOTP secrets.
- `RESEND_API_KEY`, `FORUM_MAIL_FROM` for verification/recovery mail.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_FORUM_BUCKET` for private attachments.
- `FORUM_CRON_SECRET` and an authenticated scheduler for the optional notification-email outbox.
- Owner bootstrap via CLI, never via public registration or a web query parameter.
- Game-account linking stays disabled until the actual game schema and proof-of-ownership flow are verified.

No demo users, fabricated discussions, fake activity, public secrets or destructive migration of game tables. Migration creates only prefixed forum tables and initial board/role configuration. Existing uncommitted design work is preserved.
