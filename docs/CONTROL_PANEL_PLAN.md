# Game control panel — implementation phases

## Current status — local bridge preparation, 2026-10-19

The opt-in Pawn execution bridge and explicit website dispatch workflow are now prepared locally, not deployed or enabled. See [bridge protocol, rollout and verification](../tools/server-bridge/README.md). GET bridge readiness and POST dispatch with password/current game TOTP were added; prepared proposals never execute automatically. Journal states now include queued/applied/rejected, and queued cancellation is supported. Real game native/callback behavior still requires staging tests. Full management, money/ownership/permissions editors and external AI remain unfinished. The phase-1 descriptions below document that earlier read-only milestone; they are not the complete current API contract.

## Agreed first step: sections and a usable navigation hub

Entry: game personal account `/account?tab=admin`, only for `accounts_1101.admin = 12`. This identity is separate from forum moderation roles. The first block is **Панель керування**. It is connected to the same `getMysqlPool` and `DB_*` settings as account/Forbes, never a demo-data fallback.

Implemented in this step:

- Six statistic/navigation cards: players, verified online players, houses, businesses, vehicles, apartments. Unavailable data is shown as unknown, not zero.
- Real read-only lists, paginated 10/20/50/100, ID/name/nickname/plate search, allowed sort orders, free/owned/family/admin/premium filters as appropriate.
- Player capital is exact decimal `money + bank`, excluding donation; money values remain strings to avoid floating-point loss.
- Record detail cards use a fixed field allowlist. Player card links open that player's homes/businesses/vehicles/apartments. Property cards link to the owner's player card.
- Quick query buttons: richest players, free houses, free businesses, players online.
- Online uses a bounded SA-MP client-list query, not `last_login`. Unknown/unreachable/>100-client protocol limitation is explicitly unavailable; unmatched nicknames are distinguished from matched account rows.
- AI and editing are explicitly marked as planned, not functional. No API key, AI provider, unrestricted chat-to-SQL, writes, deletes, credentials viewer or SQL console is added.

### Real-data boundary / deployment

On 2026-10-19 a read-only probe of `https://united-rp.com.ua/api/db-health` returned HTTP 200 `database: connected`. This confirms the deployed health API's connection, not the correctness of any new un-deployed endpoint. `/api/forbes` currently returned HTTP 200 **HTML**, not JSON: Forbes has not been pushed/deployed in this step. Local project environment files / DB variables are not configured in the agent shell. No live DB records, balances or credentials were edited. New endpoints require deploying the source with the existing Vercel environment settings; no schema migration is needed for this read-only first step.

API `GET /api/admin` supports:

- `?action=overview`: operator, available/unavailable counts by entity, online snapshot, timestamp, capabilities `{read:true,edit:false,ai:false}`.
- `?action=list&entity=players|houses|businesses|vehicles|apartments&q=...&filter=...&sort=...&page=1&size=20&ownerId=...`: allowlisted registry. Owner filter only applies to property, not player records.
- `?action=detail&entity=...&id=...`: allowlisted record, `editable:false`.
- `?action=online`: verified online-account list with unmatched names and check time.

Server verifies an unexpired/revocable game session and **exact level 12** for every request; all responses private/no-store/Vary: Cookie. Non-GET is rejected; untrusted table names, filters, sorts and page sizes are rejected; search values are parameter-bound and LIKE wildcards escaped. Passwords, 2FA secrets, email, IP and device identifiers are not queried in lists/details. Auth verification necessarily reads credential stamps through the existing auth helper, never returns them. Overview permits individual game-table failures without replacing unavailable counts with fake zeroes.

## Phase 2 — controlled change preparation (implemented), game execution (pending)

The second step now adds **real persistent change requests, not direct game editing**. Open a record card → `Підготувати зміни` → enter an allowed value and a 10–500 character reason → inspect the server-generated before/after diff → explicitly confirm. The UI never reports a queued proposal as applied. `edit:false` remains intentional; capabilities add `propose:true`. AI is still not connected.

The initial proposal field allowlist is deliberately narrow:

| Entity | Proposal fields | Input constraints |
| --- | --- | --- |
| `players` | `skin` | integer 0–30000 |
| `houses` | `name` | nonempty, up to 19 characters (Pawn buffer 20 with NUL) |
| `businesses` | `name` | nonempty, up to 29 characters (Pawn buffer 30 with NUL) |
| `vehicles` | `color_1`, `color_2` | integer 0–255 |
| `apartments` | `locked` | 0 or 1 |

These constraints validate a **proposal**, not that a skin/model exists or that a change is safe to execute in a particular game state. The future bridge must validate actual loaded game IDs, permissions, dependencies and current state again. Names reject controls, Pawn colour braces and supplementary Unicode characters. No money/admin/ownership/credentials/coordinates/deletion/mass-operation editor exists. The supplied dump's field widths are respected; actual deployed schema and engines still require pre-execution inspection.

### Storage / endpoints

New migration `006_admin_changes.sql` creates only website-owned InnoDB tables `site_admin_changes`, `site_admin_audit`, `site_admin_limits`. It does not alter any game table. The existing deploy migration runner automatically picks up this file on deployment; the preceding already-approved `005` remains unchanged. This step does not deploy or run migrations against production.

All endpoints use `/api/admin` and verify the live game session and **exact admin level 12**:

