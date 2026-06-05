const {
  MODE_IDS,
  MODE_LABELS,
  getModeColumns,
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
const { sanitizePlayerName } = require("./names.js");
const {
  isKvConfigured,
  zrevrangeWithScores,
  zscore,
  zadd,
  hset,
  hget,
  kvGet,
  kvSet,
  kvDel,
  kvKeys,
} = require("./kv.js");

const LB_DATA_VERSION = 3;
const LB_VERSION_KEY = "otterkart:lb:version";
const TOP_SLOTS = 10;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseLimit(raw, fallback = TOP_SLOTS) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20, Math.max(TOP_SLOTS, Math.floor(n)));
}

function padRows(rows, limit) {
  const out = Array.isArray(rows) ? rows.slice(0, limit) : [];
  while (out.length < limit) {
    out.push({
      rank: out.length + 1,
      label: "",
      walletShort: "",
      blank: true,
    });
  }
  return out;
}

function resolveMember(wallet, demoId, isDemo) {
  if (isDemo) return demoMemberKey(demoId);
  const w = String(wallet || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;
  return w;
}

async function resetAllLeaderboards() {
  if (!isKvConfigured()) return { ok: false, reason: "not_configured" };

  const staticKeys = [
    "otterkart:lb:practice",
    "otterkart:lb:practice:meta",
    "otterkart:lb:touge",
    "otterkart:lb:touge:meta",
    "otterkart:lb:endless",
    "otterkart:lb:endless:meta",
    "otterkart:lb:grandprix",
    "otterkart:lb:grandprix:meta",
    "otterkart:lb:session:points",
    "otterkart:lb:session:shells",
    "otterkart:lb:session:meta",
    `${redisKey("daily", todayISO())}`,
    `${metaHashKey("daily", todayISO())}`,
  ];

  let keys = [...staticKeys];
  try {
    const found = await kvKeys("otterkart:lb:*");
    if (Array.isArray(found)) keys.push(...found);
  } catch {}

  keys = [...new Set(keys.filter(Boolean))];
  for (const key of keys) {
    try {
      await kvDel(key);
    } catch {}
  }
  return { ok: true, deleted: keys.length };
}

async function ensureLeaderboardGeneration() {
  if (!isKvConfigured()) return;
  try {
    const current = Number(await kvGet(LB_VERSION_KEY));
    if (Number.isFinite(current) && current >= LB_DATA_VERSION) return;
    await resetAllLeaderboards();
    await kvSet(LB_VERSION_KEY, String(LB_DATA_VERSION));
  } catch {}
}

async function readBoard(mode, dateISO, limit) {
  const key = redisKey(mode, dateISO);
  const metaKey = metaHashKey(mode, dateISO);
  const raw = await zrevrangeWithScores(key, limit);
  const rows = [];
  if (!Array.isArray(raw)) return padRows(rows, limit);

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
  return padRows(rows, limit);
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
    JSON.stringify(buildMeta(mode, walletOrDemoId, { ...stats, dateISO }, opts)),
  );
  return { updated: true };
}

async function handleGet(query) {
  await ensureLeaderboardGeneration();

  if (!isKvConfigured()) {
    const blankBoards = {};
    for (const id of MODE_IDS) {
      blankBoards[id] = {
        label: MODE_LABELS[id],
        columns: getModeColumns(id),
        date: id === "daily" ? todayISO() : undefined,
        rows: padRows([], TOP_SLOTS),
      };
    }
    return {
      status: 200,
      json: { ok: true, configured: false, game: "otter-kart", boards: blankBoards, rows: [], updatedAt: Date.now() },
    };
  }

  const limit = parseLimit(query?.limit, TOP_SLOTS);
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
          columns: getModeColumns(id),
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
        columns: getModeColumns(mode),
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
        rows: padRows([], limit),
        error: e && e.message ? e.message : "Failed to read leaderboard.",
        updatedAt: Date.now(),
      },
    };
  }
}

async function handlePost(body) {
  await ensureLeaderboardGeneration();

  if (!isKvConfigured()) {
    return { status: 200, json: { ok: true, configured: false, skipped: "not_configured" } };
  }

  const isDemo = body?.demo === true || body?.demo === "true";
  const demoId = typeof body?.demoId === "string" ? body.demoId.trim() : "";
  const playerNameRaw = typeof body?.playerName === "string" ? body.playerName : "";
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
    const playerName = sanitizePlayerName(playerNameRaw);
    if (!playerName) {
      return { status: 400, json: { ok: false, error: "Invalid player name." } };
    }
    try {
      const result = await upsertLeaderboardEntry(demoId, mode, normalizedStats, {
        isDemo: true,
        playerName,
      });
      return { status: 200, json: { ok: true, ...result } };
    } catch (e) {
      return {
        status: 500,
        json: { ok: false, error: e && e.message ? e.message : "Failed to save score." },
      };
    }
  }

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return { status: 400, json: { ok: false, error: "Wallet or demo player required." } };
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
  resetAllLeaderboards,
};
