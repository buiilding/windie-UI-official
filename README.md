# Windie chat screen

A standalone React and Vite website based on the supplied reference. It runs locally with no Windie runtime, ChatGPT Sites, or Cloudflare dependency. IBM Plex Sans and IBM Plex Mono are loaded from Google Fonts when the browser has network access, with local system fallbacks.

## Run locally

From this directory, run `npm install`, then `npm start` (or `npm run dev`). Open http://localhost:3000. The server binds only to localhost and reports an error if port 3000 is already occupied.

`npm run build` checks TypeScript and creates a static website in `dist/`. Use `npm run preview` to serve that build locally.

The screen supports sidebar collapse, filtering reference recent labels, typing and clearing a draft, and choosing a reasoning effort. Remaining controls are presentation-only. No model requests, microphone access, uploads, authentication, or conversation storage are implemented.
