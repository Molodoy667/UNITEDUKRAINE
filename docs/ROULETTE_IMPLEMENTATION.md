# United Ukraine — test roulette

## What is implemented

Page `/roulette`, shared desktop/mobile navigation entry. Requires an existing **game account** session, not a forum session. Six server-defined prizes/rarities, weighted server draw using `node:crypto.randomInt`, CSS-perspective prize belt, colored triangular backgrounds, a 3D-style reveal, continuous synthesized Web Audio motor/ticks and final chime, mute, fast mode, and a personal history of the latest 50 prizes with pending/kept/sold states.

Normal animation: **12 seconds** (acceleration, cruise, smooth deceleration). Fast mode: **2.8 seconds**. Reduced-motion preference: **0.6 seconds**. These are CSS 3D/perspective effects, not a WebGL model renderer. The immutable prize returned by the server is placed at belt index 96; the result dialog uses that same snapshot. Polling balances does not recreate the animation. Closing/reloading cannot reroll or lose a committed pending prize.

Each game account gets **one test free spin**, persisted in `site_roulette_players`; reloading does not grant another. This is not connected to the old PRIME RP/MTA three-hour free-spin feature. No recurring grant is implemented in this United Ukraine test edition.

**Real donation balance** is `accounts_1101.donate_current`. A paid spin costs **100**; selling any test prize credits **100**. A confirmation explicitly says that real donation is used for test prizes. Keeping a test prize saves it **only to the website collection**, not the game's cars, skins or accessory tables. This limitation is stated on the page and result dialog. All users with existing game accounts are eligible for the one-time test free spin, including its +100 sale option: this is a test-edition grant, not a purchase-only refund.

| Rarity | Prize | Chance |
| --- | --- | --- |
| Common / white | Skin #21 | 60% |
| Rare / blue | KIA Rio | 24% |
| Epic / violet | Skin #223 | 10% |
| Mythic / pink | BMW G30 | 4% |
| Legendary / red | Maybach X222 | 1.6% |
| Exclusive / gold | Aurora GT concept | 0.4% |

Catalog: `lib/roulette/catalog.js`. Existing wiki previews are reused. The Maybach uses `/wiki/cars/429_2.png`: visual QA found that variant 1 in the original source bundle depicts a BMW instead. No unverified skin character names are invented. The gold concept is artwork, not a real game model ID.

## API

Endpoint: **`/api/roulette`**. All responses are private/no-store. No password or DB credentials are returned.

- `GET ?action=state` (default): `user`, `csrf`, `balance`, `freeSpins`, `prizes`, `rarities`, `spinPrice`, `salePrice`, `testMode`, `history`, `pending`, `moneyAvailable`, `moneyReason`.
- `POST ?action=spin`: JSON `{ "payment": "free" | "donate", "requestId": "<UUID>" }`.
- `POST ?action=resolve`: JSON `{ "spinId": "<UUID>", "decision": "keep" | "sell" }`.
- Writes require JSON, an allowed Origin, the HttpOnly game-session cookie and `X-Account-Csrf`.
- Both POSTs return `{ spin: { id, prize, status, payment, cost, createdAt, resolvedAt } }`.

Account IDs, price, award and balance are authoritative on the server. A per-account exclusive lock serializes mutations. Unique `(account_id, request_id)` prevents duplicate charges; immutable prize snapshots prevent mismatches. Only one unresolved prize is allowed. Resolving the same decision again returns the existing result; changing a completed decision is rejected. A unique ledger entry per `(spin_id, kind)` protects credits/debits. Balance change, prize, free-spin consumption, resolution and ledger commit/rollback together on InnoDB.

## Migration / deployment

The operator explicitly approved including **`ALTER TABLE accounts_1101 ENGINE=InnoDB`** in deployment migration `005_roulette.sql`. It is conditional: already-InnoDB tables are left unchanged; a missing game table (e.g. a forum-only test database) skips conversion. The conversion changes no columns or balance values. It can lock the game-account table and needs adequate disk space and ALTER permission: **take a current backup and deploy in a maintenance window**. DDL itself is not transactionally rolled back by the application's wallet transactions.

The migration also creates InnoDB `site_roulette_players`, `site_roulette_spins`, `site_roulette_ledger`. Existing `npm run deploy:build` runs all numbered migrations before the build. There are no new secret environment variables. Until the engine/table migration is applied, the API fails closed rather than debiting a MyISAM wallet.

### Game-server concurrency limitation

The inspected Pawn source caches `P_DONATE_CURRENT` and later writes it back in `GivePlayerDonate`. Consequently **paid spins and selling require freshly verified offline status**, using the existing fixed-server SA-MP client query. Online/unknown/query failure rejects money changes; free spinning and keeping a website prize remain possible.

This is a fail-closed guard, **not an atomic lock against the player logging into the game immediately after the query**. The website transaction cannot coordinate an external Pawn cache by itself. Full cross-game consistency while online or during simultaneous login requires a game-side wallet bridge/shared locking protocol and changes to that project, which are not included here. UDP reachability from Vercel must be verified after deployment; if unavailable, money actions stay disabled. No real player balance was used for local QA.

## Reproducing tests

Run a disposable local MariaDB bound to `127.0.0.1` on a non-3306 port; do not use production credentials. Set `ROULETTE_TEST_DB_PORT` and `ROULETTE_TEST_DB_PASSWORD`, then `npm run test:roulette`. The test suite creates a randomly named `roulette_test_*` database, synthesizes game accounts, applies **all** migrations and drops only its exact test database afterwards. It refuses production/VERCEL and port 3306. It never loads project env files. Tests assert migration preservation, idempotency/concurrent requests, ownership, CSRF, insufficient funds, presence guards, injected SQL-failure rollback after wallet UPDATE, MyISAM rejection, immutable award, draw boundaries and monotonic visual progress/all-six inclusion.

UI preview: additionally set `ROULETTE_TEST_PREVIEW=1`, run `node tests/roulette.preview.mjs` and `npm run dev -- --host 127.0.0.1`. Synthetic login is `player@example.test` / `Synthetic-Game-Password`; initial donation 1450, offline presence is injected only in this test process. The preview uses real disposable local SQL transactions, not production money. Stop the preview with SIGINT/SIGTERM to remove its test database.

## Generated artwork

Method: built-in `image_gen.imagegen`, transparent output. Integrated asset: `public/roulette/aurora-gt.png`. Original output: `C:/Users/Admin/.codex/generated_images/01a0b545-6f6f-7771-884c-4d7f8ceaa4bf/exec-7e75115e-a457-45eb-9b6b-80b78f5dade8.png`.

Prompt brief: an original luxury black-and-champagne-gold concept supercar named Aurora GT, front three-quarter view facing left, clean realistic game-prize render, complete car on transparent background, cinematic studio lighting, no text, no watermark and no manufacturer logo. The surrounding triangles, stage, light rays and interface are authored in CSS, not baked into the asset.

## Verification scope

Local MariaDB 11.4.9 integration tests, existing account/forum/wiki/design tests and the production build were run. Browser QA covers guest gating, the 12-second belt, exact center/result match, paid confirmation, sale/keep and balances, pending/history and responsive layouts. These checks do not establish production ALTER permission, Vercel UDP connectivity or live game issuance. The site version must still be deployed and checked by an operator before real-money use.
