const {
  MODE_IDS,
  MODE_LABELS,
  redisKey,
  metaHashKey,
  scoreForMode,
  isBetterScore,
  formatRow,
  buildMeta,
  shouldAcceptSubmission,
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

async function readBoard(mode, dateISO, limit) {
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
      meta = { wallet, walletShort: wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet };
    }
    rows.push(formatRow(mode, meta, rows.length + 1));
  }
  return rows;
}

async function handleGet(query) {
  if (!isKvConfigured()) {
    return {
      status: 200,
      json: { ok: true, configured: false, boards: {}, updatedAt: Date.now() },
    };
  }

  const limit = parseLimit(query?.limit, 8);
  const dateISO = typeof query?.date === "string" && query.date ? query.date.slice(0, 10) : todayISO();
  const all = query?.all === "1" || query?.all === "true";
  const mode = typeof query?.mode === "string" ? query.mode.trim() : "";

  try {
    if (all || !mode) {
      const boards = {};
      for (const id of MODE_IDS) {
        const boardDate = id === "daily" ? dateISO : "";
        boards[id] = {
          label: MODE_LABELS[id],
          date: id === "daily" ? dateISO : undefined,
          rows: await readBoard(id, boardDate, limit),
        };
      }
      return { status: 200, json: { ok: true, configured: true, boards, updatedAt: Date.now() } };
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

  const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim() : "";
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const signature = typeof body?.signature === "string" ? body.signature.trim() : "";
  const issuedAtSec =
    typeof body?.issuedAtSec === "number" && Number.isFinite(body.issuedAtSec)
      ? Math.floor(body.issuedAtSec)
      : NaN;
  const stats = body?.stats && typeof body.stats === "object" ? body.stats : {};
  const dateISO =
    typeof stats.dateISO === "string" && stats.dateISO
      ? stats.dateISO.slice(0, 10)
      : mode === "daily"
        ? todayISO()
        : "";

  const allowUnsignedDev =
    env.OTTER_KART_LB_ALLOW_UNSIGNED_DEV === "1" &&
    (env.NODE_ENV === "development" || env.VERCEL_ENV === "preview");

  if (!MODE_IDS.includes(mode)) {
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
    dateISO: mode === "daily" ? dateISO : stats.dateISO || "",
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

  const member = wallet.toLowerCase();
  const key = redisKey(mode, dateISO);
  const metaKey = metaHashKey(mode, dateISO);
  const score = scoreForMode(mode, normalizedStats);

  try {
    const prev = await zscore(key, member);
    if (!isBetterScore(mode, score, prev)) {
      return { status: 200, json: { ok: true, updated: false, reason: "not_improved" } };
    }
    await zadd(key, score, member);
    await hset(metaKey, member, JSON.stringify(buildMeta(mode, wallet, normalizedStats)));
    return { status: 200, json: { ok: true, updated: true } };
  } catch (e) {
    return {
      status: 500,
      json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
    };
  }
}

module.exports = { handleGet, handlePost };
