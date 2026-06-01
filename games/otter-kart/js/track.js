import { KART_RADIUS } from "./config.js";
import { TRACKS } from "./tracks.js?v=2026-05-19-neo-v4";

/** @typedef {"pavement" | "grass" | "wall"} Surface */

/** Sampled track runtime */
let ACTIVE = null;

/**
 * When true, `surfaceAt` uses perpendicular distance to the nearest polyline **segment**
 * (matches faceted GP ribbons). Neon Snake / endless keep `false` for legacy vertex behavior.
 */
let RIBBON_SEGMENT_SURFACE = true;

export function setRibbonSegmentSurface(enabled) {
  RIBBON_SEGMENT_SURFACE = !!enabled;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

export function setTrack(trackId) {
  const base = TRACKS[trackId] ?? TRACKS["meadow-oval"];
  const built = buildTrackRuntime(base);
  /** Safety: never allow overlapping centerlines */
  const closed = built.closed !== false;
  if (closed ? hasSelfIntersection(built.pts) : hasSelfIntersectionOpen(built.pts)) {
    console.warn(
      `[OtterKart] Track '${trackId}' self-intersected; falling back to meadow-oval.`,
    );
    ACTIVE = buildTrackRuntime(TRACKS["meadow-oval"]);
  } else {
    ACTIVE = built;
  }
  return ACTIVE;
}

export function getTrack() {
  if (!ACTIVE) setTrack("meadow-oval");
  return ACTIVE;
}

function buildTrackRuntime(base) {
  const N = Math.min(
    4096,
    Math.max(
      512,
      Number.isFinite(base.ribbonSamples) ? Math.floor(base.ribbonSamples) : 1024,
    ),
  );
  const lapPasses = base.ribbonLaplacianPasses === 0 ? 0 : 1;
  const pts = [];
  const closed = base.closed !== false;
  const denom = closed ? N : (N - 1);
  for (let i = 0; i < N; i++) {
    const t = (i / denom) * Math.PI * 2;
    const p0 = base.fn(t);
    const t1 = (i + 1) / denom * Math.PI * 2;
    const p1 = closed ? base.fn(t + (Math.PI * 2) / denom) : base.fn(Math.min(t1, Math.PI * 2));
    const tx0 = p1.x - p0.x;
    const ty0 = p1.y - p0.y;
    const tl = Math.hypot(tx0, ty0) || 1;
    const tx = tx0 / tl;
    const ty = ty0 / tl;
    const nx = -ty;
    const ny = tx;
    pts.push({ t, x: p0.x, y: p0.y, tx, ty, nx, ny });
  }

  /** Laplacian pass can introduce wobble on dense Catmull stadium loops; optional off per track. */
  for (let p = 0; p < lapPasses; p++) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[closed ? ((i - 1 + pts.length) % pts.length) : Math.max(0, i - 1)];
      const b = pts[i];
      const c = pts[closed ? ((i + 1) % pts.length) : Math.min(pts.length - 1, i + 1)];
      b.x = (a.x + b.x * 4 + c.x) / 6;
      b.y = (a.y + b.y * 4 + c.y) / 6;
    }
  }

  /** Recompute tangents / normals after smoothing */
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const nPts = pts.length;
    const iNext = closed ? ((i + 1) % nPts) : Math.min(nPts - 1, i + 1);
    const p1 = pts[iNext];
    let tx0 = p1.x - p0.x;
    let ty0 = p1.y - p0.y;
    /** Open track endpoints: last sample uses backward tangent (prev -> last). */
    if (!closed && i === nPts - 1 && nPts >= 2) {
      const pPrev = pts[nPts - 2];
      tx0 = p0.x - pPrev.x;
      ty0 = p0.y - pPrev.y;
    }
    const tl = Math.hypot(tx0, ty0) || 1;
    p0.tx = tx0 / tl;
    p0.ty = ty0 / tl;
    p0.nx = -p0.ty;
    p0.ny = p0.tx;
  }
  /** cumulative arc length */
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[closed ? ((i + 1) % pts.length) : Math.min(pts.length - 1, i + 1)];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    a.s = s;
    if (closed || i < pts.length - 1) s += d;
  }
  const widths = base.widths;
  const startT = Number.isFinite(base.startT) ? base.startT : 0;
  /**
   * Snap finish index to the smoothed sample nearest the authored start/finish param.
   */
  let finishIdx = 0;
  let startIdx = 0;
  if (closed) {
    const ideal = base.fn(startT);
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - ideal.x;
      const dy = pts[i].y - ideal.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        finishIdx = i;
      }
    }
  } else {
    startIdx = 0;
    finishIdx = pts.length - 1;
  }
  const pads = makeBoostPadsFromSamples(pts, widths, base.padsHint, closed);
  const pickups = makePickupsFromSamples(pts, widths, closed);
  const infieldBarriers = Array.isArray(base.infieldBarriers) ? base.infieldBarriers : [];
  const infieldKeepOut =
    base.infieldKeepOut && typeof base.infieldKeepOut === "object"
      ? base.infieldKeepOut
      : null;

  return {
    id: base.id,
    name: base.name,
    pts,
    length: s,
    widths,
    finishIdx,
    startIdx,
    closed,
    pads,
    pickups,
    infieldBarriers,
    infieldKeepOut,
  };
}

