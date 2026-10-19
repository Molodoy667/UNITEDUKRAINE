# UNITED UKRAINE — game administration bridge v1

For the actual 2026-10-19 activation evidence, current engine restrictions, backups and unverified scenarios, see [deployment record](../../docs/ADMIN_BRIDGE_DEPLOYMENT.md).

Website deployment alone does not enable game writes. This is a narrow first execution bridge, not full database administration. A successful compile or SQL test does not certify a production rollout; verify the actual server heartbeat and in-game effects separately.

The requested website routing ID `ADMIN_BRIDGE_ID=united-main` is configured in `vercel.json`. It is public configuration, not a secret. Vercel supports this static runtime setting ([configuration reference](https://vercel.com/docs/project-configuration/vercel-json#env)); other database and account secrets remain in project settings. Local development still needs its own environment variable. This does not bypass heartbeat, admin level, password/TOTP, engine or explicit-dispatch checks.

## Files and activation boundary

- Website migrations: `006_admin_changes.sql` and `007_admin_bridge.sql`, picked up by the existing `npm run deploy:build` migration runner.
- Server module: `united_web_bridge.inc` in this directory, also installed locally at `D:/RADMIR/gamemodes/systems/united_web_bridge.inc`. It contains no database credentials; it uses the existing server connection configuration.
- Local `D:/RADMIR/gamemodes/senior.pwn` has only these additions (CP1251 retained):

```pawn
// After #include "systems/player/rub.inc"
#include "systems/united_web_bridge.inc"

// At the end of the main OnGameModeInit, after NG:Init()
// UNITED web bridge: opt-in only; never deploy or enable from website alone.
UUW_Init();
```

The module uses an ALS `OnGameModeExit` chain and leaves the existing exit handler intact. Compile with the bundled tools, never copy an unsuccessful/partial AMX. The resulting test artifacts are under `.local/build`, not the working `gamemodes/senior.amx`.

The separate operator-approved server rollout requires (staging is recommended before any real game edit):

1. Back up the DB, inspect actual game table engines and confirm that the website and this gamemode use the same intended database/world. Only one bridge consumer per database is supported. Do not import any synthetic test fixture.
2. Deploy the website source with existing `DB_*`, account Origin/secret settings and migrations 006/007. The committed Vercel runtime configuration sets **`ADMIN_BRIDGE_ID=united-main`**. This ID is a routing identifier, not a password.
3. Install the compiled gamemode and module using the same R39-6 plugin/API, with a verified backup of the previous remote files. Check active server source and included dependencies before replacing the binary.
4. Copy the supplied `united_web_bridge.cfg.example` to the test server's **`scriptfiles/united_web_bridge.cfg`**. Use ASCII/no BOM, exact keys:

```ini
enabled=1
bridge_id=united-main
```

The supplied example intentionally has `enabled=0`. Activation is a separate operator step, not a side effect of copying the example or pushing Git. The server reads the actual config at initialization; enabling/disabling requires an approved restart. Custom `server.cfg` console variables are not used.

5. Check the server startup log and `GET /api/admin?action=bridge` as a logged-in level-12 admin. Only a protocol-1, enabled, `ready` heartbeat no older than 30 seconds enables website dispatch. Entity capability flags must also be true.
6. On a disposable test account/property: prepare → compare → save proposal → open journal → **Надіслати на ігровий сервер** → re-enter game password and an unused valid TOTP if enabled → confirm the actual change. Observe `queued`, then `applied` or `rejected` plus server result code. Verify both DB values and actual in-game behavior/re-login/restart before considering production rollout.

## API and state flow

- `GET /api/admin?action=bridge`: admin-only readiness, heartbeat time, per-entity capabilities. No credential fields.
- `POST /api/admin?action=dispatch`, JSON `{id,password,code?}`, current session/Origin/CSRF required. Password is checked against the current game account, not persisted or logged. Locks/rechecks current admin level 12. Existing enabled game TOTP and replay protection are honored. At most 10 step-up attempts/15 minutes, failures counted outside the transaction.
- Dispatch revalidates proposal version and field rules, stores the full allowlisted snapshot and appends `dispatched` in one transaction. Response means **queued, not applied**. Retries of the same change do not enqueue twice. An already queued/final request may be looked up after password/TOTP validation without consuming a second TOTP operation.
- Only explicit dispatches become `queued`; old prepared `awaiting_bridge` requests are never automatically executed. A dispatched request expires after five minutes. If no consumer is running it stays queued until cancelled or rejected on later processing; time passing alone does not mean it was applied.
- `GET ...?action=changes` filters `all`, `awaiting_bridge`, `queued`, `applied`, `rejected`, `cancelled`. History includes audit events and `result_code`. The journal refreshes every ten seconds without clearing an open password form.
- Cancellation is allowed before dispatch and while queued. Cancellation and consumption lock the same request: whichever commits first wins. Applied/rejected requests cannot be cancelled or resurrected. No automatic rollback or mass-operation API exists.

## Execution rules

| Entity | Operation | Additional guard |
| --- | --- | --- |
| players | `skin` | `IsValidSkin` from the actual server list; no connected client matching account ID/nickname, including not-yet-authorized clients |
| houses | `name` | loaded cache matches the expected name; 1–19 CP1251 characters |
| businesses | `name` | loaded cache matches the expected name; 1–29 CP1251 characters |
| vehicles | `color_1`, `color_2` | 0–255, loaded personal vehicle only, not family, cache colours match; unloaded vehicles rejected |
| apartments | `locked` | 0/1, loaded cache matches expected lock state |

Names must round-trip CP1251 without substitution; control/colour codes, braces, double quotes and backslashes are rejected to avoid corrupting existing CEF string builders. Website validation uses the same field widths. Existing open CEF views are not automatically re-rendered; their next normal read sees the updated cache.

All website-owned queue/audit/dispatch/bridge tables and `accounts_1101` must be InnoDB. The target game table must also be InnoDB. **Many property/vehicle tables in the supplied dump are MyISAM**. They will report disabled capability / `engine_blocked`; no new engine conversion was added or performed. Further conversion needs separate approval, backup and maintenance planning. Existing migration 005's previously approved accounts conversion is unchanged.

The consumer uses a dedicated non-reconnecting MySQL R39-6 handle; connection deduplication is explicitly disabled just while creating it, then the original default is restored. A database-wide advisory lock is held for its lifetime, preventing two consumers with separate caches. One job is processed per ten-second timer; polling defers while the main handle has unprocessed queries. R39-6 decrements that query count before callback execution, so it is **not alone a callback-drain guarantee**. The additional guards rely on this inspected gamemode: house/business/car loading is synchronous, apartment loading is startup-only (missing/mismatching cache rejects), player edits require the player disconnected. Additional plugins/filterscripts that mutate the same state or asynchronous reloads require another review before enabling this bridge.

Within the synchronous game callback: lock request/dispatcher/target; check role, expiry, fixed typed payload, full case-sensitive/null-aware snapshot and cached values; update target; update receipt; append audit; COMMIT; update cached game values before returning to the game loop. All SQL identifiers are fixed. No client-supplied SQL is executed. Full-row snapshots can safely reject when SQL float formatting differs from the website representation; this is a false stale conflict, not permission to bypass the check.

Any SQL error/uncertain COMMIT pauses the consumer. It does not reconnect and guess/retry with potentially stale memory. A reachable DB receipt resolves commit ambiguity; after investigation, restart the gamemode to reload its caches before resuming. A fresh ready heartbeat may remain visible for up to 30 seconds after failure; dispatch during that interval can only leave an unprocessed queued request, not force execution.

Synchronous SQL can stall the SA-MP main thread during network latency/outage. The module limits lock waits to one second, but that is **not a network/read timeout**. Staging needs latency/load/outage testing before production enablement. Automatic reconnection and arbitrary live SQL were deliberately not added.

## Verification and remaining unknowns

- Bundled Pawn compiler: successful build, zero compiler errors/warnings. Latest build paths recorded in `D:/RADMIR/FIXLOG.md`. The pre-existing compiler estimate is 4793 cells maximum usage against 4096 allocated stack/heap cells; the same estimate occurred before this task. This separate existing risk was not hidden or changed.
- Actual website API integration on disposable local MariaDB covers role, session, Origin/CSRF, re-entered password, current TOTP/replay, stale heartbeat, disabled engine capability, snapshot persistence, dispatch retry/cancellation and persistent failed-attempt throttle.
- `npm run test:admin:bridge` executes SQL strings extracted from this actual Pawn include on disposable MariaDB: five fixed updates, CP1251/case/NULL/missing-snapshot validation, typed payloads, name safety, engine detection, receipt/audit atomic rollback, expiry/role flags and exclusive ownership lock. **It does not execute AMX, R39-6 native functions or in-game callbacks.**
- The full game runtime, native cache updates, client visuals, deployed schema, real server heartbeat and load/failure behavior remain unverified. No game runtime was launched against the real database. Browser interaction/visual QA remains unavailable while browser access is disabled.

References checked against local include signatures: [Pawn](https://www.compuphase.com/pawn/pawn.htm), [open.mp callbacks](https://open.mp/docs/scripting/callbacks/OnGameModeExit), [R39-6 source](https://github.com/pBlueG/SA-MP-MySQL/tree/R39-6), particularly `CMySQLHandle`, `CMySQLConnection`, `CMySQLQuery` and `CCallback`. Current wiki examples use newer signatures; the code uses the installed R39-6 include, not R41 signatures.
