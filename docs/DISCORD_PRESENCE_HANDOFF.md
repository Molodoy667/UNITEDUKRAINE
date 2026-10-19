# Discord Rich Presence: website/API handoff

Prepared 2026-10-19 in UNITEDUKRAINE. Client ASI, Discord SDK DLL, manifest and Discord application settings were not changed. No commit, push, hosting change or deployment is part of this preparation.

## Server identity — verified, not guessed

- IPv4 **51.75.44.14**, port **2219**, server ID **1**.
- Configured name **United Ukraine**, from both release entries in `public/Project/info.json`.
- Same endpoint already used by `lib/server-status.js` and public `/api/server`.
- Direct local SA-MP info query at **2026-10-19T20:24:36.060Z** returned `name: United Ukraine | Сервер: 1`, `players: 0`, `maxPlayers: 500`, `source: game-query`.
- Published HTTPS `/api/server` at **2026-10-19T20:25:01.614Z** independently returned the same identity and `0/500` with `source: game-query`. These are timestamped snapshots, not an assertion about the current online count.

The XML uses the configured short name, optionally suffixed with a confirmed count. The game's free-form monitor name is not treated as executable XML or trusted route configuration.

## Prepared route and ASI strings

```text
Website origin (HTTPS, after deployment): https://united-rp.com.ua
Path (preserves original lowercase path): /projects/crmp/v2/info.xml
Alternative API path: /api/server?format=discord
```

The exact path is rewritten **before the SPA fallback** to the existing `api/server.js` function. No extra Vercel function, DB table, migration, login, cookie or API key is required. Standard `/api/server` remains JSON. The JSON and XML handlers share the same monitor reader/cache per function instance.

**Do not treat the HTTPS origin above as an already working ASI replacement.** Support for TLS in the ASI has not been established, the route has not been deployed, and binary string length/capacity must be checked by the client-patching task. Do not blindly retain the original `:3000` when pointing at Vercel HTTPS. Client application ID `1561830329449451761` is provided context, not an API parameter; this task did not inspect/change the ASI.

## XML contract

```xml
<?xml version="1.0" encoding="UTF-8"?>
<servers>
  <server id="1">
    <name>United Ukraine</name>
    <ip>51.75.44.14</ip>
    <port>2219</port>
  </server>
</servers>
```

This exact no-count response was received over the standalone loopback HTTP service and parsed successfully using .NET `XmlDocument`: root `servers`, one `server`, expected name, IP and port. The monitor was unavailable to that process at the time, so the response intentionally contained **no online count**, rather than inventing zero.

When monitoring confirms seven players (synthetic test fixture), `<name>` becomes `United Ukraine | Онлайн: 7`. A confirmed real zero becomes `United Ukraine | Онлайн: 0`. When monitoring is unavailable, invalid, for another address, or throws, the mapping still returns HTTP 200 with the plain name and no count. There is no enclosing `<root>`, no JSON body, no HTML page, no fictitious online field. `<ip>` contains **only the IPv4**, not `IP:port`; `<port>` is separate.

GET and HEAD are supported. Responses use `application/xml; charset=utf-8`, `nosniff`, UTF-8 byte-accurate Content-Length. Text is XML-escaped, XML 1.0 forbidden control/surrogate characters are stripped, and the server sends no auth/redirect headers. Unsupported methods return 405 XML plus `Allow: GET, HEAD`. Diagnostic response headers `X-Server-Status` and `X-Online-Source` distinguish confirmed online from unavailable monitoring; the old ASI does not need to parse them.

## Online and caching

The existing reader first sends a bounded SA-MP UDP info (`i`) query to the fixed server. If it fails, it uses the existing configured `MONITOR_API_URL` or the open.mp directory, accepting counts only for the exact address and a valid range. XML does not fetch its own public URL or depend on MySQL.

