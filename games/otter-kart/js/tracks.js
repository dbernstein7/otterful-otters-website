/**
 * Track library: centerline param curves + widths.
 * Each track is sampled into a ribbon (road/grass/wall) at runtime.
 */
// Grand Prix order: swap races #4 and #5.
export const TRACK_IDS = ["meadow-oval", "s-bends", "chicane", "neo-snake-gp", "lava-serpent"];

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function wrap01(x) {
  let t = x % 1;
  if (t < 0) t += 1;
  return t;
}

/**
 * Param curve: t in [0, 2π)
 * returns {x,y}
 * @param {boolean} [closed]
 * @param {{ ribbonLaplacianPasses?: number, ribbonSamples?: number, infieldBarriers?: { ax:number, ay:number, bx:number, by:number, halfW?:number }[], infieldKeepOut?: { xMin:number, xMax:number, yMin:number, yMax:number } }} [ribbon] — Laplacian/samples; optional infield walls (`infieldKeepOut` box and/or `infieldBarriers` segments).
 */
function makeParam(fn, name, widths, padsHint, startT, closed = true, ribbon) {
  const o = {
    id: name,
    name,
    widths,
    fn,
    padsHint,
    startT,
    closed: closed !== false,
  };
  if (ribbon && typeof ribbon === "object") {
    if (ribbon.ribbonLaplacianPasses === 0) o.ribbonLaplacianPasses = 0;
    if (Number.isFinite(ribbon.ribbonSamples))
      o.ribbonSamples = ribbon.ribbonSamples;
    if (Array.isArray(ribbon.infieldBarriers)) o.infieldBarriers = ribbon.infieldBarriers;
    if (ribbon.infieldKeepOut && typeof ribbon.infieldKeepOut === "object")
      o.infieldKeepOut = ribbon.infieldKeepOut;
  }
  return o;
}

function catmullRom(a, b, c, d, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    ((2 * b) +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3)
  );
}

function makeLoopFromPoints(points) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  return (t) => {
    const u = (t / (Math.PI * 2)) % 1;
    const s = (u < 0 ? u + 1 : u) * n;
    const i1 = Math.floor(s) % n;
    const lt = s - Math.floor(s);
    const i0 = (i1 - 1 + n) % n;
    const i2 = (i1 + 1) % n;
    const i3 = (i1 + 2) % n;
    const p0 = pts[i0];
    const p1 = pts[i1];
    const p2 = pts[i2];
    const p3 = pts[i3];
    return {
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, lt),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, lt),
    };
  };
}

/**
 * Insert extra vertices only on **long** control edges (e.g. straight → ellipse jump).
 * Uniform subdivision of the whole loop over-smoothed Catmull–Rom; this keeps short edges intact.
 */
function subdivideLongEdgesClosed(points, maxEdgeLen = 88) {
  const n = points.length;
  if (n < 3 || !Number.isFinite(maxEdgeLen) || maxEdgeLen < 24) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const A = points[i];
    const B = points[(i + 1) % n];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    const steps = L > maxEdgeLen ? Math.max(2, Math.ceil(L / maxEdgeLen)) : 1;
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      out.push({ x: A.x + dx * u, y: A.y + dy * u });
    }
  }
  return out;
}

function makeLoopFromPointsSplitLong(points, maxEdgeLen = 88) {
  return makeLoopFromPoints(subdivideLongEdgesClosed(points, maxEdgeLen));
}

/** Drop consecutive vertices closer than `minDist` (world units) before Catmull sampling. */
function dedupClosedControlRing(points, minDist) {
  const md = Math.max(1, minDist);
  const n0 = points.length;
  if (n0 < 4) return points;
  const out = [];
  for (let i = 0; i < n0; i++) {
    const p = points[i];
    if (!out.length) {
      out.push({ x: p.x, y: p.y });
      continue;
    }
    const q = out[out.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) < md) continue;
    out.push({ x: p.x, y: p.y });
  }
  while (
    out.length >= 3 &&
    Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < md
  ) {
    out.pop();
  }
  return out.length >= 3 ? out : points;
}

