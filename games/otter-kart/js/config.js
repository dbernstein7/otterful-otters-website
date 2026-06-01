/** World & tuning knobs */
export const TARGET_FPS = 60;
export const TOTAL_LAPS = 3;

export const KART_RADIUS = 14;

/** World span used when drawing kart stack (must match character.js layering scale) */
export const KART_SPRITE_WORLD_SPAN = KART_RADIUS * 2.35;

/** Ellipse centered at TRACK center — metric d = (dx/a)²+(dy/b)² */
export const TRACK = {
  cx: 0,
  cy: 0,
  a: 360,
  b: 238,
  /** Hard inner island wall */
  dInnerWall: 0.34,
  /** Inner grass shoulder (slow) ends / pavement begins */
  dPaveInner: 0.385,
  /** Pavement outer edge */
  dPaveOuter: 1.24,
  /** Outer grass shoulder ends / hard wall */
  dGrassOuter: 1.29,
};

export const PHYS = {
  /** Top speed on pavement (world units / s) — kept moderate for readable racing */
  maxSpeed: 268,
  reverseMax: 78,
  accel: 520,
  brake: 460,
  /** Base lateral grip blend per second toward heading */
  gripBase: 7.2,
  gripDrift: 1.08,
  /** Turn rate (rad/s) — strength curve lives in game.js so mid-speed isn’t mushy */
  steerBase: 3.05,
  /** Extra turn authority when still slow */
  steerLowSpeedBoost: 1.12,
  /** Keyboard steer eases toward ±1 — higher = reaches full lock faster */
  steerResponse: 22,
  /** Only near top speed we trim turn rate slightly (keeps straight-line stable) */
  steerHighSpeedCut: 0.9,
  steerHighSpeedStart: 0.82,
  /** Floor: never scale turns below this vs full stick (fixes “can’t rotate” mid-speed) */
  steerTurnFloor: 0.82,
  /** Speed lost per second when steering hard while not drifting */
  turnFriction: 42,
  /** Grass multiplier on max speed + extra drag */
  grassSpeedMul: 0.42,
  grassDrag: 2.05,
  wallBounceRetain: 0.35,
  driftMinSpeed: 56,
  /** Drift gauge fill rate (per sec, scaled by slip) */
  driftFill: 0.42,
  driftGaugeMax: 1,
  /**
   * Drift boost tiers (anti-exploit): boost only triggers when gauge reaches a tier.
   * Gauge is in [0, driftGaugeMax]. Thresholds are fractions of driftGaugeMax.
   */
  driftTier1: 0.45,
  driftTier2: 0.75,
  driftTier3: 0.98,
  /** Speed added on drift release per tier */
  driftBurst1: 56,
  driftBurst2: 86,
  driftBurst3: 118,
  /** Boost pad impulse */
  padBoost: 78,
  itemBoostImpulse: 62,
};

function clampCam(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

/**
 * Pixels-per-world-unit so karts visually fill most of the window (full-screen canvas).
 */
export function raceZoomForViewport(viewW, viewH) {
  const minor = Math.min(viewW || 320, viewH || 320);
  /** ~fraction of shorter screen axis taken by kart sprite span */
  const kartFill = 0.38;
  const raw = (minor * kartFill) / KART_SPRITE_WORLD_SPAN;
  /** 0.5 = zoom out 2× vs previous tuning */
  return clampCam(raw * 0.5, 1.35, 6);
}

export const CAMERA = {
  lerp: 7,
};

/** Finish radial gate — crossing CCW advances lap */
export const FINISH_ANGLE = Math.PI * 0.52;
