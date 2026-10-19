# Forbes — wealth leaderboard

Page `/forbes`, public shared desktop/mobile navigation entry between roulette and donation. No game or forum login is required. The existing MySQL environment variables are reused; **no migration, table creation or production data write** is needed.

## Ranking rules

Source: `accounts_1101`. Capital is **`money + bank`**, excluding donation, coins, vehicle/property values and business cash. This definition is disclosed on the page. The table schema was checked in the operator-provided SQL dump, reading only its CREATE TABLE definition, not account records. `money` and `bank` are VARCHAR(21), so each is validated as an integer and cast to `DECIMAL(30,0)` before addition/sorting. Negative balances remain signed; malformed/NULL values contribute zero. Ties are ordered by `id ASC` for a stable result.

The first **13** accounts form the list. Places 1–3 use a skin podium: **second left, first center and tallest, third right**. Silver, gold and bronze SVG/CSS trophies are behind the skins. These are depth-styled vector illustrations, not external 3D models. Existing wiki preview URLs are matched against each account's numeric `skin`; an unavailable preview has a neutral fallback, never another character's skin. Places 4–13 are ten ordinary nickname/capital rows. If fewer accounts exist, the page does not invent users or amounts.

All accounts are included, including administrators: no operator-requested exclusion criteria exist. Game money only becomes visible after the game saves it to the database. This is not a real-time read of the Pawn server's in-memory wallet.

## Public API

**`GET /api/forbes`**, returns:

```json
{
  "basis": "cash_plus_bank",
  "limit": 13,
  "updatedAt": "2026-10-19T00:00:00.000Z",
  "players": [
    {"rank": 1, "id": 1, "nickname": "Example_Player", "skinId": 223, "wealth": "6280000000"}
  ]
}
```

The JSON above illustrates the contract, not a live result. The SELECT reads only `id,name,skin` and the computed total. Passwords, email, IPs and donation balances are never queried or returned. Wealth is a decimal **string**, not a floating-point Number. The frontend also formats full amounts using BigInt, including amounts beyond signed BIGINT precision. Compact mobile podium labels are abbreviations; full totals are retained as accessible names/tooltips and table totals stay exact.

The handler coalesces concurrent requests and caches for 60 seconds per instance. Public edge caching uses `s-maxage=60, stale-while-revalidate=30`; the visible page polls each minute while active and has manual refresh. Due to these caches, results are not guaranteed to be under 60 seconds old: timestamps show the actual last successful DB read. Cache expiry/query failure returns generic 503/no-store, without pretending an old response is fresh. The page retains its last successful ranking with an explicit error notice. A 12-second network timeout restores the retry control. Invalid JSON is validated before date/BigInt rendering. No visitor parameters alter SQL, limit or sort order; non-GET returns 405.

The total requires a computed sort across accounts. The minute cache bounds normal request cost per instance, but production query duration/large-table load have not been measured. If the game DB grows substantially, use a separately refreshed ranking snapshot or validated generated-column index; no schema alteration is introduced here.

## Verification

- `npm run test:forbes`: API contract, method/privacy boundary, concurrent cache coalescing, refresh/failure recovery, DTO validation, exact integer formatting and frontend response validation.
- `npm run test:forbes:integration`: actual SQL against isolated loopback MariaDB. Set `FORBES_TEST_DB_PORT` to a non-3306 port and `FORBES_TEST_DB_PASSWORD`. The helper refuses production/VERCEL, creates a random `forbes_test_*` database and removes only that test database. No project env file or game-player dump is loaded. Cases cover 3+10 limit, numeric sums/order, ties, >Number/>BIGINT/21-digit totals, invalid/debt/null values, no mutation and empty tables.
- Existing account/forum/wiki/design tests and TypeScript/Vite build are regression checks.
- Desktop browser QA on synthetic local SQL records confirmed the 2–1–3 placement, three correctly matched skin images, ten rows and global navigation. Screenshot: `outputs/forbes-desktop.png` (ignored artifact).
- **Mobile visual QA was not completed:** browser access became disabled in Work settings before mobile interaction. Responsive CSS is implemented, but not claimed visually verified. Live production DB access and the deployed endpoint were not tested; this implementation has not been committed/pushed/deployed in this work step.

Local preview (synthetic players, not shipped to production): set `FORBES_TEST_PREVIEW=1` plus the isolated DB variables, run `node tests/forbes.preview.mjs` and the existing Vite dev server. Type `quit` into the preview process to stop it and remove its exact disposable DB.
