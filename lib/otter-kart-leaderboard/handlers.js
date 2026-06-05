const {
  MODE_IDS,
  MODE_LABELS,
  SESSION_POINTS_KEY,
  SESSION_SHELLS_KEY,
  SESSION_META_KEY,
  redisKey,
  metaHashKey,
  scoreForMode,
  isBetterScore,
  formatRow,
  buildMeta,
  shouldAcceptSubmission,
  shortWallet,
  sanitizeDemoId,
  demoMemberKey,
  memberDisplayShort,
} = require("./modes.js");
const { isKvConfigured, zrevrangeWithScores, zscore, zadd, hset, hget } = require("./kv.js");
const { verifySubmitSignature } = require("./verify.js");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseLimit(raw, fallback = 8) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20, Math.max(3, Math.floor(n)));
}

const MAX_DEMO_SHELLS = 50000;

function resolveMember(wallet, demoId, isDemo) {
  if (isDemo) return demoMemberKey(demoId);
  const w = String(wallet || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  return w;
}

async function readSessionBoard(limit) {
  const raw = await zrevrangeWithScores(SESSION_POINTS_KEY, limit);
  const rows = [];
  if (!Array.isArray(raw)) return rows;

  for (let i = 0; i < raw.length; i += 2) {
    const wallet = String(raw[i] || "");
    let shells = 0;
    let points = 0;
    try {
      const s = await hget(SESSION_SHELLS_KEY, wallet);
      shells = s != null ? Number(s) : 0;
    } catch {}
    const metaRaw = await hget(SESSION_META_KEY, wallet).catch(() => null);
    let meta = null;
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : null;
    } catch {
      meta = null;
    }
    if (meta) {
      points = meta.points ?? 0;
      shells = meta.shells ?? shells;
    } else {
      const combined = Number(raw[i + 1] || 0);
      points = Math.floor(combined / 1e6);
      shells = Math.floor(combined % 1e6);
    }
    if (!meta) {
      meta = {
        wallet,
        walletShort: shortWallet(wallet),
        points: Number.isFinite(points) ? points : 0,
        shells: Number.isFinite(shells) ? shells : 0,
      };
    }
    rows.push(formatRow("session", meta, rows.length + 1));
  }
  return rows;
}

async function readBoard(mode, dateISO, limit) {
  if (mode === "session") return readSessionBoard(limit);

  const key = redisKey(mode, dateISO);
  const metaKey = metaHashKey(mode, dateISO);
  const raw = await zrevrangeWithScores(key, limit);
  const rows = [];
  if (!Array.isArray(raw)) return rows;

  for (let i = 0; i < raw.length; i += 2) {
    const wallet = String(raw[i] || "");
    const metaRaw = await hget(metaKey, wallet).catch(() => null);
    let meta = null;
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : null;
    } catch {
      meta = null;
    }
    if (!meta) {
      meta = { wallet, walletShort: shortWallet(wallet) };
    }
    rows.push(formatRow(mode, meta, rows.length + 1));
  }
  return rows;
}

/**
 * Shell Rush-style: best session claim totals per wallet (called from otter-kart award).
 */
async function upsertSessionLeaderboard(walletOrDemoId, points, shells, opts = {}) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };
  const isDemo = !!opts.isDemo;
  const member = resolveMember(walletOrDemoId, walletOrDemoId, isDemo);
  if (!member) return { updated: false, reason: isDemo ? "bad_demo_id" : "bad_wallet" };

  const pts = Math.min(MAX_DEMO_SHELLS, Math.max(0, Math.floor(Number(points) || 0)));
  const sh = Math.min(MAX_DEMO_SHELLS, Math.max(0, Math.floor(Number(shells) || 0)));
  if (pts <= 0 && sh <= 0) return { updated: false, reason: "empty" };

  const score = pts * 1e6 + sh;
  const prev = await zscore(SESSION_POINTS_KEY, member);
  if (!isBetterScore("session", score, prev)) {
    return { updated: false, reason: "not_improved" };
  }

  await zadd(SESSION_POINTS_KEY, score, member);
  if (sh > 0) await zadd(SESSION_SHELLS_KEY, sh, member);
  await hset(
    SESSION_META_KEY,
    member,
    JSON.stringify({
      wallet: member,
      walletShort: memberDisplayShort(member, {
        isDemo,
        demoShort: isDemo ? shortWallet(String(walletOrDemoId || "")) : undefined,
      }),
      isDemo,
      points: pts,
      shells: sh,
      submittedAt: Date.now(),
    }),
  );
  return { updated: true };
}

/** Best run for a mode (race finish POST or award payload). */
async function upsertLeaderboardEntry(walletOrDemoId, mode, stats, opts = {}) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };
  if (mode === "session") {
    return upsertSessionLeaderboard(walletOrDemoId, stats.points, stats.shells, opts);
  }

  const isDemo = !!opts.isDemo;
  const member = resolveMember(walletOrDemoId, walletOrDemoId, isDemo);
  if (!member) return { updated: false, reason: isDemo ? "bad_demo_id" : "bad_wallet" };

  const dateISO =
    typeof stats.dateISO === "string" && stats.dateISO
      ? stats.dateISO.slice(0, 10)
      : mode === "daily"
        ? todayISO()
        : "";

  if (!shouldAcceptSubmission(mode, { ...stats, dateISO })) {
    return { updated: false, reason: "ineligible" };
  }

  const key = redisKey(mode, dateISO);
  const metaKey = metaHashKey(mode, dateISO);
  const score = scoreForMode(mode, { ...stats, dateISO });
  const prev = await zscore(key, member);
  if (!isBetterScore(mode, score, prev)) {
    return { updated: false, reason: "not_improved" };
  }

  await zadd(key, score, member);
  await hset(
    metaKey,
    member,
    JSON.stringify(buildMeta(mode, walletOrDemoId, { ...stats, dateISO }, { isDemo })),
  );
  return { updated: true };
}