function hasSelfIntersectionOpen(pts) {
  const n = pts.length;
  if (n < 8) return false;
  const skip = 10;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    for (let j = i + skip; j < n - 1; j++) {
      const c = pts[j];
      const d = pts[j + 1];
      const minAx = Math.min(a.x, b.x);
      const maxAx = Math.max(a.x, b.x);
      const minAy = Math.min(a.y, b.y);
      const maxAy = Math.max(a.y, b.y);
      const minBx = Math.min(c.x, d.x);
      const maxBx = Math.max(c.x, d.x);
      const minBy = Math.min(c.y, d.y);
      const maxBy = Math.max(c.y, d.y);
      if (maxAx < minBx || maxBx < minAx || maxAy < minBy || maxBy < minAy)
        continue;
      if (segIntersectsStrict(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y))
        return true;
    }
  }
  return false;
}

/**
 * Closest point on closed centerline → arc length u ∈ [0, length).
 * @param {number} [hintIdx] nearest sample from physics; on ties, prefer that edge to reduce flip-flop.
 */
export function kartArcU(tr, px, py, hintIdx) {
  const pts = tr.pts;
  const N = pts.length;
  const L = tr.length || 1;
  const h = Number.isFinite(hintIdx) ? (((hintIdx % N) + N) % N) : -1;
  let bestDs = Infinity;
  let bestU = 0;
  let bestSeg = -1;

  const consider = (i, uCand, ds) => {
    if (ds < bestDs - 1e-8) {
      bestDs = ds;
      bestU = uCand;
      bestSeg = i;
    } else if (h >= 0 && Math.abs(ds - bestDs) <= 1e-8) {
      const distSeg = (si) => {
        let d = Math.abs(si - h);
        if (d > N * 0.5) d = N - d;
        return d;
      };
      if (bestSeg < 0 || distSeg(i) < distSeg(bestSeg)) {
        bestU = uCand;
        bestSeg = i;
      }
    }
  };

  for (let i = 0; i < N; i++) {
    const ax = pts[i].x;
    const ay = pts[i].y;
    const bx = pts[(i + 1) % N].x;
    const by = pts[(i + 1) % N].y;
    const abx = bx - ax;
    const aby = by - ay;
    const segLenSq = abx * abx + aby * aby;
    let t = 0;
    if (segLenSq >= 1e-12)
      t = clamp(
        ((px - ax) * abx + (py - ay) * aby) / segLenSq,
        0,
        1,
      );
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    const ds = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    const segLen = Math.sqrt(segLenSq) || 0;
    const uCand = pts[i].s + t * segLen;
    consider(i, uCand, ds);
  }
  if (!Number.isFinite(bestU) || bestU < 0) return 0;
  if (bestU >= L) bestU = L - 1e-9;
  return bestU;
}

/**
 * Unwrap cumulative arc into [stripeS, stripeS+L) along the sampled polyline’s increasing-s
 * direction (same as finish-line tangent / lap direction).
 * Larger = farther into the current lap leg (ahead on track); pairs with lap count for standings.
 */
export function standingLongitudinalU(tr, kartU) {
  const L = tr.length || 1;
  const fi = tr.finishIdx ?? 0;
  const stripeS = tr.pts[fi]?.s ?? 0;
  let u =
    typeof kartU === "number" && Number.isFinite(kartU) ? kartU : 0;
  if (u < 0) u = 0;
  if (u >= L) u = L - 1e-9;
  return u >= stripeS ? u : u + L;
}

