import {
  PHYS,
  KART_RADIUS,
  TOTAL_LAPS,
  TARGET_FPS,
  raceZoomForViewport,
  cameraLerpForViewport,
  mobileRaceCameraScreenOffsetX,
  raceCameraLookAheadWorld,
  isMobileRaceViewport,
} from "./config.js";
import {
  applyHudViewportVars,
  getCanvasClientViewSize,
  getGameViewportSize,
  getRaceViewportSize,
  isEmbedded,
} from "./viewport.js";
import { resolveRaceMinimapLayout, readTouchInput } from "./touch-controls.js";
import {
  surfaceAt,
  resolveWallCollision,
  finishLineSegment,
  lapFinishCrossed,
  suggestSpawn,
  getDecor,
  makeBoostPads,
  makePickups,
  checkBoostPad,
  getTrack,
  setTrack,
  setRibbonSegmentSurface,
  kartArcU,
  standingLongitudinalU,
} from "./track.js?v=2026-05-19-neo-v4";
import {
  commitRun,
  loadGhost,
  loadLeaderboard,
  isDemoSessionActive,
  loadEffectiveLoadout,
  todayISO,
  tryUnlockRainbowKart,
} from "./storage.js";
import {
  drawKartLayers,
  getCharacterAtlas,
  kartHasShieldSprite,
  pickCpuAppearances,
} from "./character.js";
import { attachKartPhys, DEFAULT_KART_PHYS } from "./kart-stats.js";
import { TRACK_IDS } from "./tracks.js?v=2026-05-19-neo-v4";

/** Grand Prix track effects (lava fireballs, AI pace caps) also apply in admin test races. */
function gpStyleEffects(g) {
  const m = g?.mode;
  return m === "grandprix" || m === "admin";
}

/** Touge / endless neon-pink road styling (not used for GP race 4). */
function neonTougeVisual(g) {
  const m = g?.mode;
  return m === "touge" || m === "endless";
}

/** Endless + GP Neo Snake — green snake field (backdrop + shoulder band). */
function neonSnakeGreenField(g) {
  if (isGpNeoSnake(g)) return true;
  return g?.mode === "endless" && neonTougeVisual(g);
}

/** Neon Snake touge — purple snake field (backdrop + shoulder band). */
function neonSnakePurpleField(g) {
  return g?.mode === "touge" && neonTougeVisual(g);
}

/** @returns {"green" | "purple" | null} */
function neonSnakeFieldKind(g) {
  if (neonSnakeGreenField(g)) return "green";
  if (neonSnakePurpleField(g)) return "purple";
  return null;
}

/** GP race 4 — grass field + standard gray kerbs (not neon pink / sand-green curb). */
function isGpNeoSnake(g) {
  return gpStyleEffects(g) && g?.trackId === "neo-snake-gp";
}

/** Pure-pursuit CPU driving (GP4/5-style) — includes GP2/GP3 wavy stadium loops. */
function pursuitGpTrack(trackId) {
  return (
    trackId === "s-bends" ||
    trackId === "neo-snake-gp" ||
    trackId === "lava-serpent" ||
    trackId === "chicane"
  );
}

/**
 * Track item art (lazy-loaded). These are purely visual; gameplay uses the same pickup logic.
 * Folder name has a space, so we use URL-encoded paths.
 */
let TRACK_ITEM_ART = null;
let WATER_PATTERN = null;
let WATER_PATTERN_SRC = "";
let WATER_TILE_CANVAS = null;
let WATER_TILE_KEY = "";
let LAVA_PATTERN = null;
let LAVA_PATTERN_SRC = "";
let LAVA_TILE_CANVAS = null;
let LAVA_TILE_KEY = "";
let GRASS_PATTERN = null;
let GRASS_PATTERN_SRC = "";
let GRASS_TILE_CANVAS = null;
let GRASS_TILE_KEY = "";
const GRASS_TILE_SCALE = 0.22; // smaller = more repeats (less "massive")
let SAND_PATTERN = null;
let SAND_PATTERN_SRC = "";
let SAND_TILE_CANVAS = null;
let SAND_TILE_KEY = "";
const SAND_TILE_SCALE = 0.22;
let MOLTEN_PATTERN = null;
let MOLTEN_PATTERN_SRC = "";
let MOLTEN_TILE_CANVAS = null;
let MOLTEN_TILE_KEY = "";
const MOLTEN_TILE_SCALE = 0.22;
let NEON_SNAKE_TILE_CANVAS = { green: null, purple: null };
let NEON_SNAKE_TILE_KEY = { green: "", purple: "" };
let NEON_SNAKE_PATTERN_BY_SCALE = { green: new Map(), purple: new Map() };
/** Track shoulder band only (matches original grass repeat density). */
const NEON_SNAKE_EDGE_TILE_SCALE = 0.22;
/** Screen backdrop tile size as fraction of viewport (lower = smaller, more repeats). */
const NEON_SNAKE_BG_TILE_FRAC = 0.28;
const NEON_SNAKE_FALLBACK_BG = { green: "#143d1a", purple: "#1a0a22" };
// Bump this when swapping any Track Assets images (fireball, shield, rock, etc).
const TRACK_ASSET_VER = "2026-06-03-camera-lookahead";

const ROULETTE_HUD_ITEMS = [
  { label: "BOOST", key: "boost" },
  { label: "BOOST Lv2", key: "boost2" },
  { label: "BOOST Lv3", key: "boost3" },
  { label: "BANANA", key: "banana" },
  { label: "SHIELD", key: "shield" },
  { label: "ROCK", key: "rock" },
  { label: "ROCK x3", key: "rock3" },
  { label: "ROCKFLY", key: "rockfly" },
];

/** GP5 landed lava fireball radius (sprite + hitbox); 1.5× smaller than original 14. */
const GP5_LAVA_FIREBALL_R = 14 / 1.5;
/** Mystery-box / item shield duration (seconds). */
const SHIELD_DURATION_PLAYER = 3.5;
const SHIELD_DURATION_CPU = 3.0;
/** After GO: player can touch boxes; CPUs wait longer (no start-line rush). */
const MYSTERY_BOX_PLAYER_GRACE_S = 1.25;
const MYSTERY_BOX_CPU_GRACE_S = 4.0;
/** Player roulette length (CPUs use the same delay before their item applies). */
const MYSTERY_BOX_ROULETTE_S = 2.0;
/** Per-CPU cooldown between mystery boxes (player is gated by roulette UI). */
const CPU_MYSTERY_BOX_COOLDOWN_S = 6.0;

function clampInt(x, a, b) {
  return Math.max(a, Math.min(b, Math.floor(x)));
}

function nearestIdxForArcS(pts, s) {
  // `pts[i].s` is monotonic increasing.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((pts[mid]?.s ?? 0) <= s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const da = Math.abs((a?.s ?? 0) - s);
  const db = Math.abs((b?.s ?? 0) - s);
  return db < da ? hi : lo;
}

function makeMysteryBoxesForTrack(tr, groupCount = 6) {
  const pts = tr?.pts ?? [];
  const N = pts.length;
  if (!N) return [];
  const road = tr.widths?.road ?? 86;
  const out = [];
  const L = tr.length || 1;
  // More boxes + better spread: sample by arc-length, then enforce spacing.
  const minArc = Math.max(200, Math.min(520, L / Math.max(5, groupCount) * 0.62));
  const tries = Math.max(240, groupCount * 90);
  const lane = road * 0.55; // 3-across: left/center/right on the road
  const placedS = [];
  for (let k = 0; k < tries && placedS.length < groupCount; k++) {
    const s = Math.random() * L;
    const i0 = nearestIdxForArcS(pts, s);
    // Small jitter along the polyline so it doesn't look grid-like.
    const i = (i0 + clampInt((Math.random() - 0.5) * 18, -12, 12) + N) % N;
    const p = pts[i];
    const ss = p.s ?? 0;
    // Enforce arc-length spacing (wrap-aware).
    let ok = true;
    for (const qS of placedS) {
      const ds0 = Math.abs(qS - ss);
      const ds = Math.min(ds0, Math.abs(ds0 - L));
      if (ds < minArc) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    placedS.push(ss);

    // Always spawn 3 across the track at this arc location.
    const offs = [-lane, 0, lane];
    for (let j = 0; j < offs.length; j++) {
      const off = offs[j] + (Math.random() * 2 - 1) * (road * 0.06);
      const x = p.x + p.nx * off;
      const y = p.y + p.ny * off;
      out.push({
        id: `mb${placedS.length - 1}-${j}`,
        x,
        y,
        s: ss,
        taken: false,
        respawnT: 0,
        bob: Math.random() * Math.PI * 2,
        type: "mystery",
      });
    }
  }
  return out;
}

function startItemRoulette(game) {
  game.itemRoulette = {
    tLeft: MYSTERY_BOX_ROULETTE_S,
    tick: 0,
    show: "…",
    done: false,
    item: "",
  };
  game.updateRandomizerHud?.();
}

function rollMysteryItem() {
  const r = Math.random();
  // boost tiers: orange (common) → green → purple (rarest, strongest)
  if (r < 0.20) return "boost";
  if (r < 0.28) return "boost2";
  if (r < 0.32) return "boost3";
  if (r < 0.48) return "banana";
  if (r < 0.64) return "shield";
  if (r < 0.82) return "rock";
  if (r < 0.94) return "rock3";
  return "rockfly";
}

/** CPUs only roll the three “simple” mystery items (no boost / rockfly). */
function rollCpuMysteryItem() {
  const r = Math.random();
  if (r < 0.52) return "rock";
  if (r < 0.88) return "banana";
  return "shield";
}

function applyCpuMysteryItem(o, item) {
  if (item === "rock") o.rocksInv = (o.rocksInv ?? 0) + 1;
  else if (item === "banana") o.bananasInv = (o.bananasInv ?? 0) + 1;
  else if (item === "shield" && (o.shieldT ?? 0) <= 0)
    o.shieldT = SHIELD_DURATION_CPU;
}

function mysteryItemLabel(item) {
  return item === "rock"
    ? "ROCK"
    : item === "rock3"
      ? "ROCK x3"
      : item === "rockfly"
        ? "ROCKFLY"
        : item === "banana"
          ? "BANANA"
          : item === "boost3"
            ? "BOOST Lv3"
            : item === "boost2"
              ? "BOOST Lv2"
              : item === "boost"
                ? "BOOST"
                : "SHIELD";
}

function mysteryItemKeyFromShow(show) {
  const s = String(show ?? "").toLowerCase();
  if (s.includes("rockfly")) return "rockfly";
  if (s.includes("rock") && s.includes("x3")) return "rock3";
  if (s.includes("rock")) return "rock";
  if (s.includes("banana")) return "banana";
  if (s.includes("shield")) return "shield";
  if (s.includes("boost") && s.includes("lv3")) return "boost3";
  if (s.includes("boost") && s.includes("lv2")) return "boost2";
  if (s.includes("boost")) return "boost";
  return "";
}

function randomizerIconUsesLargeScale(itemKey) {
  return (
    itemKey === "rockfly" ||
    itemKey === "boost" ||
    itemKey === "boost2" ||
    itemKey === "boost3"
  );
}

function awardRouletteItem(game) {
  const K = game.kart;
  const item = rollMysteryItem();
  if (item === "shield") {
    K.shieldT = Math.max(K.shieldT ?? 0, SHIELD_DURATION_PLAYER);
    game.equippedItem = "";
    game.equippedCharges = 0;
    game.itemRoulette = null;
    game.updateRandomizerHud?.();
    return;
  }
  game.itemRoulette.item = item;
  game.itemRoulette.show = mysteryItemLabel(item);
  game.itemRoulette.done = true;
  game.equippedItem = item;
  game.equippedCharges = 1;
  game.updateRandomizerHud?.();
}

/** Cache big ribbon polylines as Path2D to reduce per-frame JS work. */
const TRACK_PATH_CACHE = new Map();
function trackCacheKey(tr) {
  const w = tr?.widths || {};
  return `${tr?.id ?? "?"}|${tr?.pts?.length ?? 0}|${w.road ?? 0}|${w.wall ?? 0}|${w.grass ?? 0}|${tr?.closed !== false ? 1 : 0}`;
}
function getTrackPath(tr) {
  const key = trackCacheKey(tr);
  const cached = TRACK_PATH_CACHE.get(key);
  if (cached) return cached;
  const pts = tr?.pts || [];
  const p = new Path2D();
  if (pts.length) {
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    if (tr?.closed !== false) p.closePath();
  }
  TRACK_PATH_CACHE.set(key, p);
  return p;
}

function drawFinishCheckered(ctx, fl, roadW, zx) {
  // Build the stripe from the midpoint so it stays centered even when wall width changes.
  const mx = fl.mx ?? (fl.x1 + fl.x2) * 0.5;
  const my = fl.my ?? (fl.y1 + fl.y2) * 0.5;
  // Span only the road (not the full wall width) so it never hangs off the edge band.
  const x1 = mx + fl.nx * roadW;
  const y1 = my + fl.ny * roadW;
  const x2 = mx - fl.nx * roadW;
  const y2 = my - fl.ny * roadW;
  const tx = fl.tx;
  const ty = fl.ty;
  const segLen = Math.hypot(x2 - x1, y2 - y1) || 1;

  // Band thickness along travel direction (world units), scales gently with road width.
  const depth = Math.max(16, Math.min(42, roadW * 0.28));
  // Checker square size (world units).
  const sq = Math.max(10, Math.min(26, roadW * 0.22));

  // Draw a subtle dark base so the checker reads over any road shade.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.moveTo(x1 - tx * depth * 0.5, y1 - ty * depth * 0.5);
  ctx.lineTo(x2 - tx * depth * 0.5, y2 - ty * depth * 0.5);
  ctx.lineTo(x2 + tx * depth * 0.5, y2 + ty * depth * 0.5);
  ctx.lineTo(x1 + tx * depth * 0.5, y1 + ty * depth * 0.5);
  ctx.closePath();
  ctx.fill();

  // Checkerboard: tiles across the stripe (width direction) and along depth direction.
  const cols = Math.max(8, Math.min(40, Math.round(segLen / sq)));
  const rows = Math.max(2, Math.min(6, Math.round(depth / sq)));
  const dxCol = (x2 - x1) / cols;
  const dyCol = (y2 - y1) / cols;
  const dxRow = tx * (depth / rows);
  const dyRow = ty * (depth / rows);
  const ox = x1;
  const oy = y1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isWhite = ((r + c) & 1) === 0;
      ctx.fillStyle = isWhite ? "rgba(245,245,245,0.92)" : "rgba(20,20,20,0.92)";
      const ax = ox + dxCol * c - tx * depth * 0.5 + dxRow * r;
      const ay = oy + dyCol * c - ty * depth * 0.5 + dyRow * r;
      const bx = ax + dxCol;
      const by = ay + dyCol;
      const cx = bx + dxRow;
      const cy = by + dyRow;
      const dx = ax + dxRow;
      const dy = ay + dyRow;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.lineTo(dx, dy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Thin outline to keep it crisp at low zoom.
  ctx.lineWidth = Math.max(1, 2.2 / zx);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.moveTo(x1 - tx * depth * 0.5, y1 - ty * depth * 0.5);
  ctx.lineTo(x2 - tx * depth * 0.5, y2 - ty * depth * 0.5);
  ctx.lineTo(x2 + tx * depth * 0.5, y2 + ty * depth * 0.5);
  ctx.lineTo(x1 + tx * depth * 0.5, y1 + ty * depth * 0.5);
  ctx.closePath();
  ctx.stroke();
}
function getTrackItemArt() {
  if (TRACK_ITEM_ART) return TRACK_ITEM_ART;
  /** @param {string} url */
  const img = (url) => {
    const im = new Image();
    im.decoding = "async";
    im.loading = "eager";
    im.src = `${url}?v=${encodeURIComponent(TRACK_ASSET_VER)}`;
    return im;
  };
  /** Gameplay sprites only — large tiling textures load on first use. */
  TRACK_ITEM_ART = {
    banana: img("./Track%20Assets/Banana.png"),
    bananaPeel: img("./Track%20Assets/BananaPeel.png"),
    fireball: img("./Track%20Assets/fireball.png"),
    goldenShell: img("./Track%20Assets/goldenshell.png"),
    shell: img("./Track%20Assets/open-shell.png"),
    mysteryBox: img("./Track%20Assets/MysteryBox.png"),
    rock: img("./Track%20Assets/Rock.png"),
    rockFly1: img("./Track%20Assets/RockFly1.png"),
    rockFly2: img("./Track%20Assets/RockFly2.png"),
    rockFly3: img("./Track%20Assets/RockFly3.png"),
    rockFly4: img("./Track%20Assets/RockFly4.png"),
    rock3: img("./Track%20Assets/3Rock.png"),
    shield: img("./Track%20Assets/Shield.png"),
    lightning: img("./Track%20Assets/Lightning.png"),
    greenLightning: img("./Track%20Assets/GreenLightning.png"),
    purpleLightning: img("./Track%20Assets/PurpleLightning.png"),
    flames: img("./Track%20Assets/Flames.png"),
    greenFlames: img("./Track%20Assets/GreenFlames.png"),
    purpleFlames: img("./Track%20Assets/PurpleFlames.png"),
    mapRing: img("./Track%20Assets/MapRing.png"),
  };
  return TRACK_ITEM_ART;
}

/** Inner hole radius / outer radius in MapRing.png (measured ~0.704). */
const MAP_RING_INNER_RADIUS_FRAC = 0.704;
/** Extra fill radius (px) so background tucks under the ring bezel. */
const MAP_RING_FILL_BLEED_PX = 3;
/** Screen-space nudge for map + inner fill (px; negative = up). Clip moves with this. */
const MAP_RING_MAP_OFFSET_Y = -5;

function getMapRingImage() {
  return getTrackItemArt().mapRing;
}

/** Lazy-load large repeat textures (saves decode RAM until a track needs them). */
function ensureTrackTexture(id, url) {
  const art = getTrackItemArt();
  if (!art[id]) {
    const im = new Image();
    im.decoding = "async";
    im.src = `${url}?v=${encodeURIComponent(TRACK_ASSET_VER)}`;
    art[id] = im;
  }
  return art[id];
}

function releaseDecodedImage(im) {
  if (!im) return;
  try {
    im.src = "";
  } catch {
    // ignore
  }
}

function dropTrackTexture(id) {
  const art = getTrackItemArt();
  releaseDecodedImage(art[id]);
  delete art[id];
}

function invalidatePatternCaches() {
  WATER_PATTERN = null;
  WATER_PATTERN_SRC = "";
  LAVA_PATTERN = null;
  LAVA_PATTERN_SRC = "";
  GRASS_PATTERN = null;
  GRASS_PATTERN_SRC = "";
  SAND_PATTERN = null;
  SAND_PATTERN_SRC = "";
  MOLTEN_PATTERN = null;
  MOLTEN_PATTERN_SRC = "";
  NEON_SNAKE_PATTERN_BY_SCALE.green.clear();
  NEON_SNAKE_PATTERN_BY_SCALE.purple.clear();
}

function getLavaPattern(ctx) {
  const im = ensureTrackTexture("lava", "./Track%20Assets/lava.png");
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || "lava";
  if (LAVA_PATTERN && LAVA_PATTERN_SRC === src) return LAVA_PATTERN;

  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!LAVA_TILE_CANVAS || LAVA_TILE_KEY !== key) {
    const tile = document.createElement("canvas");
    const TW = 256;
    const TH = 256;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      LAVA_TILE_CANVAS = tile;
      LAVA_TILE_KEY = key;
      dropTrackTexture("lava");
    }
  }

  const source = LAVA_TILE_CANVAS ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  LAVA_PATTERN = pat;
  LAVA_PATTERN_SRC = src;
  return pat;
}

function drawPatternParallax(ctx, pat, camX, camY, w, h, tMul = 1, parMul = 1) {
  const t = performance.now() * 0.0008 * tMul;
  const par = 0.06 * parMul;
  const wob = 14 * parMul;
  const ox = -((camX ?? 0) * par + Math.cos(t) * wob);
  const oy = -((camY ?? 0) * par + Math.sin(t * 0.9) * wob * 0.86);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(-ox, -oy, w, h);
  ctx.restore();
}

function getSandPattern(ctx) {
  const im = ensureTrackTexture("sand", "./Track%20Assets/sand.png");
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || "sand";
  if (SAND_PATTERN && SAND_PATTERN_SRC === src) return SAND_PATTERN;

  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!SAND_TILE_CANVAS || SAND_TILE_KEY !== key) {
    const tile = document.createElement("canvas");
    const TW = 160;
    const TH = 160;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      SAND_TILE_CANVAS = tile;
      SAND_TILE_KEY = key;
      dropTrackTexture("sand");
    }
  }

  const source = SAND_TILE_CANVAS ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  try {
    pat.setTransform?.(new DOMMatrix().scale(SAND_TILE_SCALE, SAND_TILE_SCALE));
  } catch {
    // ignore
  }
  SAND_PATTERN = pat;
  SAND_PATTERN_SRC = src;
  return pat;
}

function getGrassPattern(ctx) {
  const im = ensureTrackTexture("grass", "./Track%20Assets/grass.png");
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || "grass";
  if (GRASS_PATTERN && GRASS_PATTERN_SRC === src) return GRASS_PATTERN;

  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!GRASS_TILE_CANVAS || GRASS_TILE_KEY !== key) {
    const tile = document.createElement("canvas");
    const TW = 160;
    const TH = 160;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      GRASS_TILE_CANVAS = tile;
      GRASS_TILE_KEY = key;
      dropTrackTexture("grass");
    }
  }

  const source = GRASS_TILE_CANVAS ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  // Make the texture repeat more frequently in world-space.
  try {
    pat.setTransform?.(new DOMMatrix().scale(GRASS_TILE_SCALE, GRASS_TILE_SCALE));
  } catch {
    // ignore
  }
  GRASS_PATTERN = pat;
  GRASS_PATTERN_SRC = src;
  return pat;
}

function getMoltenPattern(ctx) {
  const im = ensureTrackTexture("molten", "./Track%20Assets/molten.png");
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || "molten";
  if (MOLTEN_PATTERN && MOLTEN_PATTERN_SRC === src) return MOLTEN_PATTERN;

  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!MOLTEN_TILE_CANVAS || MOLTEN_TILE_KEY !== key) {
    const tile = document.createElement("canvas");
    // Match grass/sand approach (smaller tile + transform scale).
    const TW = 160;
    const TH = 160;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      MOLTEN_TILE_CANVAS = tile;
      MOLTEN_TILE_KEY = key;
      dropTrackTexture("molten");
    }
  }

  const source = MOLTEN_TILE_CANVAS ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  try {
    pat.setTransform?.(new DOMMatrix().scale(MOLTEN_TILE_SCALE, MOLTEN_TILE_SCALE));
  } catch {
    // ignore
  }
  MOLTEN_PATTERN = pat;
  MOLTEN_PATTERN_SRC = src;
  return pat;
}

function getEdgeBandPattern(ctx, variant) {
  if (variant === "sand") return getSandPattern(ctx);
  if (variant === "molten") return getMoltenPattern(ctx);
  if (variant === "neon") return getNeonSnakePattern(ctx, "green", NEON_SNAKE_EDGE_TILE_SCALE);
  return getGrassPattern(ctx);
}

function neonSnakeImage(kind) {
  if (kind === "purple") {
    return ensureTrackTexture(
      "neonPurpleSnake",
      "./Track%20Assets/NeonPurpleSnake.png",
    );
  }
  return ensureTrackTexture(
    "neonGreenSnake",
    "./Track%20Assets/NeonGreenSnake.png",
  );
}

function getNeonSnakePattern(ctx, kind, tileScale = NEON_SNAKE_EDGE_TILE_SCALE) {
  const im = neonSnakeImage(kind);
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || kind;
  const patKey = `${src}|s${tileScale}`;
  const cache = NEON_SNAKE_PATTERN_BY_SCALE[kind];
  const cached = cache.get(patKey);
  if (cached) return cached;

  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!NEON_SNAKE_TILE_CANVAS[kind] || NEON_SNAKE_TILE_KEY[kind] !== key) {
    const tile = document.createElement("canvas");
    const TW = 160;
    const TH = 160;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      NEON_SNAKE_TILE_CANVAS[kind] = tile;
      NEON_SNAKE_TILE_KEY[kind] = key;
      dropTrackTexture(kind === "purple" ? "neonPurpleSnake" : "neonGreenSnake");
    }
  }

  const source = NEON_SNAKE_TILE_CANVAS[kind] ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  try {
    pat.setTransform?.(new DOMMatrix().scale(tileScale, tileScale));
  } catch {
    // ignore
  }
  cache.set(patKey, pat);
  return pat;
}

/** Full-screen snake backdrop — cached pattern + parallax (no per-frame drawImage grid). */
function neonSnakeBgPatternScale(w, h) {
  return Math.max(
    0.55,
    Math.min(2.2, (Math.max(w, h) * NEON_SNAKE_BG_TILE_FRAC) / 160),
  );
}

function drawNeonSnakeBackdrop(ctx, kind, camX, camY, w, h) {
  const scale = neonSnakeBgPatternScale(w, h);
  const pat = getNeonSnakePattern(ctx, kind, scale);
  if (pat) {
    drawPatternParallax(ctx, pat, camX, camY, w, h, 0.4, 0.5);
    return;
  }
  ctx.fillStyle = NEON_SNAKE_FALLBACK_BG[kind] ?? "#143d1a";
  ctx.fillRect(0, 0, w, h);
}

function getWaterPattern(ctx) {
  const im = ensureTrackTexture("water", "./Track%20Assets/water.png");
  if (!im?.complete || !im.naturalWidth) return null;
  const src = im.currentSrc || im.src || "water";
  if (WATER_PATTERN && WATER_PATTERN_SRC === src) return WATER_PATTERN;

  // Downscale big water images into a small tile once to avoid heavy sampling/jitter.
  const key = `${src}|${im.naturalWidth}x${im.naturalHeight}`;
  if (!WATER_TILE_CANVAS || WATER_TILE_KEY !== key) {
    const tile = document.createElement("canvas");
    // Target tile size (small enough for cheap repeats, large enough to look nice).
    const TW = 256;
    const TH = 256;
    tile.width = TW;
    tile.height = TH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.clearRect(0, 0, TW, TH);
      tctx.drawImage(im, 0, 0, TW, TH);
      WATER_TILE_CANVAS = tile;
      WATER_TILE_KEY = key;
      dropTrackTexture("water");
    }
  }

  const source = WATER_TILE_CANVAS ?? im;
  const pat = ctx.createPattern(source, "repeat");
  if (!pat) return null;
  WATER_PATTERN = pat;
  WATER_PATTERN_SRC = src;
  return pat;
}

function drawSpriteCentered(ctx, im, w, h, alpha = 1) {
  if (!im || !im.complete || im.naturalWidth <= 0) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(im, -w * 0.5, -h * 0.5, w, h);
  ctx.restore();
  return true;
}

/** Draw at PNG aspect ratio; `maxDim` = longest side in world units (no stretch). */
function drawSpriteCenteredNatural(ctx, im, maxDim, alpha = 1) {
  if (!im || !im.complete || im.naturalWidth <= 0 || im.naturalHeight <= 0)
    return false;
  const nw = im.naturalWidth;
  const nh = im.naturalHeight;
  const scale = maxDim / Math.max(nw, nh);
  return drawSpriteCentered(ctx, im, nw * scale, nh * scale, alpha);
}

