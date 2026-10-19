# Game bridge activation — 2026-10-19

Operator explicitly requested activation and separately approved restarting with one connected client. This records a verified startup, **not an end-to-end game-edit certification**.

## Confirmed

- Feature commit `d757df2` pushed to `Molodoy667/UNITEDUKRAINE`, branch `main`; remote SHA matched the local commit.
- Production build/typecheck and 25 admin/Forbes/SSR regression tests passed again before push. Earlier disposable database integration tests are documented separately.
- Website deployed: `/api/db-health` returned JSON/200, `/api/forbes` returned JSON/200 with five actual ranking entries, unauthenticated `/api/admin?action=bridge` returned JSON/401.
- Production database migration ledger contains `006_admin_changes.sql` and `007_admin_bridge.sql`. No manual production migration or synthetic game-data fixture was imported.
- SFTP pinned host key verified. Active `gamemode0 senior` source matched the pre-bridge backup (SHA-256 `CB4E1773AA595DF8F290993800B8D281A7CA253A2F2DAFEBBA9668EF6F5606C2`). All 94 remote system source files matched local build inputs. The map editor source was not present remotely, but its local hash matches its previous build record, and the remote AMX exactly matched the previous local build.
- Installed source, module, activation config and successful bundled-compiler AMX after staged upload/download SHA-256 checks. No plugin, database credential, existing server configuration, engine conversion, balance, ownership or role was changed by installation.
- New AMX SHA-256: `DF9011738D6E1D37064CB46694DF030F3CB311B6E9F71859B8BC4161834B260A`.
- Explicitly approved RCON `gmx` sent after successful readiness echo; server query answered afterwards. Log: `[09:25:33] [UNITED-WEB] Started; awaiting explicit website dispatches, protocol 1.`
- Real DB heartbeat advanced across checks. At database UTC `2026-10-19 06:26:33`, heartbeat was `06:26:23`, protocol `1`, enabled `1`, detail `ready`. The committed website `bridgeStatus` function against this database returned `configured:true, available:true` for `united-main`.
- Queue remained empty. No actual edit was dispatched in this verification. No new runtime error appeared in the inspected post-start log segment.

## Current execution limits

| Entity | Deployed engine | Available operation |
| --- | --- | --- |
| Players | InnoDB | Valid skin ID, only while disconnected |
| Apartments | InnoDB | Lock state 0/1, matching loaded cache |
| Houses | MyISAM | Blocked |
| Businesses | MyISAM | Blocked |
| Vehicles | MyISAM | Blocked |

The database engine guards were retained. Further engine conversions require separate backup/maintenance approval. Money, roles, ownership, deletion and arbitrary SQL remain unsupported.

## Recovery and unverified scenarios

- Local previous AMX/source/dependency backups: `work/bridge-review-20261019-092052/` (ignored by Git; contains private configuration and must not be published).
- Remote previous files retained at `/gamemodes/senior.amx.uu-before-20261019-092400` and `/gamemodes/senior.pwn.uu-before-20261019-092400`.
- To disable without changing code, set `enabled=0` in `scriptfiles/united_web_bridge.cfg` and perform a separately coordinated restart. Any SQL failure pauses consumption automatically; inspect receipts/caches before restarting.
- Local server FIXLOG backup: `D:/RADMIR/.local/backups/20261019-092526-362-dbab1bd5/FIXLOG.md`.
- Browser automation was disabled in Work settings; authenticated production UI/dispatch, actual in-game changes, native cache effects, load and outage/commit-failure recovery were not tested. Readiness was checked through server logs and the database, not by impersonating a logged-in player.
- The old log contains pre-activation `Stack/heap collision` errors in `UpdateCarshering`. The existing compiler stack estimate warning/risk was documented before this activation; no unrelated stack-size or carsharing changes were made. A healthy heartbeat does not establish overall game-server correctness.