function segIntersectsStrict(ax, ay, bx, by, cx, cy, dx, dy) {
  const ccw = (Ax, Ay, Bx, By, Cx, Cy) =>
    (Cy - Ay) * (Bx - Ax) > (By - Ay) * (Cx - Ax);
  const ab_c = ccw(ax, ay, bx, by, cx, cy);
  const ab_d = ccw(ax, ay, bx, by, dx, dy);
  const cd_a = ccw(cx, cy, dx, dy, ax, ay);
  const cd_b = ccw(cx, cy, dx, dy, bx, by);
  return ab_c !== ab_d && cd_a !== cd_b;
}

function hasSelfIntersection(pts) {
  const n = pts.length;
  if (n < 8) return false;
  /** Skip neighbors so we don't flag shared vertices */
  const skip = 10;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + skip; j < n; j++) {
      if (j === i) continue;
      if ((j + 1) % n === i) continue;
      if (Math.abs(j - i) < skip) continue;
      if (Math.abs((j % n) - (i % n)) > n - skip) continue;
      const c = pts[j % n];
      const d = pts[(j + 1) % n];
      /** bounding box quick reject */
      const minAx = Math.min(a.x, b.x);
      const maxAx = Math.max(a.x, b.x);
      const minAy = Math.min(a.y, b.y);
      const maxAy = Math.max(a.y, b.y);
      const minBx = Math.min(c.x, d.x);
      const maxBx = Math.max(c.x, d.x);
      const minBy = Math.min(c.y, d.y);
      const maxBy = Math.max(c.y, d.y);
      if (maxAx < minBx || maxBx < minAx || maxAy < minBy || maxBy < minAy)
        continue;
      if (
        segIntersectsStrict(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)
      )
        return true;
    }
  }
  return false;
}

function nearestSample(px, py, hintIdx) {
  const tr = getTrack();
  const pts = tr.pts;
  let bestI = hintIdx ?? 0;
  let bestD = Infinity;
  /** local search window for speed (bigger = fewer phantom walls) */
  const win = 60;
  const start = bestI - win;
  const end = bestI + win;
  for (let k = start; k <= end; k++) {
    const i = ((k % pts.length) + pts.length) % pts.length;
    const p = pts[i];
    const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  /** occasional full scan if we are way off */
  if (bestD > 140 * 140) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const d = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
  }
  return bestI;
}

/**
 * Closest point on the sampled polyline and the **segment** frame (constant along each chord).
 * This matches the faceted ribbon used for thick canvas strokes; vertex normals alone are wrong
 * mid-edge and cause “walls” / bumps that intrude on pavement.
 * @returns {{ i:number, t:number, fx:number, fy:number, nx:number, ny:number, tx:number, ty:number }}
 */
function closestRibbonFoot(tr, px, py, hintIdx) {
  const pts = tr.pts;
  const N = pts.length;
  const closed = tr.closed !== false;
  const h = Number.isFinite(hintIdx) ? (((Math.floor(hintIdx) % N) + N) % N) : -1;

  const distSeg = (si) => {
    if (h < 0) return 1e9;
    let d = Math.abs(si - h);
    if (closed && d > N * 0.5) d = N - d;
    return d;
  };

  let bestDs = Infinity;
  /** @type {{ i:number, t:number, fx:number, fy:number, nx:number, ny:number, tx:number, ty:number }} */
  let best = {
    i: 0,
    t: 0,
    fx: pts[0].x,
    fy: pts[0].y,
    nx: pts[0].nx,
    ny: pts[0].ny,
    tx: pts[0].tx,
    ty: pts[0].ty,
  };

  const consider = (i, t, ds, fx, fy, nx, ny, tx, ty) => {
    if (ds < bestDs - 1e-10) {
      bestDs = ds;
      best = { i, t, fx, fy, nx, ny, tx, ty };
    } else if (h >= 0 && Math.abs(ds - bestDs) <= 1e-10) {
      if (distSeg(i) < distSeg(best.i)) best = { i, t, fx, fy, nx, ny, tx, ty };
    }
  };

  const segCount = closed ? N : Math.max(0, N - 1);
  for (let i = 0; i < segCount; i++) {
    const j = closed ? ((i + 1) % N) : i + 1;
    const A = pts[i];
    const B = pts[j];
    const abx = B.x - A.x;
    const aby = B.y - A.y;
    const segLenSq = abx * abx + aby * aby;
    let t = 0;
    if (segLenSq >= 1e-12) {
      t = clamp(((px - A.x) * abx + (py - A.y) * aby) / segLenSq, 0, 1);
    }
    const fx = A.x + abx * t;
    const fy = A.y + aby * t;
    const dx = px - fx;
    const dy = py - fy;
    const ds = dx * dx + dy * dy;
    const segL = Math.sqrt(segLenSq) || 1;
    const tx = abx / segL;
    const ty = aby / segL;
    const nx = -ty;
    const ny = tx;
    consider(i, t, ds, fx, fy, nx, ny, tx, ty);
  }
  return best;
}

