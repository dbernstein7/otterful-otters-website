import { KART_SPRITE_WORLD_SPAN } from "./config.js";

/** Karts the CPU may use (no Rainbow — reserved for unlock) */
export const KART_IDS_STANDARD = [
  "OG",
  "Blue",
  "Green",
  "Pink",
  "Apechain",
  "Golden-Racer",
  "Banana",
  "Boat",
  "Hippie",
  "HotDog",
  "UFO",
];
export const KART_ID_RAINBOW = "Rainbow";
export const ALL_KART_IDS = [...KART_IDS_STANDARD, KART_ID_RAINBOW];

/** Garage / loadout — never includes shield-only sprites ({kart}Shield.png). */
export const GARAGE_KART_IDS = [...ALL_KART_IDS];

/** Demo session — subset of garage cosmetics */
export const DEMO_KART_IDS = ["OG", "Pink", "Blue", "Green"];
export const DEMO_HAT_IDS = ["None", "Cowboy", "Trucker", "Bucket", "Visor"];
export const DEMO_EYE_IDS = [
  "None",
  "Deal-With-It",
  "Monacle",
  "Star",
  "Stylish",
];

export function isShieldKartAssetName(name) {
  return typeof name === "string" && /shield$/i.test(name);
}

export function shieldKartAssetBasename(kartId) {
  if (!kartId || isShieldKartAssetName(kartId)) return "";
  return `${kartId}Shield`;
}

export const HAT_IDS = [
  "None",
  "Beach",
  "Beanie",
  "Birthday-Cake",
  "Bucket",
  "Conductor",
  "Cowboy",
  "Crown",
  "Frog",
  "Mad-Hotter",
  "Mushroom",
  "Pilot",
  "Pink-Cowgirl",
  "Pirate",
  "Propeller",
  "Sharky",
  "Trucker",
  "Vintage",
  "Visor",
];

export const EYE_IDS = [
  "None",
  "3D",
  "Aviator",
  "Checker",
  "Circle",
  "Dazzle",
  "Deal-With-It",
  "Flame-Visor",
  "Flames",
  "Green-Laser",
  "Heart",
  "Locked-In",
  "Monacle",
  "Neon",
  "Red-Laser",
  "Red-Laser-V2",
  "Shades",
  "Shudder",
  "Speedster",
  "Spikey",
  "Star",
  "Stars",
  "Steampunk",
  "Stunner",
  "Stylish",
  "Target",
  "Visor",
];

/** Solid-color fallback if PNGs fail (matches previous CPU palette) */
export const KART_FALLBACK = {
  Blue: { hull: "#b7f0ff", fur: "#2f4a5f" },
  Green: { hull: "#c9ffb7", fur: "#2f5a3a" },
  OG: { hull: "#ffe7c4", fur: "#bd7f4f" },
  Pink: { hull: "#ffb3e6", fur: "#5a3560" },
  Apechain: { hull: "#d9d3ff", fur: "#2e2a55" },
  "Golden-Racer": { hull: "#ffe59a", fur: "#6b4a12" },
  Banana: { hull: "#fff2a8", fur: "#4a3b12" },
  Boat: { hull: "#cbe7ff", fur: "#1f3d66" },
  Hippie: { hull: "#ffd9c6", fur: "#4f3b2f" },
  HotDog: { hull: "#ffcfb9", fur: "#5a2e22" },
  UFO: { hull: "#d5fff4", fur: "#214e45" },
  Rainbow: { hull: "#ffe7c4", fur: "#bd7f4f" },
};

