const MODE_IDS = ["session", "practice", "daily", "touge", "endless", "grandprix"];

const MODE_LABELS = {
  session: "Session shells",
  practice: "Practice",
  daily: "Drift challenge",
  touge: "Neon Snake",
  endless: "Endless Neon Snake",
  grandprix: "Grand Prix",
};

/** Shell Rush-style session totals (updated on shell claim / award). */
const SESSION_POINTS_KEY = "otterkart:lb:session:points";
const SESSION_SHELLS_KEY = "otterkart:lb:session:shells";
const SESSION_META_KEY = "otterkart:lb:session:meta";

function shortWallet(w) {
  if (!w || typeof w !== "string") return "—";
  const s = w.trim();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function sanitizePlayerId(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  return id;
}

function playerMemberKey(playerId) {
  const id = sanitizePlayerId(playerId);
  if (!id) return null;
  return `p:${id}`;
}

function memberDisplayShort(member, meta) {
  if (meta?.username) return meta.username;
  if (meta?.walletShort && !String(meta.walletShort).includes("…")) return meta.walletShort;
  const raw = String(member || "").replace(/^p:/, "").replace(/^demo:/, "");
  return shortWallet(raw) || "Player";
}

function redisKey(mode, dateISO) {
  if (mode === "session") return SESSION_POINTS_KEY;
  if (mode === "daily" && dateISO) return `otterkart:lb:daily:${dateISO}`;
  return `otterkart:lb:${mode}`;
}

function metaHashKey(mode, dateISO) {
  if (mode === "session") return SESSION_META_KEY;
  return `${redisKey(mode, dateISO)}:meta`;
}

function scoreForMode(mode, stats) {
  switch (mode) {
    case "session": {
      const points = Math.max(0, Math.floor(Number(stats.points) || 0));
      const shells = Math.max(0, Math.floor(Number(stats.shells) || 0));
      return points * 1e6 + shells;
    }
    case "daily": {
      const shells = Math.max(0, Math.floor(Number(stats.shells) || 0));
      const drift = Math.max(0, Number(stats.longestDrift) || 0);
      const driftT = Math.max(0, Number(stats.longestDriftTime) || 0);
      return (
        shells * 1e12 +
        Math.round(drift * 1000) * 1e6 +
        Math.round(driftT * 1000)
      );
    }
    case "endless": {
      const dist = Math.max(0, Number(stats.distance) || 0);
      const drift = Math.max(0, Number(stats.endlessLongestDrift) || 0);
      return Math.round(dist * 1000) * 1e6 + Math.round(drift * 1000);
    }
    case "grandprix": {
      const pts = Math.max(0, Math.floor(Number(stats.gpPlayerPoints) || 0));
      const totalMs = Math.round(Math.max(0, Number(stats.gpTotalTime) || 0) * 1000);
      return pts * 1e12 - totalMs;
    }
    default: {
      const timeMs = Math.round(Math.max(0, Number(stats.totalTime) || 0) * 1000);
      return -timeMs;
    }
  }
}

function isBetterScore(mode, nextScore, prevScore) {
  if (prevScore == null) return true;
  const prev = Number(prevScore);
  const next = Number(nextScore);
  if (!Number.isFinite(prev)) return true;
  return next > prev;
}

function formatRow(mode, meta, rank) {
  const walletShort = memberDisplayShort(meta.wallet || "", meta);
  const base = { rank, wallet: meta.wallet || "", walletShort, isDemo: !!meta.isDemo };
  switch (mode) {
    case "session":
      return {
        ...base,
        label: `${walletShort} · ${meta.points ?? 0} pts · 🐚 ${meta.shells ?? 0}`,
        points: meta.points ?? 0,
        shells: meta.shells ?? 0,
      };
    case "daily":
      return {
        ...base,
        label: `${walletShort} · 🐚 ${meta.shells ?? 0} · ${fmtDist(meta.longestDrift)} · ${fmtSec(
          meta.longestDriftTime,
        )}`,
        shells: meta.shells ?? 0,
        longestDrift: meta.longestDrift ?? 0,
        longestDriftTime: meta.longestDriftTime ?? 0,
      };
    case "endless":
      return {
        ...base,
        label: `${walletShort} · ${fmtDist(meta.distance)} · drift ${fmtDist(meta.endlessLongestDrift)} · 🐚 ${
          meta.shells ?? 0
        }`,
        distance: meta.distance ?? 0,
        endlessLongestDrift: meta.endlessLongestDrift ?? 0,
        shells: meta.shells ?? 0,
      };
    case "grandprix":
      return {
        ...base,
        label: `${walletShort} · ${meta.gpPlayerPoints ?? 0} pts · ${fmtTime(meta.gpTotalTime)} · 🐚 ${
          meta.shells ?? 0
        }`,
        gpPlayerPoints: meta.gpPlayerPoints ?? 0,
        gpTotalTime: meta.gpTotalTime ?? 0,
        shells: meta.shells ?? 0,
      };
    default:
      return {
        ...base,
        label: `${walletShort} · ${fmtTime(meta.totalTime)} · lap ${fmtTime(meta.bestLap)} · 🐚 ${meta.shells ?? 0}`,
        totalTime: meta.totalTime ?? 0,
        bestLap: meta.bestLap ?? 0,
        shells: meta.shells ?? 0,
      };
  }
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
}

function fmtDist(m) {
  const v = Math.max(0, Number(m) || 0);
  if (v >= 1609.344) return `${(v / 1609.344).toFixed(2)} mi`;
  return `${Math.round(v)} m`;
}

function fmtSec(sec) {
  const s = Math.max(0, Number(sec) || 0);
  return `${s.toFixed(1)}s`;
}

function buildMeta(mode, playerId, stats, opts = {}) {
  const member = playerMemberKey(playerId);
  const wallet = opts.wallet && /^0x[a-f0-9]{40}$/.test(String(opts.wallet).toLowerCase())
    ? String(opts.wallet).toLowerCase()
    : "";
  const username = typeof opts.username === "string" ? opts.username : "";
  const display = username || (wallet ? shortWallet(wallet) : shortWallet(String(playerId || "")));
  return {
    wallet: member || `p:${String(playerId || "").slice(0, 64)}`,
    walletShort: display,
    username,
    playerId: String(playerId || ""),
    mode,
    dateISO: stats.dateISO || "",
    totalTime: Number(stats.totalTime) || 0,
    bestLap: Number(stats.bestLap) || 0,
    shells: Math.floor(Number(stats.shells) || 0),
    longestDrift: Number(stats.longestDrift) || 0,
    longestDriftTime: Number(stats.longestDriftTime) || 0,
    distance: Number(stats.distance) || 0,
    endlessLongestDrift: Number(stats.endlessLongestDrift) || 0,
    gpTotalTime: Number(stats.gpTotalTime) || 0,
    gpPlayerPoints: Math.floor(Number(stats.gpPlayerPoints) || 0),
    submittedAt: Date.now(),
  };
}

function shouldAcceptSubmission(mode, stats) {
  if (mode === "session") {
    return (Number(stats.points) || 0) > 0 || (Number(stats.shells) || 0) > 0;
  }
  if (!MODE_IDS.includes(mode)) return false;
  if (mode === "grandprix" && !stats.gpSeriesComplete) return false;
  if (mode === "daily" && !stats.dateISO) return false;
  if (mode === "endless" && (Number(stats.distance) || 0) <= 0) return false;
  if (
    (mode === "practice" || mode === "touge") &&
    (Number(stats.totalTime) || 0) <= 0
  ) {
    return false;
  }
  return true;
}

const LB_KEY_PREFIX = "otterkart:lb:";

module.exports = {
  MODE_IDS,
  MODE_LABELS,
  SESSION_POINTS_KEY,
  SESSION_SHELLS_KEY,
  SESSION_META_KEY,
  LB_KEY_PREFIX,
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
};
