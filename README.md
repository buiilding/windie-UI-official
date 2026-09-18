# Windie chat screen

A React/Vite/TypeScript transcript client for the authenticated hosted Windie
API. The server owns conversations, sessions, model execution, and durable
events. This application owns presentation and short-lived streaming previews.
IBM Plex Sans and IBM Plex Mono use Google Fonts with local system fallbacks.

## Run locally

From this directory, run `npm install`, then `npm start` (or `npm run dev`). Open http://localhost:3000. The server binds only to localhost and reports an error if port 3000 is already occupied.

`npm run build` checks TypeScript and creates a static website in `dist/`. Use `npm run preview` to serve that build locally.

Configure public `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
`VITE_WINDIE_API_URL` values in an ignored `.env.local`. Never add private
provider keys, database credentials, or Supabase service-role keys. For local
same-origin requests, use `VITE_WINDIE_API_URL=/hosted-api`; Vite proxies to
`VITE_WINDIE_PROXY_TARGET` (default `https://hosted-api.windieos.com`).

`/` is a new-chat draft. The first send creates a conversation and navigates to
`/c/<server-issued-id>`. Opening that URL loads that specific conversation;
loading stays blank and failures remain errors, not a new-chat fallback.
Static production hosting must serve `index.html` for `/c/*` deep links.

The client follows the local Inspector's sending/reconciliation lifecycle,
adapted to hosted HTTP payloads: load the saved user, consume ordered SSE,
upsert saved responses, then clear previews. Cursor advancement follows
successful reconciliation. Saved and streamed assistants retain one row key.

Run `npm test` for client/transport regressions, `npm run build` for TypeScript
and bundle checks, and `npm run lint` for linting. Browser verification is manual
unless explicitly requested: check `/`, open an existing `/c/<id>` directly,
use New Chat, and send two successive turns. Each response must remain visible
on completion without a reload. Check Back/Forward and a second signed-in
browser too. Terminal tests are not a substitute for that visual proof.

Voice, uploads, device access, and unsupported message actions remain disabled.