- In-process monitoring cache: **15 seconds**, shared by JSON and XML, concurrent refreshes coalesced.
- XML HTTP header: `public, max-age=0, s-maxage=15, must-revalidate`; no stale-while-revalidate.
- In-process cache plus CDN cache can produce roughly **30 seconds** of age, plus upstream monitor lag/query duration; this is not a strict live-data guarantee.
- The ASI's polling frequency is unknown. If it fetches only once, the count will not refresh just because the API supports refresh. **No real-time Discord update is promised.**

## Plain HTTP blocker — verified against the public host

Probe at **2026-10-19T20:25Z**, no redirects followed:

| Request | Observed response before this change is published |
| --- | --- |
| `http://united-rp.com.ua/projects/crmp/v2/info.xml` | **308**, `Location: https://united-rp.com.ua/projects/crmp/v2/info.xml`, server Vercel |
| `https://united-rp.com.ua/projects/crmp/v2/info.xml` | **200 text/html**, SPA `index.html` — currently not XML |
| `https://united-rp.com.ua/api/server` | **200 application/json**, real `game-query` snapshot |

The rewrite fixes the **HTTPS SPA fallback after deployment**, but cannot prevent Vercel's already-observed HTTP-to-HTTPS redirect before the function executes. Supporting 308 in an HTTP-only client is insufficient if it cannot make the resulting TLS request. No TLS-support conclusion can be drawn just from the presence of cpp-httplib in the binary.

Two remaining deployment choices:

1. Confirm/add TLS support in the client and use the HTTPS website origin after deploying/testing this route.
2. If the plugin really is plain-HTTP only, deploy the prepared standalone read-only service on a separately approved HTTP-capable host. A new public origin/domain/port and firewall/proxy configuration require an operator choice/authorization. **No working public plain-HTTP origin is established yet.** Do not disable HTTPS for the main website or publish its private admin endpoints over HTTP.

## Optional HTTP service (prepared, not publicly deployed)

`scripts/discord-presence-http.mjs` serves only the exact XML path and GET/HEAD; other paths return 404. It imports the same monitor/XML code, needs Node supporting `fetch`, no npm dependencies/DB/passwords, and defaults to **127.0.0.1:3000**. `DISCORD_INFO_PORT` can be set between 1024 and 65535. Run with `npm run discord:http` or `node scripts/discord-presence-http.mjs`. `DISCORD_INFO_BIND` is an explicit bind override; do not expose it publicly until the host/firewall/deployment is approved. No privileged game restart is required.

The following minimal file set suffices for a standalone host: `scripts/discord-presence-http.mjs`, `lib/discord-presence.js`, `lib/server-status.js`, and a `package.json` declaring `type: module`. Use a service manager/reverse proxy for a real deployment. HTTP is unauthenticated and susceptible to interception; it should carry only this public mapping, never player credentials or update binaries.

Locally, the standalone service was launched on **127.0.0.1:4186** only. GET returned 200 XML with no redirect/auth, HEAD returned 200 with an empty body, an unknown path returned 404, and .NET XML parsing verified the actual response. That service was stopped after the probe. This loopback origin is **not** an address to put into a distributed game client.

## Checks and publication boundary

- `node tests/discord-presence.test.mjs`: config agreement, UTF-8/root/separate IP+port, escaping/control filtering, count validation including confirmed zero, GET/HEAD/method/cache headers, unavailable monitoring, shared-cache refresh/coalescing, rewrite ordering/function budget, actual API router over loopback HTTP (XML path, rewritten query and unchanged JSON).
- `node tests/site.test.mjs`: existing monitor/parser/fallback tests and site safety checks.
- `npm run build`: TypeScript and Vite production build passed.
- Public GET probes and direct UDP query above were performed; the new public XML URL still requires publication and verification.
- No ASI runtime, Discord activity update, TLS support, polling interval, public HTTP service or production XML deployment was tested/claimed.
- Existing unrelated `FORUM_IMPLEMENTATION.md` changes remain untouched.

After publication: fetch the exact URL without cookies or redirects, verify 200 + XML MIME/body/root, confirm separate IP/port against the connected game, test HTTP behavior, then patch the client origin only after resolving TLS/plain-HTTP compatibility. Run the actual ASI with Discord and observe its refresh interval before promising live counts.
