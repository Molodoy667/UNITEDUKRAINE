# United Ukraine Roleplay
React 19 + TypeScript + Vite. The production site is configured for Vercel's Vite framework preset and outputs static assets to `dist/`.

## Development
Requirements: Node.js 22.13+ and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

The React entry point is `src/main.tsx`; the home and section views live in `src/`. Shared navigation is in `components/site-shell.tsx`, global styles in `app/globals.css`, and branding in `public/assets/`.

Vercel builds with `npm run build`, serves `dist/`, and rewrites page paths to the SPA entry. The server-status function is `api/server.js`, available at `/api/server`.

## Content
- `/forum`, `/wiki`, `/donate`, `/account`: title-only pages as requested.
- `/contacts`, `/terms`, `/privacy`: contact details and clearly marked draft documents.
- News are introductory editorial content, not claims of actual game updates.
- All gallery images are views of the provided concept art.
- Official Discord: https://discord.gg/GyJnWJXdJ
- Launcher download URL was not provided. Replace the launcher notification with the actual HTTPS download link when available.

## Server monitoring
`/api/server` polls the public open.mp index for exactly `51.75.44.14:2219`. The server was absent from that index during implementation. Missing responses are shown as unavailable, never fabricated as online or offline. The UI refreshes every 60 seconds.

For direct UDP polling, a standalone zero-dependency monitor is included in `server-monitor/index.mjs`. Run it on a VPS with UDP access, reverse-proxy `127.0.0.1:3081/status` over HTTPS, and set the Vercel environment variable `MONITOR_API_URL` to that HTTPS endpoint. The monitor only queries the fixed server, validates replies and caches for 30 seconds. The VPS component is not deployed by this repository's Vercel build.
