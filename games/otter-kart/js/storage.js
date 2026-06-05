import {
  DEMO_EYE_IDS,
  DEMO_HAT_IDS,
  DEMO_KART_IDS,
  EYE_IDS,
  GARAGE_KART_IDS,
  HAT_IDS,
  isShieldKartAssetName,
  KART_FALLBACK,
  KART_ID_RAINBOW,
} from "./character.js";

let demoSessionActive = false;

const DEMO_PLAYER_ID_KEY = "otterkart:demoPlayerId";

export function setDemoSessionActive(active) {
  demoSessionActive = !!active;
}

export function isDemoSessionActive() {
  return demoSessionActive;
}

/** Stable anonymous id for demo leaderboard entries (no wallet). */
export function getDemoPlayerId() {
  try {
    let id = localStorage.getItem(DEMO_PLAYER_ID_KEY);
    if (!id || id.length < 8) {
      id = `d${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      localStorage.setItem(DEMO_PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return `d${Math.random().toString(36).slice(2, 14)}`;
  }
}

function clampToDemoList(list, value, fallback) {
  return validId(list, value, fallback);
}

export function clampLoadoutToDemo(loadout) {
  const kart = clampToDemoList(DEMO_KART_IDS, loadout.kart, "OG");
  const hat = clampToDemoList(DEMO_HAT_IDS, loadout.hat, "None");
  const eye = clampToDemoList(DEMO_EYE_IDS, loadout.eye, "None");
  const fb = KART_FALLBACK[kart] ?? KART_FALLBACK.OG;
  return { kart, hat, eye, hull: fb.hull, fur: fb.fur };
}

const PREFIX = "otterkart-v2";
const FALLBACK_LAPS = 3;
const KEY_LOADOUT = `${PREFIX}|loadout`;
const KEY_RAINBOW = `${PREFIX}|rainbowKartUnlocked`;

function safeParse(raw, fb) {
  try {
    if (!raw) return fb;
    return JSON.parse(raw);
  } catch {
    return fb;
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function loadGhost(mode, dateISO) {
  const key =
    mode === "daily"
      ? `${PREFIX}|daily:${dateISO}|ghost`
      : `${PREFIX}|practice|ghost`;
  return safeParse(localStorage.getItem(key), null);
}

export function saveGhost(mode, dateISO, data) {
  const key =
    mode === "daily"
      ? `${PREFIX}|daily:${dateISO}|ghost`
      : `${PREFIX}|practice|ghost`;
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadLeaderboard(mode, dateISO) {
  const key =
    mode === "daily"
      ? `${PREFIX}|daily:${dateISO}|lb`
      : `${PREFIX}|practice|lb`;
  return safeParse(localStorage.getItem(key), []);
}

export function isRainbowKartUnlocked() {
  return localStorage.getItem(KEY_RAINBOW) === "1";
}

/** @returns {boolean} true if this call newly unlocked */
export function tryUnlockRainbowKart() {
  if (localStorage.getItem(KEY_RAINBOW) === "1") return false;
  localStorage.setItem(KEY_RAINBOW, "1");
  return true;
}

function validId(list, x, fallback) {
  if (typeof x !== "string" || isShieldKartAssetName(x)) return fallback;
  return list.includes(x) ? x : fallback;
}

/**
 * @returns {{ kart: string, hat: string, eye: string, hull: string, fur: string }}
 */
export function loadLoadout() {
  const raw = safeParse(localStorage.getItem(KEY_LOADOUT), {});
  const rainbowOk = isRainbowKartUnlocked();
  // Migrate old kart ids to new ones (keeps existing players from seeing removed karts).
  if (raw?.kart === "Blue-Racer") raw.kart = "Apechain";
  let kart = validId(GARAGE_KART_IDS, raw.kart, "OG");
  if (kart === KART_ID_RAINBOW && !rainbowOk) kart = "OG";
  const hat = validId(HAT_IDS, raw.hat, "Beanie");
  const eye = validId(EYE_IDS, raw.eye, "Circle");
  const fb = KART_FALLBACK[kart] ?? KART_FALLBACK.OG;
  return { kart, hat, eye, hull: fb.hull, fur: fb.fur };
}

/** Player appearance for races / previews (demo clamps without rewriting storage). */
export function loadEffectiveLoadout() {
  const base = loadLoadout();
  return demoSessionActive ? clampLoadoutToDemo(base) : base;
}

export function saveLoadout({ kart, hat, eye }) {
  const cur = loadLoadout();
  let next = {
    kart: kart ?? cur.kart,
    hat: hat ?? cur.hat,
    eye: eye ?? cur.eye,
  };
  if (next.kart === KART_ID_RAINBOW && !isRainbowKartUnlocked())
    next.kart = "OG";
  if (isShieldKartAssetName(next.kart)) next.kart = "OG";
  if (demoSessionActive) {
    const clamped = clampLoadoutToDemo({
      ...cur,
      kart: next.kart,
      hat: next.hat,
      eye: next.eye,
    });
    next = { kart: clamped.kart, hat: clamped.hat, eye: clamped.eye };
  }
  localStorage.setItem(
    KEY_LOADOUT,
    JSON.stringify({ kart: next.kart, hat: next.hat, eye: next.eye }),
  );
}

export function saveLeaderboard(mode, dateISO, entries) {
  const key =
    mode === "daily"
      ? `${PREFIX}|daily:${dateISO}|lb`
      : `${PREFIX}|practice|lb`;
  localStorage.setItem(
    key,
    JSON.stringify(entries.slice(0, 12)),
  );
}

/** Persist leaderboard entry; update ghost only when improved samples exist */
export function commitRun({
  mode,
  dateISO,
  lapRecord,
  totalTime,
  shells,
  longestDrift,
  longestDriftTime,
}) {
  if (lapRecord?.samples?.length)
    saveGhost(mode, dateISO, {
      lapTime: lapRecord.lapTime,
      samples: lapRecord.samples,
    });

  const board = loadLeaderboard(mode, dateISO);
  const now = Date.now();
  const bl =
    lapRecord && Number.isFinite(lapRecord.lapTime)
      ? lapRecord.lapTime
      : totalTime / FALLBACK_LAPS;
  board.push(
    mode === "daily"
      ? {
          t: now,
          time: Number(totalTime.toFixed(3)),
          shells: Math.floor(Number(shells) || 0),
          longestDrift: Number((Number(longestDrift) || 0).toFixed(3)),
          longestDriftTime: Number((Number(longestDriftTime) || 0).toFixed(3)),
        }
      : {
          t: now,
          time: Number(totalTime.toFixed(3)),
          bestLap: Number(bl.toFixed(3)),
          shells,
        },
  );
  board.sort((a, b) => {
    if (mode === "daily") {
      const as = a.shells ?? 0;
      const bs = b.shells ?? 0;
      if (bs !== as) return bs - as;
      const ad = a.longestDrift ?? 0;
      const bd = b.longestDrift ?? 0;
      if (bd !== ad) return bd - ad;
      const atd = a.longestDriftTime ?? 0;
      const btd = b.longestDriftTime ?? 0;
      if (btd !== atd) return btd - atd;
      return (a.t ?? 0) - (b.t ?? 0);
    }
    const at = a.time ?? 1e9;
    const bt = b.time ?? 1e9;
    return at - bt;
  });
  saveLeaderboard(mode, dateISO, board);
}
