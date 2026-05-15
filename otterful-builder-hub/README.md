# Otterful Builder Hub (3D + MML)

React + TypeScript + Vite app embedded in **`3d-builder.html`** as the **Otterful Hub** tab. Production build is written to **`/builder/`** at the repo root (same pattern as the main static site).

## Where to put GLB files

| Path (inside this package) | Served as |
|----------------------------|-----------|
| `public/models/avatars/*.glb` | `/builder/models/avatars/...` |
| `public/models/wearables/hats/*.glb` | `/builder/models/wearables/hats/...` |
| `public/models/wearables/glasses/*.glb` | `/builder/models/wearables/glasses/...` |
| `public/models/wearables/tops/*.glb` | `/builder/models/wearables/tops/...` |
| `public/models/wearables/accessories/*.glb` | `/builder/models/wearables/accessories/...` |

Then update:

- **`src/data/avatars.ts`** — `REGISTRY` rows: `modelUrl` per token, optional `animationUrls` (idle/walk/run/jump/dance). Unlisted tokens fall back to `DEFAULT_AVATAR_MODEL`.
- **`src/data/wearables.ts`** — each wearable: `modelUrl`, **`socketName`** (must match an empty object name on the rig **or** a skinned bone name), and offsets.

## Sockets / bones

Preferred logical names (empties parented to bones, or bones themselves):

- `HeadSocket`, `FaceSocket`, `ChestSocket`, `BackSocket`, `LeftHandSocket`, `RightHandSocket`

Fallback matching lives in **`src/lib/socketAttach.ts`** (`FALLBACK_NAMES`, `resolveAttachmentObject`). Adjust there if your rig uses different naming (e.g. `mixamorigHead` only).

## Commands

```bash
cd otterful-builder-hub
npm install
npm run dev
```

Open the URL Vite prints (under `/builder/`). With the main site, open **3D Builder → Otterful Hub** or `/builder/?id=26`.

```bash
npm run build
```

Writes static files to **`../builder/`** for Vercel (`vercel.json` runs this on deploy).

## MML export

The UI builds **`/api/mml?id=<token>&hat=<id>&shirt=<id>&glasses=<id>`** using equipped wearable **ids** as query stems. Your live `/api/mml` treats `hat` / `shirt` / `glasses` (and `eyes`) as documented in `api/mml.js`. Ensure stems match Firebase `Hats/` / `Shirts/` / `Eyes/` filenames, or switch `modelUrl` + export logic to full HTTPS URLs later.

## 3D Builder deep link

**`/3d-builder.html?url=<encoded /api/mml URL>#mml`** opens the existing MML preview tab with that document URL.
