# United Ukraine Roleplay
React 19 + TypeScript, Vinext / Cloudflare Workers.

## Development
Use the Sites dependency installation and build helpers. Source lives in `app/`, shared navigation in `components/site-shell.tsx`, branding in `public/assets/`.

## Content
- `/forum`, `/wiki`, `/donate`, `/account`: title-only pages as requested.
- `/contacts`, `/terms`, `/privacy`: contact details and clearly marked draft documents.
- News are introductory editorial content, not claims of actual game updates.
- All gallery images are views of the provided concept art.
- Official Discord: https://discord.gg/GyJnWJXdJ
- Launcher download URL was not provided. Replace the launcher notification with the actual HTTPS download link when available.

## Server monitoring
`/api/server` polls the public open.mp index for exactly `51.75.44.14:2219`. The server was absent from that index during implementation. Missing responses are shown as unavailable, never fabricated as online or offline. The UI refreshes every 60 seconds.

For direct UDP polling, a standalone zero-dependency monitor is included in `server-monitor/index.mjs`. Run it on a VPS with UDP access, reverse-proxy `127.0.0.1:3081/status` over HTTPS, and set the Site runtime environment variable `MONITOR_API_URL` to that HTTPS endpoint. The monitor only queries the fixed server, validates replies and caches for 30 seconds. Native Workers cannot send UDP packets; the VPS component is required for unindexed CRMP servers. No VPS credentials were provided, so that component has not been deployed.
