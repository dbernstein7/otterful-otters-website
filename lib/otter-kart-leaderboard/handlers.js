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
  shortWallet,
  sanitizeDemoId,
  demoMemberKey,
} = require("./modes.js");
const { isKvConfigured, zrevrangeWithScores, zscore, zadd, hset, hget } = require("./kv.js");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseLimit(raw, fallback = 8) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20, Math.max(3, Math.floor(n)));
}

function resolveMember(wallet, demoId, isDemo) {
  if (isDemo) return demoMemberKey(demoId);
  const w = String(wallet || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  return w;
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
      meta = { wallet, walletShort: shortWallet(wallet) };
    }
    rows.push(formatRow(mode, meta, rows.length + 1));
  }
  return rows;
}

async function upsertLeaderboardEntry(walletOrDemoId, mode, stats, opts = {}) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };

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

async function handlePost(body) {
  if (!isKvConfigured()) {
    return { status: 200, json: { ok: true, configured: false, skipped: "not_configured" } };
  }

  const isDemo = body?.demo === true || body?.demo === "true";
  const demoId = typeof body?.demoId === "string" ? body.demoId.trim() : "";
  const wallet = typeof body?.wallet === "string" ? body.wallet.trim().toLowerCase() : "";
  const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
  const stats = body?.stats && typeof body.stats === "object" ? body.stats : {};

  if (!MODE_IDS.includes(mode)) {
    return { status: 400, json: { ok: false, error: "Unknown mode." } };
  }

  const normalizedStats = {
    ...stats,
    dateISO: mode === "daily" ? stats.dateISO || todayISO() : stats.dateISO || "",
  };
  if (!shouldAcceptSubmission(mode, normalizedStats)) {
    return { status: 400, json: { ok: false, error: "Run not eligible for this leaderboard." } };
  }

  if (isDemo) {
    if (!sanitizeDemoId(demoId)) {
      return { status: 400, json: { ok: false, error: "Invalid demoId." } };
    }
    try {
      const result = await upsertLeaderboardEntry(demoId, mode, normalizedStats, { isDemo: true });
      return { status: 200, json: { ok: true, ...result } };
    } catch (e) {
      return {
        status: 500,
        json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
      };
    }
  }

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return { status: 400, json: { ok: false, error: "Wallet or demoId required." } };
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
};
