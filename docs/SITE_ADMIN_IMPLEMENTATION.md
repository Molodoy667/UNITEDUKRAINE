# Website administration and content — 2026-10-19

Implementation in UNITEDUKRAINE only. The previous game bridge and engine guards are unchanged; AI/wallet expansion and MyISAM conversion are deferred at the operator's request.

## Interface

`/account?tab=admin`, requiring the existing game account with **admin exactly 12**, now opens four module cards:

1. **Управління сервером** — existing players, online list, property registries, proposal editors and game bridge journal.
2. **SEO та статичні сторінки** — general SEO title/description/keywords/canonical domain/social preview; home heading/copy/about text/Discord/trailer link; create, edit, publish, unpublish and soft-delete static pages, restore from trash as a draft.
3. **API та новини** — launcher download/version, resource-update flag/URLs/version, independent launcher maintenance flag/message; the same draft/publication/trash workflow for news.
4. **Вільний блок** — visibly reserved and disabled, not a non-functional link.

At the bottom of **API та новини**, **Підключення новин до лаунчера** generates a copyable developer/AI handoff and a C#/.NET Framework 4.8 example from the saved `seo.siteUrl`. Separate buttons copy the full public `/api/launcher` URL or the selected code. The example reads the root `news` array and documents nullable dates, empty images/lists, polling and failure handling; C# requires System.Net.Http and Newtonsoft.Json. Clipboard denial shows manual-copy instructions. No admin cookie, password or API key is included. The native launcher was not edited or compiled by this website task.

Page/news text is plain text (blank line = paragraph), not executable HTML. Images and downloads are URLs, not file uploads. Published custom pages appear as footer links. News cards on the home page link to their individual public pages. No fictitious news, releases or download links are seeded. Existing contacts/legal text is migrated, including its explicit draft/legal-review notices; this task does not certify those legal documents.

## Database and safety

New migration **`008_site_content.sql`** creates only InnoDB website tables:

- `site_settings`: keys `seo`, `home`, `launcher`, JSON values, optimistic version and updated actor/time.
- `site_documents`: `page` or `news`, unique kind/slug, body, excerpt, image/category, per-document SEO, publication and soft-delete flags, versions and timestamps.
- `site_content_audit`: actor/request UUID, payload hash, event/target, before/after snapshots and persisted result for idempotent retries.

Existing `npm run deploy:build` applies the migration using the existing migration runner before building. No game tables or values are changed by migration 008. `INSERT IGNORE` preserves settings on a safe manual rerun. Do not edit an already-applied migration; add a new numbered migration instead.

All administration API requests check the real current game session/admin level. Writes require trusted Origin, JSON and `X-Account-Csrf`; they lock/recheck current admin level in the transaction. Optimistic versions prevent overwriting concurrent edits. Actor/request UUID retries reuse the stored result; conflicting reuse fails. A content change and its audit commit together; an audit failure rolls back the change. URL validation allows HTTPS without URL credentials, plus site-relative image assets. SQL identifiers/actions are allowlisted and values bound. No arbitrary SQL or server-code execution is exposed. CMS writes share the existing administrative 120-operation/15-minute throttle; the counter is transactional. Audit is append-only through this API, not tamper-proof against DB root.

Delete moves a document to the trash, unpublishes it and removes it from public APIs/HTML/footer. Restore retains the body and makes a **draft**; an administrator must explicitly republish. Slugs remain reserved in trash to avoid accidentally reassigning deleted URLs.

## Endpoints

| Endpoint | Access / result |
| --- | --- |
| `GET /api/site` | Published settings, latest 12 news and up to 100 page navigation links; no admin/audit data |
| `GET /api/site?action=document&kind=page&slug=...` | One published page, otherwise 404 |
| `GET /api/site?action=document&kind=news&slug=...` | One published news item, otherwise 404 |
| `GET /api/launcher` | Explicit launcher configuration, fixed game endpoint and published news with absolute links |
| `GET /api/server` | Real direct UDP info query first; clearly tagged monitor/open.mp fallback, or `unavailable` without invented player count |
| `GET /api/admin?action=site-settings` | Private editable settings and versions |
| `GET /api/admin?action=site-documents&kind=page\|news&state=active\|trash&page=1` | Private paginated documents (20/page) |
| `GET /api/admin?action=site-audit` | Latest 50 content audit event summaries |
| `POST /api/admin?action=site-settings-save` | `{group,value,version,requestId}` |
| `POST /api/admin?action=site-document-save` | `{id:null\|number,version,document,requestId}` |
| `POST /api/admin?action=site-document-delete` | `{id,version,requestId}` |
| `POST /api/admin?action=site-document-restore` | `{id,version,requestId}` |

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

## Verification and deployment boundary

- `npm run build`: TypeScript and Vite production build passed.
- `tests/site.test.mjs`: input/URL/boolean/resource validation, safe HTML/JSON metadata, direct packet parser, coalescing/cache/fallback/unavailable behavior.
- `tests/site.integration.mjs`: disposable loopback MariaDB only, real game-login cookies, role/Origin/CSRF, migration/rerun, settings persistence and stale versions, page draft/publish/HTML, launcher/news synchronization, delete/restore, concurrent idempotent creation, duplicate slug, audit failure rollback and demotion.
- Existing administration/bridge SQL, account, roulette, forum, wiki, Forbes and static React rendering checks were rerun. Static rendering checks all four module cards and editor form fields; it does not prove browser interaction/mobile visual layout.
- No live game edits, MyISAM conversion, production migration, commit, push, hosting restart or deployment was performed for this change. Unrelated existing `FORUM_IMPLEMENTATION.md` edits were preserved. Publish the source through the usual deployment pipeline, then verify the actual public HTML, authenticated CMS and launcher JSON against production.