async function handleGet(query) {
  if (!isKvConfigured()) {
    return {
      status: 200,
      json: { ok: true, configured: false, game: "otter-kart", boards: {}, rows: [], updatedAt: Date.now() },
    };
  }

  const limit = parseLimit(query?.limit, 8);
  const dateISO = typeof query?.date === "string" && query.date ? query.date.slice(0, 10) : todayISO();
  const all = query?.all === "1" || query?.all === "true" || !query?.mode;
  const mode = typeof query?.mode === "string" ? query.mode.trim() : "";

  try {
    if (all) {
      const boards = {};
      for (const id of MODE_IDS) {
        const boardDate = id === "daily" ? dateISO : "";
        boards[id] = {
          label: MODE_LABELS[id],
          date: id === "daily" ? dateISO : undefined,
          rows: await readBoard(id, boardDate, limit),
        };
      }
      return {
        status: 200,
        json: { ok: true, configured: true, game: "otter-kart", boards, updatedAt: Date.now() },
      };
    }

    if (!MODE_IDS.includes(mode)) {
      return { status: 400, json: { ok: false, error: "Unknown mode." } };
    }
    const boardDate = mode === "daily" ? dateISO : "";
    const rows = await readBoard(mode, boardDate, limit);
    return {
      status: 200,
      json: {
        ok: true,
        configured: true,
        game: "otter-kart",
        mode,
        label: MODE_LABELS[mode],
        date: mode === "daily" ? dateISO : undefined,
        rows,
        updatedAt: Date.now(),
      },
    };
  } catch (e) {
    return {
      status: 200,
      json: {
        ok: true,
        configured: true,
        game: "otter-kart",
        boards: {},
        rows: [],
        error: e && e.message ? e.message : "Failed to read leaderboard.",
        updatedAt: Date.now(),
      },
    };
  }
}

async function handlePost(body, env, nowSec) {
  if (!isKvConfigured()) {
    return { status: 200, json: { ok: true, configured: false, skipped: "not_configured" } };
  }

  const isDemo = body?.demo === true || body?.demo === "true";
  const demoId = typeof body?.demoId === "string" ? body.demoId.trim() : "";
  const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
  const stats = body?.stats && typeof body.stats === "object" ? body.stats : {};

  if (isDemo) {
    if (!sanitizeDemoId(demoId)) {
      return { status: 400, json: { ok: false, error: "Invalid demoId." } };
    }
    if (!MODE_IDS.includes(mode)) {
      return { status: 400, json: { ok: false, error: "Unknown mode." } };
    }

    if (mode === "session") {
      const shells = Math.min(MAX_DEMO_SHELLS, Math.max(0, Math.floor(Number(stats.shells) || 0)));
      const points = Math.min(
        MAX_DEMO_SHELLS,
        Math.max(0, Math.floor(Number(stats.points) || shells)),
      );
      try {
        const result = await upsertSessionLeaderboard(demoId, points, shells, { isDemo: true });
        return { status: 200, json: { ok: true, demo: true, ...result } };
      } catch (e) {
        return {
          status: 500,
          json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
        };
      }
    }

    const normalizedStats = {
      ...stats,
      dateISO: mode === "daily" ? stats.dateISO || todayISO() : stats.dateISO || "",
    };
    if (!shouldAcceptSubmission(mode, normalizedStats)) {
      return { status: 400, json: { ok: false, error: "Run not eligible for this leaderboard." } };
    }

    try {
      const result = await upsertLeaderboardEntry(demoId, mode, normalizedStats, { isDemo: true });
      return { status: 200, json: { ok: true, demo: true, ...result } };
    } catch (e) {
      return {
        status: 500,
        json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
      };
    }
  }

  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
  const issuedAtSec =
    typeof body?.issuedAtSec === "number" && Number.isFinite(body.issuedAtSec)
      ? Math.floor(body.issuedAtSec)
      : NaN;

  const allowUnsignedDev =
    env.OTTER_KART_LB_ALLOW_UNSIGNED_DEV === "1" &&
    (env.NODE_ENV === "development" || env.VERCEL_ENV === "preview");

  if (!MODE_IDS.includes(mode) || mode === "session") {
    return { status: 400, json: { ok: false, error: "Unknown mode." } };
  }
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return { status: 400, json: { ok: false, error: "Wallet required." } };
  }
  if (!runId || runId.length > 128) {
    return { status: 400, json: { ok: false, error: "Invalid runId." } };
  }

  const normalizedStats = {
    ...stats,
    dateISO: mode === "daily" ? stats.dateISO || todayISO() : stats.dateISO || "",
  };
  if (!shouldAcceptSubmission(mode, normalizedStats)) {
    return { status: 400, json: { ok: false, error: "Run not eligible for this leaderboard." } };
  }

  if (!allowUnsignedDev) {
    if (!signature) {
      return { status: 401, json: { ok: false, error: "Wallet signature required." } };
    }
    const good = await verifySubmitSignature({
      wallet,
      mode,
      runId,
      issuedAtSec,
      signature,
      nowSec,
      stats: normalizedStats,
    });
    if (!good) {
      return { status: 403, json: { ok: false, error: "Invalid or expired signature." } };
    }
  }

  try {
    const result = await upsertLeaderboardEntry(wallet, mode, normalizedStats);
    return { status: 200, json: { ok: true, ...result } };
  } catch (e) {
    return {
      status: 500,
      json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
    };
  }
}

module.exports = {
  handleGet,
  handlePost,
  upsertLeaderboardEntry,
  upsertSessionLeaderboard,
};