export function characterAssetUrl(folder, basename) {
  // Allow "no hat" / "no glasses" choice in the UI.
  if (!basename || basename === "None")
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/Tr6K5kAAAAASUVORK5CYII=";
  return `./Character Select/${folder}/${basename}.png`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Assign distinct standard karts to each CPU (never Rainbow).
 * If the player uses a standard kart, CPUs use the other three.
 * If the player uses Rainbow, CPUs pick any three from the four.
 */
export function pickCpuAppearances(playerKart, count) {
  let pool = KART_IDS_STANDARD.filter((k) => k !== playerKart);
  if (pool.length < count) pool = [...KART_IDS_STANDARD];
  const karts = shuffle(pool).slice(0, count);
  const hats = shuffle([...HAT_IDS]);
  const eyes = shuffle([...EYE_IDS]);
  const out = [];
  for (let i = 0; i < count; i++) {
    const kart = karts[i];
    const fb = KART_FALLBACK[kart] ?? KART_FALLBACK.OG;
    out.push({
      kart,
      hat: hats[i % hats.length],
      eye: eyes[i % eyes.length],
      hull: fb.hull,
      fur: fb.fur,
    });
  }
  return out;
}

function loadImage(src, ms = 12000) {
  return new Promise((resolve) => {
    let settled = false;
    const tid = setTimeout(() => wrap(null), ms);
    function wrap(im) {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      resolve(im?.complete && im?.naturalWidth ? im : null);
    }
    const im = new Image();
    im.onload = () => wrap(im);
    im.onerror = () => wrap(null);
    im.src = src;
  });
}

/** @typedef {{ karts: Record<string, HTMLImageElement | null>, shieldKarts: Record<string, HTMLImageElement | null>, hats: Record<string, HTMLImageElement | null>, eyes: Record<string, HTMLImageElement | null> }} CharacterAtlas */

let atlasPromise = /** @type {Promise<CharacterAtlas> | null} */ (null);
let atlasCache = /** @type {CharacterAtlas | null} */ (null);

export function getCharacterAtlas() {
  return atlasCache;
}

export function loadCharacterAtlas() {
  if (atlasCache) return Promise.resolve(atlasCache);
  if (atlasPromise) return atlasPromise;
  atlasPromise = (async () => {
    const karts = {};
    const shieldKarts = {};
    const hats = {};
    const eyes = {};
    const jobs = [];
    for (const id of ALL_KART_IDS) {
      jobs.push(
        loadImage(characterAssetUrl("Karts", id)).then((img) => {
          karts[id] = img;
        }),
      );
      const shieldBase = shieldKartAssetBasename(id);
      if (shieldBase) {
        jobs.push(
          loadImage(characterAssetUrl("Karts", shieldBase)).then((img) => {
            shieldKarts[id] = img;
          }),
        );
      }
    }
    for (const id of HAT_IDS) {
      jobs.push(
        loadImage(characterAssetUrl("Hats", id)).then((img) => {
          hats[id] = img;
        }),
      );
    }
    for (const id of EYE_IDS) {
      jobs.push(
        loadImage(characterAssetUrl("Eyes", id)).then((img) => {
          eyes[id] = img;
        }),
      );
    }
    await Promise.all(jobs);
    atlasCache = { karts, shieldKarts, hats, eyes };
    return atlasCache;
  })();
  return atlasPromise;
}

/**
 * Layer order: kart body, eyewear, hat.
 */
export function drawKartLayers(
  ctx,
  x,
  y,
  ang,
  alphaW,
  kartId,
  eyeId,
  hatId,
  atlas,
  hullFallback,
  furFallback,
  drawOtterFn,
  opts,
) {
  const shieldActive = !!(opts && opts.shieldActive);
  const baseId =
    kartId && !isShieldKartAssetName(kartId) ? kartId : "OG";
  const shieldIm = shieldActive ? atlas?.shieldKarts?.[baseId] : null;
  const kart = shieldIm ?? atlas?.karts?.[baseId];
  const eyeIm = atlas?.eyes?.[eyeId];
  const hatIm = atlas?.hats?.[hatId];
  const hasKart =
    kart && kart.complete && kart.naturalWidth > 0;
  if (!hasKart) {
    drawOtterFn(ctx, x, y, ang, alphaW, hullFallback, furFallback);
    return;
  }

  /** PNGs face downward in bitmap space vs +x game forward (see drawOtter). */
  const spriteAng = ang - Math.PI / 2;
  const spriteSpan = KART_SPRITE_WORLD_SPAN;
  const head = Number.isFinite(ang) ? ang : 0;

  ctx.save();
  try {
    ctx.translate(x, y);

    /** Ground shadow (heading-aligned; drawn before sprite so it sits underneath). */
    if (Number.isFinite(spriteSpan) && spriteSpan > 0) {
      const rx = spriteSpan * (shieldActive ? 0.44 : 0.4);
      const ry = spriteSpan * (shieldActive ? 0.22 : 0.19);
      const fy = spriteSpan * 0.09;
      if (rx > 0 && ry > 0) {
        ctx.save();
        try {
          const ga = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
          ctx.globalAlpha = ga * (alphaW ?? 1) * (shieldActive ? 0.4 : 0.34);
          ctx.fillStyle = "rgba(0,0,0,0.58)";
          ctx.beginPath();
          ctx.ellipse(0, fy, rx, ry, head, 0, Math.PI * 2);
          ctx.fill();
        } catch {
          /* Bad radii/transform — skip shadow, keep drawing kart. */
        } finally {
          ctx.restore();
        }
      }
    }

    ctx.rotate(spriteAng);
    const ga =
      typeof ctx.globalAlpha === "number" ? ctx.globalAlpha : 1;
    ctx.globalAlpha = ga * (alphaW ?? 1);

    /** @param {HTMLImageElement | null | undefined} img */
    const blit = (img) => {
      if (!img?.complete || !img.naturalWidth) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = spriteSpan / Math.max(iw, ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
    };

    blit(kart);
    if (!shieldActive) {
      blit(eyeIm);
      blit(hatIm);
    }
  } finally {
    ctx.restore();
  }
}

export function kartHasShieldSprite(atlas, kartId) {
  const im = atlas?.shieldKarts?.[kartId];
  return !!(im && im.complete && im.naturalWidth > 0);
}
