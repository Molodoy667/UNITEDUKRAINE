# Game personal account

Page: `/account`. The forum and game accounts remain independent identities.

## Data and verified game rules

The account dashboard reads game table `accounts_1101`. Login uses `email` and `players_password`, matching the case-sensitive literal password comparison in `D:/RADMIR/gamemodes/senior.pwn`, `OnAuthorizationStart`. The website never updates or rehashes game passwords. Passwords, game 2FA secrets, IPs and device identifiers never enter a public API response. Separate test roulette functionality can mutate `donate_current` under its own transaction/offline guards; see `ROULETTE_IMPLEMENTATION.md`.

The same source defines `GetExpToNextLevel` as `(level + 1) * 4`, but `GivePlayerExp` increments the level only when experience is **greater** than that value. The displayed promotion requirement is consequently `(level + 1) * 4 + 1`. Existing surplus experience is clamped to 100% visually, not changed in the database.

`last_login` is updated by `SavePlayerAccount`, including on disconnect. It is deliberately displayed as **last activity**, not a guaranteed last login time. `last_exit` is shown separately. Online is checked using a bounded SA-MP client-list UDP query to the same fixed server used by `/api/server`: `51.75.44.14:2219`. Replies are validated and cached in memory for 15 seconds. If the query is unavailable, malformed, or disabled (including the protocol's >100-player limitation), the status is `null`, not falsely offline. Reference: https://open.mp/docs/tutorials/QueryMechanism . UDP reachability from the deployed Vercel function must still be checked after deployment.

Property ownership follows `owner_id = accounts_1101.id`, as verified in the game's property/vehicle/apartment modules:

| UI | Table | Additional fields |
| --- | --- | --- |
| Cars | `ownable_cars` | `model_id`, number, mileage, fuel; excludes family cars (`famcar <> 0`) |
| Houses | `houses` | name, city/zone IDs, price, paid-until time |
| Businesses | `business` | name, price, balance, products, paid-until time |
| Apartments | `appartaments_ap` | building ID, floor, stored apartment number, price, paid days |

Skin/vehicle labels and previews come from `/wiki/catalog.json`, matched by numeric `skin`/`model_id`; unavailable previews have an explicit fallback. City names/indices come from `D:/RADMIR/pawno/include/zones.inc`, with an ID fallback for unknown values. Apartment display numbers follow `app.inc`: `(floor - 1) * 4 + apt_num + 1`; the raw `apt_num` is a zero-based position on a floor, not the visible apartment number. The game treats `job` as a faction rank when `team` is set; it must not be mapped directly to the employment array's different IDs. Known legacy job mappings and faction names/ranks were checked against the source. Additional jobs without a confirmed mapping display their ID.

Also displayed: phone and SIM balance, cash/bank/donate/coins, premium tier/expiry, registration, game activity today/yesterday, licences, warnings, health, law-abiding score, property slots and 2FA state. Premium is active only while `premium_time` is in the future. The `/api/account` dashboard itself provides no payment, transfer, password-change or game-state mutation.

## API

`/api/account` accepts these actions:

- `GET ?action=session` (default): `{ account: null }` for a guest; otherwise `{ account, assets, presence, csrf, updatedAt }`.
- `POST ?action=login`: JSON `{ email, password, code? }`. Returns the public profile and CSRF token, sets a 7-day HttpOnly/SameSite cookie, then the browser separately loads the dashboard. Existing game Google Authenticator protection is checked when `google_auth > 0`; invalid or unsupported secret formats fail closed.
- `POST ?action=logout`: JSON `{}` with `X-Account-Csrf`; revokes the session and clears the cookie.
- `GET ?action=admin`: requires a current game account with **exactly `admin = 12`**; no site-edit operations exist yet. The dashboard's admin entry opens `/account?tab=admin`.

Production cookies are `__Host-uu_account` with Secure/HttpOnly/Path=/; local HTTP development uses `uu_account`. Only a SHA-256 session-token digest is stored. Sessions are invalidated when the game password, email or 2FA settings change. Writes require an allowed Origin and JSON, with CSRF verification for authenticated requests. Rate limits are database-backed (IP and email), so they survive concurrent function instances. Duplicate-email matches are rejected rather than selecting another character arbitrarily. All ownership predicates use the server-authenticated account ID, never a browser-supplied ID.

## Configuration and migration

Uses the existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. The existing `FORUM_ORIGIN` and `FORUM_IP_SECRET` work for the account too. Optional overrides: `ACCOUNT_ORIGIN` and `ACCOUNT_RATE_SECRET` (at least 32 characters). Vercel's environment-provided deployment and production hostnames are also allowed Origins. No credentials belong in source control.

`migrations/004_game_accounts.sql` creates only `site_account_sessions`, `site_account_limits`, `site_account_totp_steps`; no foreign key or writes to the MyISAM game tables. The current `npm run deploy:build` already runs all numbered migrations through `forum:migrate`, so migration 004 participates in deployment. The full player SQL dump is never imported by the application.

Migration 005 adds roulette tables and the separately operator-approved conversion of `accounts_1101` to InnoDB. Take a backup and schedule a maintenance window; this can block the table. The account data/auth columns are unchanged.

Development: run the existing `npm run forum:api` alongside `npm run dev`. Expired sessions/rate buckets are removed by `npm run forum:cleanup`. After deploying, verify a real game account and compare property ownership against the live DB; local synthetic tests do not establish live DB connectivity or runtime UDP reachability.
