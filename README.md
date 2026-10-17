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

## Visual design
The home page uses a graphite/gold visual theme, a perspective hero frame, pointer-driven card tilt, section entrance transitions and decorative floating elements. The original `world-promo.png` and logo are unchanged. Touch devices do not run pointer tilt, and `prefers-reduced-motion` disables animations. Gallery and article dialogs support Escape, focus return and keyboard focus containment.

Run `node --test tests/design.test.mjs` for component-rendering smoke checks and `npm run build` for TypeScript and production compilation. These checks do not replace browser testing of responsive layout and interactions. Run `npm run forum:api` alongside Vite for local API execution; configure a local database using [the example](config/forum.env.example). Vite proxies `/api` to the local API process.

Vercel runs `npm run deploy:build` to apply forum migrations and then build the Vite application. MySQL variables must be available during the build. It serves `dist/` and rewrites page paths to the SPA entry. The server-status function is `api/server.js`, available at `/api/server`.

## Content
- `/forum`: MySQL-backed forum with accounts, scoped permissions, topics, appeals, moderation and administration. Setup and operational dependencies: [Forum operations](docs/FORUM_OPERATIONS.md).
- `/wiki`: local skin, vehicle and accessory catalog with previews, ID/name search and 10/50/100-item pagination. Import details and data limits: [Wiki catalog](docs/WIKI.md).
- `/donate`, `/account`: existing title-only pages.
- `/contacts`, `/terms`, `/privacy`: contact details and clearly marked draft documents.
- News are introductory editorial content, not claims of actual game updates.
- All gallery images are views of the provided concept art.
- Official Discord: https://discord.gg/GyJnWJXdJ
- Launcher download URL was not provided. Replace the launcher notification with the actual HTTPS download link when available.

## Server monitoring
`/api/server` polls the public open.mp index for exactly `51.75.44.14:2219`. The server was absent from that index during implementation. Missing responses are shown as unavailable, never fabricated as online or offline. The UI refreshes every 60 seconds.

For direct UDP polling, a standalone zero-dependency monitor is included in `server-monitor/index.mjs`. Run it on a VPS with UDP access, reverse-proxy `127.0.0.1:3081/status` over HTTPS, and set the Vercel environment variable `MONITOR_API_URL` to that HTTPS endpoint. The monitor only queries the fixed server, validates replies and caches for 30 seconds. The VPS component is not deployed by this repository's Vercel build.