/**
 * Axis-aligned infield box — always **wall** (neo-snake-gp pinch / shortcut block).
 * @returns {null | { surface: "wall", idx: number, lat: number, nx: number, ny: number, tx: number, ty: number }}
 */
function tryInfieldKeepOut(tr, px, py, hintIdx) {
  const box = tr.infieldKeepOut;
  if (!box) return null;
  const { xMin, xMax, yMin, yMax } = box;
  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax) ||
    px < xMin ||
    px > xMax ||
    py < yMin ||
    py > yMax
  ) {
    return null;
  }

  const N = tr.pts.length;
  const wall = tr.widths.wall;
  const idx =
    Number.isFinite(hintIdx) && N > 0
      ? (((Math.floor(hintIdx) % N) + N) % N)
      : 0;

  const dl = px - xMin;
  const dr = xMax - px;
  const db = py - yMin;
  const dt = yMax - py;
  const m = Math.min(dl, dr, db, dt);
  let nx;
  let ny;
  if (m === dl) {
    nx = -1;
    ny = 0;
  } else if (m === dr) {
    nx = 1;
    ny = 0;
  } else if (m === db) {
    nx = 0;
    ny = -1;
  } else {
    nx = 0;
    ny = 1;
  }
  return {
    surface: "wall",
    idx,
    lat: wall + 40,
    nx,
    ny,
    tx: -ny,
    ty: nx,
  };
}

/**
 * Optional thick line segments — always **wall** when closer than `halfW`.
 * @returns {null | { surface: "wall", idx: number, lat: number, nx: number, ny: number, tx: number, ty: number }}
 */
