# Otterful Hub (MML → Three.js)

Single-page **browser hub**: loads your **MML document URL** (same HTML as `/api/mml?id=…` / `/mml/<id>.mml`), parses `<m-character>` and `<m-model>`, loads those **GLBs only** (no generic placeholder avatar), and lets you walk with **WASD** on a small floor with **portal zones** and a **rotating mirror** clone.

## File structure

```
otterful-hub/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  index.html
  README.md
  src/
    main.tsx              # Vite entry
    OtterfulHub.tsx       # Page layout, fetch MML, side panel
    HubCanvas.tsx         # R3F Canvas: floor, portals, avatar, mirror, camera, WASD
    parseMml.ts           # HTML parser (matches your MML shape)
    avatarUtils.ts        # GLTF load, bone attach, scale/ground
    hub.css
    vite-env.d.ts
```

Build output (generated, not committed): **`/hub/`** at the **repository root** (`../hub` from this package) so the live site serves **`https://<your-domain>/hub/`**.

## Install & run (dev)

```bash
cd otterful-hub
npm install
npm run dev
```

Open the URL Vite prints (paths are under `/hub/` because of `base`).

## Production build

```bash
cd otterful-hub
npm install
npm run build
```

This writes static files to **`../hub/`** (sibling of `otterful-hub/`). Deploy that folder with your static host.

On **Vercel**, the root `vercel.json` is set to run this build on each deploy so `/hub/` exists without committing build artifacts.

## Where this lives in the Otterful site

- **Source**: `otterful-hub/` (this folder).
- **Built site path**: `/hub/index.html` + `/hub/assets/*`.
- **Navigation**: add a link to **`/hub/`** from `index.html`, `3d-builder.html`, or your main nav (see repo for an example pill to “Hub”).

Default MML URL is set in `src/OtterfulHub.tsx` (`DEFAULT_MML_URL`).

## Rules honored

- MML URL is the **source of truth** (fetch HTML → parse → load those URLs).
- No separate trait/metadata system in this app.
- No multiplayer / staking / chain in this MVP.

## Wearables & animation (practical notes)

- **You do not need to strip rigs** from hats/shirts for them to follow the otter. Rigged accessories are parented to the socket bone; we **re-center** each wearable GLB on its bounding box first so huge exporter offsets do not leave props floating in space.
- **Idle / walk / run** when the MML omits `anim=` (common for Otterful bodies after the demo idle is stripped): the hub loads the same **Shell Snag Mixamo** files served at **`/mixamo/idle-00.glb`**, **`/mixamo/walk.glb`**, and **`/mixamo/run-medium.glb`** (same-origin as your site). Hold **Shift** while moving to favor run.
