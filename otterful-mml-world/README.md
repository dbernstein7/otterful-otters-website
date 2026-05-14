# Otterful MML multiplayer world

This folder is a small **[mml-io/3d-web-experience](https://github.com/mml-io/3d-web-experience)** world you **run and deploy separately** from the static Otterful website. The main site (Vercel) cannot host long-lived WebSocket multiplayer; this Node app does.

## What you get

- **WASD** movement, **chat**, and **multiple browser tabs / users** on the same world.
- **Otter avatars** via your public MML documents: `https://www.otterfulotters.xyz/mml/<id>.mml` (edit `world.json` to add more IDs or change the host).
- A sample **hello-world** MML document in the world (`mml-documents/hello-world.html`).

## Run locally

Requires **Node 20+**.

```bash
cd otterful-mml-world
npm install
npm run serve
```

Open **http://127.0.0.1:8080** in two tabs to see multiple users. Pick an avatar from the list (Otterful #1, #14, …) or use custom MML if the client UI allows it (`allowCustomAvatars` is `true` in `world.json`).

## Embed on the Otterful 3D Builder

After you deploy this app to **HTTPS** (see below), on [3d-builder.html](../3d-builder.html) use **Otter 3D → Advanced → Replace frame with this URL** (or open in a new tab). You **cannot** embed `http://127.0.0.1` inside the HTTPS site.

## Deploy (pick one)

### Fly.io / Railway / Render / any Node host

1. Set the service **port** to the one your host injects (often `PORT`); the CLI defaults to **8080** if unset.
2. Ensure **WebSockets** are supported (not “static only”).
3. Point your **HTTPS** URL at this process (`npm start`).

This folder includes a working **`Dockerfile`** (Node 22 Alpine, `npm ci`, `npm start`) you can use on Fly.io, Railway, etc.

### Custom MML base URL

Search-replace `https://www.otterfulotters.xyz` in `world.json` if your MML lives on another host (staging, fork, etc.). Each avatar entry uses `mmlCharacterUrl` per the upstream [world config schema](https://github.com/mml-io/3d-web-experience) (`avatars.availableAvatars[]`).

## CLI reference

Same as upstream:

- `npx @mml-io/3d-web-experience init <dir>` — scaffold a new world.
- `npx @mml-io/3d-web-experience serve world.json` — run this world.

See [3d-web-experience README](https://github.com/mml-io/3d-web-experience#readme) for auth, webhooks, and `world.json` options.