function tryInfieldBarriers(tr, px, py, hintIdx) {
  const bars = tr.infieldBarriers;
  if (!bars?.length) return null;
  const N = tr.pts.length;
  const wall = tr.widths.wall;
  const idx =
    Number.isFinite(hintIdx) && N > 0
      ? (((Math.floor(hintIdx) % N) + N) % N)
      : 0;

  for (const b of bars) {
    const ax = b.ax;
    const ay = b.ay;
    const bx = b.bx;
    const by = b.by;
    const hw = Number.isFinite(b.halfW) ? b.halfW : 44;
    const abx = bx - ax;
    const aby = by - ay;
    const segLenSq = abx * abx + aby * aby;
    let t = 0;
    if (segLenSq >= 1e-12) {
      t = clamp(((px - ax) * abx + (py - ay) * aby) / segLenSq, 0, 1);
    }
    const fx = ax + abx * t;
    const fy = ay + aby * t;
    const dx = px - fx;
    const dy = py - fy;
    const dist = Math.hypot(dx, dy);
    if (dist >= hw) continue;
    const segL = Math.sqrt(segLenSq) || 1;
    const tx = abx / segL;
    const ty = aby / segL;
    let nx;
    let ny;
    if (dist < 1e-6) {
      /** On the segment spine: use unit normal perpendicular to the barrier (stable when `dx,dy` ~ 0). */
      nx = -ty;
      ny = tx;
      const lateral = (px - fx) * nx + (py - fy) * ny;
      if (lateral < 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }
    /** `lat` large enough that `resolveWallCollision` always pushes off this wall. */
    const lat = (wall + 40) * (nx * (px - fx) + ny * (py - fy) >= 0 ? 1 : -1);
    return {
      surface: "wall",
      idx,
      lat,
      nx,
      ny,
      tx,
      ty,
    };
  }
  return null;
}

/** Hard infield walls override ribbon pavement/grass (shortcuts, pinch zones). */
function tryInfieldWalls(tr, px, py, hintIdx) {
  return tryInfieldKeepOut(tr, px, py, hintIdx) ?? tryInfieldBarriers(tr, px, py, hintIdx);
}

/**
 * @returns {{ surface: Surface, idx: number, lat: number, nx: number, ny: number, tx: number, ty: number }}
 * `nx,ny` point from centerline toward the query point (for wall pushes). `tx,ty` follow increasing arc `s`.
 */
export function surfaceAt(px, py, hintIdx) {
  const tr = getTrack();
  if (!RIBBON_SEGMENT_SURFACE) {
    const i = nearestSample(px, py, hintIdx);
    const p = tr.pts[i];
    const dx = px - p.x;
    const dy = py - p.y;
    const lat = dx * p.nx + dy * p.ny;
    const a = Math.abs(lat);
    const road = tr.widths.road;
    const wall = tr.widths.wall;
    let surface = /** @type {Surface} */ ("wall");
    if (a <= road) surface = "pavement";
    else if (a <= wall) surface = "grass";
    const sign = lat >= 0 ? 1 : -1;
    const cut = tryInfieldWalls(tr, px, py, hintIdx);
    if (cut) return cut;
    return {
      surface,
      idx: i,
      lat,
      nx: p.nx * sign,
      ny: p.ny * sign,
      tx: p.tx,
      ty: p.ty,
    };
  }

  const c = closestRibbonFoot(tr, px, py, hintIdx);
  const lat = (px - c.fx) * c.nx + (py - c.fy) * c.ny;
  const a = Math.abs(lat);
  const road = tr.widths.road;
  const wall = tr.widths.wall;
  let surface = /** @type {Surface} */ ("wall");
  if (a <= road) surface = "pavement";
  else if (a <= wall) surface = "grass";

  const N = tr.pts.length;
  const closed = tr.closed !== false;
  const j = closed ? ((c.i + 1) % N) : Math.min(c.i + 1, N - 1);
  const idx = c.t < 0.5 ? c.i : j;

  const sign = lat >= 0 ? 1 : -1;
  const cut = tryInfieldWalls(tr, px, py, hintIdx);
  if (cut) return cut;
  return {
    surface,
    idx,
    lat,
    nx: c.nx * sign,
    ny: c.ny * sign,
    tx: c.tx,
    ty: c.ty,
  };
}

export function finishForwardDot(vx, vy, idx) {
  const tr = getTrack();
  const p = tr.pts[idx ?? 0] ?? tr.pts[0];
  const vm = Math.hypot(vx, vy) || 1;
  return (vx * p.tx + vy * p.ty) / vm;
}

export function resolveWallCollision(x, y, vx, vy, hintIdx) {
  const tr = getTrack();
  const hit = surfaceAt(x, y, hintIdx);
  if (hit.surface !== "wall") return { x, y, vx, vy, idx: hit.idx };
  const lat = hit.lat;
  const limit = tr.widths.wall - KART_RADIUS * 0.95;
  const push = (Math.abs(lat) - limit) + KART_RADIUS * 0.2;
  const nx = hit.nx;
  const ny = hit.ny;
  const nxX = x - nx * push;
  const nyY = y - ny * push;
  const vn = vx * nx + vy * ny;
  let nvx = vx;
  let nvy = vy;
  if (vn > 0) {
    nvx -= 1.8 * vn * nx;
    nvy -= 1.8 * vn * ny;
    nvx *= 0.78;
    nvy *= 0.78;
  }
  return { x: nxX, y: nyY, vx: nvx, vy: nvy, idx: hit.idx };
}

export function finishLineSegment() {
  const tr = getTrack();
  const p = tr.pts[tr.finishIdx];
  /** Make stripe span the whole playable width (road + shoulder) */
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

/** Strict segment crossing (exclusive), good enough for kart motion steps */
function segIntersects(a, b, c, d) {
  const ccw = (A, B, C) =>
    (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  return (
    ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
  );
}

/**
 * Crossing finish stripe while moving clockwise around the loop (tangential forward bias).
 */
export function lapFinishCrossed(
  prevX,
  prevY,
  x,
  y,
  speed,
  vx,
  vy,
  line,
) {
  // Be permissive: lap completion should still count at low speeds (drifting/braking over stripe).
  if (speed < 18) return false;
  /**
   * Robust crossing:
   * - treat finish as an infinite line with normal = track tangent (tx,ty)
   * - detect sign change across that line
   * - require position near the stripe segment (within halfW + radius)
   */
  const mx = line.mx ?? (line.x1 + line.x2) * 0.5;
  const my = line.my ?? (line.y1 + line.y2) * 0.5;
  const nx = line.tx;
  const ny = line.ty;
  const s0 = (prevX - mx) * nx + (prevY - my) * ny;
  const s1 = (x - mx) * nx + (y - my) * ny;
  if (!((s0 < 0 && s1 >= 0) || (s0 > 0 && s1 <= 0))) return false;

  const side = Math.abs((x - mx) * line.nx + (y - my) * line.ny);
  const lim = (line.halfW ?? 120) + KART_RADIUS * 1.05;
  if (side > lim) return false;

  /** Require motion roughly aligned with forward track direction */
  const vm = Math.hypot(vx, vy) || 1;
  const f = vx * line.tx + vy * line.ty;
  return f > 0.005 * vm;
}

export function suggestSpawn() {
  const tr = getTrack();
  const si = tr.closed === false ? (tr.startIdx ?? 0) : tr.finishIdx;
  const p = tr.pts[si];
  /** spawn just behind the stripe */
  const back = 44;
  const x = p.x - p.tx * back;
  const y = p.y - p.ty * back;
  return { x, y, theta: Math.atan2(p.ty, p.tx) };
}

/** Decorate rocks / trees in world coords */
export function getDecor() {
  /** Keep scene clean: no rocks, no center clutter. */
  return { rocks: [], trees: [] };
}

export function makeBoostPads() {
  return getTrack().pads;
}

export function makePickups() {
  return getTrack().pickups.map((p) => ({ ...p, taken: false }));
}

export function checkBoostPad(px, py, kartRadius, pads, dt) {
  for (const p of pads) {
    if (p.cooldown > 0) {
      p.cooldown -= dt;
      continue;
    }
    const bx = px - p.centerX;
    const by = py - p.centerY;
    const c = Math.cos(-p.angle);
    const s = Math.sin(-p.angle);
    const lx = bx * c - by * s;
    const ly = bx * s + by * c;
    const hl = p.widthAlong * 0.5;
    const clx = Math.max(-hl, Math.min(hl, lx));
    const dist = Math.hypot(clx - lx, ly);
    if (dist < p.r + kartRadius) {
      p.cooldown = 0.45;
      return true;
    }
  }
  return false;
}

function makeBoostPadsFromSamples(pts, widths, hint, closed) {
  const pads = [];
  // Make boost pads shorter everywhere (author hints still work but are capped).
  const padLen = clamp(Math.floor(hint?.padLen ?? 14), 6, 16);
  /**
   * If pads is explicitly provided as an array (even empty), treat it as authoritative.
   * Empty array => no pads.
   */
  const anchors = Array.isArray(hint?.pads) ? hint.pads : null;
  /**
   * Backwards-compat: if no explicit pads are provided, keep the old evenly-spaced behavior.
   * @type {number[]}
   */
  const idxs = [];
  if (Array.isArray(anchors)) {
    if (!anchors.length) return pads;
    for (const a of anchors) {
      let idx = 0;
      if (typeof a === "number" && Number.isFinite(a)) {
        /**
         * If a in [0,1], treat as lap fraction; otherwise treat as sample index.
         * (This keeps authoring simple in tracks.js.)
         */
        if (a >= 0 && a <= 1) idx = Math.round(a * (pts.length - 1));
        else idx = Math.round(a);
      }
      idxs.push(((idx % pts.length) + pts.length) % pts.length);
    }
  } else {
    const every = hint?.padEvery ?? 92;
    for (let i = 0; i < pts.length; i += every) idxs.push(i);
  }

  for (const i of idxs) {
    const p = pts[i];
    const qi = closed ? ((i + padLen) % pts.length) : Math.min(pts.length - 1, i + padLen);
    const q = pts[qi];
    pads.push({
      sx: p.x,
      sy: p.y,
      ex: q.x,
      ey: q.y,
      r: 36,
      cooldown: 0,
      centerX: (p.x + q.x) * 0.5,
      centerY: (p.y + q.y) * 0.5,
      widthAlong: Math.hypot(q.x - p.x, q.y - p.y) + widths.road * 0.7,
      angle: Math.atan2(q.y - p.y, q.x - p.x),
    });
  }
  return pads;
}

function makePickupsFromSamples(pts, widths, closed) {
  const items = [];
  const step = Math.floor(pts.length / 9);
  for (let i = 0; i < 9; i++) {
    const idx = closed ? ((i * step + 10) % pts.length) : Math.min(pts.length - 1, (i * step + 10));
    const p = pts[idx];
    const off = (i % 2 === 0 ? 1 : -1) * (widths.road * 0.35);
    // Track pickups are shells only; bananas/boost/rocks/shields come from Mystery Boxes.
    const type = i % 6 === 0 ? "goldenShell" : "shell";
    items.push({
      id: `p${i}`,
      x: p.x + p.nx * off,
      y: p.y + p.ny * off,
      type,
      taken: false,
      bob: Math.random() * Math.PI * 2,
    });
  }
  return items;
}