- `GET ?action=detail&entity=...&id=...` adds `version` and `proposalFields`; `editable` remains false.
- `POST ?action=preview` JSON `{entity,id,version,values,reason}` validates the original record and returns `changes`, `reason`, `expiresAt`, `token`, `applied:false`. Preview is not persisted; HMAC-signed data is session/actor-bound and expires after ten minutes. The session binding does not contain the raw login cookie or database session ID.
- `POST ?action=confirm` JSON `{token,requestId}` (UUID v4) rechecks the current record version, then atomically inserts a request **and** its `submitted` audit event. Response `{id,status:"awaiting_bridge",applied:false,replayed}`. Unique actor/request and active-target keys prevent duplicate submissions or overlapping active requests for the same record. The browser retains the same key for retries while that preview is open. A lost response can be resolved by retrying or inspecting the journal; a page reload discards the preview but not saved requests.
- `POST ?action=cancel` JSON `{id,reason}` locks a prepared/queued request, marks it cancelled, frees its active-target key and appends a `cancelled` audit event in the same transaction. Repeated cancellation does not duplicate the event. Any current level-12 administrator can cancel; the actor of each event is recorded.
- `GET ?action=changes&status=all|awaiting_bridge|queued|applied|rejected|cancelled&page=1` returns twenty requests per page with diffs, reasons, actor IDs/current nicknames, server result code and ordered audit events. Readiness is separate at `GET ?action=bridge`; static `executionEnabled:false` was removed. Audit rows are append-only through this API, **not tamper-proof against a database administrator**.

POST requires trusted Origin, JSON and the current `X-Account-Csrf`. Payloads are bounded to 16 KiB. Previews and successful submissions/cancellations share a per-admin 120-operation/15-minute limit; failed transactional submissions roll back their counter. HMAC uses existing `ACCOUNT_RATE_SECRET` or `FORUM_IP_SECRET`, minimum 32 characters in production. No new external provider or secret is needed if the existing secret is valid. Local preview signatures are process-specific unless a development secret is supplied. Signed tokens, credential stamps, password fields and other account credentials are not stored in audit/history.

Version comparison covers allowlisted game columns and detects changes visible at preview/confirmation. It is **not an atomic lock against game writes**: a server could change a record immediately afterwards. This is acceptable for a non-executing queue only; a future worker must revalidate at actual execution. A cancelled request cannot be resurrected by retrying its original confirmation. Expired previews cannot create new requests; an already-committed identical request can still be looked up idempotently.

### Remaining before real editing

1. Confirm each field's game semantics, dependencies and storage engine in the deployed schema. Many game property/vehicle tables in the supplied dump are MyISAM; cross-table transactional edits must not be claimed atomic without resolving that.
2. Expand permission-scoped editors only after validating game-side semantics. Submission/cancellation audit and before/after preview are implemented; execution/rollback audit is not.
3. Add stronger re-authentication/2FA and recovery for higher-risk changes. The current low-risk, non-executing queue uses the existing session and CSRF; it is not a substitute for step-up authentication of actual money/role writes.
4. Game server caches account/property/vehicle data. To prevent overwrite or inconsistent ownership, build a game-side request/ack bridge or enforce a verified maintenance/offline workflow. Database writes alone do not establish in-game synchronization.
5. Start with low-risk metadata; money, admin roles, ownership transfers, deletion and mass changes require stronger confirmation, re-auth/2FA, audit, rollback/recovery and separate authorization. Preserve last administrator access.

## Phase 3 — AI assistant (read-only first)

Choose and configure a provider/key only after operator approval; consider the privacy of transmitting game data. A tool-based assistant should map intent to the **same allowlisted search/detail functions** and display clickable results. It must not generate/execute arbitrary SQL, read password columns or treat text in player/business names as instructions. Start with: find a business by ID/name; find a house; richest players; unowned houses. Unknown intents ask for clarification. Editing is a separate form/confirmation workflow, never implicit model execution.

Without this provider, do not label keyword matching as AI. The UI currently offers real quick-query buttons and visibly says AI is planned.

## Phase 4 — operations and complete management

Scoped staff permissions, audit search, background job status, exports with field restrictions, backups/restoration drills, verified migrations, monitoring and game-bridge health. Only then expand to safe bulk operations with limits and approval. Full database-root access is not the intended interface.

## Verification

Unit/API tests and disposable MariaDB integration tests with synthetic records passed: real game-login/session authorization, exact admin-level check, denied access after demotion, allowlisted lists/details for all five tables, ownership/free filters, LIKE-literal escaping, pagination, exact large-money sorting, unknown online handling, and refusal of mutations/unsafe identifiers. Account, roulette and Forbes regressions are checked too. No live balances are used. The supplied Pawn source confirms `IsHouseOwned`/`IsBusinessOwned` use owner ID >0, consistent with free <=0; apartment ownership uses the same rule.

Phase 2 was additionally verified against isolated local MariaDB with synthetic accounts, real game-login cookies, migration 006 and actual SQL: all five proposal forms; exact role/Origin/CSRF boundaries; invalid and tampered previews; changed-session rejection; stale-record conflict; concurrent identical retries; three conflicting submissions on the two-connection pool; cancellation replay; pending-target uniqueness; rate limit; and an injected audit INSERT failure that rolls back the entire request. Snapshots confirm all game-table records remain unchanged during request workflows. Unit tests cover token expiry and production-secret requirements. Static React rendering checks request-vs-execution labels and HTML escaping of diffs.

The production connection health was checked read-only during phase 1; new production Forbes/admin queries and migration 006 still need post-deploy verification by an authenticated admin. Browser access was disabled in Work settings at the end of the previous step, so this panel's visual QA has not been completed. The real React panel is statically rendered in tests to validate six section buttons, safe initial counts, quick queries and honest editing/AI labels. Static rendering does not establish interactive/mobile layout correctness.