/** Linear interior samples between chord endpoints (stadium straight↔arc hand-offs). */
function stadiumChordBlend(a, b, blendN) {
  const out = [];
  const m = Math.max(6, Math.floor(blendN));
  for (let i = 1; i <= m; i++) {
    const u = i / (m + 1);
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

/**
 * Quadratic connector bowed **radially outward** from map origin (stadium infield ~ 0,0).
 * Fills straight↔arc hand-offs so the path does not cut a sharp **chord** (Catmull cusps, curb
 * explosions). Used when building GP2’s explicit polyline.
 */
function stadiumQuadraticOutwardFillet(a, b, bulge, samples) {
  const mx = (a.x + b.x) * 0.5;
  const my = (a.y + b.y) * 0.5;
  const d = Math.hypot(mx, my) || 1;
  const cx = mx + (mx / d) * bulge;
  const cy = my + (my / d) * bulge;
  const out = [];
  const m = Math.max(14, Math.floor(samples));
  for (let i = 1; i < m; i++) {
    const t = i / m;
    const o = 1 - t;
    out.push({
      x: o * o * a.x + 2 * o * t * cx + t * t * b.x,
      y: o * o * a.y + 2 * o * t * cy + t * t * b.y,
    });
  }
  return out;
}

/**
 * GP2 centerline: **no Catmull–Rom**. Uniform `t ∈ [0,2π)` → uniform **arc length** along a dense
 * closed polyline (linear between vertices). Corners use `stadiumQuadraticOutwardFillet` on all
 * four hand-offs so geometry cannot spline‑overshoot inward.
 */
function makeClosedPolylineArcLengthFn(polyIn, dedupMin = 2) {
  const ring = dedupClosedControlRing(polyIn, dedupMin);
  const n = ring.length;
  if (n < 3) {
    return () => ({ x: 0, y: 0 });
  }
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] =
      cum[i] + Math.hypot(ring[j].x - ring[i].x, ring[j].y - ring[i].y);
  }
  const total = cum[n];
  return (t) => {
    const TAU = Math.PI * 2;
    let u = t / TAU;
    u %= 1;
    if (u < 0) u += 1;
    let s = u * total;
    if (s >= total) s = total - 1e-9;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const i = Math.min(lo, n - 1);
    const j = (i + 1) % n;
    const L = cum[i + 1] - cum[i] || 1;
    const f = Math.min(1, Math.max(0, (s - cum[i]) / L));
    const ax = ring[i].x;
    const ay = ring[i].y;
    return {
      x: ax + (ring[j].x - ax) * f,
      y: ay + (ring[j].y - ay) * f,
    };
  };
}

function makeSbendsArcLengthTrack() {
  const W = 2950;
  const xL = -W * 0.5;
  const xR = W * 0.5;
  const gapY = 720;
  const AFlat = 52;
  const FFlat = 5;
  const phiTop = 0.32;
  const phiBot = 1.85;
  const N = 80;
  const arcSteps = 68;

  const top = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    top.push({
      x: xL + (xR - xL) * u,
      y: -gapY * 0.5 + AFlat * Math.sin(u * Math.PI * 2 * FFlat + phiTop),
    });
  }

  const right = [];
  {
    const cx = xR + 530;
    const cy = 0;
    const rx = 530;
    const ry = gapY * 0.69;
    for (let k = 1; k <= arcSteps; k++) {
      const a = (-Math.PI / 2) + (Math.PI * k) / arcSteps;
      right.push({
        x: cx + Math.cos(a) * rx,
        y: cy + Math.sin(a) * ry,
      });
    }
  }

  const bottom = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    bottom.push({
      x: xR - (xR - xL) * u,
      y: gapY * 0.5 + AFlat * Math.sin(u * Math.PI * 2 * FFlat + phiBot),
    });
  }

  const left = [];
  {
    const cx = xL - 530;
    const cy = 0;
    const rx = 530;
    const ry = gapY * 0.69;
    for (let k = 1; k <= arcSteps; k++) {
      const a = (Math.PI / 2) + (Math.PI * k) / arcSteps;
      left.push({
        x: cx + Math.cos(a) * rx,
        y: cy + Math.sin(a) * ry,
      });
    }
  }

  const chordBulge = (a, b) => {
    const ch = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.min(380, Math.max(160, ch * 0.52));
  };
  const chordSamples = (a, b) => {
    const ch = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.max(16, Math.min(52, Math.round(ch / 17)));
  };

  const fil = (a, b) =>
    stadiumQuadraticOutwardFillet(a, b, chordBulge(a, b), chordSamples(a, b));

  const poly = [
    ...top,
    ...fil(top[top.length - 1], right[0]),
    ...right,
    ...fil(right[right.length - 1], bottom[0]),
    ...bottom,
    ...fil(bottom[bottom.length - 1], left[0]),
    ...left,
    ...fil(left[left.length - 1], top[0]),
  ];

  return makeClosedPolylineArcLengthFn(poly, 1.2);
}

