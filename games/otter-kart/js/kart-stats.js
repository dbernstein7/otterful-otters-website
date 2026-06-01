import { PHYS } from "./config.js";

/** @typedef {{ speed: number, control: number, drift: number }} StatTriplet */

function clampStat(x) {
  return Math.max(0, Math.min(100, x));
}

/** Stat 50 → multiplier 1.0; span is full swing at stat 0/100 (e.g. 0.15 → ±7.5% at ±50). */
function statMul(stat, span) {
  return 1 + ((stat - 50) / 50) * (span / 2);
}

/** Base kart stats (50 = average). Medium spread ~40–65. */
export const KART_STATS = {
  OG: { speed: 52, control: 54, drift: 52 },
  Blue: { speed: 54, control: 56, drift: 50 },
  Green: { speed: 50, control: 58, drift: 48 },
  Pink: { speed: 56, control: 52, drift: 54 },
  Apechain: { speed: 58, control: 50, drift: 52 },
  "Golden-Racer": { speed: 62, control: 52, drift: 48 },
  Banana: { speed: 50, control: 50, drift: 60 },
  Boat: { speed: 48, control: 58, drift: 50 },
  Hippie: { speed: 46, control: 56, drift: 54 },
  HotDog: { speed: 46, control: 56, drift: 54 },
  UFO: { speed: 54, control: 50, drift: 62 },
  Rainbow: { speed: 58, control: 56, drift: 56 },
};

const ZERO = { speed: 0, control: 0, drift: 0 };

/** Hat bonuses — None = 0. */
export const HAT_BONUSES = {
  None: ZERO,
  Beach: { speed: 0, control: 0, drift: 3 },
  Beanie: { speed: 0, control: 3, drift: 0 },
  "Birthday-Cake": { speed: 2, control: 0, drift: 2 },
  Bucket: { speed: 0, control: 4, drift: 0 },
  Conductor: { speed: 0, control: 5, drift: 0 },
  Cowboy: { speed: 3, control: 0, drift: 2 },
  Crown: { speed: 0, control: 4, drift: 0 },
  Frog: { speed: 0, control: 0, drift: 4 },
  "Mad-Hotter": { speed: 0, control: 0, drift: 5 },
  Mushroom: { speed: 0, control: 0, drift: 4 },
  Pilot: { speed: 4, control: 0, drift: 0 },
  "Pink-Cowgirl": { speed: 2, control: 2, drift: 0 },
  Pirate: { speed: 3, control: 0, drift: 3 },
  Propeller: { speed: 5, control: 0, drift: 0 },
  Sharky: { speed: 0, control: 0, drift: 4 },
  Trucker: { speed: 0, control: 3, drift: 2 },
  Vintage: { speed: 0, control: 4, drift: 2 },
  Visor: { speed: 2, control: 3, drift: 0 },
};

/** Eyewear bonuses — None = 0. */
export const EYE_BONUSES = {
  None: ZERO,
  "3D": { speed: 0, control: 3, drift: 0 },
  Aviator: { speed: 3, control: 2, drift: 0 },
  Checker: { speed: 0, control: 0, drift: 3 },
  Circle: { speed: 0, control: 2, drift: 0 },
  Dazzle: { speed: 2, control: 0, drift: 3 },
  "Deal-With-It": { speed: 0, control: 4, drift: 0 },
  "Flame-Visor": { speed: 0, control: 0, drift: 5 },
  Flames: { speed: 0, control: 0, drift: 4 },
  "Green-Laser": { speed: 4, control: 0, drift: 0 },
  Heart: { speed: 0, control: 2, drift: 2 },
  "Locked-In": { speed: 0, control: 5, drift: 0 },
  Monacle: { speed: 0, control: 4, drift: 0 },
  Neon: { speed: 0, control: 0, drift: 4 },
  "Red-Laser": { speed: 5, control: 0, drift: 0 },
  "Red-Laser-V2": { speed: 6, control: 0, drift: 0 },
  Shades: { speed: 2, control: 2, drift: 0 },
  Shudder: { speed: 0, control: 0, drift: 3 },
  Speedster: { speed: 6, control: 0, drift: 0 },
  Spikey: { speed: 0, control: 0, drift: 4 },
  Star: { speed: 2, control: 0, drift: 3 },
  Stars: { speed: 0, control: 0, drift: 4 },
  Steampunk: { speed: 0, control: 3, drift: 2 },
  Stunner: { speed: 3, control: 3, drift: 0 },
  Stylish: { speed: 0, control: 3, drift: 2 },
  Target: { speed: 0, control: 4, drift: 0 },
  Visor: { speed: 3, control: 2, drift: 0 },
};

const DEFAULT_KART_STATS = KART_STATS.OG;

/**
 * @param {string} kartId
 * @param {string} hatId
 * @param {string} eyeId
 * @returns {StatTriplet}
 */
export function resolveKartStats(kartId, hatId, eyeId) {
  const base = KART_STATS[kartId] ?? DEFAULT_KART_STATS;
  const hat = HAT_BONUSES[hatId] ?? ZERO;
  const eye = EYE_BONUSES[eyeId] ?? ZERO;
  return {
    speed: clampStat(base.speed + hat.speed + eye.speed),
    control: clampStat(base.control + hat.control + eye.control),
    drift: clampStat(base.drift + hat.drift + eye.drift),
  };
}

/**
 * Kart-specific physics scalars derived from global PHYS baseline.
 * @param {StatTriplet} stats
 */
export function statsToPhys(stats) {
  const speedM = statMul(stats.speed, 0.24);
  const controlM = statMul(stats.control, 0.24);
  const driftM = statMul(stats.drift, 0.24);
  return {
    maxSpeed: PHYS.maxSpeed * speedM,
    accel: PHYS.accel * speedM,
    steerBase: PHYS.steerBase * controlM,
    gripBase: PHYS.gripBase * controlM,
    turnFriction: PHYS.turnFriction / statMul(stats.control, 0.16),
    gripDrift: PHYS.gripDrift / statMul(stats.drift, 0.2),
    driftFill: PHYS.driftFill * driftM,
    driftBurst1: PHYS.driftBurst1 * driftM,
    driftBurst2: PHYS.driftBurst2 * driftM,
    driftBurst3: PHYS.driftBurst3 * driftM,
  };
}

/** Default physics (50/50/50 stats) for karts without attachKartPhys. */
export const DEFAULT_KART_PHYS = statsToPhys({ speed: 50, control: 50, drift: 50 });

/**
 * @param {StatTriplet} stats
 * @returns {{ speed: number, control: number, drift: number }}
 */
export function formatStatBars(stats) {
  return {
    speed: clampStat(stats.speed),
    control: clampStat(stats.control),
    drift: clampStat(stats.drift),
  };
}

/** @param {any} K kart with kartId, hatId, eyeId */
export function attachKartPhys(K) {
  if (!K) return;
  K.phys = statsToPhys(
    resolveKartStats(K.kartId ?? "OG", K.hatId ?? "None", K.eyeId ?? "None"),
  );
}