function drawFireball(ctx, c) {
  const art = getTrackItemArt();
  const im = art.fireball;
  const r = (c.r ?? 14) * 0.72;
  const z = c.z ?? 0;
  const z01 = clamp(z / 260, 0, 1);
  ctx.save();
  ctx.translate(c.x, c.y);
  // shadow
  ctx.fillStyle = `rgba(0,0,0,${0.26 * (1 - z01 * 0.7)})`;
  ctx.beginPath();
  ctx.ellipse(
    0,
    r * 0.72,
    r * (0.92 - z01 * 0.35),
    r * (0.56 - z01 * 0.25),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  // sprite
  ctx.translate(0, -z);
  // GP5 lava asset is drawn flame-up; daily lane fireballs roll with the track.
  if (!c.upright) ctx.rotate((c.ang ?? 0) + Math.PI * 1.5);
  ctx.save();
  ctx.shadowColor = "rgba(255, 120, 20, 0.55)";
  ctx.shadowBlur = 18;
  drawSpriteCentered(ctx, im, r * 2.05, r * 2.05, 1);
  ctx.restore();
  ctx.restore();
}

function lavaFireballHitRadius(c) {
  return (c.r ?? 14) + KART_RADIUS * 0.95;
}

/** Swept hit test — no wall push; karts pass through after a speed penalty. */
function tryLavaFireballHitKart(k, c, px0, py0) {
  if (!(c.landed ?? false) || (c.cd ?? 0) > 0) return false;
  const cx = c.x ?? 0;
  const cy = c.y ?? 0;
  const hitR = lavaFireballHitRadius(c);
  const x1 = k.x ?? 0;
  const y1 = k.y ?? 0;
  const x0 = Number.isFinite(px0) ? px0 : x1;
  const y0 = Number.isFinite(py0) ? py0 : y1;
  const hit =
    segHitsCircle(x0, y0, x1, y1, cx, cy, hitR) ||
    Math.hypot(cx - x1, cy - y1) < hitR;
  if (!hit) return false;
  applyLavaFireballHit(k, c);
  return true;
}

const ITEM_SPINOUT_DURATION = 1.28;
const ITEM_SPINOUT_SPEED_MUL = 0.32;
const ITEM_SPINOUT_HEADING_JITTER = 2.4;

/** Banana / rock / RockFly — same spinout for player and CPUs. */
function applyItemSpinoutHit(kart) {
  if (!kart || (kart.shieldT ?? 0) > 0) return false;
  if ((kart.spinT ?? 0) > 0) return false;
  kart.spinT = ITEM_SPINOUT_DURATION;
  kart.vx = (kart.vx ?? 0) * ITEM_SPINOUT_SPEED_MUL;
  kart.vy = (kart.vy ?? 0) * ITEM_SPINOUT_SPEED_MUL;
  kart.heading =
    (kart.heading ?? 0) +
    (Math.random() - 0.5) * ITEM_SPINOUT_HEADING_JITTER;
  return true;
}

function applyKartSpinWobble(kart, dt) {
  if (!kart || (kart.spinT ?? 0) <= 0) return;
  kart.spinT = Math.max(0, kart.spinT - dt);
  kart.heading += Math.sin(kart.spinT * 22) * 3.8 * dt;
}

function applyLavaFireballHit(k, c) {
  c.cd = 0.65;
  if ((k.shieldT ?? 0) > 0) return;
  // Light penalty: slow down and wobble, but keep moving through the hazard.
  k.spinT = Math.max(k.spinT ?? 0, 0.52);
  k.vx = (k.vx ?? 0) * 0.72;
  k.vy = (k.vy ?? 0) * 0.72;
  k.heading = (k.heading ?? 0) + (Math.random() - 0.5) * 0.55;
}

/** Banana peels on track — player + all CPUs (practice / GP / admin). */
function resolveBananaCollisions(game, dt) {
  const K = game.kart;
  if (!game.bananas?.length) return;
  for (let i = game.bananas.length - 1; i >= 0; i--) {
    const b = game.bananas[i];
    b.t = (b.t ?? 0) + dt;
    if ((b.t ?? 0) <= 0.06) continue;
    const hitR = (b.r ?? 11) + KART_RADIUS * 0.85;

    const peelHit = (kart, isPlayer) => {
      if (!kart) return false;
      if (Math.hypot(b.x - (kart.x ?? 0), b.y - (kart.y ?? 0)) >= hitR) return false;
      if ((kart.shieldT ?? 0) > 0) {
        game.bananas.splice(i, 1);
        return true;
      }
      if ((kart.spinT ?? 0) > 0) return false;
      if (isPlayer && game.mode === "endless") {
        game.endlessBananaHits = (game.endlessBananaHits ?? 0) + 1;
        if ((game.endlessBananaHits ?? 0) >= 5) {
          game.endRace(game.raceTime, NaN);
          return true;
        }
      }
      applyItemSpinoutHit(kart);
      game.bananas.splice(i, 1);
      return true;
    };

    if (peelHit(K, true)) {
      if (game.phase === "finished") return;
      continue;
    }
    for (const o of game.opponents ?? []) {
      if (!o) continue;
      if (peelHit(o, false)) break;
    }
    if (game.phase === "finished") return;

    if (game.mode === "endless") {
      const d = Math.hypot(b.x - K.x, b.y - K.y);
      if (b.t > 14 || d > 900) game.bananas.splice(i, 1);
    } else if (b.t > 55) {
      game.bananas.splice(i, 1);
    }
  }
}

function drawRockProjectile(ctx, r) {
  const art = getTrackItemArt();
  const im = art.rock;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate((r.t ?? 0) * 10.0);
  const ok = drawSpriteCentered(ctx, im, 14, 14, 0.98);
  if (!ok) {
    ctx.fillStyle = "#7a7f86";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRockFly(ctx, rf) {
  const art = getTrackItemArt();
  const t = rf.t ?? 0;
  // 4-frame loop while in flight — upright, native 100×52 aspect (never square-stretch).
  const f = Math.floor((t * 14) % 4);
  const im = f === 0 ? art.rockFly1 : f === 1 ? art.rockFly2 : f === 2 ? art.rockFly3 : art.rockFly4;
  ctx.save();
  ctx.translate(rf.x, rf.y);
  const ok = drawSpriteCenteredNatural(ctx, im, 30, 0.98);
  if (!ok) {
    ctx.fillStyle = "#7a7f86";
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 3.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShieldRing(ctx, k, zx) {
  if ((k.shieldT ?? 0) <= 0) return;
  if (kartHasShieldSprite(getCharacterAtlas(), k.kartId)) return;
  const r = KART_RADIUS + 12;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = `rgba(150,220,255,${0.45 + pulse * 0.25})`;
  ctx.lineWidth = Math.max(2, 6 / zx);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1, 2 / zx);
  ctx.beginPath();
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function driftFlameImageForTier(art, tier) {
  if (tier >= 3) {
    const im = art.purpleFlames;
    if (im?.complete && im.naturalWidth > 0) return im;
  }
  if (tier >= 2) {
    const im = art.greenFlames;
    if (im?.complete && im.naturalWidth > 0) return im;
  }
  return art.flames;
}

function drawBoostFlames(ctx, K) {
  const t = K?.boostT ?? 0;
  if (!Number.isFinite(t) || t <= 0) return;
  const art = getTrackItemArt();
  const vx = K.vx ?? 0;
  const vy = K.vy ?? 0;
  const spd = Math.hypot(vx, vy);
  const ang = spd > 8 ? Math.atan2(vy, vx) : (K.heading ?? 0);
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const pMax = K?.phys?.maxSpeed ?? DEFAULT_KART_PHYS.maxSpeed;
  const hot = clamp(spd / (pMax * 1.05), 0.75, 1.08);

  /** Subtle, slow size breathing — much less “rumble” than before. */
  const pulse = 0.996 + 0.004 * Math.sin(performance.now() * 0.0035);
  /** Single exhaust flame asset; rotate so it points *backwards* from travel direction. */
  const w = 40 * pulse * hot;
  const h = 48 * pulse * hot;
  const back = 0;
  const tier = K?.boostFlameTier ?? 0;

  ctx.save();
  ctx.translate(K.x - fx * back, K.y - fy * back);
  /** PNG is upright flame; rotate to align exhaust ~behind motion. */
  ctx.rotate(ang - Math.PI * 0.5);
  ctx.globalCompositeOperation = "lighter";
  drawSpriteCentered(ctx, driftFlameImageForTier(art, tier), w, h, 0.9);
  ctx.restore();
}

function drawDriftReleaseFlame(ctx, K) {
  const t = K?.driftFlameT ?? 0;
  if (!Number.isFinite(t) || t <= 0) return;
  const art = getTrackItemArt();
  const tier = K?.driftReleaseTier ?? 0;
  const strength = clamp(K?.driftFlameStrength ?? 0.4, 0.2, 1);
  const p = clamp(t / 0.22, 0, 1);

  /** After drift release, velocity can point sideways; anchor to heading for a stable exhaust. */
  const ang = K.heading ?? 0;
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);

  const pop = 1 + (1 - p) * 0.35;
  const w = 44 * pop * (0.75 + strength * 0.55);
  const h = 56 * pop * (0.75 + strength * 0.65);
  const back = 3;
  const alpha = 0.95 * Math.pow(p, 0.55);

  ctx.save();
  ctx.translate(K.x - fx * back, K.y - fy * back);
  ctx.rotate(ang - Math.PI * 0.5);
  ctx.globalCompositeOperation = "lighter";
  drawSpriteCentered(ctx, driftFlameImageForTier(art, tier), w, h, alpha);
  ctx.restore();
}

function drawDriftSmoke(ctx, smoke) {
  if (!smoke?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(220, 228, 238, 1)";
  for (let i = 0; i < smoke.length; i++) {
    const p = smoke[i];
    const u = clamp(p.age / Math.max(p.life, 1e-6), 0, 1);
    const inten = clamp(p.intensity ?? 1, 0.25, 1.75);
    const a = (1 - u) * 0.22 * inten;
    if (a <= 0.002) continue;
    const r = p.r * (0.7 + u * 1.05);
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSkidMarks(ctx, skids) {
  if (!skids?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < skids.length; i++) {
    const s = skids[i];
    const u = clamp(s.age / Math.max(s.life, 1e-6), 0, 1);
    const a = (1 - u) * 0.55 * clamp(s.alpha ?? 1, 0.2, 1.4);
    if (a <= 0.003) continue;
    ctx.strokeStyle = `rgba(18, 18, 18, ${a.toFixed(4)})`;
    ctx.lineWidth = clamp(s.w ?? 2.2, 1.2, 3.3);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function fmtRaceTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const frac = Math.floor((s % 1) * 100);
  const body = Math.floor(s).toString().padStart(2, "0");
  return `${m.toString().padStart(2, "0")}:${body}.${frac
    .toString()
    .padStart(2, "0")}`;
}

function fmtShortSeconds(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  if (sec < 10) return `${sec.toFixed(2)}s`;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  return fmtRaceTime(sec);
}

function fmtShortDistanceMeters(m) {
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtShortDistanceMetersWithUS(m) {
  if (!Number.isFinite(m) || m < 0) m = 0;
  const metric = fmtShortDistanceMeters(m);
  if (m < 1000) {
    const ft = m * 3.28084;
    return `${metric} (${Math.round(ft)} ft)`;
  }
  const mi = m / 1609.344;
  return `${metric} (${mi.toFixed(2)} mi)`;
}

function usesDriftBoardHud(mode) {
  return (
    mode === "daily" ||
    mode === "endless" ||
    mode === "practice" ||
    mode === "touge" ||
    mode === "grandprix" ||
    mode === "admin"
  );
}

/** Practice / GP: drift board stacks under Timeboard; drift/snake modes use top-right. */
function driftBoardUnderTimeHud(mode) {
  return mode === "practice" || mode === "grandprix" || mode === "admin";
}

/** Top-center Randomizer.png — GP / practice on GP tracks only (not drift or Neon Snake). */
function usesMysteryRandomizerHud(game) {
  if (game.phase !== "racing") return false;
  if (game.mode === "daily" || game.mode === "touge" || game.mode === "endless")
    return false;
  return TRACK_IDS.includes(game.trackId ?? "");
}

function hudDriftDistanceM(game) {
  if (game.mode === "endless") return game.endlessDriftCurD ?? 0;
  return game._driftCurD ?? 0;
}

/** Snake / open-road modes: drift score only grows with forward road progress. */
function snakeDriftDistanceMode(game) {
  return (
    game.mode === "daily" ||
    game.mode === "touge" ||
    game.mode === "endless" ||
    neonTougeVisual(game) ||
    isGpNeoSnake(game)
  );
}

function resetDriftProgressAnchor(game, kart) {
  game._driftScoreIdx = -1;
  game._driftMaxS = NaN;
  game._driftMaxU = NaN;
  if (kart) {
    game._driftPrevX = kart.x;
    game._driftPrevY = kart.y;
  }
}

function resetCurrentDriftChain(game, kart) {
  if (game.mode === "endless") {
    game.endlessDriftCurD = 0;
  } else {
    game._driftCurD = 0;
    if (game.mode === "daily") game._driftCurT = 0;
  }
  resetDriftProgressAnchor(game, kart);
}

/** Snake-road modes: hard wall (GP) or road edge (touge/endless). */
function kartOnSnakeTrackBarrier(game, x, y, hintIdx, useRoadBarrier) {
  const hit = surfaceAt(x, y, hintIdx);
  if (useRoadBarrier) return hit.surface !== "pavement";
  return hit.surface === "wall";
}

/**
 * Meters earned this tick while drifting forward on pavement.
 * Uses monotonic arc progress + path efficiency so donuts / reverse can't farm distance.
 */
function forwardDriftStepM(game, kart, dt) {
  const tr = getTrack();
  const pts = tr.pts;
  const N = pts.length;
  if (N <= 0) return 0;

  const idxHint = kart.trackIdx ?? 0;
  const px0 = Number.isFinite(game._driftPrevX) ? game._driftPrevX : kart.x;
  const py0 = Number.isFinite(game._driftPrevY) ? game._driftPrevY : kart.y;
  const pathStep = Math.hypot(kart.x - px0, kart.y - py0);
  game._driftPrevX = kart.x;
  game._driftPrevY = kart.y;

  const srf = surfaceAt(kart.x, kart.y, idxHint);
  const onPave = srf.surface === "pavement";
  const nearRoad =
    Math.abs(srf.lat ?? 0) <= (tr.widths?.road ?? 0) * 0.92;
  if (!onPave || !nearRoad) return 0;

  const L = tr.length || 1;
  const closed = tr.closed !== false;

  const candIdx = clamp(Math.floor(idxHint), 0, N - 1);
  if (!Number.isFinite(game._driftScoreIdx) || game._driftScoreIdx < 0) {
    game._driftScoreIdx = candIdx;
  } else {
    const last = clamp(Math.floor(game._driftScoreIdx), 0, N - 1);
    game._driftScoreIdx = nearestSampleLocal(tr, kart.x, kart.y, last, 34);
  }
  const scoreIdx = clamp(Math.floor(game._driftScoreIdx), 0, N - 1);
  const p = pts[scoreIdx] ?? pts[0];
  const tx = p.tx ?? 1;
  const ty = p.ty ?? 0;

  const vx = kart.vx ?? 0;
  const vy = kart.vy ?? 0;
  const fwdVel = vx * tx + vy * ty;
  const spd = Math.hypot(vx, vy);

  if (fwdVel <= 0) return -1;
  if (spd > 2 && fwdVel / spd < 0.38) return 0;

  let arcStep = 0;

  if (closed) {
    const uNow = kartArcUAny(tr, kart.x, kart.y, scoreIdx);
    if (!Number.isFinite(game._driftMaxU)) {
      game._driftMaxU = uNow;
      return 0;
    }
    const ahead = modDelta(uNow, game._driftMaxU, L);
    const behind = modDelta(game._driftMaxU, uNow, L);
    if (behind > 14 && ahead < 3) return -1;
    arcStep = ahead > 0.02 ? ahead : 0;
    if (arcStep > 0) game._driftMaxU = uNow;
  } else {
    const sNow = p.s ?? 0;
    if (!Number.isFinite(game._driftMaxS)) {
      game._driftMaxS = sNow;
      return 0;
    }
    const maxS = game._driftMaxS;
    if (sNow < maxS - 14) return -1;
    arcStep = sNow > maxS ? sNow - maxS : 0;
    if (arcStep > 0) game._driftMaxS = sNow;
  }

  if (arcStep <= 0) return 0;

  const eff = arcStep / Math.max(pathStep, 0.04);
  if (pathStep > 0.08 && eff < 0.4) return 0;

  const cap = Math.min(arcStep, fwdVel * dt * 1.15 + 0.75);
  return cap > 0 ? cap : 0;
}

function stepCurrentDriftDistance(game, kart, dt) {
  if (!usesDriftBoardHud(game.mode)) return;
  if (kart.drifting) {
    let dStep;
    if (snakeDriftDistanceMode(game)) {
      const fwd = forwardDriftStepM(game, kart, dt);
      if (fwd < 0) {
        resetCurrentDriftChain(game, kart);
        return;
      }
      dStep = fwd;
    } else {
      dStep = Math.hypot(kart.vx ?? 0, kart.vy ?? 0) * dt;
    }
    if (dStep <= 0) return;

    if (game.mode === "endless") {
      game.endlessDriftCurD = (game.endlessDriftCurD ?? 0) + dStep;
      game.endlessLongestDrift = Math.max(
        game.endlessLongestDrift ?? 0,
        game.endlessDriftCurD ?? 0,
      );
    } else {
      game._driftCurD = (game._driftCurD ?? 0) + dStep;
      if (game.mode === "daily") {
        game.longestDrift = Math.max(game.longestDrift ?? 0, game._driftCurD);
        game._driftCurT = (game._driftCurT ?? 0) + dt;
        game.longestDriftTime = Math.max(
          game.longestDriftTime ?? 0,
          game._driftCurT,
        );
      }
    }
  } else {
    if (game.mode === "endless") {
      game.endlessDriftCurD = 0;
    } else {
      game._driftCurD = 0;
      if (game.mode === "daily") game._driftCurT = 0;
    }
    if (snakeDriftDistanceMode(game)) resetDriftProgressAnchor(game, kart);
  }
}

function fmtDriftHudDistance(game, m) {
  if (!Number.isFinite(m) || m < 0) m = 0;
  if (driftBoardUnderTimeHud(game.mode)) {
    if (m < 1000) {
      const ft = m * 3.28084;
      return `${Math.round(m)} m (${Math.round(ft)} ft)`;
    }
    const mi = m / 1609.344;
    return `${(m / 1000).toFixed(2)} km (${mi.toFixed(2)} mi)`;
  }
  return fmtShortDistanceMetersWithUS(m);
}

function ordinalPlace(n) {
  if (!Number.isFinite(n) || n < 1) return "?";
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${Math.floor(n)}th`;
}

/** Endless Neon Snake: +50 shells per 5 mi of forward distance (US survey mile). */
const ENDLESS_M_PER_MI = 1609.344;
const ENDLESS_SHELL_MI_STEP = 5;
const ENDLESS_SHELL_INTERVAL_M = ENDLESS_M_PER_MI * ENDLESS_SHELL_MI_STEP;
const ENDLESS_SHELL_PER_STEP = 50;

function endlessDistanceShellTiers(distM) {
  const d = Math.max(0, Number(distM) || 0);
  return Math.floor(d / ENDLESS_SHELL_INTERVAL_M);
}

function endlessDistanceShellBonus(distM) {
  return endlessDistanceShellTiers(distM) * ENDLESS_SHELL_PER_STEP;
}

function stepEndlessDistanceShellAwards(game, kart, distM) {
  const tiers = endlessDistanceShellTiers(distM);
  const paid = game.endlessDistShellTiersPaid ?? 0;
  if (tiers <= paid) return;
  const add = (tiers - paid) * ENDLESS_SHELL_PER_STEP;
  kart.shells = (kart.shells ?? 0) + add;
  game.endlessDistShellTiersPaid = tiers;
  game.endlessDistShellBonus = (game.endlessDistShellBonus ?? 0) + add;
}

/** One-time payout after completing the full Grand Prix series. */
function gpSeriesShellPayout(place) {
  const p = Math.floor(Number(place));
  if (p === 1) return 300;
  if (p === 2) return 200;
  if (p === 3) return 100;
  if (p === 4) return 75;
  if (p === 5) return 50;
  if (p === 6) return 25;
  return 0;
}

function gpPointsForPlace(place) {
  const p = Math.floor(Number(place));
  // Mario Kart-ish curve, tuned for 4 racers (you + 3 CPUs).
  if (p === 1) return 15;
  if (p === 2) return 12;
  if (p === 3) return 10;
  if (p === 4) return 8;
  if (p === 5) return 7;
  if (p === 6) return 6;
  if (p === 7) return 5;
  if (p === 8) return 4;
  return 0;
}

function accumulateForwardOdometer(K, dt) {
  /**
   * Forward-only distance.
   * Use track tangent (tx,ty) at the nearest sample so reversing never adds distance.
   * (Heading-based could be exploited by spinning while sliding backwards.)
   */
  const s = surfaceAt(K.x, K.y, K.trackIdx ?? 0);
  K.trackIdx = s.idx;
  const fwd = (K.vx ?? 0) * (s.tx ?? 0) + (K.vy ?? 0) * (s.ty ?? 0);
  K.odometer = (K.odometer ?? 0) + Math.max(0, fwd) * dt;
}

function resolveRoadBarrierCollision(x, y, vx, vy, hintIdx, game) {
  const tr = getTrack();
  const hit = surfaceAt(x, y, hintIdx);
  // "Firm" bounce is great for neon-snake-gp but makes CPUs pinball/wedge on lava-serpent.
  const firm = game?.trackId === "neo-snake-gp";
  // Open-track endcaps for touge/endless: don't allow driving "past the ends",
  // even if you're still on pavement (spawn is slightly behind the start stripe).
  if (tr.closed === false && (game?.mode === "touge" || game?.mode === "endless")) {
    const si = tr.startIdx ?? 0;
    const fi = tr.finishIdx ?? (tr.pts.length - 1);
    const sp = tr.pts[si] ?? tr.pts[0];
    const fp = tr.pts[fi] ?? tr.pts[tr.pts.length - 1];
    const cap = 36;
    // Only apply endcaps near the endpoints (avoid "invisible walls" mid-course).
    const capNear = 320;
    const ds0 = (x - sp.x) * (x - sp.x) + (y - sp.y) * (y - sp.y);
    const ds1 = (x - fp.x) * (x - fp.x) + (y - fp.y) * (y - fp.y);
    const dStart = (x - sp.x) * sp.tx + (y - sp.y) * sp.ty;
    const dFinish = (x - fp.x) * fp.tx + (y - fp.y) * fp.ty;
    // Behind start: push forward.
    if (ds0 <= capNear * capNear && dStart < -cap) {
      const dd = (-cap) - dStart;
      return {
        x: x + sp.tx * dd,
        y: y + sp.ty * dd,
        vx: vx * 0.55,
        vy: vy * 0.55,
        idx: hit.idx,
      };
    }
    // Beyond finish: push backward.
    if (ds1 <= capNear * capNear && dFinish > cap) {
      const dd = dFinish - cap;
      return {
        x: x - fp.tx * dd,
        y: y - fp.ty * dd,
        vx: vx * 0.55,
        vy: vy * 0.55,
        idx: hit.idx,
      };
    }
  }

  if (hit.surface === "pavement") return { x, y, vx, vy, idx: hit.idx };
  // Push back to (just inside) the road boundary.
  const lat = hit.lat ?? 0;
  const limit = tr.widths.road - KART_RADIUS * 0.92;
  const push = (Math.abs(lat) - limit) + KART_RADIUS * 0.15;
  const nx = hit.nx;
  const ny = hit.ny;
  const nxX = x - nx * push;
  const nyY = y - ny * push;
  const vn = vx * nx + vy * ny;
  let nvx = vx;
  let nvy = vy;
  if (vn > 0) {
    const bounce = firm ? 2.15 : 1.55;
    nvx -= bounce * vn * nx;
    nvy -= bounce * vn * ny;
    const damp = firm ? 0.42 : 0.62;
    nvx *= damp;
    nvy *= damp;
  } else {
    const damp = firm ? 0.72 : 0.85;
    nvx *= damp;
    nvy *= damp;
  }
  return { x: nxX, y: nyY, vx: nvx, vy: nvy, idx: hit.idx };
}

function nearestSampleLocal(tr, px, py, aroundIdx, window) {
  const pts = tr.pts;
  const N = pts.length;
  if (N <= 0) return 0;
  const a = clamp(Math.floor(aroundIdx ?? 0), 0, N - 1);
  const w = clamp(Math.floor(window ?? 24), 6, 120);
  const i0 = clamp(a - w, 0, N - 1);
  const i1 = clamp(a + w, 0, N - 1);
  let bestI = a;
  let bestD = Infinity;
  for (let i = i0; i <= i1; i++) {
    const p = pts[i];
    const dx = px - p.x;
    const dy = py - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function crossedStripeS(prevS, nextS, stripeS, L) {
  const a = Number(prevS) || 0;
  const b = Number(nextS) || 0;
  const s = Number(stripeS) || 0;
  const len = Number(L) || 1;
  if (len <= 0) return false;
  if (b >= a) return a < s && b >= s;
  // wrapped (b jumped back to 0)
  return a < s || b >= s;
}

function modDelta(uNow, uStart, L) {
  const len = Number(L) || 1;
  if (len <= 0) return 0;
  let a = Number(uNow) || 0;
  let b = Number(uStart) || 0;
  a = ((a % len) + len) % len;
  b = ((b % len) + len) % len;
  const d = a - b;
  return d >= 0 ? d : d + len;
}

function sampleIdxForS(tr, s, hintIdx) {
  const pts = tr.pts;
  const N = pts.length;
  if (N <= 0) return 0;
  const L = tr.length || 1;
  let ss = Number(s) || 0;
  ss = ((ss % L) + L) % L;

  // Binary search on cumulative arc length (old 60-step walk failed on dense GP ribbons).
  let lo = 0;
  let hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((pts[mid]?.s ?? 0) <= ss + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function kartArcUAny(tr, px, py, hintIdx) {
  const pts = tr.pts;
  const N = pts.length;
  const L = tr.length || 1;
  const closed = tr.closed !== false;
  const h = Number.isFinite(hintIdx) ? clamp(Math.floor(hintIdx), 0, N - 1) : -1;
  let bestDs = Infinity;
  let bestU = 0;
  let bestSeg = -1;

  const distSeg = (si) => {
    if (h < 0) return 1e9;
    let d = Math.abs(si - h);
    if (closed) {
      if (d > N * 0.5) d = N - d;
    }
    return d;
  };

  const consider = (i, uCand, ds) => {
    if (ds < bestDs - 1e-8) {
      bestDs = ds;
      bestU = uCand;
      bestSeg = i;
    } else if (h >= 0 && Math.abs(ds - bestDs) <= 1e-8) {
      if (bestSeg < 0 || distSeg(i) < distSeg(bestSeg)) {
        bestU = uCand;
        bestSeg = i;
      }
    }
  };

  const segCount = closed ? N : Math.max(0, N - 1);
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[closed ? ((i + 1) % N) : (i + 1)];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const segLenSq = abx * abx + aby * aby;
    let t = 0;
    if (segLenSq >= 1e-12)
      t = clamp(((px - a.x) * abx + (py - a.y) * aby) / segLenSq, 0, 1);
    const qx = a.x + abx * t;
    const qy = a.y + aby * t;
    const ds = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    const segLen = Math.sqrt(segLenSq) || 0;
    const uCand = (a.s ?? 0) + t * segLen;
    consider(i, uCand, ds);
  }

  if (!Number.isFinite(bestU) || bestU < 0) return 0;
  if (bestU >= L) bestU = L - 1e-9;
  return bestU;
}

function checkpointLineSegment() {
  const tr = getTrack();
  const pts = tr.pts;
  const L = tr.length || 1;
  const fi = tr.finishIdx ?? 0;
  const stripeS = pts[fi]?.s ?? 0;
  const s = stripeS + L * 0.5; // opposite side of the loop
  const idx = sampleIdxForS(tr, s, fi);
  const p = pts[idx] ?? pts[0];
  const w = tr.widths.wall;
  return {
    x1: p.x + p.nx * w,
    y1: p.y + p.ny * w,
    x2: p.x - p.nx * w,
    y2: p.y - p.ny * w,
    mx: p.x,
    my: p.y,
    halfW: w,
    nx: p.nx,
    ny: p.ny,
    tx: p.tx,
    ty: p.ty,
  };
}

/**
 * Standings: lap count dominates; within a lap, cumulative arc forward from finish (stripeS unwrap).
 * Larger uLong = farther on course; we previously subtracted it (inverting the whole leaderboard).
 */
const STANDINGS_LAP_SEP = 1e12;
const ARC_Q = 64;

/** @returns {{ key: number, uLong: number }} */
function standingsRowProgress(tr, laps, kart) {
  const ku = kartArcU(tr, kart.x, kart.y, kart.trackIdx ?? 0);
  const uLong = standingLongitudinalU(tr, ku);
  const uq = Math.floor(uLong * ARC_Q + 1e-6) / ARC_Q;
  return { key: laps * STANDINGS_LAP_SEP + uq, uLong };
}

/** @returns {{ kart: any, tag: string, player: boolean, key: number }[]} */
function racersSortedByProgress(game) {
  const tr = getTrack();
  const rows = [
    { kart: game.kart, tag: "You", player: true },
    ...game.opponents.map((o) => ({
      kart: o,
      tag: o.kartId || "CPU",
      player: false,
    })),
  ];
  /** Player laps live on `game.lapsFinished`; CPU laps on each opponent kart. */
  rows.forEach((r, i) => {
    r._stable = i;
    const laps = r.player
      ? game.lapsFinished ?? 0
      : r.kart.lapsFinished ?? 0;
    const p = standingsRowProgress(tr, laps, r.kart);
    r.key = p.key;
    r.uLong = p.uLong;
  });
  rows.sort((a, b) => {
    const dk = b.key - a.key;
    if (dk !== 0) return dk > 0 ? 1 : -1;
    const du = b.uLong - a.uLong;
    if (du !== 0) return du > 0 ? 1 : -1;
    return a._stable - b._stable;
  });
  return rows;
}

/** Finish order among you + CPUs (same sort as HUD position). */
function computeRaceFinishPlace(game) {
  const rows = racersSortedByProgress(game);
  let i = rows.findIndex((r) => r.kart === game.kart);
  if (i < 0) i = rows.findIndex((r) => r.player === true);
  if (i < 0) return NaN;
  return i + 1;
}

function computeRaceFinishPlaceByTime(game) {
  const all = [
    { kart: game.kart, player: true, t: game.kart?.finishedRaceT },
    ...(game.opponents ?? []).map((o) => ({ kart: o, player: false, t: o?.finishedRaceT })),
  ];
  const any = all.some((r) => Number.isFinite(r.t) && r.t >= 0);
  if (!any) return computeRaceFinishPlace(game);
  // Earlier finish time wins; non-finishers sort after.
  all.sort((a, b) => {
    const ta = Number.isFinite(a.t) ? a.t : Infinity;
    const tb = Number.isFinite(b.t) ? b.t : Infinity;
    if (ta !== tb) return ta - tb;
    // Tie-break: progress.
    const rows = racersSortedByProgress(game);
    const ia = rows.findIndex((r) => r.kart === a.kart);
    const ib = rows.findIndex((r) => r.kart === b.kart);
    return ia - ib;
  });
  const idx = all.findIndex((r) => r.player);
  return idx >= 0 ? idx + 1 : NaN;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function ribbonPointAtS(tr, s) {
  const pts = tr.pts;
  const L = tr.length || 1;
  if (!pts.length) return { x: 0, y: 0, idx: 0, tx: 1, ty: 0, nx: 0, ny: 1 };
  const closed = tr.closed !== false;
  const N = pts.length;
  s = ((s % L) + L) % L;

  const segCount = closed ? N : Math.max(1, N - 1);
  let i = 0;
  while (i < segCount - 1) {
    const j = (i + 1) % N;
    const sEnd = closed && j === 0 ? L : (pts[j]?.s ?? L);
    if (sEnd >= s) break;
    i++;
  }

  const a = pts[i];
  const b = pts[closed ? ((i + 1) % N) : Math.min(i + 1, N - 1)];
  if (!a || !b) {
    const p0 = pts[0];
    return {
      x: p0.x,
      y: p0.y,
      idx: 0,
      tx: p0.tx ?? 1,
      ty: p0.ty ?? 0,
      nx: p0.nx ?? 0,
      ny: p0.ny ?? 1,
    };
  }

  const sA = a.s ?? 0;
  const sB = closed && (i + 1) % N === 0 ? L : (b.s ?? sA);
  const denom = sB - sA || 1;
  const u = (s - sA) / denom;
  const x = a.x + (b.x - a.x) * u;
  const y = a.y + (b.y - a.y) * u;
  const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const tx = (b.x - a.x) / segLen;
  const ty = (b.y - a.y) / segLen;
  return { x, y, idx: i, tx, ty, nx: a.nx, ny: a.ny };
}

function rockFlyOpponentFinished(o, game) {
  if (!o) return true;
  const laps = o.lapsFinished ?? 0;
  const target = game?.lapTarget?.() ?? TOTAL_LAPS;
  if (laps >= target) return true;
  if (Number.isFinite(o.finishedRaceT)) return true;
  return false;
}

function rockFlyTargetOk(game, tgt) {
  if (!tgt || !game) return false;
  if (!Number.isFinite(tgt.x) || !Number.isFinite(tgt.y)) return false;
  if (tgt === game.kart) return !rockFlyOpponentFinished(tgt, game);
  if (rockFlyOpponentFinished(tgt, game)) return false;
  return (game.opponents ?? []).includes(tgt);
}

/** Prefer a rival still racing; never home in on a kart that already finished. */
function pickRockFlyTarget(K, opps, game) {
  const live = (opps ?? []).filter(
    (o) =>
      o &&
      Number.isFinite(o.x) &&
      Number.isFinite(o.y) &&
      !rockFlyOpponentFinished(o, game),
  );
  if (!live.length) return null;
  const hx = Math.cos(K.heading ?? 0);
  const hy = Math.sin(K.heading ?? 0);
  let bestAhead = null;
  let bestAheadD = Infinity;
  for (const o of live) {
    const dx = (o.x ?? 0) - (K.x ?? 0);
    const dy = (o.y ?? 0) - (K.y ?? 0);
    const ahead = dx * hx + dy * hy;
    if (ahead < 40) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestAheadD) {
      bestAheadD = d;
      bestAhead = o;
    }
  }
  if (bestAhead) return bestAhead;
  let best = null;
  let bestD = Infinity;
  for (const o of live) {
    const d = Math.hypot((o.x ?? 0) - (K.x ?? 0), (o.y ?? 0) - (K.y ?? 0));
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function safeSurfaceAt(px, py, hintIdx) {
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return { surface: "wall", idx: hintIdx ?? 0 };
  }
  try {
    return surfaceAt(px, py, hintIdx);
  } catch {
    return { surface: "wall", idx: hintIdx ?? 0 };
  }
}

function spawnRockFlyFromKart(K) {
  const tr = getTrack();
  const sK = kartArcUAny(tr, K.x, K.y, K.trackIdx ?? 0);
  const p = ribbonPointAtS(tr, sK);
  const ahead = KART_RADIUS + 20;
  const sx = p.x + p.tx * ahead;
  const sy = p.y + p.ty * ahead;
  const s0 = kartArcUAny(tr, sx, sy, p.idx);
  const p0 = ribbonPointAtS(tr, s0);
  return { x: p0.x, y: p0.y, s: s0, ang: Math.atan2(p0.ty, p0.tx) };
}

function advanceRockFlyAlongTrack(rf, dt, speed, game) {
  const tr = getTrack();
  const tgt = rf.target;
  if (!tgt || !tr.pts?.length || !rockFlyTargetOk(game, tgt)) return false;
  const L = tr.length || 1;
  const tx = tgt.x ?? 0;
  const ty = tgt.y ?? 0;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;

  const sNow = Number.isFinite(rf.s)
    ? rf.s
    : kartArcUAny(tr, rf.x, rf.y, rf.idxHint ?? 0);
  const sT = kartArcUAny(tr, tx, ty, tgt.trackIdx ?? 0);
  if (!Number.isFinite(sNow) || !Number.isFinite(sT)) return false;

  let d = ((sT - sNow) % L + L) % L;
  if (d > L * 0.5) d -= L;
  const step = Math.sign(d || 1) * Math.min(speed * dt, Math.abs(d) || 0);
  if (!Number.isFinite(step)) return false;
  const sNext = ((sNow + step) % L + L) % L;
  if (!Number.isFinite(sNext)) return false;

  const p = ribbonPointAtS(tr, sNext);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;

  let remainArc = ((sT - sNext) % L + L) % L;
  if (remainArc > L * 0.5) remainArc = L - remainArc;

  let x = p.x;
  let y = p.y;
  // CPUs sit off the centerline; steer onto the kart when close. Skip on lava GP — hazards break surface queries.
  const closeArc = 130;
  const allowWorldSteer = tr.id !== "lava-serpent";
  if (allowWorldSteer && remainArc < closeArc) {
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.hypot(dx, dy) || 1;
    const move = Math.min(speed * dt * 1.35, dist);
    const nx = x + (dx / dist) * move;
    const ny = y + (dy / dist) * move;
    const surf = safeSurfaceAt(nx, ny, p.idx);
    if (surf?.surface === "pavement") {
      x = nx;
      y = ny;
    } else {
      const nx2 = x + (dx / dist) * move * 0.55;
      const ny2 = y + (dy / dist) * move * 0.55;
      if (safeSurfaceAt(nx2, ny2, p.idx)?.surface === "pavement") {
        x = nx2;
        y = ny2;
      }
    }
    rf.ang = Math.atan2(ty - y, tx - x);
  } else {
    rf.ang = Math.atan2(p.ty, p.tx);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  rf.x = x;
  rf.y = y;
  rf.s = sNext;
  rf.idxHint = p.idx;
  return true;
}

function rockFlyHitsKart(px0, py0, x1, y1, kx, ky) {
  const r = KART_RADIUS + 20;
  if (Math.hypot(x1 - kx, y1 - ky) <= r) return true;
  if (segHitsCircle(px0, py0, x1, y1, kx, ky, r)) return true;
  return false;
}

function pickRouletteIcon(art, show, itemKey = "") {
  const key = itemKey || mysteryItemKeyFromShow(show);
  const ready = (im) => im?.complete && im.naturalWidth > 0;
  if (key === "boost3") return ready(art.purpleLightning) ? art.purpleLightning : art.lightning;
  if (key === "boost2") return ready(art.greenLightning) ? art.greenLightning : art.lightning;
  if (key === "boost") return art.lightning;
  if (key === "rockfly") return art.rockFly1;
  const s = String(show ?? "").toLowerCase();
  if (s.includes("rockfly")) return art.rockFly1;
  if (s.includes("rock") && s.includes("x3")) return art.rock3 ?? art.rock;
  if (s.includes("rock")) return art.rock;
  if (s.includes("banana")) return art.banana;
  if (s.includes("shield")) return art.shield;
  if (s.includes("boost")) return art.lightning;
  return art.lightning ?? art.rock;
}

function rouletteIconSrc(show, itemKey = "") {
  const im = pickRouletteIcon(getTrackItemArt(), show, itemKey);
  return im?.src || "";
}

function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  let t = 0;
  if (abLenSq >= 1e-9) t = clamp(((cx - ax) * abx + (cy - ay) * aby) / abLenSq, 0, 1);
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy <= r * r;
}

function finishLineSegmentAtIdx(idx) {
  const tr = getTrack();
  const p = tr.pts[idx ?? tr.finishIdx ?? 0] ?? tr.pts[0];
  const w = tr.widths.wall;
  const mx = p.x;
  const my = p.y;
  return {
    x1: p.x + p.nx * w,
    y1: p.y + p.ny * w,
    x2: p.x - p.nx * w,
    y2: p.y - p.ny * w,
    mx,
    my,
    halfW: w,
    nx: p.nx,
    ny: p.ny,
    tx: p.tx,
    ty: p.ty,
  };
}

function driftTierFromGauge(gauge) {
  const g = clamp(Number(gauge) || 0, 0, PHYS.driftGaugeMax || 1);
  const m = PHYS.driftGaugeMax || 1;
  const t1 = (PHYS.driftTier1 ?? 0.34) * m;
  const t2 = (PHYS.driftTier2 ?? 0.67) * m;
  const t3 = (PHYS.driftTier3 ?? 0.98) * m;
  if (g >= t3) return 3;
  if (g >= t2) return 2;
  if (g >= t1) return 1;
  return 0;
}

function makeSmokeParticle(x, y, vx, vy, r, life, intensity) {
  return {
    x,
    y,
    vx,
    vy,
    r,
    life,
    intensity: Number.isFinite(intensity) ? intensity : 1,
    age: 0,
  };
}

function makeSkidSeg(x1, y1, x2, y2, life, w, alpha) {
  return {
    x1,
    y1,
    x2,
    y2,
    life,
    w,
    alpha: Number.isFinite(alpha) ? alpha : 1,
    age: 0,
  };
}

function makeTougeShellPickups(n) {
  const tr = getTrack();
  const pts = tr.pts;
  const out = [];
  const count = Math.max(8, Math.min(60, Math.floor(Number(n) || 24)));
  const step = Math.max(1, Math.floor((pts.length - 1) / count));
  for (let i = 0; i < count; i++) {
    const idx = clamp(i * step + 12, 0, pts.length - 1);
    const p = pts[idx];
    const off = (i % 2 === 0 ? 1 : -1) * (tr.widths.road * 0.32);
    out.push({
      id: `tsh${i}`,
      x: p.x + p.nx * off,
      y: p.y + p.ny * off,
      type: "shell",
      taken: false,
      bob: Math.random() * Math.PI * 2,
    });
  }
  return out;
}

function spawnEndlessBanana(game) {
  const K = game.kart;
  const tr = getTrack();
  const pts = tr.pts;
  const n = pts?.length ?? 0;
  if (n < 2) return;

  // Spawn based on the sampled centerline ahead of current track index.
  const baseIdx = clamp(Math.floor(K.trackIdx ?? 0), 0, n - 1);
  // Use a broader random window ahead so hazards populate straights too.
  const winA = 26;
  const winB = 110;
  const ahead0 = winA + Math.floor(Math.random() * (winB - winA));
  const minSep = 64; // keep peels from clustering (but allow dispersion)

  // Try harder to place across the road width (not just center).
  for (let tries = 0; tries < 24; tries++) {
    const idx = (baseIdx + ahead0 + tries) % n;
    const p = pts[idx];
    const side = Math.random() < 0.5 ? -1 : 1;
    // Pick an off-center target, then "slide inward" if we landed off-road.
    const maxLat = clamp(tr.widths.road * 0.42, 16, 66);
    // Mix inner/mid/outer lanes so you can't just "thread the middle".
    const u = Math.random();
    const edgeBias =
      u < 0.28 ? 0.18 + Math.random() * 0.22 : // inner
      u < 0.78 ? 0.45 + Math.random() * 0.35 : // mid
      0.78 + Math.random() * 0.22; // outer
    const targetLat = side * edgeBias * maxLat;
    const scales = [1.0, 0.78, 0.6, 0.45, 0.32];
    for (const sc of scales) {
      const lat = targetLat * sc;
      const x = p.x + p.nx * lat;
      const y = p.y + p.ny * lat;
      const s = surfaceAt(x, y, idx);
      if (s.surface !== "pavement") continue;
      let ok = true;
      for (const b of game.bananas ?? []) {
        if (Math.hypot(b.x - x, b.y - y) < minSep) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      game.bananas.push({ x, y, r: 11, t: 0 });
      return;
    }
  }
  // Fallback: place nearer the center so we don't "spawn nothing" too often.
  for (let tries = 0; tries < 10; tries++) {
    const idx = (baseIdx + ahead0 + tries) % n;
    const p = pts[idx];
    const maxLat = clamp(tr.widths.road * 0.22, 10, 34);
    const lat = (Math.random() * 2 - 1) * maxLat;
    const x = p.x + p.nx * lat;
    const y = p.y + p.ny * lat;
    const s = surfaceAt(x, y, idx);
    if (s.surface !== "pavement") continue;
    let ok = true;
    for (const b of game.bananas ?? []) {
      if (Math.hypot(b.x - x, b.y - y) < minSep) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    game.bananas.push({ x, y, r: 11, t: 0 });
    return;
  }

  // Last fallback: force on centerline (better a visible peel than nothing).
  const pf = pts[(baseIdx + ahead0) % n];
  game.bananas.push({ x: pf.x, y: pf.y, r: 11, t: 0 });
}

function wrapWorld(game, dx, dy) {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6)
  )
    return;
  const K = game.kart;
  K.x += dx;
  K.y += dy;
  game.prevKx += dx;
  game.prevKy += dy;
  game.cam.x += dx;
  game.cam.y += dy;
  // IMPORTANT: Don't shift track-anchored objects (pickups/bananas/etc).
  // Wrapping should only reposition the player/camera against the fixed track.
}

function wrapAngleRad(a) {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
}

function lerpAngleRad(a, b, u) {
  const d = wrapAngleRad(b - a);
  return a + d * u;
}

function interpGhostSampleNoWrap(samples, t) {
  if (!samples.length) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (t <= first.t) return { x: first.x, y: first.y, hh: first.h };
  if (t >= last.t) return { x: last.x, y: last.y, hh: last.h };

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const A = samples[lo];
  const B = samples[hi];
  const u = clamp((t - A.t) / Math.max(B.t - A.t, 1e-6), 0, 1);
  return {
    x: A.x + (B.x - A.x) * u,
    y: A.y + (B.y - A.y) * u,
    hh: lerpAngleRad(A.h, B.h, u),
  };
}

function interpGhostSample(samples, t, lapTime) {
  if (!samples.length) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const lt =
    Number.isFinite(lapTime) && lapTime > 0
      ? lapTime
      : Math.max(last.t, first.t + 0.001);

  let tt = t;
  if (lt > 0) tt = ((t % lt) + lt) % lt;

  /** Wrap segment: interpolate from last -> first across lap boundary */
  if (tt < first.t || tt >= last.t) {
    const dt = (first.t + lt) - last.t;
    if (dt < 1e-4) {
      return { x: first.x, y: first.y, hh: first.h };
    }
    const u =
      tt >= last.t
        ? clamp((tt - last.t) / Math.max(dt, 1e-6), 0, 1)
        : clamp((tt + lt - last.t) / Math.max(dt, 1e-6), 0, 1);
    return {
      x: last.x + (first.x - last.x) * u,
      y: last.y + (first.y - last.y) * u,
      hh: lerpAngleRad(last.h, first.h, u),
    };
  }

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= tt) lo = mid;
    else hi = mid;
  }
  const A = samples[lo];
  const B = samples[hi];
  const u = clamp((tt - A.t) / Math.max(B.t - A.t, 1e-6), 0, 1);
  return {
    x: A.x + (B.x - A.x) * u,
    y: A.y + (B.y - A.y) * u,
    hh: lerpAngleRad(A.h, B.h, u),
  };
}

/** @typedef {"menu" | "racing" | "finished"} GamePhase */

export class Game {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.phase = "menu";
    this.mode = "practice";
    this.dateISO = todayISO();
    this.finishLine = finishLineSegment();
    this.decor = getDecor();
    this.keys = new Set();
    this.touch = {
      gas: false,
      brake: false,
      drift: false,
      steer: 0,
    };
    this.cam = { x: 0, y: 0 };
    this.ghostData = null;
    this.ghostTime = 0;
    this.ghostRun = null;
    this.opponents = [];
    this.trackId = "meadow-oval";
    this.gpResults = [];
    this.totalShellsSession = 0;
    this._sessionShellsCountedThisRace = false;
    this.smoke = [];
    this.skids = [];
    this.rocks = [];
    this.rockFlies = [];
    this._handlersBound = false;
    this._ptrBound = false;
    this.boundKeyDown = (e) => {
      let k =
        e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      /** Normalize space across browsers: e.key may be " ", "Space", or "Spacebar" */
      if (e.code === "Space" || k === "space" || k === "spacebar") k = " ";
      this.keys.add(k);
      if ([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(k))
        e.preventDefault();
      if (
        ["w","s","arrowup","arrowdown","a","arrowleft","d","arrowright"," "].includes(
          k,
        )
      )
        e.preventDefault();
      if (k === "r") this.requestRestartRace();
      if (k === "f") this.endlessDebug = !this.endlessDebug;
      if (k === "q") this.useAwardedItem();
      if (k === "1" || k === "2" || k === "3") this.useInventoryKey(k);
    };
    this.boundKeyUp = (e) => {
      let k =
        e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      if (e.code === "Space" || k === "space" || k === "spacebar") k = " ";
      this.keys.delete(k);
    };
    this.lastT = 0;
    this.acc = 0;
    this.frameDt = 1 / TARGET_FPS;
    this.loop = this.loop.bind(this);
    getTrackItemArt();
  }

  lapTarget() {
    if (this.mode === "practice") return 5;
    return TOTAL_LAPS;
  }

  bindInput() {
    if (this._handlersBound) return;
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    this._handlersBound = true;

  }

  useInventoryKey(k) {
    if (this.phase !== "racing" || !this.started) return;
    const K = this.kart;
    if (this.mode === "endless") return;
    // GP / practice: mystery-box items (also Q / tap randomizer / gamepad X/Y).
    if (this.mode === "grandprix" || this.mode === "practice" || this.mode === "admin") {
      const item =
        this.equippedItem ||
        (this.itemRoulette?.done ? this.itemRoulette.item : "");
      const rockItems = new Set(["rock", "rock3", "rockfly"]);
      const boostItems = new Set(["boost", "boost2", "boost3"]);
      if (k === "1" && item === "banana") this.useAwardedItem();
      else if (k === "2" && boostItems.has(item)) this.useAwardedItem();
      else if (k === "3" && rockItems.has(item)) this.useAwardedItem();
      return;
    }
    if (k === "1" && K.bananasInv > 0) {
      K.bananasInv--;
      const bx = Math.cos(K.heading);
      const by = Math.sin(K.heading);
      this.bananas.push({
        x: K.x - bx * (KART_RADIUS + 26),
        y: K.y - by * (KART_RADIUS + 26),
        r: 11,
        t: 0,
      });
      if (this.itemRoulette?.done && this.itemRoulette.item === "banana") this.itemRoulette = null;
    }
    if (k === "2" && K.boostsInv > 0) {
      K.boostsInv--;
      applyBoostImpulse(K, PHYS.itemBoostImpulse);
      applyTimedBoost(K, 0.2, 0.7);
      if (this.itemRoulette?.done && this.itemRoulette.item === "boost") this.itemRoulette = null;
    }
    if (k === "3" && (K.rocksInv ?? 0) > 0) {
      K.rocksInv--;
      const sp = 740;
      const hx = Math.cos(K.heading);
      const hy = Math.sin(K.heading);
      const vx = hx * sp + (K.vx ?? 0) * 0.35;
      const vy = hy * sp + (K.vy ?? 0) * 0.35;
      this.rocks = this.rocks ?? [];
      this.rocks.push({
        x: K.x + hx * (KART_RADIUS + 18),
        y: K.y + hy * (KART_RADIUS + 18),
        vx,
        vy,
        t: 0,
        owner: "player",
      });
      if (this.itemRoulette?.done && this.itemRoulette.item === "rock") this.itemRoulette = null;
    }
  }

  useAwardedItem() {
    if (this.phase !== "racing" || !this.started) return;
    if (this.itemRoulette && !this.itemRoulette.done) return;

    const K = this.kart;
    const item =
      this.equippedItem ||
      (this.itemRoulette?.done ? this.itemRoulette.item : "");
    if (!item) return;
    if ((this.equippedCharges ?? 0) <= 0) this.equippedCharges = 1;
    if (item === "banana") {
      const bx = Math.cos(K.heading);
      const by = Math.sin(K.heading);
      this.bananas.push({
        x: K.x - bx * (KART_RADIUS + 26),
        y: K.y - by * (KART_RADIUS + 26),
        r: 11,
        t: 0,
      });
    } else if (item === "boost" || item === "boost2" || item === "boost3") {
      applyMysteryBoost(
        K,
        item === "boost3" ? 3 : item === "boost2" ? 2 : 1,
      );
    } else if (item === "rock") {
      const sp = 520;
      const hx = Math.cos(K.heading);
      const hy = Math.sin(K.heading);
      const vx = hx * sp + (K.vx ?? 0) * 0.32;
      const vy = hy * sp + (K.vy ?? 0) * 0.32;
      this.rocks = this.rocks ?? [];
      this.rocks.push({
        x: K.x + hx * (KART_RADIUS + 18),
        y: K.y + hy * (KART_RADIUS + 18),
        vx,
        vy,
        t: 0,
        owner: "player",
      });
    } else if (item === "rock3") {
      const sp = 510;
      const hx0 = Math.cos(K.heading);
      const hy0 = Math.sin(K.heading);
      const fan = 0.22;
      const angles = [K.heading - fan, K.heading, K.heading + fan];
      this.rocks = this.rocks ?? [];
      for (const a of angles) {
        const hx = Math.cos(a);
        const hy = Math.sin(a);
        this.rocks.push({
          x: K.x + hx0 * (KART_RADIUS + 18),
          y: K.y + hy0 * (KART_RADIUS + 18),
          vx: hx * sp + (K.vx ?? 0) * 0.30,
          vy: hy * sp + (K.vy ?? 0) * 0.30,
          t: 0,
          owner: "player",
        });
      }
    } else if (item === "rockfly") {
      const tgt = pickRockFlyTarget(K, this.opponents, this);
      if (tgt) {
        const sp = spawnRockFlyFromKart(K);
        this.rockFlies = this.rockFlies ?? [];
        this.rockFlies.push({
          x: sp.x,
          y: sp.y,
          s: sp.s,
          ang: sp.ang,
          t: 0,
          idxHint: K.trackIdx ?? 0,
          target: tgt,
          owner: "player",
        });
      } else {
        const sp = 520;
        const hx = Math.cos(K.heading);
        const hy = Math.sin(K.heading);
        this.rocks = this.rocks ?? [];
        this.rocks.push({
          x: K.x + hx * (KART_RADIUS + 18),
          y: K.y + hy * (KART_RADIUS + 18),
          vx: hx * sp + (K.vx ?? 0) * 0.32,
          vy: hy * sp + (K.vy ?? 0) * 0.32,
          t: 0,
          owner: "player",
        });
      }
    } else if (item === "shield") {
      K.shieldT = Math.max(K.shieldT ?? 0, SHIELD_DURATION_PLAYER);
    }

    // Consume equipped item and clear UI.
    this.equippedCharges = Math.max(0, (this.equippedCharges ?? 0) - 1);
    if ((this.equippedCharges ?? 0) <= 0) this.equippedItem = "";
    this.itemRoulette = null;
    this.updateRandomizerHud();
  }

  setModePractice() {
    this.mode = "practice";
    this.dateISO = "";
    this.ghostData = loadGhost("practice", "");
    if (!this.trackId) this.trackId = "meadow-oval";
  }

  setModeDaily() {
    this.mode = "daily";
    this.dateISO = todayISO();
    this.ghostData = null;
  }

  setModeTouge() {
    this.mode = "touge";
    this.dateISO = "";
    this.ghostData = null;
    this.trackId = this.trackId || "neo-touge";
  }

  setModeEndless() {
    this.mode = "endless";
    this.dateISO = "";
    this.ghostData = null;
    this.trackId = this.trackId || "neo-touge";
  }

  setModeGrandPrix() {
    this.mode = "grandprix";
    this.dateISO = "";
    this.gpTracks = [...TRACK_IDS];
    this.gpIndex = 0;
    this.gpTotalTime = 0;
    this.gpTotalShells = 0;
    this.gpSeriesPayout = 0;
    this._sessionShellsCountedGpPayout = false;
    this.gpPlayerPoints = 0;
    this.gpCpuPoints = [0, 0, 0];
    /** Keep CPU appearances consistent for the whole series. */
    this.gpCpuLooks = null;
    this.ghostData = null;
    this.trackId = this.gpTracks[this.gpIndex] ?? "meadow-oval";
    this.gpResults = [];
  }

  /**
   * Single-race test on a Grand Prix track (CPUs + full lap rules). Does not save leaderboard or session shells.
   * @param {string} trackId
   */
  setModeAdmin(trackId) {
    const id =
      typeof trackId === "string" && TRACK_IDS.includes(trackId)
        ? trackId
        : TRACK_IDS[0];
    this.mode = "admin";
    this.dateISO = "";
    this.ghostData = null;
    this.trackId = id;
  }

  requestRestartRace() {
    if (this.phase === "menu") return;
    if (this.phase === "finished") this.panelEnd?.classList.add("hidden");
    if (this.mode === "grandprix" && this.phase === "finished") {
      const nTr = this.gpTracks?.length ?? 5;
      if ((this.gpIndex ?? 0) < nTr - 1) {
        this.advanceGrandPrix();
        return;
      }
      /** Finished last GP race → full series restart from track 1 */
      this.setModeGrandPrix();
      this.softRestart();
      return;
    }
    this.softRestart();
  }

  /** Close results and return to the start menu (abandons an in-progress Grand Prix). */
  returnToMainMenu() {
    this.panelEnd?.classList?.add?.("hidden");
    document.body?.classList?.add?.("otter-ui-menu");
    document.body?.classList?.remove?.("otter-ui-garage");
    document.body?.classList?.add?.("otter-ui-playtab");
    this.panelStart?.classList?.add?.("hidden");
    this.phase = "menu";
    // Ensure mode-specific HUD widgets don't persist on the homepage.
    this.hudDriftCurEl?.classList?.add?.("hidden");
    this.hudLivesEl?.classList?.add?.("hidden");
    if (this.mode === "grandprix") {
      this.gpIndex = 0;
      this.gpTotalTime = 0;
      this.gpTotalShells = 0;
      this.gpResults = [];
      this.gpSeriesPayout = 0;
      this.gpPlayerPoints = 0;
      this.gpCpuPoints = [0, 0, 0];
      this.gpCpuLooks = null;
    }
    this.setModePractice();
    this.trackId = "meadow-oval";
    if (this.hudMode) this.hudMode.textContent = this.getHUDModeLabel();
    this.updateCountdownUI();
    this.updateHomeShellsUI();
  }

  softRestart() {
    document.body?.classList?.remove?.("otter-ui-menu");
    this.phase = "racing";
    this.resetRace();
    this.panelEnd?.classList?.add?.("hidden");
    this.panelStart?.classList?.add?.("hidden");
  }

  /** UI hooks set from main.js */
  setUIHooks({
    countdownEl,
    hudTime,
    hudLap,
    shellCount,
    bananaInv,
    boostInv,
    driftWrap,
    driftFill,
    driftMeterTrack,
    hudMode,
    hudRandomizer,
    hudRandomizerItem,
    hudPlace,
    hudDriftCur,
    hudDriftCurVal,
    hudLives,
    hudLivesVal,
    homeShellsTotal,
    mapSessionShells,
    btnClaim,
    panelEnd,
    panelStart,
    endTitle,
    endTime,
    endBestLap,
    endDriftTime,
    endShellsN,
    endFinishPlace,
    endDailyRank,
    lbList,
    lbLabel,
    lbSub,
  }) {
    this.countdownEl = countdownEl;
    this.hudTime = hudTime;
    this.hudLap = hudLap;
    this.shellCountEl = shellCount;
    this.bananaInvEl = bananaInv;
    this.boostInvEl = boostInv;
    this.driftWrap = driftWrap;
    this.driftFill = driftFill;
    this.driftMeterTrack = driftMeterTrack;
    this.hudMode = hudMode;
    this.hudRandomizerEl = hudRandomizer ?? null;
    this.hudRandomizerItemEl = hudRandomizerItem ?? null;
    if (this.hudRandomizerEl && !this._randomizerTapBound) {
      this.hudRandomizerEl.addEventListener(
        "pointerdown",
        (ev) => {
          if (ev.button !== undefined && ev.button !== 0) return;
          this.useAwardedItem();
          ev.preventDefault?.();
          ev.stopPropagation?.();
        },
        { passive: false },
      );
      this._randomizerTapBound = true;
    }
    this.hudPlaceEl = hudPlace ?? null;
    this.hudDriftCurEl = hudDriftCur ?? null;
    this.hudDriftCurValEl = hudDriftCurVal ?? null;
    this.hudLivesEl = hudLives ?? null;
    this.hudLivesValEl = hudLivesVal ?? null;
    this.homeShellsTotalEl = homeShellsTotal ?? null;
    this.mapSessionShellsEl = mapSessionShells ?? null;
    this.btnClaim = btnClaim ?? null;
    this.panelEnd = panelEnd;
    this.panelStart = panelStart;
    this.endTitle = endTitle;
    this.endTime = endTime;
    this.endBestLap = endBestLap;
    this.endDriftTime = endDriftTime ?? null;
    this.endShellsN = endShellsN;
    this.endFinishPlace = endFinishPlace ?? null;
    this.endDailyRank = endDailyRank;
    this.lbList = lbList;
    this.lbLabel = lbLabel;
    this.lbSub = lbSub ?? null;
  }

  updateHomeShellsUI() {
    const n = String(this.totalShellsSession ?? 0);
    if (this.homeShellsTotalEl) this.homeShellsTotalEl.textContent = n;
    if (this.mapSessionShellsEl) this.mapSessionShellsEl.textContent = n;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = this.canvas;
    const menu = document.body?.classList?.contains("otter-ui-menu");
    const vp = menu
      ? { ...getGameViewportSize(), visualViewport: null }
      : getRaceViewportSize();
    const w = vp.vw;
    const h = vp.vh;
    const vv = vp.visualViewport;

    if (vv && !isEmbedded()) {
      canvas.style.position = "fixed";
      canvas.style.inset = "auto";
      canvas.style.left = `${Math.round(vv.offsetLeft)}px`;
      canvas.style.top = `${Math.round(vv.offsetTop)}px`;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    } else {
      canvas.style.position = "fixed";
      canvas.style.inset = "0";
      canvas.style.left = "0";
      canvas.style.top = "0";
      canvas.style.right = "0";
      canvas.style.bottom = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w;
    this.viewH = h;
    applyHudViewportVars();
    invalidatePatternCaches();
  }

  resetRace() {
    /** Segment-based ribbon math only for GP-style races — keep Neon Snake / endless legacy feel. */
    setRibbonSegmentSurface(
      this.mode !== "touge" && this.mode !== "endless",
    );
    setTrack(this.trackId);
    /** Must match active track (constructor only ran once — was stuck on first layout) */
    this.finishLine = finishLineSegment();
    this.checkLine = checkpointLineSegment();
    const spawn = suggestSpawn();
    const grid = makeStartGrid(spawn, 4);
    const p0 = grid[0];
    const pLook = loadEffectiveLoadout();
    // Visual variety: grass or sand edge band on GP tracks (GP4 always grass → gray kerb).
    const isGpLava = gpStyleEffects(this) && this.trackId === "lava-serpent";
    this.edgeBandVariant = neonSnakeFieldKind(this)
      ? "neon"
      : isGpLava
          ? "molten"
          : Math.random() < 0.5
            ? "sand"
            : "grass";
    this.kart = {
      x: p0.x,
      y: p0.y,
      vx: 0,
      vy: 0,
      heading: p0.h,
      trackIdx: 0,
      driftGauge: 0,
      drifting: false,
      driftFlameT: 0,
      driftFlameStrength: 0,
      driftReleaseTier: 0,
      _smokeAcc: 0,
      _smokeSide: 1,
      _skidAcc: 0,
      _skidPrevLx: null,
      _skidPrevLy: null,
      _skidPrevRx: null,
      _skidPrevRy: null,
      steerSmoothed: 0,
      spinT: 0,
      shells: 0,
      bananasInv: 0,
      boostsInv: 0,
      rocksInv: 0,
      shieldT: 0,
      bestLapThisSession: Infinity,
      lastLapElapsed: null,
      kartId: pLook.kart,
      hatId: pLook.hat,
      eyeId: pLook.eye,
      hull: pLook.hull,
      fur: pLook.fur,
      odometer: 0,
      boostT: 0,
      boostCapMul: 0,
      boostFlameTier: 0,
      finishedRaceT: NaN,
    };
    attachKartPhys(this.kart);
    // Snap grid positions back onto pavement so CPUs don't spawn into walls/grass.
    const snapToRoad = (pt) => {
      const tr = getTrack();
      const hint = tr.finishIdx ?? 0;
      let x = pt.x;
      let y = pt.y;
      for (let k = 0; k < 3; k++) {
        const srf = surfaceAt(x, y, hint);
        if (srf.surface === "pavement") break;
        // Use the same barrier resolver used during racing to push inside the road.
        const col = resolveRoadBarrierCollision(x, y, 0, 0, srf.idx ?? hint, this);
        x = col.x;
        y = col.y;
      }
      pt.x = x;
      pt.y = y;
      return pt;
    };
    // Only for modes with opponents (grand prix + practice races).
    for (let i = 0; i < grid.length; i++) snapToRoad(grid[i]);
    this.boostPads = makeBoostPads();
    this.pickups = makePickups();
    // Mystery boxes: GP / practice / admin — not drift, touge, or endless.
    if (
      TRACK_IDS.includes(this.trackId) &&
      this.mode !== "touge" &&
      this.mode !== "endless" &&
      this.mode !== "daily"
    ) {
      const tr0 = getTrack();
      const L = tr0.length || 1;
      // Spawn in 3-across groups; `n` is groups count.
      const n = clampInt(L / 1400, 7, 12);
      this.mysteryBoxes = makeMysteryBoxesForTrack(tr0, n);
    } else {
      this.mysteryBoxes = [];
    }
    this.itemRoulette = null;
    this.equippedItem = "";
    this.equippedCharges = 0;
    this.rocks = [];
    this.rockFlies = [];
    if (this.mode === "touge") {
      this.kart.bananasInv = 0;
      this.pickups = makeTougeShellPickups(28);
    }
    if (this.mode === "endless") {
      this.kart.bananasInv = 0;
      this.kart.boostsInv = 0;
      this.boostPads = [];
      this.pickups = makeTougeShellPickups(34).map((p) => ({ ...p, respawnT: 0 }));
      // Ensure initial endless pickups start as normal shells (golden only starts at 5000m).
      this.pickups = this.pickups.map((p) => ({ ...p, type: "shell" }));
      this.lives = 3;
      this.endlessLeft = 300; // 5 minutes max
      this.endlessNextBananaD = 90;
      this.endlessNextBananaT = 1.0;
      this.endlessLastBananaOdo = 0;
      this.endlessHazardsArmed = false;
      this.endlessHazardsArmedT = 0;
      this.endlessLastU = NaN;
      this.endlessWraps = 0;
      this.endlessBaseU = NaN;
      this.endlessMaxU = NaN;
      this.endlessEarnedU = NaN;
      this.endlessPrevX = NaN;
      this.endlessPrevY = NaN;
      this.endlessScoreIdx = -1;
      this.endlessBaseS = NaN;
      this.endlessMaxS = NaN;
      this.endlessDebug = false;
      this.endlessDist = 0;
      this.endlessDistShellTiersPaid = 0;
      this.endlessDistShellBonus = 0;
      this.endlessHardness = 0;
      this.wrapCooldown = 1.25;
      const pts = getTrack().pts;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      this.wrapMinX = minX;
      this.wrapMaxX = maxX;
      this.wrapW = maxX - minX;
    } else {
      this.lives = 0;
      this.endlessLeft = 0;
      this.endlessNextBananaD = 0;
      this.endlessNextBananaT = 0;
      this.endlessLastBananaOdo = 0;
      this.endlessHazardsArmed = false;
      this.endlessHazardsArmedT = 0;
      this.endlessLastU = NaN;
      this.endlessWraps = 0;
      this.endlessBaseU = NaN;
      this.endlessMaxU = NaN;
      this.endlessEarnedU = NaN;
      this.endlessPrevX = NaN;
      this.endlessPrevY = NaN;
      this.endlessScoreIdx = -1;
      this.endlessBaseS = NaN;
      this.endlessMaxS = NaN;
      this.endlessDebug = false;
      this.endlessDist = 0;
      this.endlessDistShellTiersPaid = 0;
      this.endlessDistShellBonus = 0;
      this.endlessHardness = 0;
      this.wrapMinX = 0;
      this.wrapMaxX = 0;
      this.wrapW = 0;
    }

    // Grand Prix lava track: lava fireballs that arc up and land on the road.
    if (isGpLava) {
      this.lavaFireballs = [];
      this.lavaFireballSpawnCd = 0;
      this.lavaFireballMinS = 260; // how far ahead to target
    } else {
      this.lavaFireballs = [];
      this.lavaFireballSpawnCd = 0;
    }
    if (this.mode === "daily") {
      this.pickups = this.pickups.map((p, i) => ({
        ...p,
        id: `ds${i}`,
        type: Math.random() < 0.015 ? "goldenShell" : "shell",
        taken: false,
        respawnT: 0,
      }));
    }
    this.fireballs = [];
    this.fireballsActive = false;
    this.bananas = [];
    this._sessionShellsCountedThisRace = false;
    this.raceTime = 0;
    this.lapsFinished = 0;
    this.lapStartRaceT = 0;
    this.lapCooldown = 1.45;
    // Lap gate: must pass checkpoint each lap before finish counts.
    this.lapCheckpointPassed = false;
    this.prevKx = p0.x;
    this.prevKy = p0.y;
    /** Avoid camera chasing from origin — big offset was causing visible hitch */
    this.cam.x = p0.x;
    this.cam.y = p0.y;
    this.ghostSamplesThisLap = [];
    this.sessionBestLapTime = Infinity;
    this.sessionBestGhost = null;
    this.raceSplits = [];

    /** Ghost replay disabled — avoid building unused multi-lap sample arrays. */
    this.ghostRun = null;

    /** Real opponents (AI) — always continuous, no resets at finish. */
    if (this.mode === "daily" || this.mode === "touge" || this.mode === "endless") {
      this.opponents = [];
    } else if (this.mode === "grandprix") {
      if (!this.gpCpuLooks) this.gpCpuLooks = pickCpuAppearances(pLook.kart, 3);
      // In Grand Prix, keep the same CPU "roster" for the whole series.
      // (Reusing objects keeps their personality too — not just their cosmetics.)
      if (!this.opponents?.length) this.opponents = makeOpponentsFromLooks(this.gpCpuLooks);
      // Ensure cosmetics match stored looks even if something mutated them.
      for (let i = 0; i < 3; i++) {
        const o = this.opponents[i];
        const lk = this.gpCpuLooks[i];
        if (!o || !lk) continue;
        o.kartId = lk.kart;
        o.hatId = lk.hat;
        o.eyeId = lk.eye;
        o.hull = lk.hull;
        o.fur = lk.fur;
        attachKartPhys(o);
      }
    } else {
      this.opponents = makeOpponents(3, pLook.kart);
    }
    for (let i = 0; i < this.opponents.length; i++) {
      const g = grid[i + 1];
      if (!g) break;
      const o = this.opponents[i];
      o.x = g.x;
      o.y = g.y;
      o.vx = 0;
      o.vy = 0;
      // Align CPU heading to the actual track tangent at its spawn point
      // so it doesn't immediately drive into a wall.
      const srfO = surfaceAt(o.x, o.y, 0);
      o.trackIdx = srfO.idx;
      const trO = getTrack();
      const pO = trO.pts[o.trackIdx] ?? trO.pts[0];
      o.heading = Math.atan2(pO.ty ?? 0, pO.tx ?? 1);
      o.spinT = 0;
      o.steerSmoothed = 0;
      o.lapsFinished = 0;
      o.lapStartRaceT = 0;
      o.lapCooldown = 1.45;
      o.lapCheckpointPassed = false;
      o.prevOx = o.x;
      o.prevOy = o.y;
      o.odometer = 0;
      o.boostT = 0;
      o.boostCapMul = 0;
      o.boostFlameTier = 0;
      o.finishedRaceT = NaN;
      o.driftFlameT = 0;
      o.driftFlameStrength = 0;
      o.driftReleaseTier = 0;
      o._smokeAcc = 0;
      o._smokeSide = 1;
      o._skidAcc = 0;
      o._skidPrevLx = null;
      o._skidPrevLy = null;
      o._skidPrevRx = null;
      o._skidPrevRy = null;
      // Reset dynamic line so they don't start by aiming at a wall.
      o.lineLat = 0;
      o.lineLatTarget = 0;
      o.lineT = 0;
      o.bananasInv = 0;
      o.boostsInv = 0;
      o.rocksInv = 0;
      o.shieldT = 0;
      o.boostT = 0;
      o.nextBananaT = 2.5 + Math.random() * 2.5;
      o.nextBoostT = 2.5 + Math.random() * 2.5;
      o.nextRockT = 3 + Math.random() * 3;
      o.nextMysteryT = 0;
      o.mysteryRollT = 0;
      o.mysteryPendingItem = "";
      attachKartPhys(o);
    }

    this.kart.bananasInv = 0;
    this.kart.boostsInv = 0;
    this.kart.rocksInv = 0;

    this.smoke.length = 0;
    this.skids.length = 0;

    this.longestDrift = 0;
    this._driftCurD = 0;
    this._driftPrevX = p0.x;
    this._driftPrevY = p0.y;
    this._driftScoreIdx = -1;
    this._driftMaxS = NaN;
    this._driftMaxU = NaN;
    this.longestDriftTime = 0;
    this._driftCurT = 0;
    this.endlessLongestDrift = 0;
    this.endlessDriftCurD = 0;
    this.endlessBananaHits = 0;
    this.dailyLeft = this.mode === "daily" ? 120 : 0;

    /** Countdown gate */
    this.countdownT = 3.25;
    this.started = false;
    this.updateCountdownUI();
    this.updateRaceHudPanels();
  }

  startFromMenu(mode) {
    this.bindInput();
    if (mode === "daily") this.setModeDaily();
    else if (mode === "touge") this.setModeTouge();
    else if (mode === "endless") this.setModeEndless();
    else if (mode === "grandprix") this.setModeGrandPrix();
    else this.setModePractice();
    if (this.hudMode) {
      this.hudMode.textContent = this.getHUDModeLabel();
    }
    this.softRestart();
  }

  getHUDModeLabel() {
    let label = "Practice";
    if (this.mode === "daily") label = "Drift challenge";
    else if (this.mode === "touge") label = "Neon Snake";
    else if (this.mode === "endless") label = "Endless Neon Snake";
    else if (this.mode === "admin") label = `Admin · ${this.trackId ?? ""}`;
    else if (this.mode === "grandprix")
      label = `Grand Prix · ${this.gpIndex + 1}/${this.gpTracks.length}`;
    if (isDemoSessionActive()) label = `${label} · Demo`;
    return label;
  }

  advanceGrandPrix() {
    this.gpIndex = (this.gpIndex ?? 0) + 1;
    this.trackId = this.gpTracks[this.gpIndex] ?? "meadow-oval";
    if (this.hudMode) this.hudMode.textContent = this.getHUDModeLabel();
    this.softRestart();
  }

  endRace(totalTime, bestLap) {
    this.phase = "finished";
    const pickupShells = this.kart.shells;
    const shells = pickupShells;
    if (this.mode !== "admin" && !this._sessionShellsCountedThisRace) {
      this.totalShellsSession = (this.totalShellsSession ?? 0) + (pickupShells ?? 0);
      this._sessionShellsCountedThisRace = true;
      this.updateHomeShellsUI?.();
    }
    const lbTime = Number(totalTime.toFixed(3));
    const nRacers = 1 + (this.opponents?.length ?? 0);
    const finishPlace = computeRaceFinishPlaceByTime(this);
    const finishExtra = { finishPlace, nRacers };

    if (this.mode === "grandprix") {
      const lastGp =
        (this.gpIndex ?? 0) === (this.gpTracks?.length ?? 5) - 1;
      this.gpTotalTime = (this.gpTotalTime ?? 0) + totalTime;
      this.gpTotalShells = (this.gpTotalShells ?? 0) + pickupShells;

       /** Series standings: accumulate points for you + each CPU this race. */
      const rows = racersSortedByProgress(this);
      // rows[0] is winner, etc.
      for (let i = 0; i < rows.length; i++) {
        const place = i + 1;
        const pts = gpPointsForPlace(place);
        if (rows[i]?.player) {
          this.gpPlayerPoints = (this.gpPlayerPoints ?? 0) + pts;
        } else {
          // Opponents are stable in-array; map to index for points.
          const idxCpu = this.opponents.findIndex((o) => o === rows[i].kart);
          if (idxCpu >= 0) {
            this.gpCpuPoints = this.gpCpuPoints ?? [0, 0, 0];
            this.gpCpuPoints[idxCpu] = (this.gpCpuPoints[idxCpu] ?? 0) + pts;
          }
        }
      }

      let seriesPlace = NaN;
      if (lastGp) {
        const pts = [
          { who: "you", points: this.gpPlayerPoints ?? 0 },
          ...this.opponents.map((o, i) => ({
            who: `cpu${i}`,
            points: (this.gpCpuPoints?.[i] ?? 0),
          })),
        ];
        pts.sort((a, b) => {
          const dp = (b.points ?? 0) - (a.points ?? 0);
          if (dp !== 0) return dp;
          // Tiebreak: lower cumulative time wins.
          if (a.who === "you" && b.who !== "you") return -1;
          if (b.who === "you" && a.who !== "you") return 1;
          return 0;
        });
        seriesPlace = pts.findIndex((r) => r.who === "you") + 1;
        const payout = gpSeriesShellPayout(seriesPlace);
        this.gpSeriesPayout = payout;
        this.gpTotalShells = (this.gpTotalShells ?? 0) + payout;
        if (!this._sessionShellsCountedGpPayout && payout > 0) {
          this.totalShellsSession = (this.totalShellsSession ?? 0) + payout;
          this._sessionShellsCountedGpPayout = true;
          this.updateHomeShellsUI?.();
        }
      }
      if (lastGp) {
      }
      this.gpResults = this.gpResults ?? [];
      this.gpResults.push({
        raceNo: (this.gpIndex ?? 0) + 1,
        trackId: this.trackId,
        time: totalTime,
        bestLap,
        place: finishPlace,
        shells: pickupShells,
        pointsEarned: gpPointsForPlace(finishPlace),
        gpPlayerPoints: this.gpPlayerPoints ?? 0,
      });
      const newRainbowUnlock = Boolean(lastGp && tryUnlockRainbowKart());
      this.fillEndScreen(totalTime, bestLap, shells, lbTime, {
        ...finishExtra,
        newRainbowUnlock,
        gpPlace: Number.isFinite(seriesPlace) ? seriesPlace : finishPlace,
        gpSeriesComplete: lastGp,
      });
      return;
    }
    if (this.mode !== "endless" && this.mode !== "admin") {
      const gh = this.sessionBestGhost;
      commitRun({
        mode: this.mode,
        dateISO: this.dateISO || "",
        lapRecord:
          gh && gh.samples?.length
            ? { lapTime: gh.lapTime, samples: gh.samples }
            : { lapTime: bestLap || totalTime / TOTAL_LAPS, samples: [] },
        totalTime,
        shells,
        longestDrift: this.mode === "daily" ? (this.longestDrift ?? 0) : 0,
        longestDriftTime:
          this.mode === "daily" ? (this.longestDriftTime ?? 0) : 0,
      });
    }
    this.fillEndScreen(totalTime, bestLap, shells, lbTime, finishExtra);
  }

  /** @param {{ finishPlace?: number, nRacers?: number, newRainbowUnlock?: boolean, gpPlace?: number, gpSeriesComplete?: boolean }} [extra] */
  fillEndScreen(totalTime, bestLap, shells, lbTime, extra) {
    extra = extra || {};
    let fp = extra.finishPlace;
    const nRacers =
      extra.nRacers ?? 1 + (this.opponents?.length ?? 0);
    if (!Number.isFinite(fp) || fp < 1) {
      fp = computeRaceFinishPlace(this);
    }
    const finishLineStr =
      Number.isFinite(fp) &&
      fp >= 1 &&
      Number.isFinite(nRacers) &&
      nRacers >= 1
        ? `${ordinalPlace(Math.min(fp, nRacers))} of ${nRacers}`
        : "";
    const placeDd =
      this.endFinishPlace ??
      (typeof document !== "undefined"
        ? document.getElementById("end-finish-place")
        : null);
    if (placeDd) placeDd.textContent = finishLineStr || "—";
    this.panelEnd?.classList.remove("hidden");
    if (this.mode === "grandprix") {
      this.panelEnd?.classList?.add?.("panel--gp");
      const n = this.gpTracks?.length ?? 5;
      const i = (this.gpIndex ?? 0) + 1;
      const base =
        extra.gpSeriesComplete
          ? `Grand Prix · Series complete (${n} races)`
          : `Grand Prix · Race ${i} / ${n}`;
      this.endTitle.textContent =
        finishLineStr ? `${base} — ${finishLineStr}` : base;
      if (this.endTime) this.endTime.textContent = fmtRaceTime(totalTime);
      if (this.endBestLap)
        this.endBestLap.textContent = fmtRaceTime(bestLap);
      if (this.endShellsN) this.endShellsN.textContent = String(shells);
      if (this.lbLabel) this.lbLabel.textContent = "GP race log";
      if (this.lbSub) this.lbSub.textContent = "";
      if (this.endDailyRank) {
        let msg = `Grand Prix totals · cumulative ${fmtRaceTime(this.gpTotalTime ?? 0)} · 🐚 ${this.gpTotalShells ?? 0}`;
        if (extra.gpSeriesComplete) {
          const payout = this.gpSeriesPayout ?? 0;
          if (payout > 0)
            msg += ` (includes ${payout} payout for ${ordinalPlace(extra.gpPlace ?? NaN)})`;
          msg += ` · points ${this.gpPlayerPoints ?? 0}`;
        }
        if (extra.newRainbowUnlock)
          msg +=
            " · Rainbow kart unlocked — choose it on the Character tab.";
        this.endDailyRank.textContent = msg;
        this.endDailyRank.classList.remove("hidden");
        if (
          extra.newRainbowUnlock &&
          typeof window !== "undefined"
        ) {
          window.dispatchEvent(new CustomEvent("otterkart-loadout-change"));
        }
      }
      const btn = document.getElementById("btn-restart");
      if (btn) {
        btn.textContent =
          i < n ? "Next race" : "Restart Grand Prix";
      }
      if (this.lbList) {
        this.lbList.innerHTML = "";
        /** Series standings snapshot (points) */
        const ptsRows = [
          { tag: "You", points: this.gpPlayerPoints ?? 0 },
          ...this.opponents.map((o, idx) => ({
            tag: o.kartId || `CPU${idx + 1}`,
            points: this.gpCpuPoints?.[idx] ?? 0,
          })),
        ];
        ptsRows.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        const yourRank = ptsRows.findIndex((r) => r.tag === "You") + 1;
        if (this.lbSub) {
          this.lbSub.textContent = `Series standings: ${ptsRows
            .map((r) => `${r.tag} ${r.points} pts`)
            .join(" · ")}${yourRank > 0 ? ` · you are ${ordinalPlace(yourRank)}` : ""}`;
        }

        for (const r of this.gpResults ?? []) {
          const li = document.createElement("li");
          const pts = r.pointsEarned ?? 0;
          const cum = r.gpPlayerPoints ?? this.gpPlayerPoints ?? 0;
          li.textContent = `Race ${r.raceNo} · ${fmtRaceTime(r.time)} · best lap ${fmtRaceTime(r.bestLap)} · ${ordinalPlace(r.place)} · +${pts} pts (total ${cum}) · 🐚 ${r.shells ?? 0}`;
          this.lbList.appendChild(li);
        }
        if (!(this.gpResults?.length)) {
          const li = document.createElement("li");
          li.textContent = "No results yet.";
          this.lbList.appendChild(li);
        }
      }
      return;
    }
    this.panelEnd?.classList?.remove?.("panel--gp");
    {
      const btn = document.getElementById("btn-restart");
      if (btn) btn.textContent = "Restart";
    }
    this.endTitle.textContent = finishLineStr
      ? `Race complete · ${finishLineStr}`
      : "Race complete";
    if (this.endTime) this.endTime.textContent = fmtRaceTime(totalTime);
    if (this.endBestLap)
      this.endBestLap.textContent = fmtRaceTime(bestLap);
    if (this.endShellsN) this.endShellsN.textContent = String(shells);

    const board =
      this.mode === "admin"
        ? []
        : loadLeaderboard(
            this.mode,
            this.mode === "daily" ? this.dateISO : "",
          );
    if (this.mode === "daily") {
      const lab = document.getElementById("end-bestlap-label");
      if (lab) lab.textContent = "Longest drift";
      if (this.endBestLap)
        this.endBestLap.textContent = fmtShortDistanceMetersWithUS(this.longestDrift ?? 0);
      const dLab = document.getElementById("end-drift-time-label");
      if (dLab) dLab.textContent = "Longest drift time";
      if (this.endDriftTime)
        this.endDriftTime.textContent = fmtShortSeconds(this.longestDriftTime ?? 0);
      const idx =
        board.findIndex(
          (r) =>
            (r.shells ?? 0) === shells &&
            Math.abs((r.longestDrift ?? 0) - (this.longestDrift ?? 0)) < 0.002,
        ) + 1;
      const rankMsg =
        idx > 0 ? `Daily rank on today’s leaderboard: ${idx}` : "";
      if (rankMsg && this.endDailyRank) {
        this.endDailyRank.textContent = rankMsg;
        this.endDailyRank.classList.remove("hidden");
      } else if (this.endDailyRank) this.endDailyRank.classList.add("hidden");
    } else if (this.mode === "endless") {
      const lab = document.getElementById("end-bestlap-label");
      if (lab) lab.textContent = "Distance";
      if (this.endBestLap)
        this.endBestLap.textContent = fmtShortDistanceMetersWithUS(this.endlessDist ?? 0);
      const dLab = document.getElementById("end-drift-time-label");
      if (dLab) dLab.textContent = "Longest drift";
      if (this.endDriftTime)
        this.endDriftTime.textContent = fmtShortDistanceMetersWithUS(this.endlessLongestDrift ?? 0);
      const distBonus = this.endlessDistShellBonus ?? endlessDistanceShellBonus(this.endlessDist ?? 0);
      const tiers = endlessDistanceShellTiers(this.endlessDist ?? 0);
      const pickedUp = Math.max(0, (shells ?? 0) - distBonus);
      if (this.endDailyRank) {
        this.endDailyRank.textContent =
          tiers > 0
            ? `Distance bonus: +${distBonus} shells (${ENDLESS_SHELL_PER_STEP} per ${ENDLESS_SHELL_MI_STEP} mi · ${tiers}×) · picked up ${pickedUp}`
            : `Distance bonus: +0 shells — reach ${ENDLESS_SHELL_MI_STEP} mi for +${ENDLESS_SHELL_PER_STEP}`;
        this.endDailyRank.classList.remove("hidden");
      }
    } else {
      const lab = document.getElementById("end-bestlap-label");
      if (lab) lab.textContent = "Best lap";
      if (this.endBestLap) this.endBestLap.textContent = fmtRaceTime(bestLap);
      const dLab = document.getElementById("end-drift-time-label");
      if (dLab) dLab.textContent = "—";
      if (this.endDriftTime) this.endDriftTime.textContent = "—";
      if (this.endDailyRank) this.endDailyRank.classList.add("hidden");
    }

    if (this.lbLabel) {
      this.lbLabel.textContent =
        this.mode === "daily"
          ? "Drift challenge"
          : this.mode === "endless"
            ? "Endless Neon Snake"
            : this.mode === "admin"
              ? "Admin"
              : "Practice";
    }
    if (this.lbSub)
      this.lbSub.textContent =
        this.mode === "admin"
          ? "Test run — not saved to leaderboard or session shells."
          : "";
    if (this.lbList) {
      this.lbList.innerHTML = "";
      board.slice(0, 6).forEach((r, i) => {
        const li = document.createElement("li");
        if (this.mode === "daily") {
          li.textContent = `${i + 1}. 🐚 ${r.shells ?? 0} · longest drift ${fmtShortDistanceMetersWithUS(r.longestDrift ?? 0)} · ${fmtShortSeconds(r.longestDriftTime ?? 0)}`;
        } else {
          li.textContent = `${i + 1}. ${fmtRaceTime(r.time)} · best lap ${fmtRaceTime(
            r.bestLap ?? r.time / TOTAL_LAPS,
          )} · 🐚 ${r.shells ?? 0}`;
        }
        this.lbList.appendChild(li);
      });
      if (!board.length) {
        const li = document.createElement("li");
        li.textContent =
          this.mode === "admin"
            ? "Use Admin on the map to try another GP track."
            : "No runs yet — one more try!";
        this.lbList.appendChild(li);
      }
    }
  }

  loop(ts) {
    requestAnimationFrame(this.loop);
    if (!this.lastT) this.lastT = ts;
    let dt = (ts - this.lastT) / 1000;
    this.lastT = ts;
    dt = clamp(dt, 0, 0.05);
    this.acc += dt;
    while (this.acc >= this.frameDt) {
      this.fixedStep(this.frameDt);
      this.acc -= this.frameDt;
    }
    pollGamepadActions(this);
    if (this.phase === "menu") {
      this.drawMenuBackdrop();
      return;
    }
    this.draw(this.phase === "finished");
  }

  fixedStep(dt) {
    if (this.phase !== "racing") return;

    /** Countdown: freeze everything until GO */
    if (!this.started) {
      this.countdownT -= dt;
      if (this.countdownT <= 0) {
        this.started = true;
        this.countdownT = 0;
      }
      this.updateCountdownUI();
      this.updateRaceHudPanels();
      if (!this.started) {
        this.stepCameraFollow(dt);
        return;
      }
    }

    const insKeys = inputFromKeys(this.keys);
    const insPad = readGamepadInput(this);
    const insTouch = readTouchInput(this);
    const ins = {
      gas: Boolean(insKeys.gas || insPad.gas || insTouch.gas),
      brake: Boolean(insKeys.brake || insPad.brake || insTouch.brake),
      steer: clamp(
        (insKeys.steer ?? 0) + (insPad.steer ?? 0) + (insTouch.steer ?? 0),
        -1,
        1,
      ),
      drift: Boolean(insKeys.drift || insPad.drift || insTouch.drift),
    };
    const Kc = this.kart;
    const sk = 1 - Math.exp(-PHYS.steerResponse * dt);
    Kc.steerSmoothed += (ins.steer - Kc.steerSmoothed) * sk;
    this.applySpin(dt);
    let drive = {
      ...ins,
      steer: clamp(Kc.steerSmoothed, -1, 1),
    };
    if (Kc.spinT > 0)
      drive = {
        gas: false,
        brake: false,
        steer: clamp(Kc.steerSmoothed * 0.22, -0.85, 0.85),
        drift: false,
      };
    integrateKart(this.kart, drive, dt, this);
    this.stepFx(dt);
    this.resolveCollisionsPickupBanana(dt);

    // Mystery box respawn timers (15s).
    if (this.mysteryBoxes?.length) {
      for (const b of this.mysteryBoxes) {
        if (!b.taken) continue;
        b.respawnT = Math.max(0, (b.respawnT ?? 0) - dt);
        if ((b.respawnT ?? 0) <= 0) {
          b.taken = false;
          b.bob = Math.random() * Math.PI * 2;
        }
      }
    }

    // Shield timer (player + CPUs)
    if ((this.kart.shieldT ?? 0) > 0) this.kart.shieldT = Math.max(0, this.kart.shieldT - dt);
    for (const o of this.opponents ?? []) {
      if (!o) continue;
      if ((o.shieldT ?? 0) > 0) o.shieldT = Math.max(0, o.shieldT - dt);
    }

    // Mystery box roulette (top-center UI)
    if (this.itemRoulette && !this.itemRoulette.done) {
      this.itemRoulette.tLeft = Math.max(0, (this.itemRoulette.tLeft ?? 0) - dt);
      this.itemRoulette.tick = (this.itemRoulette.tick ?? 0) + dt;
      if ((this.itemRoulette.tick ?? 0) >= 0.08) {
        this.itemRoulette.tick = 0;
        const pick =
          ROULETTE_HUD_ITEMS[
            Math.floor(Math.random() * ROULETTE_HUD_ITEMS.length)
          ];
        this.itemRoulette.show = pick.label;
        this.itemRoulette.spinKey = pick.key;
      }
      if ((this.itemRoulette.tLeft ?? 0) <= 0) awardRouletteItem(this);
    }

    // Rocks: simple forward projectiles that spin karts on hit.
    if (this.rocks?.length) {
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const r = this.rocks[i];
        const px0 = r.x;
        const py0 = r.y;
        r.t += dt;
        r.x += (r.vx ?? 0) * dt;
        r.y += (r.vy ?? 0) * dt;

        // Bounce off outer boundary walls.
        const hit = surfaceAt(r.x, r.y, 0);
        if (hit.surface === "wall") {
          const nx = hit.nx ?? 0;
          const ny = hit.ny ?? 0;
          const vn = (r.vx ?? 0) * nx + (r.vy ?? 0) * ny;
          if (vn > 0) {
            r.vx = (r.vx ?? 0) - 2 * vn * nx;
            r.vy = (r.vy ?? 0) - 2 * vn * ny;
            r.vx *= 0.82;
            r.vy *= 0.82;
            r.x -= nx * 10;
            r.y -= ny * 10;
            r.bounces = (r.bounces ?? 0) + 1;
            if ((r.bounces ?? 0) > 6) {
              this.rocks.splice(i, 1);
              continue;
            }
          }
        }
        // Cull quickly
        if (r.t > 2.2) {
          this.rocks.splice(i, 1);
          continue;
        }
        const hitKart = (k) =>
          segHitsCircle(px0, py0, r.x, r.y, k.x ?? 0, k.y ?? 0, KART_RADIUS + 12);
        // Hit player (skip own shot)
        if (
          r.owner !== "player" &&
          (this.kart.shieldT ?? 0) <= 0 &&
          hitKart(this.kart)
        ) {
          applyItemSpinoutHit(this.kart);
          this.rocks.splice(i, 1);
          continue;
        }
        // Hit opponents (skip the CPU that fired it)
        for (const o of this.opponents ?? []) {
          if (!o) continue;
          if (r.owner === "cpu" && r.ownerId === o.id) continue;
          if ((o.shieldT ?? 0) > 0) continue;
          if (hitKart(o)) {
            applyItemSpinoutHit(o);
            this.rocks.splice(i, 1);
            break;
          }
        }
      }
    }

    // RockFly: homing along track centerline toward target's live arc position.
    if (this.rockFlies?.length) {
      const flySp = 440;
      for (let i = this.rockFlies.length - 1; i >= 0; i--) {
        const rf = this.rockFlies[i];
        const px0 = rf.x;
        const py0 = rf.y;
        rf.t = (rf.t ?? 0) + dt;
        let tgt = rf.target;
        if (!rockFlyTargetOk(this, tgt)) {
          tgt = pickRockFlyTarget(this.kart, this.opponents, this);
          if (tgt) rf.target = tgt;
          else {
            this.rockFlies.splice(i, 1);
            continue;
          }
        }
        if (!getTrack().pts?.length) {
          this.rockFlies.splice(i, 1);
          continue;
        }

        if (!advanceRockFlyAlongTrack(rf, dt, flySp, this)) {
          this.rockFlies.splice(i, 1);
          continue;
        }

        if (rf.t > 4.2) {
          this.rockFlies.splice(i, 1);
          continue;
        }

        if (rockFlyHitsKart(px0, py0, rf.x, rf.y, tgt.x ?? 0, tgt.y ?? 0)) {
          applyItemSpinoutHit(tgt);
          this.rockFlies.splice(i, 1);
        }
      }
    }

    resolveBananaCollisions(this, dt);
    if (this.phase === "finished") return;

    this.raceTime += dt;
    if (this.mode !== "daily" && this.mode !== "touge" && this.mode !== "endless") {
      stepOpponents(this.opponents, dt, this);
      resolveKartCollisions(this.kart, this.opponents);
    }

    accumulateForwardOdometer(this.kart, dt);
    for (const o of this.opponents) accumulateForwardOdometer(o, dt);

    const K = this.kart;

    // Grand Prix lava track: spawn lava fireballs that arc up from lava and land on the track.
    if (gpStyleEffects(this) && this.trackId === "lava-serpent") {
      const tr = getTrack();
      const pts = tr.pts;
      const L = tr.length || 1;
      const road = tr.widths.road ?? 80;
      this.lavaFireballSpawnCd = Math.max(0, (this.lavaFireballSpawnCd ?? 0) - dt);

      // Keep count bounded so it doesn't overwhelm the track.
      const maxBalls = 4;
      if ((this.lavaFireballs?.length ?? 0) > maxBalls) {
        this.lavaFireballs.splice(0, (this.lavaFireballs.length ?? 0) - maxBalls);
      }

      // Spawn cadence: keep it lighter + more random so CPUs can't "optimize" around it.
      // (Also just feels fairer.)
      const t = this.raceTime ?? 0;
      const cadence = clamp(2.6 - t * 0.006, 1.6, 2.6);

      if ((this.lavaFireballSpawnCd ?? 0) <= 0) {
        // Dispersed + "pops near you": pick a random racer, then land ahead of them.
        // Also enforce minimum arc-length spacing from existing fireballs to avoid clustering.
        const racers = [this.kart, ...(this.opponents ?? [])].filter(Boolean);
        const r = racers.length ? racers[Math.floor(Math.random() * racers.length)] : this.kart;
        const baseIdx = clamp(Math.floor(r.trackIdx ?? 0), 0, pts.length - 1);
        const baseS = pts[baseIdx]?.s ?? 0;
        const ahead = 240 + Math.random() * 520; // when driver is getting close
        let bestIdx = baseIdx;
        let bestP = pts[baseIdx] ?? pts[0];
        let bestS = ((baseS + ahead) % L + L) % L;

        const minSep = 420; // minimum separation between landed fireballs along track
        const landed = (this.lavaFireballs ?? []).filter((c) => c?.landed && Number.isFinite(c?.s));
        for (let tries = 0; tries < 12; tries++) {
          const sTry = ((baseS + ahead + (Math.random() - 0.5) * 520) % L + L) % L;
          const cand = sampleIdxForS(tr, sTry, baseIdx);
          const p0 = pts[cand] ?? pts[0];
          const p1 = pts[(cand + 18) % pts.length] ?? p0;
          const curv = Math.abs(
            wrapAngleRad(
              Math.atan2(p1.ty ?? 0, p1.tx ?? 1) - Math.atan2(p0.ty ?? 0, p0.tx ?? 1),
            ),
          );
          if (curv > 0.78) continue;
          let ok = true;
          for (const c of landed) {
            const ds = Math.abs(((c.s ?? 0) - sTry + L) % L);
            const d2 = Math.min(ds, L - ds);
            if (d2 < minSep) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          bestIdx = cand;
          bestP = p0;
          bestS = sTry;
          break;
        }

        const idx = bestIdx;
        const p = bestP;
        const landS = bestS;
        const latTarget = (Math.random() * 2 - 1) * road * 0.55;

        // Spawn "from lava": off-road, then arc onto the road.
        const side = Math.random() < 0.5 ? -1 : 1;
        const latFrom = side * (road + 110 + Math.random() * 120);
        const x0 = p.x + p.nx * latFrom;
        const y0 = p.y + p.ny * latFrom;
        const x1 = p.x + p.nx * latTarget;
        const y1 = p.y + p.ny * latTarget;

        const flight = 0.85 + Math.random() * 0.75;
        const peak = (200 + Math.random() * 110) / 1.5;

        this.lavaFireballs = this.lavaFireballs ?? [];
        this.lavaFireballs.push({
          x: x0,
          y: y0,
          xFrom: x0,
          yFrom: y0,
          xTo: x1,
          yTo: y1,
          s: landS,
          t: 0,
          flight,
          peak,
          z: 0,
          r: GP5_LAVA_FIREBALL_R,
          ang: Math.atan2(p.ty ?? 0, p.tx ?? 1),
          upright: true,
          landed: false,
          life: 7.5 + Math.random() * 4.0,
          cd: 0,
        });

        // Next spawn
        const jitter = 0.25 + Math.random() * 0.35;
        // Occasionally skip a beat for breathing room.
        const skip = Math.random() < 0.22 ? 1.35 : 1;
        this.lavaFireballSpawnCd = cadence * skip * (1 + (Math.random() - 0.5) * jitter);
      }

      // Step + collisions
      if (this.lavaFireballs?.length) {
        for (let i = this.lavaFireballs.length - 1; i >= 0; i--) {
          const c = this.lavaFireballs[i];
          c.cd = Math.max(0, (c.cd ?? 0) - dt);
          c.life = (c.life ?? 0) - dt;

          if (!(c.landed ?? false)) {
            c.t = (c.t ?? 0) + dt;
            const u = clamp((c.t ?? 0) / (c.flight ?? 1), 0, 1);
            // Smooth approach to landing point.
            const e = 1 - Math.pow(1 - u, 2.2);
            c.x = (c.xFrom ?? c.x ?? 0) + ((c.xTo ?? c.x ?? 0) - (c.xFrom ?? c.x ?? 0)) * e;
            c.y = (c.yFrom ?? c.y ?? 0) + ((c.yTo ?? c.y ?? 0) - (c.yFrom ?? c.y ?? 0)) * e;
            // Parabolic arc
            c.z = (c.peak ?? 240) * 4 * u * (1 - u);
            if (u >= 1) {
              c.landed = true;
              c.z = 0;
              c.x = c.xTo ?? c.x;
              c.y = c.yTo ?? c.y;
            }
          }

          tryLavaFireballHitKart(K, c, this.prevKx, this.prevKy);

          if ((c.life ?? 0) <= 0) this.lavaFireballs.splice(i, 1);
        }

        for (const o of this.opponents ?? []) {
          if (!o) continue;
          for (const c of this.lavaFireballs) {
            if (tryLavaFireballHitKart(o, c, o.prevOx, o.prevOy)) break;
          }
        }
      }
    }

    /** Daily drift minigame: 2-minute timer + drift stat */
    if (this.mode === "daily") {
      stepCurrentDriftDistance(this, K, dt);
      this.dailyLeft = Math.max(0, (this.dailyLeft ?? 0) - dt);

      // Fireballs: spawn at 1:30 remaining, then snake around the track together.
      if (!this.fireballsActive && (this.dailyLeft ?? 0) <= 90) {
        const tr = getTrack();
        const pts = tr.pts;
        const L = tr.length || 1;
        const fi = tr.finishIdx ?? 0;
        const baseS = (pts[fi]?.s ?? 0) + 80; // slightly ahead of the stripe
        const w = tr.widths.wall; // same width as finish stripe
        const n = 12;
        this.fireballs = [];
        const idx = sampleIdxForS(tr, baseS, fi);
        const p = pts[idx] ?? pts[0];
        // 8 fireballs with a 2-slot gap (so you can pass).
        const slots = 10;
        this.fireballSlots = slots;
        this.fireballGapStart = 4; // gapA=4, gapB=5 initially
        this.fireballPhasePrevS = ((baseS % L) + L) % L;
        const gapA = this.fireballGapStart;
        const gapB = this.fireballGapStart + 1;
        let placed = 0;
        for (let s = 0; s < slots; s++) {
          if (s === gapA || s === gapB) continue;
          const u = slots <= 1 ? 0.5 : s / (slots - 1);
          const lat = (-w + (w - -w) * u) * 0.92;
          const p = pts[idx] ?? pts[0];
          this.fireballs.push({
            s: ((baseS % L) + L) % L,
            prevS: ((baseS % L) + L) % L,
            lat,
            latTarget: lat,
            slot: s,
            idx,
            x: p.x + p.nx * lat,
            y: p.y + p.ny * lat,
            r: 10,
            ang: Math.atan2(p.ty ?? 0, p.tx ?? 1),
            cd: 0,
          });
          placed++;
          if (placed >= n) break;
        }
        this.fireballsActive = true;
      }

      if (this.fireballsActive && this.fireballs?.length) {
        const tr = getTrack();
        const pts = tr.pts;
        const L = tr.length || 1;
        const stripeS = pts[tr.finishIdx ?? 0]?.s ?? 0;
        const speed = (this.dailyLeft ?? 0) <= 60 ? 168 : 118; // faster at 1:00 remaining
        // Detect finish-line crossings (whole group moves together).
        const leader = this.fireballs[0];
        const leaderPrevS = leader?.prevS ?? leader?.s ?? 0;
        const leaderNextS = (((leader?.s ?? 0) + speed * dt) % L + L) % L;
        if (crossedStripeS(leaderPrevS, leaderNextS, stripeS, L)) {
          const slots = Math.max(6, Math.floor(this.fireballSlots ?? 10));
          // choose a new 2-wide gap start (0..slots-2), avoid repeating the same one
          const prevGap = clamp(Math.floor(this.fireballGapStart ?? 0), 0, slots - 2);
          let gs = Math.floor(Math.random() * (slots - 1));
          if (gs === prevGap) gs = (gs + 2) % (slots - 1);
          this.fireballGapStart = gs;
          const w = tr.widths.wall;
          const gapA = gs;
          const gapB = gs + 1;
          // assign first 8 non-gap slots in order; fireballs slide to their new lanes
          const used = [];
          for (let s = 0; s < slots; s++) if (s !== gapA && s !== gapB) used.push(s);
          for (let i = 0; i < this.fireballs.length; i++) {
            const c = this.fireballs[i];
            const slot = used[i % used.length];
            c.slot = slot;
            const u = slots <= 1 ? 0.5 : slot / (slots - 1);
            c.latTarget = (-w + (w - -w) * u) * 0.92;
          }
        }
        for (const c of this.fireballs) {
          c.cd = Math.max(0, (c.cd ?? 0) - dt);
          const s0 = c.s ?? 0;
          const s1 = (((s0 + speed * dt) % L) + L) % L;
          c.s = s1;
          // Stable index advancement: walk forward along samples instead of searching,
          // to prevent occasional wrong-segment snaps/teleports.
          let i = clamp(Math.floor(c.idx ?? 0), 0, pts.length - 1);
          const wrapped = s1 < (c.prevS ?? s0);
          if (wrapped) i = 0;
          for (let k = 0; k < 40; k++) {
            const si = pts[i]?.s ?? 0;
            const sn = pts[(i + 1) % pts.length]?.s ?? (L + 1e-9);
            const wraps = sn < si;
            const inSeg =
              (!wraps && s1 >= si && s1 <= sn) ||
              (wraps && (s1 >= si || s1 <= sn));
            if (inSeg) break;
            i = (i + 1) % pts.length;
          }
          c.idx = i;
          c.prevS = s1;
          const p = pts[i] ?? pts[0];
          // Slide toward target lane (avoid instant teleports).
          const kLat = 1 - Math.exp(-dt * 7.5);
          c.lat = (c.lat ?? 0) + ((c.latTarget ?? (c.lat ?? 0)) - (c.lat ?? 0)) * kLat;
          c.x = p.x + p.nx * (c.lat ?? 0);
          c.y = p.y + p.ny * (c.lat ?? 0);
          c.ang = Math.atan2(p.ty ?? 0, p.tx ?? 1);

          // player collision
          const d = Math.hypot((c.x ?? 0) - K.x, (c.y ?? 0) - K.y);
          if (d < (c.r ?? 15) + KART_RADIUS * 0.9 && (c.cd ?? 0) <= 0) {
            c.cd = 0.75;
            K.spinT = Math.max(K.spinT ?? 0, 0.95);
            K.vx *= 0.5;
            K.vy *= 0.5;
            K.heading += (Math.random() - 0.5) * 1.4;
          }
        }
      }

      if ((this.dailyLeft ?? 0) <= 0) {
        this.endRace(120, NaN);
        return;
      }
    }

    /** Current drift distance (Driftboard HUD) */
    if (
      this.mode === "endless" ||
      this.mode === "practice" ||
      this.mode === "touge" ||
      this.mode === "grandprix" ||
      this.mode === "admin"
    ) {
      stepCurrentDriftDistance(this, K, dt);
    }

    /** Touge point-to-point: finish when crossing the end stripe once. */
    if (this.mode === "touge") {
      if ((this.tougeCooldown ?? 0) > 0) this.tougeCooldown -= dt;
      const crossedTouge =
        (this.tougeCooldown ?? 0) <= 0 &&
        lapFinishCrossed(
          this.prevKx,
          this.prevKy,
          K.x,
          K.y,
          Math.hypot(K.vx, K.vy),
          K.vx,
          K.vy,
          this.finishLine,
        );
      this.prevKx = K.x;
      this.prevKy = K.y;
      if (crossedTouge) {
        this.endRace(this.raceTime, NaN);
        return;
      }
    }

    /** Endless: wrap only at the finish end (open track). */
    if (this.mode === "endless") {
      this.wrapCooldown = Math.max(0, (this.wrapCooldown ?? 0) - dt);
      const tr = getTrack();
      if (tr.closed === false && (this.wrapCooldown ?? 0) <= 0) {
        const si = tr.startIdx ?? 0;
        const fi = tr.finishIdx ?? (tr.pts.length - 1);
        const sp = tr.pts[si] ?? tr.pts[0];
        const fp = tr.pts[fi] ?? tr.pts[tr.pts.length - 1];
        // Signed distance along tangent from each endpoint.
        const dFinish = (K.x - fp.x) * fp.tx + (K.y - fp.y) * fp.ty;
        const cap = 26;
        const near = 360;
        const ds = (K.x - fp.x) * (K.x - fp.x) + (K.y - fp.y) * (K.y - fp.y);
        if (ds <= near * near && dFinish > cap) {
          wrapWorld(this, sp.x - fp.x, sp.y - fp.y);
          this.wrapCooldown = 0.25;
          // Keep Endless scoring stable across the teleport.
          // The wrap is an explicit "end -> start" transition, so advance wraps here
          // and reset prev-pos so displacement-based earning doesn't go negative/zero out.
          // Always advance wraps on teleport (do not depend on any scoring vars).
          this.endlessWraps = (this.endlessWraps ?? 0) + 1;
          const srf2 = surfaceAt(this.kart.x, this.kart.y, this.kart.trackIdx ?? 0);
          this.kart.trackIdx = srf2.idx;
          this.endlessScoreIdx = srf2.idx;
          this.endlessPrevX = this.kart.x;
          this.endlessPrevY = this.kart.y;
        }
      }
    }

    /** Lap cross */
    if (this.mode !== "daily" && this.mode !== "touge" && this.mode !== "endless") {
      if (this.lapCooldown > 0) this.lapCooldown -= dt;

      const spd = Math.hypot(K.vx, K.vy);
      const crossedCheckpoint =
        this.lapCooldown <= 0 &&
        lapFinishCrossed(
          this.prevKx,
          this.prevKy,
          K.x,
          K.y,
          spd,
          K.vx,
          K.vy,
          this.checkLine,
        );
      if (crossedCheckpoint) this.lapCheckpointPassed = true;

      const crossedFinish =
        this.lapCooldown <= 0 &&
        lapFinishCrossed(
          this.prevKx,
          this.prevKy,
          K.x,
          K.y,
          spd,
          K.vx,
          K.vy,
          this.finishLine,
        );

      this.prevKx = K.x;
      this.prevKy = K.y;

      if (crossedFinish && this.lapCheckpointPassed) {
        const lapElapsed = this.raceTime - this.lapStartRaceT;
        if (lapElapsed >= 3.1) {
          this.lapsFinished++;
          if (this.lapsFinished >= this.lapTarget() && !Number.isFinite(K.finishedRaceT))
            K.finishedRaceT = this.raceTime;
          this.finishLineWork(lapElapsed, { x: K.x, y: K.y, h: K.heading });
          this.lapStartRaceT = this.raceTime;
          this.lapCooldown = 0.9;
          this.ghostSamplesThisLap.length = 0;
          this.lapCheckpointPassed = false;
        }
      }
    }

    for (const o of this.opponents) {
      if (o.lapCooldown > 0) o.lapCooldown -= dt;
      const spdO = Math.hypot(o.vx, o.vy);
      const crossedCpO =
        o.lapCooldown <= 0 &&
        lapFinishCrossed(
          o.prevOx,
          o.prevOy,
          o.x,
          o.y,
          spdO,
          o.vx,
          o.vy,
          this.checkLine,
        );
      if (crossedCpO) o.lapCheckpointPassed = true;
      const crossedO =
        o.lapCooldown <= 0 &&
        lapFinishCrossed(
          o.prevOx,
          o.prevOy,
          o.x,
          o.y,
          spdO,
          o.vx,
          o.vy,
          this.finishLine,
        );
      if (crossedO) {
        const lapElapsedO =
          this.raceTime -
          (typeof o.lapStartRaceT === "number" ? o.lapStartRaceT : 0);
        if (lapElapsedO >= 3.1 && o.lapCheckpointPassed) {
          o.lapsFinished++;
          if (o.lapsFinished >= this.lapTarget() && !Number.isFinite(o.finishedRaceT))
            o.finishedRaceT = this.raceTime;
          o.lapStartRaceT = this.raceTime;
          o.lapCooldown = 0.9;
          o.lapCheckpointPassed = false;
        }
      }
      o.prevOx = o.x;
      o.prevOy = o.y;
    }

    this.recordGhostSample();

    /** Smoothed camera every physics tick (was once per paint with fixed Δt → jitter) */
    this.stepCameraFollow(dt);

    /** HUD mirrors */
    if (this.shellCountEl) this.shellCountEl.textContent = String(K.shells);
    // Banana/boost HUD chips removed; items come from Mystery Boxes.
    if (this.hudTime)
      this.hudTime.textContent =
        this.mode === "daily"
          ? fmtRaceTime(this.dailyLeft ?? 0)
          : this.mode === "endless"
            ? fmtRaceTime(this.endlessLeft ?? 0)
            : fmtRaceTime(this.raceTime);

    this.updateRaceHudPanels();

    if (this.hudLivesEl && this.hudLivesValEl) {
      const showLives = this.mode === "endless";
      this.hudLivesEl.classList.toggle("hidden", !showLives);
      if (showLives) {
        const left = Math.max(0, 5 - (this.endlessBananaHits ?? 0));
        this.hudLivesValEl.textContent = String(left);
      }
    }

    const lapTarget = this.lapTarget();
    let shownLap = clamp(this.lapsFinished + 1, 1, lapTarget);
    if (this.lapsFinished >= lapTarget) shownLap = lapTarget;
    if (this.hudLap) this.hudLap.textContent = `Lap ${shownLap} / ${lapTarget}`;

    if (this.driftWrap && this.driftFill) {
      const vis = ins.drift || K.driftGauge > 0.04;
      this.driftWrap.classList.toggle("hidden", !vis);
      const pct =
        clamp(K.driftGauge / PHYS.driftGaugeMax, 0, 1) * 100;
      this.driftFill.style.width = `${pct}%`;
      if (this.driftMeterTrack)
        this.driftMeterTrack.setAttribute(
          "aria-valuenow",
          String(Math.round(pct)),
        );
      const lab = this.driftWrap.querySelector?.(".drift-box__label");
      if (lab) {
        const tier = driftTierFromGauge(K.driftGauge ?? 0);
        lab.textContent = tier > 0 ? `Drift boost · Lv ${tier}` : "Drift boost";
      }
    }

    this.updateRandomizerHud();

    if (this.mode !== "daily" && this.mode !== "endless" && this.lapsFinished >= lapTarget) {
      let best = this.kart.bestLapThisSession;
      if (
        !Number.isFinite(best) ||
        best === Infinity ||
        best <= 0
      )
        best = this.raceSplits.length ? Math.min(...this.raceSplits) : lapElapsedHack(this);
      const total = this.raceTime;
      this.endRace(total, best);
    }
  }

  stepFx(dt) {
    const K = this.kart;
    this.emitDriftFx(K, dt);
    for (const o of this.opponents) this.emitDriftFx(o, dt);

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.smoke.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.35, dt);
      p.vy *= Math.pow(0.35, dt);
    }

    for (let i = this.skids.length - 1; i >= 0; i--) {
      const s = this.skids[i];
      s.age += dt;
      if (s.age >= s.life) this.skids.splice(i, 1);
    }

    if ((K.driftFlameT ?? 0) > 0) K.driftFlameT = Math.max(0, K.driftFlameT - dt);
    for (const o of this.opponents) {
      if ((o.driftFlameT ?? 0) > 0) o.driftFlameT = Math.max(0, o.driftFlameT - dt);
    }
  }

  emitDriftFx(K, dt) {
    if (!K) return;
    const spd = Math.hypot(K.vx ?? 0, K.vy ?? 0);
    if (!(K.drifting && spd > PHYS.driftMinSpeed * 0.45)) {
      K._smokeAcc = 0;
      K._skidAcc = 0;
      K._skidPrevLx = null;
      K._skidPrevLy = null;
      K._skidPrevRx = null;
      K._skidPrevRy = null;
      return;
    }
    const pMax = K.phys?.maxSpeed ?? DEFAULT_KART_PHYS.maxSpeed;
    const rate = clamp(spd / (pMax * 1.05), 0, 1);
    const driftU = clamp((K.driftGauge ?? 0) / (PHYS.driftGaugeMax || 1), 0, 1);
    const intervalBase = 0.06 - 0.03 * rate;
    /** More charged drift => more smoke per second (denser). */
    const interval = intervalBase * (1 - 0.78 * driftU);
    K._smokeAcc = (K._smokeAcc ?? 0) + dt;
    while (K._smokeAcc >= interval) {
      K._smokeAcc -= interval;
      const ang = spd > 8 ? Math.atan2(K.vy ?? 0, K.vx ?? 0) : (K.heading ?? 0);
      const fx = Math.cos(ang);
      const fy = Math.sin(ang);
      const lx = -fy;
      const ly = fx;
      K._smokeSide = (K._smokeSide ?? 1) * -1;
      const side = (K._smokeSide ?? 1) * 7;
      const back = 16;
      const x = (K.x ?? 0) - fx * back + lx * side + (Math.random() - 0.5) * 2.5;
      const y = (K.y ?? 0) - fy * back + ly * side + (Math.random() - 0.5) * 2.5;
      const puffV = 14 + Math.random() * 16;
      const vx = -fx * puffV + (Math.random() - 0.5) * 10;
      const vy = -fy * puffV + (Math.random() - 0.5) * 10;
      const r = 3.2 + Math.random() * 4.2;
      const life = 0.18 + Math.random() * 0.14;
      /** More charged drift => slightly thicker smoke. */
      const inten = 0.8 + driftU * 1.35;
      this.smoke.push(makeSmokeParticle(x, y, vx, vy, r, life, inten));
      if (this.smoke.length > 140) this.smoke.splice(0, this.smoke.length - 140);
    }

    /** Skidmarks: short segments behind rear wheels while drifting. */
    const skidStep = 0.035;
    K._skidAcc = (K._skidAcc ?? 0) + dt;
    while (K._skidAcc >= skidStep) {
      K._skidAcc -= skidStep;
      const angH = K.heading ?? 0;
      const fxh = Math.cos(angH);
      const fyh = Math.sin(angH);
      const lxh = -fyh;
      const lyh = fxh;
      const back = 14;
      const half = 6.2;
      const baseX = (K.x ?? 0) - fxh * back;
      const baseY = (K.y ?? 0) - fyh * back;
      const leftX = baseX + lxh * half;
      const leftY = baseY + lyh * half;
      const rightX = baseX - lxh * half;
      const rightY = baseY - lyh * half;

      const w = 1.4 + driftU * 1.1;
      const alpha = 0.55 + driftU * 0.65;
      const lifeSkid = 3.8 + driftU * 2.2;

      if (Number.isFinite(K._skidPrevLx) && Number.isFinite(K._skidPrevLy)) {
        this.skids.push(
          makeSkidSeg(
            K._skidPrevLx,
            K._skidPrevLy,
            leftX,
            leftY,
            lifeSkid,
            w,
            alpha,
          ),
        );
      }
      if (Number.isFinite(K._skidPrevRx) && Number.isFinite(K._skidPrevRy)) {
        this.skids.push(
          makeSkidSeg(
            K._skidPrevRx,
            K._skidPrevRy,
            rightX,
            rightY,
            lifeSkid,
            w,
            alpha,
          ),
        );
      }

      K._skidPrevLx = leftX;
      K._skidPrevLy = leftY;
      K._skidPrevRx = rightX;
      K._skidPrevRy = rightY;

      if (this.skids.length > 480) this.skids.splice(0, this.skids.length - 480);
    }
  }

  updateRaceHudPanels() {
    if (this.hudDriftCurEl && this.hudDriftCurValEl) {
      const show = usesDriftBoardHud(this.mode);
      const underTime = driftBoardUnderTimeHud(this.mode);
      this.hudDriftCurEl.classList.toggle("hidden", !show);
      this.hudDriftCurEl.classList.toggle("hud-drift-board--under-time", show && underTime);
      this.hudDriftCurEl.classList.toggle("hud-drift-board--corner", show && !underTime);
      if (show) {
        this.hudDriftCurValEl.textContent = fmtDriftHudDistance(
          this,
          hudDriftDistanceM(this),
        );
      }
      const placeActive =
        !underTime &&
        (this.opponents?.length ?? 0) > 0 &&
        this.phase === "racing" &&
        !this.hudPlaceEl?.hidden;
      document.body?.classList?.toggle("hud-placement-active", placeActive);
    }
    this.updateRacePlaceHud();
  }

  updateRacePlaceHud() {
    const wrap = this.hudPlaceEl;
    if (!wrap) return;
    if (!this.opponents?.length) {
      wrap.hidden = true;
      return;
    }
    if (this.phase !== "racing") {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const el = wrap.querySelector(".hud-place__inner") ?? wrap;
    const rows = racersSortedByProgress(this);
    const pos = rows.findIndex((r) => r.player) + 1;
    const n = rows.length;
    el.replaceChildren();

    const lbl = document.createElement("span");
    lbl.className = "hud-place__lbl";
    lbl.textContent = "Position";
    el.appendChild(lbl);

    const big = document.createElement("div");
    big.className = "hud-place__big";
    big.append(document.createTextNode(`${ordinalPlace(pos)} `));
    const span = document.createElement("span");
    span.textContent = `/ ${n}`;
    big.appendChild(span);
    el.appendChild(big);

    const ol = document.createElement("ol");
    ol.className = "hud-place__list";
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      if (r.player) li.classList.add("you");
      const idx = document.createElement("span");
      idx.className = "idx";
      idx.textContent = `${i + 1}.`;
      li.appendChild(idx);
      li.appendChild(document.createTextNode(` ${r.tag}`));
      ol.appendChild(li);
    });
    el.appendChild(ol);
  }

  syncRaceViewFromCanvas() {
    if (this.phase === "menu" || document.body?.classList?.contains("otter-ui-menu"))
      return;
    const { vw, vh } = getCanvasClientViewSize(this.canvas);
    if (!isMobileRaceViewport(vw, vh)) return;
    if (Math.abs(vw - this.viewW) > 3 || Math.abs(vh - this.viewH) > 3) {
      this.resize();
      return;
    }
    this.viewW = vw;
    this.viewH = vh;
  }

  stepCameraFollow(dt) {
    this.syncRaceViewFromCanvas();
    const lerp = cameraLerpForViewport(this.viewW, this.viewH);
    const lfac = clamp(1 - Math.exp(-lerp * dt), 0, 1);
    const K = this.kart;
    const mobile = isMobileRaceViewport(this.viewW, this.viewH);
    const kx = K.x ?? 0;
    const ky = K.y ?? 0;

    /** Mobile: always center on the kart (look-ahead + bad vv sizes caused top-left drift). */
    if (mobile) {
      this.cam.x += (kx - this.cam.x) * lfac;
      this.cam.y += (ky - this.cam.y) * lfac;
      return;
    }

    const spd = Math.hypot(K.vx ?? 0, K.vy ?? 0);
    const look = raceCameraLookAheadWorld(this.viewW, this.viewH);
    const hx = Math.cos(K.heading ?? 0);
    const hy = Math.sin(K.heading ?? 0);
    const ahead = look * clamp(spd / 220, 0.12, 1);
    const tx = kx + hx * ahead;
    const ty = ky + hy * ahead;
    this.cam.x += (tx - this.cam.x) * lfac;
    this.cam.y += (ty - this.cam.y) * lfac;
  }

  updateRandomizerHud() {
    const wrap = this.hudRandomizerEl;
    const icon = this.hudRandomizerItemEl;
    if (!wrap || !icon) return;
    const show = usesMysteryRandomizerHud(this);
    wrap.classList.toggle("hidden", !show);
    if (!show) {
      icon.hidden = true;
      icon.classList.remove("hud-randomizer__item--rolling");
      return;
    }
    let label = "";
    let itemKey = "";
    if (this.itemRoulette?.show) {
      label = String(this.itemRoulette.show);
      itemKey =
        this.itemRoulette.item ||
        this.itemRoulette.spinKey ||
        mysteryItemKeyFromShow(label);
    } else if (this.equippedItem && (this.equippedCharges ?? 0) > 0) {
      itemKey = this.equippedItem;
      label = mysteryItemLabel(itemKey);
    }
    if (label) {
      const src = rouletteIconSrc(label, itemKey);
      if (src && icon.src !== src) icon.src = src;
      icon.hidden = false;
      icon.classList.toggle(
        "hud-randomizer__item--lg",
        randomizerIconUsesLargeScale(itemKey),
      );
      icon.classList.toggle(
        "hud-randomizer__item--rolling",
        !!(this.itemRoulette && !this.itemRoulette.done),
      );
    } else {
      icon.hidden = true;
      icon.classList.remove("hud-randomizer__item--lg");
      icon.classList.remove("hud-randomizer__item--rolling");
    }
  }

  updateCountdownUI() {
    if (!this.countdownEl) return;
    if (this.phase !== "racing" || this.started) {
      this.countdownEl.classList.add("hidden");
      this.countdownEl.textContent = "";
      return;
    }
    const t = this.countdownT;
    let txt = "";
    let cls = "countdown__num";
    if (t > 2.25) txt = "3";
    else if (t > 1.25) txt = "2";
    else if (t > 0.25) txt = "1";
    else {
      txt = "GO!";
      cls = "countdown__go";
    }
    this.countdownEl.classList.remove("hidden");
    this.countdownEl.innerHTML = `<div class="${cls}">${txt}</div>`;
  }

  finishLineWork(lapElapsed, finishSnap) {
    const K = this.kart;
    K.lastLapElapsed = lapElapsed;
    this.raceSplits.push(lapElapsed);
    if (
      lapElapsed < K.bestLapThisSession ||
      !Number.isFinite(K.bestLapThisSession)
    )
      K.bestLapThisSession = lapElapsed;

    const raw = this.ghostSamplesThisLap;
    if (
      raw.length > 8 &&
      lapElapsed < this.sessionBestLapTime
    ) {
      const norm = rotateLapSamplesToFinish(
        raw,
        lapElapsed,
        this.finishLine,
        finishSnap,
      );
      const sealed = sealLoopAtFinish(norm, lapElapsed, finishSnap);
      this.sessionBestLapTime = lapElapsed;
      this.sessionBestGhost = {
        lapTime: lapElapsed,
        samples: sealed,
      };
      const loaded = loadGhost(
        this.mode,
        this.mode === "daily" ? this.dateISO : "",
      );
      if (
        loaded == null ||
        !Number.isFinite(loaded.lapTime) ||
        lapElapsed + 1e-3 < loaded.lapTime
      ) {
        this.ghostData = {
          lapTime: lapElapsed,
          samples: sealed,
        };
      }
    }
  }

  recordGhostSample() {
    const K = this.kart;
    const tlap = this.raceTime - this.lapStartRaceT;
    this.ghostSamplesThisLap.push({
      t: tlap,
      x: K.x,
      y: K.y,
      h: K.heading,
    });
  }

  advanceGhost(dt) {}

  resolveCollisionsPickupBanana(dt) {
    const K = this.kart;
    const srf = surfaceAt(K.x, K.y, K.trackIdx);
    K.trackIdx = srf.idx;
    if (
      srf.surface !== "wall" &&
      checkBoostPad(K.x, K.y, KART_RADIUS, this.boostPads, dt)
    ) {
      applyBoostImpulse(K, PHYS.padBoost);
      applyTimedBoost(K, 0.28, 0.8);
    }

    for (const p of this.pickups) {
      if (
        (this.mode === "daily" || this.mode === "endless") &&
        p.taken &&
        (p.respawnT ?? 0) > 0
      ) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.taken = false;
          p.respawnT = 0;
        }
      }
      if (p.taken) continue;
      const d = Math.hypot(p.x - K.x, p.y - K.y);
      if (d < KART_RADIUS + 18) {
        p.taken = true;
        if (p.type === "shell") K.shells += 1;
        if (p.type === "goldenShell") K.shells += 10;
        if (this.mode === "daily" || this.mode === "endless") {
          p.respawnT = 3.25;
          if (this.mode === "daily") {
            // Drift challenge: rare golden shells.
            p.type = Math.random() < 0.025 ? "goldenShell" : "shell";
          } else if (this.mode === "endless") {
            // Endless: golden shells only after 5000m, and very rare.
            const canGold = (this.endlessDist ?? 0) >= 5000;
            p.type = canGold && Math.random() < 0.006 ? "goldenShell" : "shell";
          }
        }
      }
    }

    // Grand Prix mystery boxes: random item after 2s roulette.
    if (this.mysteryBoxes?.length && raceCombatStarted(this, false)) {
      for (const p of this.mysteryBoxes) {
        if (p.taken) continue;
        // If we already have a roulette (rolling or an un-used awarded item), don't consume more boxes.
        if (this.itemRoulette) continue;
        const d = Math.hypot(p.x - K.x, p.y - K.y);
        if (d < KART_RADIUS + 18) {
          p.taken = true;
          p.respawnT = 5.0;
          startItemRoulette(this);
        }
      }
    }

    /** Endless: banana hazards (difficulty ramps with distance) */
    if (this.mode === "endless") {
      this.endlessLeft = Math.max(0, (this.endlessLeft ?? 0) - dt);
      if ((this.endlessLeft ?? 0) <= 0) {
        this.endRace(this.raceTime, NaN);
        return;
      }
      const tr = getTrack();
      const L = tr.length || 1;
      // Use the stable nearest-sample index (trackIdx) for progress.
      // This prevents snapping to spatially-close but far-ahead snake segments.
      const srf0 = surfaceAt(K.x, K.y, K.trackIdx ?? 0);
      K.trackIdx = srf0.idx;
      /**
       * Scoring index stabilization:
       * When the snake track folds near itself, nearest-sample can jump to a
       * spatially-close but far-ahead segment. For fairness, only allow the
       * scoring index to move locally (within a window) each tick.
       */
      const N = tr.pts.length;
      const candIdx = clamp(Math.floor(K.trackIdx ?? 0), 0, Math.max(0, N - 1));
      if (!Number.isFinite(this.endlessScoreIdx) || (this.endlessScoreIdx ?? -1) < 0) {
        this.endlessScoreIdx = candIdx;
      } else {
        const last = clamp(Math.floor(this.endlessScoreIdx ?? 0), 0, Math.max(0, N - 1));
        // Always pick the nearest sample in a LOCAL window around the last score idx.
        // This prevents snapping to other nearby-but-far segments AND prevents freezing.
        this.endlessScoreIdx = nearestSampleLocal(tr, K.x, K.y, last, 34);
      }

      const scoreIdx = clamp(this.endlessScoreIdx ?? 0, 0, Math.max(0, N - 1));
      const sNow = tr.pts[scoreIdx]?.s ?? 0;
      // Keep a debug-friendly "u" as the current arc-length sample.
      this.endlessLastU = sNow;

      // Displacement gate: only "earn" distance when actually moving forward on pavement.
      const srf = srf0;
      const p = tr.pts[K.trackIdx] ?? tr.pts[0];
      const px0 = Number.isFinite(this.endlessPrevX) ? this.endlessPrevX : K.x;
      const py0 = Number.isFinite(this.endlessPrevY) ? this.endlessPrevY : K.y;
      const dxW = (K.x ?? 0) - px0;
      const dyW = (K.y ?? 0) - py0;
      const fwdDisp = dxW * (p.tx ?? 0) + dyW * (p.ty ?? 0);
      const onPave = srf.surface === "pavement";
      const nearRoadCenter =
        Math.abs(srf.lat ?? 0) <= (tr.widths?.road ?? 0) * 0.92;
      const allow = onPave && nearRoadCenter && fwdDisp > 0 ? Math.max(0, fwdDisp) : 0;

      const unwrappedS = (this.endlessWraps ?? 0) * L + sNow;
      if (!Number.isFinite(this.endlessBaseS)) {
        this.endlessBaseS = unwrappedS;
        this.endlessMaxS = unwrappedS;
      } else {
        const baseS = this.endlessBaseS ?? 0;
        let maxS = this.endlessMaxS ?? baseS;
        const MIN_ADV = 72; // must exceed prior max by this much to count
        if (allow > 0 && unwrappedS > maxS + MIN_ADV) {
          // Cap growth by what you could have physically earned this tick.
          const delta = Math.min(unwrappedS - maxS, allow * 1.6 + 10);
          maxS += Math.max(0, delta);
          this.endlessMaxS = maxS;
        } else {
          this.endlessMaxS = maxS;
        }
      }

      const baseS = this.endlessBaseS ?? 0;
      const maxS = this.endlessMaxS ?? baseS;
      this.endlessDist = Math.max(0, maxS - baseS);
      this.endlessPrevX = K.x;
      this.endlessPrevY = K.y;

      const od = this.endlessDist ?? 0;
      stepEndlessDistanceShellAwards(this, K, od);
      const startAt = 1609; // 1 mile in meters
      // hardness: 0 → 1 over ~2500m
      this.endlessHardness = clamp(od / 2500, 0, 1);
      // Distance spacing (prevents clustering) + time fallback (prevents "spawns stop" when you're spinning/stuck)
      // Easier start: fewer peels + larger spacing for the first stretch.
      const spacingD = 760 - 360 * (this.endlessHardness ?? 0); // 760m → 400m
      const maxField = 1 + Math.floor((this.endlessHardness ?? 0) * 3); // 1 → 4
      if (od < startAt) {
        // Don't spawn hazards yet. Keep timer primed.
        this.endlessNextBananaT = 0.25;
        this.endlessLastBananaOdo = od;
        this.endlessHazardsArmedT = 0;
      } else {
        if (!this.endlessHazardsArmed) {
          // First moment you cross 1 mile: arm hazards + spawn immediately.
          this.endlessHazardsArmed = true;
          this.endlessHazardsArmedT = 0;
          this.endlessNextBananaT = 0;
          spawnEndlessBanana(this);
          this.endlessLastBananaOdo = od;
        }
        this.endlessHazardsArmedT = (this.endlessHazardsArmedT ?? 0) + dt;
        this.endlessNextBananaT = (this.endlessNextBananaT ?? 0) - dt;
      }
      const readyByD =
        od - (this.endlessLastBananaOdo ?? 0) >= spacingD;
      const readyByT = (this.endlessNextBananaT ?? 0) <= 0;
      if (
        od >= startAt &&
        (readyByD || readyByT) &&
        (this.bananas?.length ?? 0) < maxField
      ) {
        spawnEndlessBanana(this);
        this.endlessLastBananaOdo = od;
        const tMin = 4.6;
        const tMax = 8.2;
        this.endlessNextBananaT =
          tMax - (tMax - tMin) * (this.endlessHardness ?? 0);
      }

      // Fail-safe: only if hazards are armed but there are zero peels for a while.
      if (
        od >= startAt &&
        this.endlessHazardsArmed &&
        (this.bananas?.length ?? 0) === 0 &&
        (this.endlessHazardsArmedT ?? 0) > 3.0
      ) {
        spawnEndlessBanana(this);
        this.endlessHazardsArmedT = 0.6; // avoid spamming
      }
      if ((this.lives ?? 0) <= 0) {
        this.endRace(this.raceTime, NaN);
        return;
      }
    }

  }

  applySpin(dt) {
    applyKartSpinWobble(this.kart, dt);
  }

  draw(showFinishedBackdrop) {
    this.syncRaceViewFromCanvas();
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;

    const snakeField = neonSnakeFieldKind(this);
    if (snakeField) {
      drawNeonSnakeBackdrop(ctx, snakeField, this.cam.x, this.cam.y, w, h);
    } else {
      const isGpLava = gpStyleEffects(this) && this.trackId === "lava-serpent";
      const pat = isGpLava ? getLavaPattern(ctx) : getWaterPattern(ctx);
      if (pat) {
        drawPatternParallax(ctx, pat, this.cam.x, this.cam.y, w, h, isGpLava ? 1.25 : 1);
      } else {
        ctx.fillStyle = "#76d6ff";
        ctx.fillRect(0, 0, w, h);
      }
    }

    const zx = raceZoomForViewport(w, h);
    const camOffX = mobileRaceCameraScreenOffsetX(w, h);

    ctx.save();
    try {
      ctx.setTransform(
        zx,
        0,
        0,
        zx,
        w * 0.5 - zx * this.cam.x - camOffX,
        h * 0.5 - zx * this.cam.y,
      );

      // Pass edge-band choice into track renderer (cheaper than threading params everywhere).
      ctx.__edgeBandVariant = this.edgeBandVariant;
      ctx.__neonSnakeFieldKind = neonSnakeFieldKind(this);
      drawGrassAndTrack(ctx, neonTougeVisual(this));

    /** Finish stripe — GP checkerboard on every track/mode (including drift / Neon Snake). */
    {
      const fl = this.finishLine;
      if (fl) {
        const tr = getTrack();
        drawFinishCheckered(ctx, fl, tr.widths.road ?? 86, zx);
      }
    }

    drawDecor(ctx, this.decor);
    drawBoostPads(ctx, this.boostPads);

    drawSkidMarks(ctx, this.skids);

    // Endless hazards are dropped bananas; they render via drawBananaGround below.

    /** Pickups */
    const tPulse = performance.now() * 0.004;
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.bob += this.frameDt * 3;
      drawPickup(ctx, p, Math.sin(p.bob) * 6, tPulse);
    }

    if (this.mysteryBoxes?.length) {
      for (const p of this.mysteryBoxes) {
        if (p.taken) continue;
        // Mystery boxes are static on track (no shake/bob).
        drawPickup(ctx, p, 0, tPulse);
      }
    }

    for (const b of this.bananas)
      drawBananaGround(ctx, b);

    if (this.rocks?.length) {
      for (const r of this.rocks) drawRockProjectile(ctx, r);
    }
    if (this.rockFlies?.length) {
      for (const rf of this.rockFlies) drawRockFly(ctx, rf);
    }

    if (this.mode === "daily" && this.fireballsActive && this.fireballs?.length) {
      for (const c of this.fireballs) drawFireball(ctx, c);
    }

    if (gpStyleEffects(this) && this.trackId === "lava-serpent" && this.lavaFireballs?.length) {
      for (const c of this.lavaFireballs) drawFireball(ctx, c);
    }

    drawDriftSmoke(ctx, this.smoke);

    /** Opponents */
    const atlas = getCharacterAtlas();
    for (const o of this.opponents) {
      drawBoostFlames(ctx, o);
      drawDriftReleaseFlame(ctx, o);
      const oShield = (o.shieldT ?? 0) > 0;
      drawShieldRing(ctx, o, zx);
      drawKartLayers(
        ctx,
        o.x,
        o.y,
        o.heading,
        0.92,
        o.kartId,
        o.eyeId,
        o.hatId,
        atlas,
        o.hull,
        o.fur,
        drawOtter,
        { shieldActive: oShield },
      );
    }

    drawBoostFlames(ctx, this.kart);
    drawDriftReleaseFlame(ctx, this.kart);
    const pShield = (this.kart.shieldT ?? 0) > 0;
    drawShieldRing(ctx, this.kart, zx);
    drawKartLayers(
      ctx,
      this.kart.x,
      this.kart.y,
      this.kart.heading,
      1.0,
      this.kart.kartId,
      this.kart.eyeId,
      this.kart.hatId,
      atlas,
      this.kart.hull,
      this.kart.fur,
      drawOtter,
      { shieldActive: pShield },
    );
    } finally {
      ctx.restore();
    }

    drawGpCourseMinimap(ctx, this);

    if (this.opponents?.length) {
      const nearest = nearestOpponentToPlayer(this.opponents, this.kart.x, this.kart.y);
      if (nearest)
        drawOffscreenArrow(ctx, nearest.x, nearest.y, this.cam.x, this.cam.y, zx, w, h);
    }

    if (showFinishedBackdrop) {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, w, h);
    }

    if (this.phase === "finished" && this.hudPlaceEl)
      this.hudPlaceEl.hidden = true;
  }

  drawMenuBackdrop() {
    this.resizeCheck();
    if (this.hudPlaceEl) this.hudPlaceEl.hidden = true;
    const ctx = this.ctx;
    const w = this.viewW || window.innerWidth;
    const h = this.viewH || window.innerHeight;
    ctx.fillStyle = "#0b100d";
    ctx.fillRect(0, 0, w, h);
  }

  resizeCheck() {
    const menu = document.body?.classList?.contains("otter-ui-menu");
    const { vw, vh } = menu
      ? getGameViewportSize()
      : getCanvasClientViewSize(this.canvas);
    if (Math.abs(this.viewW - vw) > 4 || Math.abs(this.viewH - vh) > 4) this.resize();
  }
}

function lapElapsedHack(self) {
  return self.kart.lastLapElapsed ?? 999;
}

function inputFromKeys(keys) {
  let steer = 0;
  if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
  if (keys.has("d") || keys.has("arrowright")) steer += 1;
  return {
    gas: keys.has("w") || keys.has("arrowup"),
    brake: keys.has("s") || keys.has("arrowdown"),
    steer,
    drift: keys.has(" "),
  };
}

function clampAbsDeadzone(x, dz) {
  const v = Number(x) || 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const s = v < 0 ? -1 : 1;
  return s * (a - dz) / (1 - dz);
}

function gpBtnDown(btn) {
  if (!btn) return false;
  return Boolean(btn.pressed || (btn.value ?? 0) > 0.45);
}

function activeGamepad() {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function")
    return null;
  const pads = navigator.getGamepads();
  if (!pads?.length) return null;
  for (const p of pads) {
    if (p?.connected) return p;
  }
  return null;
}

/** Edge-triggered pad actions — polled every animation frame so taps aren't missed. */
function pollGamepadActions(game) {
  if (!game || game.phase !== "racing") return;
  const gp = activeGamepad();
  if (!gp) return;

  const btns = gp.buttons || [];
  const n = Math.max(16, btns.length);
  let cur = game._gpPressedBuf;
  let prev = game._gpPrevPressed;
  if (!cur || cur.length < n) {
    cur = game._gpPressedBuf = new Array(n);
    prev = game._gpPrevPressed = new Array(n);
  }
  for (let i = 0; i < btns.length && i < cur.length; i++) {
    cur[i] = gpBtnDown(btns[i]);
  }
  const justPressed = (i) => i < cur.length && cur[i] && !prev[i];

  // X/Square (2) and Y/Triangle (3) — use equipped mystery-box item.
  if (justPressed(2) || justPressed(3)) game.useAwardedItem?.();
  if (justPressed(9)) {
    try {
      document.getElementById?.("btn-settings")?.click?.();
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < btns.length && i < prev.length; i++) prev[i] = cur[i];
}

function readGamepadInput(game) {
  const gp = activeGamepad();
  if (!gp) return { gas: false, brake: false, steer: 0, drift: false };

  const axes = gp.axes || [];
  const btns = gp.buttons || [];
  const dead = 0.18;
  const steer = clampAbsDeadzone(axes[0] ?? 0, dead);

  /** Standard mapping: RT=7, LT=6; fallback to digital A/Cross for gas */
  const rt = btns[7]?.value ?? (gpBtnDown(btns[7]) ? 1 : 0);
  const lt = btns[6]?.value ?? (gpBtnDown(btns[6]) ? 1 : 0);
  const gas = rt > 0.2 || Boolean(gpBtnDown(btns[0]) && !gpBtnDown(btns[7]));
  const brake = lt > 0.2 || Boolean(gpBtnDown(btns[1]) && !gpBtnDown(btns[6]));

  /** A/Cross (0) = drift */
  const drift = gpBtnDown(btns[0]);

  /** D-pad optional steer assist if stick is idle */
  let steerOut = steer;
  if (Math.abs(steerOut) < 0.12) {
    const dl = gpBtnDown(btns[14]);
    const dr = gpBtnDown(btns[15]);
    if (dl && !dr) steerOut = -1;
    else if (dr && !dl) steerOut = 1;
  }

  return { gas, brake, steer: steerOut, drift };
}

function applyBoostImpulse(K, imp) {
  const c = Math.cos(K.heading);
  const s = Math.sin(K.heading);
  K.vx += c * imp;
  K.vy += s * imp;
}

/** Mystery-box boost tiers — orange (weakest) · green (mid) · purple (strongest). */
function applyMysteryBoost(K, tier) {
  const lv = clamp(Math.floor(tier), 1, 3);
  const base = PHYS.itemBoostImpulse;
  let impulse;
  let capMul;
  let duration;
  let flameTier;
  if (lv === 3) {
    impulse = base * 1.55;
    capMul = 0.42;
    duration = 0.72;
    flameTier = 3;
  } else if (lv === 2) {
    impulse = base * 1.22;
    capMul = 0.30;
    duration = 0.52;
    flameTier = 2;
  } else {
    impulse = base * 0.88;
    capMul = 0.18;
    duration = 0.36;
    flameTier = 0;
  }
  applyBoostImpulse(K, impulse);
  applyTimedBoost(K, capMul, duration, flameTier);
}

/**
 * Temporary max-speed increase so boosts are always noticeable even near Vmax.
 * @param {any} K
 * @param {number} capMul e.g. 0.25 => +25% max speed while active
 * @param {number} duration seconds
 * @param {number} [flameTier] 0 = orange (pads/items); 1–3 = drift release colors
 */
function applyTimedBoost(K, capMul, duration, flameTier = 0) {
  if (!K) return;
  const d = Number.isFinite(duration) ? duration : 0;
  const m = Number.isFinite(capMul) ? capMul : 0;
  if (d <= 0 || m <= 0) return;
  K.boostT = Math.max(K.boostT ?? 0, d);
  K.boostCapMul = Math.max(K.boostCapMul ?? 0, m);
  K.boostFlameTier = flameTier;
}

/** @param {any} K */
function integrateKart(K, ins, dt, game) {
  const P = K.phys ?? DEFAULT_KART_PHYS;
  const wasDrifting = K.drifting;
  let grip = P.gripBase;
  /** Drift engages only with speed & hold */
  K.drifting = ins.drift && Math.hypot(K.vx, K.vy) > PHYS.driftMinSpeed * 0.35;
  if (K.drifting) grip = P.gripDrift;

  const srf = surfaceAt(K.x, K.y, K.trackIdx ?? 0);
  K.trackIdx = srf.idx;
  const surface = srf.surface;
  const spd = Math.hypot(K.vx, K.vy);
  let maxMul = surface === "grass" ? PHYS.grassSpeedMul : 1;
  // GP4/GP5 off-road (pink/molten): slower than normal grass so it's clearly drivable-but-bad.
  if (
    surface === "grass" &&
    (game?.trackId === "neo-snake-gp" || game?.trackId === "lava-serpent")
  ) {
    maxMul *= 0.78;
  }

  /** Forward axis */
  const fx = Math.cos(K.heading);
  const fy = Math.sin(K.heading);
  /** Lateral perpendicular (left-hand) */
  const lx = -fy;
  const ly = fx;

  const fwd = spd > 8 ? ((K.vx * fx + K.vy * fy) / spd) : 0;
  const lat = spd > 8 ? ((K.vx * lx + K.vy * ly) / spd) : 0;

  if (K.spinT > 0) {
    grip *= 0.45;
    maxMul *= 0.8;
  }

  /** Heading change — arcade: strong rotation at most speeds; only softens near Vmax */
  const speedRatio = spd / P.maxSpeed;
  const floor =
    typeof PHYS.steerTurnFloor === "number" ? PHYS.steerTurnFloor : 0.78;
  let speedNorm =
    floor + (1 - floor) * Math.pow(clamp(speedRatio, 0, 1.05), 0.55);
  speedNorm = clamp(speedNorm, floor, 1.12);
  if (spd < 108) speedNorm *= PHYS.steerLowSpeedBoost;
  speedNorm = clamp(speedNorm, floor * 0.95, 1.18);
  let hiCut = 1;
  if (speedRatio > PHYS.steerHighSpeedStart) {
    const u =
      clamp(
        (speedRatio - PHYS.steerHighSpeedStart) /
          (1 - PHYS.steerHighSpeedStart),
        0,
        1,
      );
    hiCut = 1 + (PHYS.steerHighSpeedCut - 1) * u;
  }
  let turnAmt =
    P.steerBase *
    ins.steer *
    speedNorm *
    hiCut *
    dt;
  if (!K.drifting && Math.abs(ins.steer) > 0.12 && spd > 20) {
    const loss =
      P.turnFriction * Math.abs(ins.steer) * (spd / P.maxSpeed) * dt;
    const vm = spd - loss;
    if (vm > 0) {
      K.vx = (K.vx / spd) * vm;
      K.vy = (K.vy / spd) * vm;
    }
  }
  if (K.drifting) turnAmt *= 1.18;
  if (K.spinT > 0) turnAmt *= 0.25;
  K.heading += turnAmt;

  const nfx = Math.cos(K.heading);
  const nfy = Math.sin(K.heading);
  const nlx = -nfy;
  const nly = nfx;

  /** Accel */
  if (K.spinT <= 0) {
    if (ins.gas) {
      K.vx += nfx * P.accel * dt;
      K.vy += nfy * P.accel * dt;
    }
    if (ins.brake) {
      const vm = Math.hypot(K.vx, K.vy);
      if (vm > 1) {
        const drop = PHYS.brake * dt;
        const f = Math.max(0, vm - drop) / vm;
        K.vx *= f;
        K.vy *= f;
      }
    }
  }

  /** Grass drag */
  if (surface === "grass") {
    let drag = PHYS.grassDrag;
    if (game?.trackId === "neo-snake-gp" || game?.trackId === "lava-serpent") drag *= 1.35;
    const f = Math.max(0, 1 - drag * dt);
    K.vx *= f;
    K.vy *= f;
  }

  /** Align velocity with heading (grip) */
  const nspd = Math.hypot(K.vx, K.vy);
  const fspd = K.vx * nfx + K.vy * nfy;
  const lspd = K.vx * nlx + K.vy * nly;
  const targetX = nfx * fspd + nlx * lspd * (K.drifting ? 0.88 : 0.25);
  const targetY = nfy * fspd + nly * lspd * (K.drifting ? 0.88 : 0.25);
  const bl = 1 - Math.exp(-grip * dt);
  K.vx += (targetX - K.vx) * bl;
  K.vy += (targetY - K.vy) * bl;

  /** Cap speed */
  const ns = Math.hypot(K.vx, K.vy);
  /** Decay temporary boost cap. */
  if ((K.boostT ?? 0) > 0) {
    K.boostT -= dt;
    if (K.boostT <= 0) {
      K.boostT = 0;
      K.boostCapMul = 0;
      K.boostFlameTier = 0;
    }
  }
  const capBoost = 1 + (K.boostCapMul ?? 0);
  const aiCapBoost = 1 + (K.aiCapMul ?? 0);
  const cap = P.maxSpeed * maxMul * capBoost * aiCapBoost;
  if (ns > cap && ns > 1) {
    const f = cap / ns;
    K.vx *= f;
    K.vy *= f;
  }

  /** Drift gauge */
  if (K.drifting && ns > PHYS.driftMinSpeed) {
    K.driftGauge = clamp(
      /** Linear in time held drifting (no slip/angle weighting). */
      K.driftGauge + P.driftFill * dt,
      0,
      PHYS.driftGaugeMax,
    );
  } else if (!ins.drift && wasDrifting) {
    const g = clamp(K.driftGauge ?? 0, 0, 1);
    const tier = driftTierFromGauge(K.driftGauge ?? 0);
    if (tier > 0) {
      const burst =
        tier === 3
          ? (P.driftBurst3 ?? 118)
          : tier === 2
            ? (P.driftBurst2 ?? 86)
            : (P.driftBurst1 ?? 56);
      applyBoostImpulse(K, burst);
      applyTimedBoost(K, 0.16 + 0.04 * tier, 0.42 + 0.12 * tier, tier);
      K.driftReleaseTier = tier;
      K.driftFlameT = Math.max(K.driftFlameT ?? 0, 0.22);
      K.driftFlameStrength = Math.max(K.driftFlameStrength ?? 0, 0.35 + 0.2 * tier);
    } else {
      K.driftReleaseTier = 0;
    }
    K.driftGauge = 0;
  } else if (!K.drifting) {
    K.driftGauge = Math.max(0, K.driftGauge - dt * 0.45);
  }

  K.x += K.vx * dt;
  K.y += K.vy * dt;

  // Road barrier only for point-to-point / endless modes.
  // In GP4/GP5, allow driving off-road (pink/molten) but it slows you (grass surface).
  const useRoadBarrier = game?.mode === "touge" || game?.mode === "endless";
  if (
    game &&
    K === game.kart &&
    ins.drift &&
    snakeDriftDistanceMode(game) &&
    kartOnSnakeTrackBarrier(game, K.x, K.y, K.trackIdx ?? 0, useRoadBarrier)
  ) {
    resetCurrentDriftChain(game, K);
  }
  const col = useRoadBarrier
    ? resolveRoadBarrierCollision(K.x, K.y, K.vx, K.vy, K.trackIdx ?? 0, game)
    : resolveWallCollision(K.x, K.y, K.vx, K.vy, K.trackIdx ?? 0);
  K.x = col.x;
  K.y = col.y;
  K.vx = col.vx;
  K.vy = col.vy;
  K.trackIdx = col.idx ?? K.trackIdx;
}

/**
 * Bottom-right course map inside MapRing.png — circular clip, road from `tr.pts`.
 */
function drawGpCourseMinimap(ctx, game) {
  if (game.phase !== "racing" && game.phase !== "finished") return;
  const okMode =
    game.mode === "grandprix" ||
    game.mode === "admin" ||
    game.mode === "practice" ||
    game.mode === "daily";
  if (!okMode || !TRACK_IDS.includes(game.trackId)) return;

  const tr = getTrack();
  if (tr.closed === false || !tr.pts?.length) return;

  const pts = tr.pts;
  const wv = game.viewW;
  const hv = game.viewH;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const tcx = (minX + maxX) * 0.5;
  const tcy = (minY + maxY) * 0.5;
  const Ww = Math.max(maxX - minX, 200);
  const Hh = Math.max(maxY - minY, 200);
  const padW = (tr.widths?.wall ?? 150) * 2.1;

  const touchMap = resolveRaceMinimapLayout(game.canvas, wv, hv);
  if (!touchMap) return;
  const { outerD, outerR, x0, y0, cxScreen, cyScreen, mapCy } = touchMap;
  const innerR = outerR * MAP_RING_INNER_RADIUS_FRAC;
  const fillR = innerR + MAP_RING_FILL_BLEED_PX;
  const innerPad = 4;
  const drawD = innerR * 2 - innerPad * 2;
  const scale = Math.min(drawD / (Ww + padW), drawD / (Hh + padW));

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.beginPath();
  ctx.arc(cxScreen, mapCy, fillR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8, 14, 22, 0.94)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cxScreen, mapCy, innerR, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(cxScreen, mapCy);
  ctx.scale(scale, scale);
  ctx.translate(-tcx, -tcy);

  const roadHalf = tr.widths?.road ?? 86;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = "rgba(38, 42, 50, 0.72)";
  ctx.lineWidth = roadHalf * 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = Math.max(1.6, 2.4 / scale);
  ctx.stroke();

  const fidx = tr.finishIdx ?? 0;
  const fp = pts[fidx] ?? pts[0];
  const nn = Math.hypot(fp.nx, fp.ny) || 1;
  const fnx = fp.nx / nn;
  const fny = fp.ny / nn;
  const ftLen = 48;
  ctx.strokeStyle = "rgba(255, 70, 210, 0.92)";
  ctx.lineWidth = Math.max(1, 2 / scale);
  ctx.beginPath();
  ctx.moveTo(fp.x - fnx * ftLen, fp.y - fny * ftLen);
  ctx.lineTo(fp.x + fnx * ftLen, fp.y + fny * ftLen);
  ctx.stroke();

  const pr = Math.max(2.4, 3.6 / scale);
  ctx.fillStyle = "#ffd54a";
  ctx.beginPath();
  ctx.arc(game.kart.x, game.kart.y, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.38)";
  ctx.lineWidth = Math.max(0.55, 0.95 / scale);
  ctx.stroke();

  for (const o of game.opponents ?? []) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    ctx.fillStyle = "rgba(130, 200, 255, 0.88)";
    ctx.beginPath();
    ctx.arc(o.x, o.y, pr * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const ring = getMapRingImage();
  if (ring?.complete && ring.naturalWidth > 0) {
    ctx.drawImage(ring, x0, y0, outerD, outerD);
  } else {
    ctx.beginPath();
    ctx.arc(cxScreen, cyScreen, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cxScreen, cyScreen, innerR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.font = '700 11px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 4;
  if (!touchMap.fromDomSlot) {
    ctx.fillText(
      String(tr.name ?? game.trackId).toUpperCase(),
      cxScreen,
      y0 - 4,
    );
  }
  ctx.shadowBlur = 0;

  ctx.restore();
}

/** Half-width extension beyond `widths.road` for GP ribbon kerbs (matches legacy curb band). */
function ribbonCurbDepth(tr) {
  const road = tr.widths.road ?? 86;
  const grass = tr.widths.grass ?? road + 18;
  return clamp(Math.min(8, (grass - road) * 0.55), 4, 10);
}

function drawTrackCurbs(ctx, tr, neonTouge) {
  if (neonTouge) return;
  /** GP ribbons: solid kerb ring is drawn under asphalt in `drawGrassAndTrack` (same stroke geometry). */
  if (TRACK_IDS.includes(tr.id)) return;
  const pts = tr.pts;
  const n = pts.length;
  if (n < 4) return;

  const closed = tr.closed !== false;
  const road = tr.widths.road ?? 86;
  const grass = tr.widths.grass ?? road + 18;
  const curbDepth = ribbonCurbDepth(tr);
  const stripeLen = 10;
  const RED = "#c92a2a";
  const WHITE = "#f1f1f1";

  ctx.save();

  /** Ribbon tracks ship per-sample `nx,ny` (smooth with dense sampling). Densified x,y-only polylines
   *  recompute chord normals → zigzag offset → self-overlapping strokes on tight inner bends. */
  const useRibbonNormals =
    pts[0] != null && typeof pts[0].nx === "number" && typeof pts[0].ny === "number";
  const curbPts = useRibbonNormals
    ? pts
    : closed
      ? densifyClosedPolylineForCurbs(pts, 18, 0.9992)
      : densifyOpenPolylineForCurbs(pts, 18, 0.9992);
  const nc = curbPts.length;
  if (nc < 4) {
    ctx.restore();
    return;
  }

  /** Closed: dashed stroke on offset midline — no stacked quads at vertices. */
  if (closed && drawTrackCurbsClosedDashedStroke(ctx, curbPts, nc, road, curbDepth, stripeLen, RED, WHITE)) {
    ctx.restore();
    return;
  }

  const stripeStep = stripeLen;
  let sAcc = 0;
  const segCount = closed ? nc : nc - 1;
  for (let i = 0; i < segCount; i++) {
    const j = closed ? (i + 1) % nc : i + 1;
    const A = curbPts[i];
    const B = curbPts[j];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const segL = Math.hypot(dx, dy) || 1;
    if (segL < 1.25) continue;
    const snx = -dy / segL;
    const sny = dx / segL;
    let d = 0;
    while (d < segL - 1e-6) {
      const d1 = Math.min(segL, d + stripeLen);
      const u0 = d / segL;
      const u1 = d1 / segL;
      const x0 = A.x + dx * u0;
      const y0 = A.y + dy * u0;
      const x1 = A.x + dx * u1;
      const y1 = A.y + dy * u1;
      const stripeIdx = Math.floor((sAcc + d) / stripeLen);
      const fill = stripeIdx % 2 === 0 ? RED : WHITE;
      for (const sgn of [-1, 1]) {
        const ox0 = x0 + snx * road * sgn;
        const oy0 = y0 + sny * road * sgn;
        const ox1 = x1 + snx * road * sgn;
        const oy1 = y1 + sny * road * sgn;
        const ix0 = x0 + snx * (road + curbDepth) * sgn;
        const iy0 = y0 + sny * (road + curbDepth) * sgn;
        const ix1 = x1 + snx * (road + curbDepth) * sgn;
        const iy1 = y1 + sny * (road + curbDepth) * sgn;
        ctx.beginPath();
        ctx.moveTo(ox0, oy0);
        ctx.lineTo(ox1, oy1);
        ctx.lineTo(ix1, iy1);
        ctx.lineTo(ix0, iy0);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      d += stripeStep;
    }
    sAcc += segL;
  }
  ctx.restore();
}

/**
 * Kerb as dashed stroke on the curb midline — avoids overlapping filled quads at vertices.
 * When `pts[i].nx/ny` exist (ribbon runtime), the midline uses those normals instead of chord
 * normals so tight bends do not zigzag and self-overlap.
 * @returns {boolean}
 */
function drawTrackCurbsClosedDashedStroke(ctx, pts, n, road, curbDepth, stripeLen, RED, WHITE) {
  const half = road + curbDepth * 0.5;
  ctx.lineJoin = "bevel";
  ctx.lineCap = "butt";
  ctx.miterLimit = 2;
  ctx.lineWidth = curbDepth;

  const vertexNormals =
    pts[0] != null && typeof pts[0].nx === "number" && typeof pts[0].ny === "number";

  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    let moved = false;
    if (vertexNormals) {
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const px = p.x + p.nx * half * sgn;
        const py = p.y + p.ny * half * sgn;
        if (!moved) {
          ctx.moveTo(px, py);
          moved = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = pts[i].x;
        const ay = pts[i].y;
        const bx = pts[j].x;
        const by = pts[j].y;
        const dx = bx - ax;
        const dy = by - ay;
        const L = Math.hypot(dx, dy);
        if (L < 1e-4) continue;
        const nx = (-dy / L) * half * sgn;
        const ny = (dx / L) * half * sgn;
        const px = ax + nx;
        const py = ay + ny;
        const qx = bx + nx;
        const qy = by + ny;
        if (!moved) {
          ctx.moveTo(px, py);
          moved = true;
        } else {
          ctx.lineTo(px, py);
        }
        ctx.lineTo(qx, qy);
      }
    }
    if (!moved) return false;
    ctx.closePath();

    ctx.setLineDash([stripeLen, stripeLen]);
    ctx.strokeStyle = RED;
    ctx.lineDashOffset = 0;
    ctx.stroke();
    ctx.strokeStyle = WHITE;
    ctx.lineDashOffset = stripeLen;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return true;
}

/** cos ≈ 1 = straight run; smaller = sharper bend → extra curb subdivisions there. */
function turnCosAtPolyline(pts, i, n, closed) {
  const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
  const j = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  if (ip === i || j === i) return 1;
  const v1x = pts[i].x - pts[ip].x;
  const v1y = pts[i].y - pts[ip].y;
  const v2x = pts[j].x - pts[i].x;
  const v2y = pts[j].y - pts[i].y;
  const l1 = Math.hypot(v1x, v1y) || 1;
  const l2 = Math.hypot(v2x, v2y) || 1;
  const u1x = v1x / l1;
  const u1y = v1y / l1;
  const u2x = v2x / l2;
  const u2y = v2y / l2;
  return u1x * u2x + u1y * u2y;
}

/** Extra vertices so curb quads meet gentle bends (length **and** corner angle). */
function densifyClosedPolylineForCurbs(pts, maxEdgeLen, minCos = 0.9985) {
  const maxL = Math.max(14, maxEdgeLen);
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i].x;
    const ay = pts[i].y;
    const bx = pts[j].x;
    const by = pts[j].y;
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let steps = Math.max(1, Math.ceil(L / maxL));
    const c = turnCosAtPolyline(pts, j, n, true);
    if (c < minCos) steps = Math.max(steps, 6);
    if (c < 0.97) steps = Math.max(steps, 12);
    if (c < 0.88) steps = Math.max(steps, 20);
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push({ x: ax + dx * u, y: ay + dy * u });
    }
  }
  return out;
}

function densifyOpenPolylineForCurbs(pts, maxEdgeLen, minCos = 0.9985) {
  const maxL = Math.max(14, maxEdgeLen);
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[i].x;
    const ay = pts[i].y;
    const bx = pts[i + 1].x;
    const by = pts[i + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let steps = Math.max(1, Math.ceil(L / maxL));
    const jj = i + 1;
    if (jj > 0 && jj < n - 1) {
      const c = turnCosAtPolyline(pts, jj, n, false);
      if (c < minCos) steps = Math.max(steps, 6);
      if (c < 0.97) steps = Math.max(steps, 12);
      if (c < 0.88) steps = Math.max(steps, 20);
    }
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push({ x: ax + dx * u, y: ay + dy * u });
    }
  }
  out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
  return out;
}

function drawGrassAndTrack(ctx, neonTouge) {
  const tr = getTrack();
  const pts = tr.pts;
  const closed = tr.closed !== false;
  const gpRibbon = TRACK_IDS.includes(tr.id);
  const path = getTrackPath(tr);
  const snakeKind = /** @type {any} */ (ctx.__neonSnakeFieldKind);
  const edgeBandVariant =
    snakeKind
      ? "neon"
      : neonTouge
        ? "grass"
        : (/** @type {any} */ (ctx.__edgeBandVariant) || "grass");
  const gpTarmac = gpRibbon && !neonTouge;
  /** All GP variants now use gray asphalt + gray kerb. Sand = lighter pair, grass = darker pair. */
  let gpRoadHex = "#4a4d52";
  let gpCurbHex = "#c92a2a";
  if (gpTarmac) {
    if (edgeBandVariant === "sand") {
      gpRoadHex = "#3a3e45";
      gpCurbHex = "#b8bcc2";
    } else {
      gpRoadHex = "#32363d";
      gpCurbHex = "#6b7078";
    }
  }

  /** grass background */
  // Background is filled in screen-space in `draw()` (water or neon gradient).
  // Here we only draw track geometry layers.

  /** GP ribbons: round joins read smoother on dense samples; bevel fights Catmull faceting. */
  if (gpRibbon && !neonTouge) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  } else {
    ctx.lineJoin = neonTouge ? "round" : "bevel";
    ctx.lineCap = neonTouge ? "round" : "butt";
  }
  // Lighter edge band (green/purple snake texture, or GP sand/grass patterns).
  if (snakeKind) {
    const p = getNeonSnakePattern(ctx, snakeKind, NEON_SNAKE_EDGE_TILE_SCALE);
    ctx.strokeStyle =
      p ?? (snakeKind === "purple" ? "#5a2868" : "#2c6a2c");
  } else {
    const p = getEdgeBandPattern(ctx, edgeBandVariant);
    ctx.strokeStyle = p ?? "#2c6a2c";
  }
  ctx.lineWidth = tr.widths.wall * 2;
  ctx.stroke(path);

  /**
   * GP ribbons: solid kerb band **under** the road stroke (same path + round joins).
   * Color comes from edge band variant (grass vs sand); see `gpCurbHex`.
   */
  if (gpTarmac) {
    const roadW = tr.widths.road ?? 86;
    const d = ribbonCurbDepth(tr);
    ctx.strokeStyle = gpCurbHex;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2 * (roadW + d);
    ctx.stroke(path);
  }

  /** road */
  if (neonTouge) {
    ctx.save();
    ctx.shadowColor = "rgba(125, 249, 255, 0.28)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(22, 28, 42, 0.92)";
  } else {
    ctx.strokeStyle = gpTarmac ? gpRoadHex : "#4a4d52";
  }
  if (gpRibbon && !neonTouge) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  } else {
    ctx.lineJoin = neonTouge ? "round" : "bevel";
    ctx.lineCap = neonTouge ? "round" : "butt";
  }
  ctx.lineWidth = tr.widths.road * 2;
  ctx.stroke(path);
  if (neonTouge) ctx.restore();

  drawTrackCurbs(ctx, tr, neonTouge);

  /** dashed centerline */
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = neonTouge ? "rgba(255, 245, 160, 0.26)" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = neonTouge ? 3.5 : 3;
  ctx.setLineDash([14, 18]);
  ctx.stroke(path);
  ctx.setLineDash([]);
}

function drawDecor(ctx, decor) {
  for (const r of decor.rocks) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.fillStyle = r.otter ? "#6a6a78" : "#6b6f78";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-r.s, r.s * 0.2);
    ctx.lineTo(r.s * 0.4, -r.s * 0.6);
    ctx.lineTo(r.s * 0.6, r.s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (r.otter) {
      ctx.fillStyle = "#c48a5a";
      ctx.beginPath();
      ctx.arc(0, -r.s * 0.15, r.s * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const t of decor.trees) {
    ctx.fillStyle = "#2d4a30";
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - t.s);
    ctx.lineTo(t.x + t.s * 0.45, t.y + t.s * 0.15);
    ctx.lineTo(t.x - t.s * 0.45, t.y + t.s * 0.15);
    ctx.fill();
    ctx.fillStyle = "#4a3826";
    ctx.fillRect(t.x - 3, t.y + t.s * 0.12, 6, t.s * 0.35);
  }
}

function drawBoostPads(ctx, pads) {
  if (!pads?.length) return;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.lineCap = "round";
  for (const p of pads) {
    const w = (p.r ?? 36) * 1.55;
    const hot = p.cooldown > 0;
    const g = ctx.createLinearGradient(p.sx, p.sy, p.ex, p.ey);
    if (hot) {
      g.addColorStop(0, "rgba(255, 245, 160, 0.15)");
      g.addColorStop(0.5, "rgba(255, 220, 80, 0.22)");
      g.addColorStop(1, "rgba(255, 245, 160, 0.15)");
    } else {
      g.addColorStop(0, "rgba(125, 249, 255, 0.18)");
      g.addColorStop(0.5, "rgba(58, 203, 255, 0.26)");
      g.addColorStop(1, "rgba(125, 249, 255, 0.18)");
    }

    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(p.ex, p.ey);
    ctx.stroke();

    /** Subtle rim */
    ctx.strokeStyle = hot
      ? "rgba(255, 240, 140, 0.35)"
      : "rgba(190, 250, 255, 0.32)";
    ctx.lineWidth = Math.max(1, w * 0.14);
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(p.ex, p.ey);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickup(ctx, p, oy, pulse) {
  /** Static ground shadow (no bob, no rotation). */
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha *= 0.32;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const sw =
    p.type === "banana" ? 7.8
    : p.type === "shell" ? 8.5
    : p.type === "goldenShell" ? 4.8
    : p.type === "mystery" ? 8.2
    : 7.2;
  const sh =
    p.type === "banana" ? 3.2
    : p.type === "shell" ? 3.6
    : p.type === "goldenShell" ? 2.1
    : p.type === "mystery" ? 3.4
    : 3.0;
  ctx.beginPath();
  ctx.ellipse(0, 9, sw, sh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, p.y + oy);
  if (p.type === "shell") {
    const art = getTrackItemArt();
    const t = Math.sin(pulse) * 0.5 + 0.5;
    ctx.rotate(Math.sin(pulse * 0.6) * 0.35);
    const ok = drawSpriteCentered(
      ctx,
      art.shell,
      (22 + t * 2) / 1.5,
      (16 + t * 1.5) / 1.5,
      0.98,
    );
    if (!ok) {
      ctx.fillStyle = "#c8eae9";
      ctx.beginPath();
      ctx.arc(0, 0, 10 + Math.sin(pulse) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.type === "goldenShell") {
    const art = getTrackItemArt();
    const t = Math.sin(pulse) * 0.5 + 0.5;
    ctx.rotate(Math.sin(pulse * 0.55) * 0.28);
    ctx.save();
    ctx.shadowColor = "rgba(255, 220, 120, 0.65)";
    ctx.shadowBlur = 22;
    const ok = drawSpriteCentered(
      ctx,
      art.goldenShell,
      (24 + t * 2) / 2,
      (18 + t * 2) / 2,
      0.98,
    );
    ctx.restore();
    if (!ok) {
      ctx.fillStyle = "#ffd36a";
      ctx.beginPath();
      ctx.arc(0, 0, (11 + Math.sin(pulse) * 1.8) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.type === "banana") {
    const art = getTrackItemArt();
    ctx.rotate(Math.sin(pulse * 0.8) * 0.25);
    const ok = drawSpriteCentered(ctx, art.banana, 19, 19, 0.98);
    if (!ok) {
      ctx.fillStyle = "#f3e05b";
      ctx.beginPath();
      ctx.arc(3, -2, 9, Math.PI * 0.35, Math.PI * 2.1);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.stroke();
    }
  } else if (p.type === "mystery") {
    const art = getTrackItemArt();
    // Static mystery box on track (no wobble / no shake).
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.22)";
    ctx.shadowBlur = 12;
    const ok = drawSpriteCentered(ctx, art.mysteryBox, 16, 16, 0.98);
    ctx.restore();
    if (!ok) {
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -10, 20, 20);
      ctx.fillStyle = "#1a1208";
      ctx.font = "bold 14px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 1);
    }
  } else {
    const art = getTrackItemArt();
    const t = Math.sin(pulse) * 0.5 + 0.5;
    ctx.rotate(Math.sin(pulse * 0.7) * 0.2);
    const ok = drawSpriteCentered(ctx, art.lightning, 18 + t * 2, 24 + t * 2, 0.98);
    if (!ok) {
      const g = ctx.createLinearGradient(-10, -6, 10, 10);
      g.addColorStop(0, "#7df9ff");
      g.addColorStop(1, "#3acbff");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 3);
      ctx.lineTo(0, 9);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBananaGround(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  const art = getTrackItemArt();
  const ok = drawSpriteCentered(ctx, art.bananaPeel, 30, 30, 0.96);
  if (!ok) {
    ctx.fillStyle = "#e8cf4a";
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOffscreenArrow(ctx, wx, wy, camX, camY, zoom, w, h) {
  const sx = (wx - camX) * zoom + w * 0.5;
  const sy = (wy - camY) * zoom + h * 0.5;
  const pad = 26;
  if (sx >= pad && sx <= w - pad && sy >= pad && sy <= h - pad) return;

  const cx = w * 0.5;
  const cy = h * 0.5;
  const dx = sx - cx;
  const dy = sy - cy;
  const ang = Math.atan2(dy, dx);

  const rx = (w * 0.5 - pad) / Math.max(Math.abs(Math.cos(ang)), 1e-6);
  const ry = (h * 0.5 - pad) / Math.max(Math.abs(Math.sin(ang)), 1e-6);
  const r = Math.min(rx, ry);
  const px = cx + Math.cos(ang) * r;
  const py = cy + Math.sin(ang) * r;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.globalAlpha = 0.9;

  ctx.fillStyle = "rgba(157,232,255,0.95)";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  const t = denom > 1e-9 ? clamp((apx * abx + apy * aby) / denom, 0, 1) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function rotateLapSamplesToFinish(raw, lapTime, finishLine, finishSnap) {
  if (!raw?.length) return [];
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    const d =
      finishSnap?.x != null
        ? Math.hypot(o.x - finishSnap.x, o.y - finishSnap.y)
        : distPointToSegment(
            o.x,
            o.y,
            finishLine.x1,
            finishLine.y1,
            finishLine.x2,
            finishLine.y2,
          );
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }

  const tStart = raw[bestI].t;
  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const i = (bestI + k) % raw.length;
    const o = raw[i];
    let t = o.t;
    if (i < bestI) t += lapTime;
    out.push({
      t: Math.max(0, t - tStart),
      x: o.x,
      y: o.y,
      h: o.h,
    });
  }
  /** Ensure first sample is exactly t=0 */
  if (out.length) out[0].t = 0;
  return out;
}

function sealLoopAtFinish(samples, lapTime, finishSnap) {
  if (!samples?.length) return [];
  const fx = finishSnap?.x ?? samples[0].x;
  const fy = finishSnap?.y ?? samples[0].y;
  const fh = finishSnap?.h ?? samples[0].h;

  /** Force an exact shared seam at finish so looping can’t jump. */
  const out = [
    { t: 0, x: fx, y: fy, h: fh },
    ...samples.filter((s) => s.t > 0.0005 && s.t < lapTime - 0.0005),
    { t: lapTime, x: fx, y: fy, h: fh },
  ];
  return out;
}

function makeOpponents(count, playerKartId) {
  const looks = pickCpuAppearances(playerKartId, count);
  const out = [];
  for (let i = 0; i < count; i++) {
    const lk = looks[i];
    out.push({
      id: `cpu${i}`,
      kartId: lk.kart,
      hatId: lk.hat,
      eyeId: lk.eye,
      hull: lk.hull,
      fur: lk.fur,
      trackIdx: 0,
      /** Core kart state */
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      driftGauge: 0,
      drifting: false,
      steerSmoothed: 0,
      spinT: 0,
      /** Items (mystery boxes only — none at race start) */
      bananasInv: 0,
      boostsInv: 0,
      rocksInv: 0,
      /** Personality */
      wobble: Math.random() * Math.PI * 2,
      thinkT: 0,
      nextBananaT: 1.5 + Math.random() * 1.5,
      nextBoostT: 1.2 + Math.random() * 1.8,
      // Dynamic racing line (keeps CPUs from feeling robotic).
      lineLat: 0,
      lineLatTarget: (Math.random() * 2 - 1) * 26,
      lineT: 0,
    });
    attachKartPhys(out[out.length - 1]);
  }
  return out;
}

function makeOpponentsFromLooks(looks) {
  const out = [];
  for (let i = 0; i < (looks?.length ?? 0); i++) {
    const lk = looks[i];
    out.push({
      id: `cpu${i}`,
      kartId: lk.kart,
      hatId: lk.hat,
      eyeId: lk.eye,
      hull: lk.hull,
      fur: lk.fur,
      trackIdx: 0,
      /** Core kart state */
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      driftGauge: 0,
      drifting: false,
      steerSmoothed: 0,
      spinT: 0,
      /** Items (mystery boxes only — none at race start) */
      bananasInv: 0,
      boostsInv: 0,
      rocksInv: 0,
      /** Personality */
      wobble: Math.random() * Math.PI * 2,
      thinkT: 0,
      nextBananaT: 1.5 + Math.random() * 1.5,
      nextBoostT: 1.2 + Math.random() * 1.8,
      // Dynamic racing line (keeps CPUs from feeling robotic).
      lineLat: 0,
      lineLatTarget: (Math.random() * 2 - 1) * 26,
      lineT: 0,
    });
    attachKartPhys(out[out.length - 1]);
  }
  return out;
}

/** Mystery boxes / CPU item use only after the grid clears (avoids start-line grabs). */
function raceCombatStarted(game, forCpu = false) {
  const grace = forCpu ? MYSTERY_BOX_CPU_GRACE_S : MYSTERY_BOX_PLAYER_GRACE_S;
  return !!game.started && (game.raceTime ?? 0) >= grace;
}

function stepOpponents(opps, dt, game) {
  if (!opps?.length) return;
  const tr = getTrack();
  const pts = tr.pts;
  // GP#4 deep clean: drive lava-serpent exactly like neo-snake-gp (no extra hacks).
  const neoGp = pursuitGpTrack(game?.trackId);
  const lavaGp = false;
  const mixAng = (a, b, t) => a + wrapAngleRad(b - a) * clamp(t, 0, 1);
  for (const o of opps) {
    o.wobble += dt * 1.1;
    applyKartSpinWobble(o, dt);

    if ((o.nextMysteryT ?? 0) > 0)
      o.nextMysteryT = Math.max(0, o.nextMysteryT - dt);
    if ((o.mysteryRollT ?? 0) > 0) {
      o.mysteryRollT = Math.max(0, o.mysteryRollT - dt);
      if (o.mysteryRollT <= 0) {
        applyCpuMysteryItem(o, o.mysteryPendingItem || rollCpuMysteryItem());
        o.mysteryPendingItem = "";
        o.nextMysteryT = CPU_MYSTERY_BOX_COOLDOWN_S;
      }
    }

    const spd = Math.hypot(o.vx, o.vy);
    // IMPORTANT: On tight/curvy tracks, advancing trackIdx by velocity can desync and
    // make CPUs "turn early" or wedge into corners. Instead, re-anchor to nearest sample.
    const srf = surfaceAt(o.x, o.y, o.trackIdx ?? 0);
    o.trackIdx = srf.idx;
    const cur = pts[o.trackIdx ?? 0] ?? pts[0];

    // Hard recovery: if on grass/wall, steer aggressively back toward pavement
    // and avoid drifting until we're stable again.
    const offroad = srf.surface !== "pavement";

    const lookN =
      (neoGp ? 18 : 18) +
      Math.floor(clamp(spd / (neoGp ? 19 : 18), 0, neoGp ? 12 : 18));
    const target = pts[(o.trackIdx + lookN) % pts.length];

    /** small lane offsets so they don't overlap perfectly (use track normal) */
    const lane =
      (o.id.endsWith("0") ? -0.55 : o.id.endsWith("1") ? 0.55 : 0) *
      KART_RADIUS *
      5.2;
    // Add subtle, continuous line variation so CPUs don't feel on-rails.
    const wobLane = clamp(Math.sin(o.wobble * 0.65) * 18, -22, 22);
    const ox = target.nx * lane;
    const oy = target.ny * lane;
    const ox2 = target.nx * wobLane;
    const oy2 = target.ny * wobLane;

    const tx = target.x + ox + ox2;
    const ty = target.y + oy + oy2;

    const desiredPoint = Math.atan2(ty - o.y, tx - o.x);
    const desiredTan = Math.atan2(target.ty ?? 0, target.tx ?? 1);
    const desired = neoGp ? mixAng(desiredPoint, desiredTan, 0.35) : desiredPoint;
    const diff = wrapAngleRad(desired - o.heading);

    const steerTarget = clamp(diff * (neoGp ? 1.22 : 1.35), -1, 1);
    const sk = 1 - Math.exp(-PHYS.steerResponse * dt);
    o.steerSmoothed += (steerTarget - o.steerSmoothed) * sk;

    const gas = o.spinT <= 0;
    // GP CPU pace boost: GP4 (neo-snake) only — GP5 uses player-equivalent caps.
    o.aiCatchupT = Math.max(0, (o.aiCatchupT ?? 0) - dt);
    let baseCap = 0;
    if (gpStyleEffects(game) && game?.trackId === "neo-snake-gp") baseCap = 0.10;
    const catchupCap =
      (o.aiCatchupT ?? 0) > 0 && game?.trackId === "neo-snake-gp" ? 0.10 : 0;
    const capMax = game?.trackId === "neo-snake-gp" ? 0.20 : 0;
    o.aiCapMul = Math.min(capMax, baseCap + catchupCap);
    const wantDrift = Math.abs(diff) > (neoGp ? 0.58 : 0.55);
    const drift =
      neoGp
        ? // Slightly more willing to drift so it looks less robotic.
          (Math.abs(diff) > 0.54 && spd > 112) || (Math.abs(diff) > 0.78 && spd > 94)
        : Math.abs(diff) > 0.55 && spd > 120;

    // GP#4 (lava-serpent): use a pure-pursuit controller so CPUs don't "turn early"
    // into the next bend before finishing the current one.
    if (pursuitGpTrack(game?.trackId)) {
      const L = tr.length || 1;
      const pCur = pts[o.trackIdx ?? 0] ?? pts[0];
      const pAheadSmall = pts[(o.trackIdx + 18) % pts.length] ?? pCur;
      const curv = Math.abs(
        wrapAngleRad(
          Math.atan2(pAheadSmall.ty ?? 0, pAheadSmall.tx ?? 1) -
            Math.atan2(pCur.ty ?? 0, pCur.tx ?? 1),
        ),
      );
      // Lookahead distance in *arc length* units.
      // Tight turns -> shorter lookahead; straights -> longer lookahead.
      let lookMax = 165;
      if (game?.trackId === "neo-snake-gp" || game?.trackId === "lava-serpent") lookMax = 178;
      else if (game?.trackId === "chicane" || game?.trackId === "s-bends") lookMax = 165;
      const curvTaper =
        game?.trackId === "neo-snake-gp"
          ? clamp(1.14 - curv * 0.9, 0.56, 1.14)
          : clamp(1.12 - curv * 1.05, 0.5, 1.12);
      const lookDist =
        clamp(85 + spd * 0.24, 80, lookMax) * curvTaper;
      const baseS = pCur.s ?? 0;
      // Wrap lookahead around the loop (fixes last-turn-before-finish mis-target).
      const aimS = (((baseS + lookDist) % L) + L) % L;
      const aimIdx = sampleIdxForS(tr, aimS, o.trackIdx ?? 0);
      const pAim = pts[aimIdx] ?? pCur;

      // neo-snake-gp: find a faster line without going wide into walls:
      // bias toward the inside of the upcoming turn (apexing), with small per-CPU variation.
      let lane = 0;
      if (
        game?.trackId === "neo-snake-gp" ||
        game?.trackId === "chicane" ||
        game?.trackId === "s-bends"
      ) {
        const t0x = pCur.tx ?? 1;
        const t0y = pCur.ty ?? 0;
        const t1x = pAim.tx ?? t0x;
        const t1y = pAim.ty ?? t0y;
        const cross = t0x * t1y - t0y * t1x;
        const turnSign = cross === 0 ? 0 : cross > 0 ? 1 : -1;
        // Faster line: stronger apexing, still clamped so they don't scrape the wall.
        // NOTE: track normals (nx,ny) point to the "left" of the tangent.
        // If the path is turning left (cross>0), the inside/apex is to the left => +nx.
        // So apex sign should match turnSign (not the opposite).
        const apex = (turnSign) * KART_RADIUS * 2.05 * clamp(curv / 0.75, 0, 1);
        const jitter = (o.id.endsWith("0") ? -1 : o.id.endsWith("1") ? 1 : 0) * KART_RADIUS * 0.45;
        const road = tr.widths.road ?? 80;
        const maxSafe = Math.max(8, road - KART_RADIUS * 1.25 - 14);
        lane = clamp(apex + jitter, -maxSafe, maxSafe);
      } else {
        // lava-serpent (GP5): also apex, but a bit safer (hazards + wider turns).
        const t0x = pCur.tx ?? 1;
        const t0y = pCur.ty ?? 0;
        const t1x = pAim.tx ?? t0x;
        const t1y = pAim.ty ?? t0y;
        const cross = t0x * t1y - t0y * t1x;
        const turnSign = cross === 0 ? 0 : cross > 0 ? 1 : -1;
        const apex = turnSign * KART_RADIUS * 1.55 * clamp(curv / 0.75, 0, 1);
        const jitter =
          (o.id.endsWith("0") ? -1 : o.id.endsWith("1") ? 1 : 0) * KART_RADIUS * 0.35;
        const road = tr.widths.road ?? 80;
        const maxSafe = Math.max(8, road - KART_RADIUS * 1.25 - 18);
        lane = clamp(apex + jitter, -maxSafe, maxSafe);
      }
      const ax = pAim.x + pAim.nx * lane;
      const ay = pAim.y + pAim.ny * lane;

      const desiredPoint = Math.atan2(ay - o.y, ax - o.x);
      const desiredTan = Math.atan2(pAim.ty ?? 0, pAim.tx ?? 1);
      const desired = mixAng(desiredPoint, desiredTan, 0.22);
      const diff2 = wrapAngleRad(desired - o.heading);

      const steerTarget2 = clamp(diff2 * 1.28, -1, 1);
      o.steerSmoothed += (steerTarget2 - o.steerSmoothed) * (1 - Math.exp(-PHYS.steerResponse * dt));

      // Corner-speed controller: slow *just enough* before turn-in so they carry speed through.
      const curvN = clamp(curv / 0.9, 0, 1);
      const oMax = o.phys?.maxSpeed ?? DEFAULT_KART_PHYS.maxSpeed;
      const targetSpeed =
        oMax *
        1.02 *
        (1 - 0.24 * curvN) *
        (1 - 0.10 * clamp(Math.abs(diff2) / 1.3, 0, 1));
      const brake =
        spd > targetSpeed + 10 &&
        (curvN > 0.18 || Math.abs(diff2) > 0.55);
      const drift2 =
        ((Math.abs(diff2) > 0.54 && spd > 106) || (curvN > 0.52 && spd > 98)) &&
        !brake;
      integrateKart(o, { gas, brake, steer: o.steerSmoothed, drift: drift2 }, dt, game);
    } else {
      // Default behavior for other tracks.
      integrateKart(o, { gas, brake: false, steer: o.steerSmoothed, drift }, dt, game);
    }

    /** Boost pads affect CPU too */
    if (
      surfaceAt(o.x, o.y, o.trackIdx ?? 0).surface !== "wall" &&
      checkBoostPad(o.x, o.y, KART_RADIUS, game.boostPads, dt)
    ) {
      applyBoostImpulse(o, PHYS.padBoost);
      applyTimedBoost(o, 0.26, 0.75);
    }

    /** CPU can pick up banana/boost pickups */
    for (const p of game.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < KART_RADIUS + 18) {
        p.taken = true;
      }
    }

    /** CPU mystery boxes: same 2s “roulette” delay as player, then cooldown. */
    if (
      raceCombatStarted(game, true) &&
      game.mysteryBoxes?.length &&
      (o.mysteryRollT ?? 0) <= 0 &&
      (o.nextMysteryT ?? 0) <= 0
    ) {
      for (const p of game.mysteryBoxes) {
        if (p.taken) continue;
        const d = Math.hypot(p.x - o.x, p.y - o.y);
        if (d < KART_RADIUS + 18) {
          p.taken = true;
          p.respawnT = 5.0;
          o.mysteryRollT = MYSTERY_BOX_ROULETTE_S;
          o.mysteryPendingItem = rollCpuMysteryItem();
          break;
        }
      }
    }

    /** Use items: occasionally drop banana, occasionally boost, rarely throw rock */
    if (!raceCombatStarted(game, true)) continue;
    o.nextBananaT -= dt;
    o.nextBoostT -= dt;
    o.nextRockT = (o.nextRockT ?? 1.2) - dt;
    const playerDx = game.kart.x - o.x;
    const playerDy = game.kart.y - o.y;
    const ahead = playerDx * Math.cos(o.heading) + playerDy * Math.sin(o.heading);
    const distP = Math.hypot(playerDx, playerDy);
    if (o.bananasInv > 0 && o.nextBananaT <= 0 && distP < 240 && ahead < -20) {
      o.bananasInv--;
      const bx = Math.cos(o.heading);
      const by = Math.sin(o.heading);
      game.bananas.push({
        x: o.x - bx * (KART_RADIUS + 26),
        y: o.y - by * (KART_RADIUS + 26),
        r: 11,
        t: 0,
      });
      o.nextBananaT = 1.7 + Math.random() * 2.0;
    }
    const oMaxBoost = o.phys?.maxSpeed ?? DEFAULT_KART_PHYS.maxSpeed;
    if (o.boostsInv > 0 && o.nextBoostT <= 0 && spd < oMaxBoost * 0.92) {
      o.boostsInv--;
      applyBoostImpulse(o, PHYS.itemBoostImpulse);
      applyTimedBoost(o, 0.2, 0.7);
      o.nextBoostT = 1.8 + Math.random() * 2.2;
    }
    if ((o.rocksInv ?? 0) > 0 && (o.nextRockT ?? 0) <= 0 && distP < 520 && ahead > 40) {
      o.rocksInv--;
      const sp = 720;
      const hx = Math.cos(o.heading);
      const hy = Math.sin(o.heading);
      game.rocks = game.rocks ?? [];
      game.rocks.push({
        x: o.x + hx * (KART_RADIUS + 18),
        y: o.y + hy * (KART_RADIUS + 18),
        vx: hx * sp + (o.vx ?? 0) * 0.35,
        vy: hy * sp + (o.vy ?? 0) * 0.35,
        t: 0,
        owner: "cpu",
        ownerId: o.id,
      });
      o.nextRockT = 2.2 + Math.random() * 2.6;
    }
  }
}

function nearestOpponentToPlayer(opps, px, py) {
  let best = null;
  let bestD = Infinity;
  for (const o of opps) {
    const d = Math.hypot(o.x - px, o.y - py);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function opponentAhead(k, opps) {
  const hx = Math.cos(k.heading ?? 0);
  const hy = Math.sin(k.heading ?? 0);
  let best = null;
  let bestD = Infinity;
  for (const o of opps ?? []) {
    const dx = (o.x ?? 0) - (k.x ?? 0);
    const dy = (o.y ?? 0) - (k.y ?? 0);
    const ahead = dx * hx + dy * hy;
    if (ahead < 40) continue;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function resolveKartCollisions(player, opps) {
  const all = [player, ...(opps ?? [])];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const A = all[i];
      const B = all[j];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1;
      const minD = KART_RADIUS * 2.05;
      if (d < minD) {
        const nx = dx / d;
        const ny = dy / d;
        const push = (minD - d) * 0.5;
        A.x -= nx * push;
        A.y -= ny * push;
        B.x += nx * push;
        B.y += ny * push;

        /** small velocity exchange along normal for a satisfying bump */
        const avn = A.vx * nx + A.vy * ny;
        const bvn = B.vx * nx + B.vy * ny;
        const jn = (bvn - avn) * 0.35;
        A.vx += jn * nx;
        A.vy += jn * ny;
        B.vx -= jn * nx;
        B.vy -= jn * ny;
      }
    }
  }
}

function makeStartGrid(spawn, n) {
  const fx = Math.cos(spawn.theta);
  const fy = Math.sin(spawn.theta);
  const rx = -fy;
  const ry = fx;
  const tr = getTrack();
  const roomy = tr?.id === "lava-serpent";
  const side = KART_RADIUS * (roomy ? 3.25 : 2.4);
  const back = KART_RADIUS * (roomy ? 3.35 : 2.65);
  const baseX = spawn.x;
  const baseY = spawn.y;

  /** 2x2 grid: [P][CPU0] / [CPU1][CPU2] */
  const pts = [
    { x: baseX - rx * side * 0.55, y: baseY - ry * side * 0.55, h: spawn.theta },
    { x: baseX + rx * side * 0.55, y: baseY + ry * side * 0.55, h: spawn.theta },
    { x: baseX - rx * side * 0.55 - fx * back, y: baseY - ry * side * 0.55 - fy * back, h: spawn.theta },
    { x: baseX + rx * side * 0.55 - fx * back, y: baseY + ry * side * 0.55 - fy * back, h: spawn.theta },
  ];
  return pts.slice(0, Math.max(1, n));
}

// thetaFromPos removed (ellipse-only).

function drawOtter(ctx, x, y, ang, alphaW, hullColor, furColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const ga = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
  ctx.globalAlpha = ga * (alphaW ?? 1);
  const hull = hullColor ?? "#ffe7c4";
  const fur = furColor ?? "#bd7f4f";
  /** Body */
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(0, -2, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(-4, 2, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(12, -1, 5, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12.5, 0.8, 1.9, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13.9, -0.2, 1.9, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();

  /** Wheels hint */
  ctx.fillStyle = "rgba(36,42,54,0.85)";
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      ctx.beginPath();
      ctx.arc(j * 7, i * 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
