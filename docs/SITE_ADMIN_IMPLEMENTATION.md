# Website administration and content — 2026-10-19

Implementation in UNITEDUKRAINE only. The previous game bridge and engine guards are unchanged; AI/wallet expansion and MyISAM conversion are deferred at the operator's request.

## Interface

`/account?tab=admin`, requiring the existing game account with **admin exactly 12**, opens compact modules in separate browser tabs:

1. **Ігровий сервер** — existing players, online list, property registries, proposal editors and game bridge journal.
2. **Редагування сайту** — access mode, menu and logo, plus the home page's hero, server card, project description, ticker, news, game steps, gallery, community and footer. Each visible block can be disabled. The access modes are public, account-authenticated, and technical work; only an admin-12 account can bypass technical work.
3. **SEO та сторінки** — general SEO settings and editable static pages.
4. **Новини та API** — photo upload/preview, news management and copyable API examples.
5. **База знань** — existing knowledge-base editor.
6. **Project / Android** — Project background and Android image endpoints.

Visitors blocked by the account-authenticated mode can use `/account?site-login=1` to sign in. The mode is checked across client-side pages, server-rendered pages and public page-content endpoints. The technical-work screen uses an existing WebP site image with animated CSS decoration.

At the bottom of **API та новини**, **Підключення новин до лаунчера** generates copyable instructions plus **Electron (JavaScript)** and **Unity (C# / UnityWebRequest)** examples from the saved `seo.siteUrl`. Separate buttons copy `/api/launcher?action=news` or the selected code. Electron uses main-process `net.fetch`, a narrow IPC/preload bridge and safe text DOM cards; Unity uses a serializable wrapper with `JsonUtility`, polling and a UI event. Neither requires Newtonsoft.Json. Both explain nullable dates, empty lists/images, 10-second timeout, 60-second refresh and retaining the previous list on errors. Unity card/texture rendering must be wired into the actual launcher UI. Clipboard denial offers manual copy. No admin cookie/password/API key is included. Separate Electron/Unity projects were not edited or compiled.

Page/news text is plain text (blank line = paragraph), not executable HTML. News/page images can be uploaded or supplied as HTTPS URLs; downloads remain URLs. Published custom pages appear as footer links. Home news cards link to individual pages. Migration 010 adds exactly one clearly labeled **Тестова** news article at `/news/test-launcher-news`, explicitly requested by the operator, with the existing `/assets/world-promo.png` illustration. It does not announce an actual game release. It can be edited/deleted from the admin panel, and existing rows with that slug are not overwritten. Existing contacts/legal text retains its explicit draft/legal-review notices; this task does not certify those legal documents.

## Database and safety

New migration **`008_site_content.sql`** creates only InnoDB website tables:

- `site_settings`: keys `seo`, `home`, `launcher`, JSON values, optimistic version and updated actor/time.
- `site_documents`: `page` or `news`, unique kind/slug, body, excerpt, image/category, per-document SEO, publication and soft-delete flags, versions and timestamps.
- `site_content_audit`: actor/request UUID, payload hash, event/target, before/after snapshots and persisted result for idempotent retries.

Migration **009_site_media.sql** adds InnoDB `site_media`: UUID, unique SHA-256, MIME, byte size, dimensions, binary bytes, actor and timestamp. Uploaded images are stored in MySQL, **not R2**, so no additional storage credentials are needed. The browser accepts PNG/JPEG/WebP files up to 5 MiB and converts normal site images to WebP; stored output is capped at 3 MiB and dimensions at 4096 × 4096. The Project background is the one exception: it is saved as PNG, with JPEG converted to PNG, and served from `/Project/background.png`. SVG/GIF and animated WebP are rejected. The server checks canonical base64, MIME against container signatures, container bounds and dimension headers, not full pixel decoding or malware scanning. Private JSON upload is bounded to 5 MiB; ordinary CMS JSON retains its 64 KiB limit. Auth/Origin/CSRF are checked first. Upload, deduplication and metadata-only audit are transactional and reuse the existing 120 operations / 15 minutes limiter; binary/base64 is not copied into audit snapshots.

`/Project/background.png` and `/Project/android-logo.webp` are stable public routes backed by the saved media row. Vercel serves those bytes through the media API; uploads do not overwrite files inside the deployed source directory.

Images are served by `/api/media?id=<UUID>` with their validated MIME, `nosniff` and no-store. An unlinked/draft image requires an administrator-12 session for preview; anonymous/ordinary access returns 404. An image referenced by any published, non-deleted document or the saved SEO image becomes public with wildcard CORS (no credential permission), including HEAD support. Removing the last public reference makes future anonymous requests private again, but cannot revoke already downloaded copies. Assets shared by other published documents stay public. Soft deletion retains image bytes for restoration; unlinked uploads are not automatically purged. This deliberately bounded DB storage is suitable for small images, not large media archives.

Existing `npm run deploy:build` applies the migration using the existing migration runner before building. No game tables or values are changed by migration 008. `INSERT IGNORE` preserves settings on a safe manual rerun. Do not edit an already-applied migration; add a new numbered migration instead.

All administration API requests check the real current game session/admin level. Writes require trusted Origin, JSON and `X-Account-Csrf`; they lock/recheck current admin level in the transaction. Optimistic versions prevent overwriting concurrent edits. Actor/request UUID retries reuse the stored result; conflicting reuse fails. A content change and its audit commit together; an audit failure rolls back the change. URL validation allows HTTPS without URL credentials, plus site-relative image assets. SQL identifiers/actions are allowlisted and values bound. No arbitrary SQL or server-code execution is exposed. CMS writes share the existing administrative 120-operation/15-minute throttle; the counter is transactional. Audit is append-only through this API, not tamper-proof against DB root.

Delete moves a document to the trash, unpublishes it and removes it from public APIs/HTML/footer. Restore retains the body and makes a **draft**; an administrator must explicitly republish. Slugs remain reserved in trash to avoid accidentally reassigning deleted URLs.

## Endpoints

| Endpoint | Access / result |
| --- | --- |
| `GET /api/site` | Published settings, latest 12 news and up to 100 page navigation links in public mode; restricted modes return only access-screen settings to unauthorized visitors |
| `GET /api/site?action=document&kind=page&slug=...` | One published page; denied while the site is restricted and the visitor is unauthorized |
| `GET /api/site?action=document&kind=news&slug=...` | One published news item; denied while the site is restricted and the visitor is unauthorized |
| `GET /api/launcher` | Explicit launcher configuration, fixed game endpoint and published news with absolute links |
| `GET /api/launcher?action=news` | `{schemaVersion:1,news:[{id,title,excerpt,image,url,publishedAt}]}`; public, absolute URLs, CORS, last 12 published news |
| `GET/HEAD /api/media?id=<UUID>` | Image bytes; public only when referenced by published content/SEO; otherwise administrator preview |
| `GET /api/server` | Real direct UDP info query first; clearly tagged monitor/open.mp fallback, or `unavailable` without invented player count |
| `GET /api/admin?action=site-settings` | Private editable settings and versions |
| `GET /api/admin?action=site-documents&kind=page\|news&state=active\|trash&page=1` | Private paginated documents (20/page) |
| `GET /api/admin?action=site-audit` | Latest 50 content audit event summaries |
| `POST /api/admin?action=site-settings-save` | `{group,value,version,requestId}` |
| `POST /api/admin?action=site-document-save` | `{id:null\|number,version,document,requestId}` |
| `POST /api/admin?action=site-document-delete` | `{id,version,requestId}` |
| `POST /api/admin?action=site-document-restore` | `{id,version,requestId}` |
| `POST /api/admin?action=site-image-upload` | `{requestId,mime,data}` where `data` is canonical base64; admin 12 + Origin + CSRF; returns `{saved,id,url,mime,size,width,height,replayed}` |

Public launcher response fields:

```json
{
  "project": "UNITED UKRAINE",
  "siteUrl": "https://united-rp.com.ua",
  "launcher": {
    "version": "",
    "downloadUrl": "",
    "resourcesEnabled": false,
    "resourcesUrl": "",
    "resourcesVersion": "",
    "resourcesUpdateUrl": "",
    "maintenance": false,
    "maintenanceMessage": ""
  },
  "server": { "address": "51.75.44.14", "port": 2219 },
  "news": []
}
```

`resourcesEnabled` cannot be enabled without `resourcesUrl` and `resourcesVersion`. It does not toggle maintenance. The new API does not rewrite `/Project/info.json` or `/Project/CRMP/info.json`; adapting a separate native launcher is outside this request.

## Public HTML, routes and online

Vercel routes `/`, `/contacts`, `/terms`, `/privacy`, `/p/:slug` and `/news/:slug` to `/api/render`. That function reads the **built** `dist/index.html` (included via `functions.api/render.js.includeFiles`) and inserts DB-derived title, description, keywords, canonical/OpenGraph metadata, escaped readable content and JSON bootstrap before sending the HTML. This makes the home/page/news SEO available before JavaScript. Missing or unpublished documents return real HTTP 404; DB/template failures return 503/noindex, not fabricated content.

React renders the same public database content. Existing app routes retain their normal Vite routing and update common SEO metadata client-side. This is not full SSR for forum/account/wiki. Content APIs/HTML use no-store. After a save, reopen/refresh the public page to read fresh content.

Direct online uses fixed `51.75.44.14:2219`, UDP opcode `i` (not the 100-player-limited client list). Requests are coalesced and cached 15 seconds; the home refreshes every minute and has manual refresh/timeout. On failure no `players:0` is fabricated. Production Vercel UDP egress and fallback availability must still be checked after deployment. The local network probe during this task returned an actual online server with 0/500 players, source `game-query`.

## Donations — 2026-11-26

Admin level 12 gets a **Донат** module with two tabs. **Донат-паки** edits package title, description, image, included items, UAH price, active state/order, donation-to-UAH rate, custom top-up limits, bank/recipient/IBAN/card/tax ID, payment notes and the rules players must accept. Package image uploads use the existing site media uploader and WebP conversion. **Список операцій** filters/paginates requests and records approvals or rejections with an operator-supplied reason.

The public `/donate` page checks the game nickname against `accounts_1101` before creating a fixed-price package or custom top-up request. It shows a 30-minute countdown, payment details and payment-purpose text, then lets the player report that they paid. Expired instructions close; reported transfers wait for a human administrator to compare the bank statement and confirm or reject them. There is no payment-provider integration or automatic bank verification in this implementation. Only a confirmed administrator action credits `accounts_1101.donate_current`; a unique ledger row and the wallet update commit together, so retrying a confirmation cannot credit twice. The operation snapshot preserves its selected package and payment details if the admin later edits settings.

Migration **`017_donations.sql`** adds only InnoDB donation settings, packages, operations, ledger, audit and public request-rate-limit tables. The top-up conversion rate is configurable (default **1 game donation point per 1 UAH**); custom top-ups default to 50–50,000 UAH. Package amount is package UAH price × current configured rate. The player accepts the saved rules before the request is created. Incomplete bank details or empty rules keep checkout disabled. The public API uses the existing `ACCOUNT_RATE_SECRET` / `FORUM_IP_SECRET` for HMAC IP rate limits and fails closed in production when no sufficiently long secret is configured. It also enforces the existing site access mode server-side for donation API reads and writes.

Game wallet writes follow the existing roulette guard. Before approval, the server must confirm `accounts_1101` is InnoDB and a fresh game-server query must report the player offline. An online player, unavailable presence check or unsupported engine blocks the credit and leaves the operation pending for a retry. The game caches `donate_current`, so this offline check is important; as already documented for roulette, it does not atomically lock a player from logging in immediately after the query. Production UDP reachability and the balance/cache behavior must be verified after deployment. Install the migration through the existing `npm run deploy:build` pipeline before enabling the payment instructions in admin. No real bank transfer, production migration, wallet credit or deployment was performed for this feature.

## Verification and deployment boundary

- `npm run build`: TypeScript and Vite production build passed.
- `tests/site.test.mjs`: input/URL/boolean/resource validation, safe HTML/JSON metadata, direct packet parser, coalescing/cache/fallback/unavailable behavior.
- `tests/site.integration.mjs`: disposable loopback MariaDB only, real game-login cookies, role/Origin/CSRF, migration/rerun, settings persistence and stale versions, page draft/publish/HTML, launcher/news synchronization, delete/restore, concurrent idempotent creation, duplicate slug, audit failure rollback and demotion.
- News/media follow-up: `tests/site-media.test.mjs` checks image limits/headers/MIME/base64/URLs and no-DB CORS preflight. `tests/site-media.integration.mjs` persists actual PNG/JPEG bytes in disposable MariaDB, checks real sessions/CSRF, draft privacy, publication and absolute API image links, HEAD, deletion/restoration, deduplication/idempotence and audit-failure rollback. Updated static React tests check file input and Electron/Unity options; Electron example JavaScript is syntax-checked. Actual browser upload/clipboard/mobile layout and native Electron/Unity runtimes are not exercised by these tests.
- Existing administration/bridge SQL, account, roulette, forum, wiki, Forbes and static React rendering checks were rerun. Static rendering checks all four module cards and editor form fields; it does not prove browser interaction/mobile visual layout.
- No live game edits, MyISAM conversion, production migration, commit, push, hosting restart or deployment was performed for this change. Unrelated existing `FORUM_IMPLEMENTATION.md` edits were preserved. Publish the source through the usual deployment pipeline, then verify the actual public HTML, authenticated CMS and launcher JSON against production.