/**
 * Evenly spaced **interior** points between straight↔arc endpoints (top→right→bottom→left→wrap).
 * Uses **linear** spacing along the chord — cosine easing clusters points near A/B (ds/dt→0),
 * which creates **near-duplicate Catmull control vertices** → tangent spikes → curb geometry explodes.
 */
function stitchStadiumCorners(top, right, bottom, left, blendN = 12, closureBlendN) {
  const cB =
    closureBlendN == null || !Number.isFinite(closureBlendN)
      ? blendN
      : closureBlendN;
  const ring = [
    ...top,
    ...stadiumChordBlend(top[top.length - 1], right[0], blendN),
    ...right,
    ...stadiumChordBlend(right[right.length - 1], bottom[0], blendN),
    ...bottom,
    ...stadiumChordBlend(bottom[bottom.length - 1], left[0], blendN),
    ...left,
    ...stadiumChordBlend(left[left.length - 1], top[0], cB),
  ];
  return dedupClosedControlRing(ring, 3.5);
}

/** Widths are half-widths in world units */
const widthsDefault = {
  road: 86,
  grass: 118,
  wall: 144,
};

export const TRACKS = {
  /** The original vibe but thicker + readable */
  "meadow-oval": makeParam(
    (t) => {
      const a = 360;
      const b = 238;
      return { x: Math.cos(t) * a, y: Math.sin(t) * b };
    },
    "meadow-oval",
    { ...widthsDefault, road: 90, grass: 122, wall: 150 },
    { pads: [0.14, 0.62], padLen: 36 },
    Math.PI * 1.03,
  ),

  /**
   * GP2: **piecewise polyline + arc-length sampling** — no Catmull–Rom, so corners cannot
   * spline-overshoot; curbs follow chord offsets consistently. All four stadium connectors get the
   * same outward quadratic fillet.
   */
  "s-bends": makeParam(
    makeSbendsArcLengthTrack(),
    "s-bends",
    { ...widthsDefault, road: 92, grass: 124, wall: 154 },
    { pads: [0.08, 0.52], padLen: 14 },
    Math.PI * 1.0,
    true,
    { ribbonLaplacianPasses: 0, ribbonSamples: 2496 },
  ),

  /**
   * GP3: stadium-style circuit — **top mimics the bottom** (same gentle wiggle:
   * A, F, phase as the “good” bottom straight). Smooth elliptical U-connectors
   * (no sharp 90° corners). CPUs use pure-pursuit like neo-snake-gp / lava-serpent.
   */
  "chicane": makeParam(
    makeLoopFromPointsSplitLong(
      (() => {
        const W = 2500;
        const xL = -W * 0.5;
        const xR = W * 0.5;
        const gapY = 620;
        const AFlat = 36;
        const FFlat = 2;
        const phi = 0.35;
        const N = 20;

        const top = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          top.push({
            x: xL + (xR - xL) * u,
            y: -gapY * 0.5 + AFlat * Math.sin(u * Math.PI * 2 * FFlat + phi),
          });
        }

        const right = [];
        {
          const cx = xR + 480;
          const cy = 0;
          const rx = 480;
          const ry = gapY * 0.68;
          const steps = 20;
          for (let k = 1; k <= steps; k++) {
            const a = (-Math.PI / 2) + (Math.PI * k) / steps;
            right.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        const bottom = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          bottom.push({
            x: xR - (xR - xL) * u,
            y: gapY * 0.5 + AFlat * Math.sin(u * Math.PI * 2 * FFlat + phi),
          });
        }

        const left = [];
        {
          const cx = xL - 480;
          const cy = 0;
          const rx = 480;
          const ry = gapY * 0.68;
          const steps = 20;
          for (let k = 1; k <= steps; k++) {
            const a = (Math.PI / 2) + (Math.PI * k) / steps;
            left.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        return stitchStadiumCorners(top, right, bottom, left, 12);
      })(),
    ),
    "chicane",
    { ...widthsDefault, road: 92, grass: 124, wall: 154 },
    { pads: [0.08, 0.52], padLen: 14 },
    Math.PI * 1.0,
    true,
    { ribbonLaplacianPasses: 0, ribbonSamples: 1664 },
  ),

  /** Peanut / figure-ish shape */
  "peanut": makeParam(
    (t) => {
      /**
       * Peanut without crossing: classic cos(2t) radial pinch.
       * Always positive radius => never overlaps.
       */
      const a = 430;
      const b = 300;
      const r = 0.78 + 0.22 * Math.cos(t * 2);
      return { x: Math.cos(t) * a * r, y: Math.sin(t) * b * r };
    },
    "peanut",
    { ...widthsDefault, road: 86, grass: 118, wall: 148 },
    { pads: [0.23, 0.74], padLen: 32 },
    Math.PI * 1.05,
  ),

  /**
   * Grand Prix race #4 (lava/molten styling is applied by game.js):
   * a longer, curvier loop inspired by the Neon Snake GP geometry.
   */
  "lava-serpent": makeParam(
    makeLoopFromPointsSplitLong(
      (() => {
        const W = 4200;
        const xL = -W * 0.5;
        const xR = W * 0.5;
        const gapY = 1080;
        const A = 185;
        const F = 4;
        const N = 26;

        const top = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          top.push({
            x: xL + (xR - xL) * u,
            y: -gapY * 0.5 + A * Math.sin(u * Math.PI * 2 * F),
          });
        }

        const right = [];
        {
          const cx = xR + 560;
          const cy = 0;
          const rx = 560;
          const ry = gapY * 0.7;
          const steps = 22;
          for (let k = 1; k <= steps; k++) {
            const a = (-Math.PI / 2) + (Math.PI * k) / steps;
            right.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        const bottom = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          bottom.push({
            x: xR - (xR - xL) * u,
            y: gapY * 0.5 + A * Math.sin(u * Math.PI * 2 * F + 0.9),
          });
        }

        const left = [];
        {
          const cx = xL - 560;
          const cy = 0;
          const rx = 560;
          const ry = gapY * 0.7;
          const steps = 22;
          for (let k = 1; k <= steps; k++) {
            const a = (Math.PI / 2) + (Math.PI * k) / steps;
            left.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        return stitchStadiumCorners(top, right, bottom, left, 12);
      })(),
    ),
    "lava-serpent",
    // Wider road so CPUs have margin through the connectors.
    { ...widthsDefault, road: 106, grass: 132, wall: 170 },
    // GP#4: pads on straighter sections, and 2x smaller.
    { pads: [0.08, 0.58], padLen: 7 },
    // Start/finish on a straight (zero-slope point on the top straight).
    Math.PI * 0.375,
    true,
    { ribbonLaplacianPasses: 0, ribbonSamples: 1664 },
  ),

  /** Long sweeping snake with multiple wiggles */
  "snake": makeParam(
    (t) => {
      /**
       * Snake without overlap: gentle phase-shifted radial modulation.
       * No lateral additive terms that can create loops.
       */
      const a = 455;
      const b = 290;
      const r = 1 + 0.14 * Math.sin(t * 3 + 0.6);
      const ry = 1 + 0.08 * Math.sin(t * 3 - 0.4);
      return { x: Math.cos(t) * a * r, y: Math.sin(t) * b * ry };
    },
    "snake",
    { ...widthsDefault, road: 90, grass: 122, wall: 154 },
    { pads: [0.16, 0.66], padLen: 32 },
    Math.PI * 1.12,
  ),

  /**
   * Greybox: Neon Touge — snake-like road (matches reference image style).
   * A long horizontal wavy section, U-turn, return wavy section, U-turn.
   * Designed to be non-intersecting so it won't fallback to meadow-oval.
   */
  "neo-touge": makeParam(
    (t) => {
      const TAU = Math.PI * 2;
      /** Open track: do NOT wrap u (prevents last segment snapping back to start). */
      let u = t / TAU;
      if (!Number.isFinite(u)) u = 0;
      u = clamp(u, 0, 1);

      // Single point-to-point snake road (no return lane).
      const repeats = 3;
      const W = 1900; // base segment horizontal span
      const totalW = W * repeats;
      const xL = -totalW * 0.5;
      const xR = totalW * 0.5;
      const A = 210;
      /** Integer freqs so repeated segments join seamlessly. */
      const F = 3.0;
      const yBase = 0;
      const x = xL + (xR - xL) * u;
      const uSeg = u * repeats;
      const seg = Math.floor(uSeg);
      let uu = uSeg - seg;
      if (u >= 1) uu = 1;
      const y =
        yBase +
        A * Math.sin(TAU * F * uu) +
        38 * Math.sin(TAU * 2.0 * uu + 0.8);
      return { x, y };
    },
    "neo-touge",
    { ...widthsDefault, road: 94, grass: 132, wall: 165 },
    { pads: [], padLen: 34 },
    Math.PI * 1.0,
    false,
  ),

  /**
   * Neon Snake (Grand Prix): tight stadium snake — triple wiggle straights, elliptical U-caps.
   * Arc-length polyline (no Catmull overshoot). Middle infield is grass/wall only via ribbon math.
   */
  "neo-snake-gp": makeParam(
    makeClosedPolylineArcLengthFn(
      (() => {
        const W = 2400;
        const xL = -W * 0.5;
        const xR = W * 0.5;
        /** gapY − 2A > 2× road (740 − 360 = 380 > 188) — wiggle crests stay separated. */
        const gapY = 740;
        const A = 180;
        const F = 3;
        const phiBot = 0.9;
        const N = 28;

        const top = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          top.push({
            x: xL + (xR - xL) * u,
            y: -gapY * 0.5 + A * Math.sin(u * Math.PI * 2 * F),
          });
        }

        const right = [];
        {
          const cx = xR + 480;
          const cy = 0;
          const rx = 480;
          const ry = gapY * 0.68;
          const steps = 20;
          for (let k = 1; k <= steps; k++) {
            const a = (-Math.PI / 2) + (Math.PI * k) / steps;
            right.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        const bottom = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          bottom.push({
            x: xR - (xR - xL) * u,
            y: gapY * 0.5 + A * Math.sin(u * Math.PI * 2 * F + phiBot),
          });
        }

        const left = [];
        {
          const cx = xL - 480;
          const cy = 0;
          const rx = 480;
          const ry = gapY * 0.68;
          const steps = 20;
          for (let k = 1; k <= steps; k++) {
            const a = (Math.PI / 2) + (Math.PI * k) / steps;
            left.push({
              x: cx + Math.cos(a) * rx,
              y: cy + Math.sin(a) * ry,
            });
          }
        }

        return stitchStadiumCorners(top, right, bottom, left, 14);
      })(),
      2,
    ),
    "neo-snake-gp",
    { ...widthsDefault, road: 94, grass: 132, wall: 165 },
    { pads: [], padLen: 34 },
    /** Top straight center (x≈0, flat sine); was π → bottom straight spawn. */
    Math.PI * 0.286,
    true,
    { ribbonLaplacianPasses: 0, ribbonSamples: 2304 },
  ),
};

