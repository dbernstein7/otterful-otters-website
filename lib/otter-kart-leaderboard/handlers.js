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
  sanitizePlayerId,
  playerMemberKey,
  memberDisplayShort,
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

const MAX_SHELLS = 50000;

function optionalWallet(raw) {
  const w = String(raw || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(w) ? w : "";
}

async function readSessionBoard(limit) {
  const raw = await zrevrangeWithScores(SESSION_POINTS_KEY, limit);
  const rows = [];
  if (!Array.isArray(raw)) return rows;

  for (let i = 0; i < raw.length; i += 2) {
    const member = String(raw[i] || "");
    let shells = 0;
    let points = 0;
    try {
      const s = await hget(SESSION_SHELLS_KEY, member);
      shells = s != null ? Number(s) : 0;
    } catch {}
    const metaRaw = await hget(SESSION_META_KEY, member).catch(() => null);
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
        wallet: member,
        walletShort: memberDisplayShort(member, {}),
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
    const member = String(raw[i] || "");
    const metaRaw = await hget(metaKey, member).catch(() => null);
    let meta = null;
    try {
      meta = metaRaw ? JSON.parse(metaRaw) : null;
    } catch {
      meta = null;
    }
    if (!meta) {
      meta = { wallet: member, walletShort: memberDisplayShort(member, {}) };
    }
    rows.push(formatRow(mode, meta, rows.length + 1));
  }
  return rows;
}

async function upsertSessionLeaderboard(playerId, points, shells, opts = {}) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };
  const member = playerMemberKey(playerId);
  if (!member) return { updated: false, reason: "bad_player_id" };

  const pts = Math.min(MAX_SHELLS, Math.max(0, Math.floor(Number(points) || 0)));
  const sh = Math.min(MAX_SHELLS, Math.max(0, Math.floor(Number(shells) || 0)));
  if (pts <= 0 && sh <= 0) return { updated: false, reason: "empty" };

  const score = pts * 1e6 + sh;
  const prev = await zscore(SESSION_POINTS_KEY, member);
  if (!isBetterScore("session", score, prev)) {
    return { updated: false, reason: "not_improved" };
  }

  const wallet = optionalWallet(opts.wallet);
  await zadd(SESSION_POINTS_KEY, score, member);
  if (sh > 0) await zadd(SESSION_SHELLS_KEY, sh, member);
  await hset(
    SESSION_META_KEY,
    member,
    JSON.stringify({
      wallet: member,
      walletShort: wallet ? shortWallet(wallet) : shortWallet(String(playerId || "")),
      playerId: String(playerId || ""),
      points: pts,
      shells: sh,
      submittedAt: Date.now(),
    }),
  );
  return { updated: true };
}

async function upsertLeaderboardEntry(playerId, mode, stats, opts = {}) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };
  if (mode === "session") {
    return upsertSessionLeaderboard(playerId, stats.points, stats.shells, opts);
  }

  const member = playerMemberKey(playerId);
  if (!member) return { updated: false, reason: "bad_player_id" };

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
    JSON.stringify(buildMeta(mode, playerId, { ...stats, dateISO }, { wallet: opts.wallet })),
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

  const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : "";
  const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
  const stats = body?.stats && typeof body.stats === "object" ? body.stats : {};
  const wallet = optionalWallet(body?.wallet);

  if (!sanitizePlayerId(playerId)) {
    return { status: 400, json: { ok: false, error: "Invalid playerId." } };
  }
  if (!MODE_IDS.includes(mode)) {
    return { status: 400, json: { ok: false, error: "Unknown mode." } };
  }

  const opts = { wallet };

  if (mode === "session") {
    const shells = Math.min(MAX_SHELLS, Math.max(0, Math.floor(Number(stats.shells) || 0)));
    const points = Math.min(MAX_SHELLS, Math.max(0, Math.floor(Number(stats.points) || shells)));
    try {
      const result = await upsertSessionLeaderboard(playerId, points, shells, opts);
      return { status: 200, json: { ok: true, ...result } };
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
    const result = await upsertLeaderboardEntry(playerId, mode, normalizedStats, opts);
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
