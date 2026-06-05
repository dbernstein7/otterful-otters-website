const MODE_IDS = ["practice", "daily", "touge", "endless", "grandprix"];

const MODE_LABELS = {
  practice: "Practice",
  daily: "Drift challenge",
  touge: "Neon Snake",
  endless: "Endless Neon Snake",
  grandprix: "Grand Prix",
};

const MODE_COLUMNS = {
  practice: [
    { key: "player", header: "Player" },
    { key: "shells", header: "🐚" },
    { key: "totalTime", header: "3 laps" },
  ],
  daily: [
    { key: "player", header: "Player" },
    { key: "shells", header: "🐚" },
    { key: "longestDrift", header: "Longest drift" },
    { key: "longestDriftTime", header: "Drift time" },
  ],
  touge: [
    { key: "player", header: "Player" },
    { key: "shells", header: "🐚" },
    { key: "totalTime", header: "Time" },
    { key: "longestDrift", header: "Longest drift" },
    { key: "longestDriftTime", header: "Drift time" },
  ],
  endless: [
    { key: "player", header: "Player" },
    { key: "distance", header: "Distance" },
    { key: "shells", header: "🐚" },
    { key: "shellBonus", header: "Dist bonus" },
    { key: "longestDrift", header: "Longest drift" },
    { key: "longestDriftTime", header: "Drift time" },
  ],
  grandprix: [
    { key: "player", header: "Player" },
    { key: "gpTotalShells", header: "Total 🐚" },
    { key: "gpPickupShells", header: "Race 🐚" },
    { key: "gpShellBonus", header: "Bonus 🐚" },
    { key: "gpPlayerPoints", header: "Pts" },
    { key: "gpTotalTime", header: "Time" },
  ],
};

function shortWallet(w) {
  if (!w || typeof w !== "string") return "—";
  const s = w.trim().replace(/^demo:/, "");
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function sanitizeDemoId(raw) {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  return id;
}

function demoMemberKey(demoId) {
  const id = sanitizeDemoId(demoId);
  if (!id) return null;
  return `demo:${id}`;
}

function isDemoMember(member) {
  return typeof member === "string" && member.startsWith("demo:");
}

function memberDisplayShort(member, meta) {
  if (meta?.playerName) return meta.playerName;
  return meta?.walletShort || shortWallet(meta?.wallet || member);
}

function redisKey(mode, dateISO) {
  if (mode === "daily" && dateISO) return `otterkart:lb:daily:${dateISO}`;
  return `otterkart:lb:${mode}`;
}

function metaHashKey(mode, dateISO) {
  return `${redisKey(mode, dateISO)}:meta`;
}

function scoreForMode(mode, stats) {
  switch (mode) {
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
      const driftT = Math.max(0, Number(stats.endlessLongestDriftTime) || 0);
      const shells = Math.max(0, Math.floor(Number(stats.shells) || 0));
      return (
        Math.round(dist * 1000) * 1e12 +
        Math.round(drift * 1000) * 1e6 +
        Math.round(driftT * 1000) * 1e3 +
        shells
      );
    }
    case "grandprix": {
      const totalShells = Math.max(
        0,
        Math.floor(Number(stats.gpTotalShells ?? stats.shells) || 0),
      );
      const pts = Math.max(0, Math.floor(Number(stats.gpPlayerPoints) || 0));
      return totalShells * 1e12 + pts;
    }
    case "practice":
    case "touge": {
      const timeMs = Math.round(Math.max(0, Number(stats.totalTime) || 0) * 1000);
      const shells = Math.max(0, Math.floor(Number(stats.shells) || 0));
      return -timeMs * 1e6 + shells;
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

function cellValuesForMode(mode, meta) {
  const player = memberDisplayShort(meta.wallet || "", meta);
  const gpTotalShells = Math.max(
    0,
    Math.floor(Number(meta.gpTotalShells ?? meta.shells) || 0),
  );
  const gpShellBonus = Math.max(0, Math.floor(Number(meta.gpShellBonus) || 0));
  const gpPickupShells = Math.max(
    0,
    Math.floor(Number(meta.gpPickupShells) || gpTotalShells - gpShellBonus),
  );
  const driftDist = mode === "endless" ? meta.endlessLongestDrift : meta.longestDrift;
  const driftTime = mode === "endless" ? meta.endlessLongestDriftTime : meta.longestDriftTime;

  return {
    player,
    shells: String(meta.shells ?? 0),
    totalTime: fmtTime(meta.totalTime),
    longestDrift: fmtDist(driftDist),
    longestDriftTime: fmtSec(driftTime),
    distance: fmtDist(meta.distance),
    shellBonus: String(meta.shellBonus ?? 0),
    gpTotalShells: String(gpTotalShells),
    gpPickupShells: String(gpPickupShells),
    gpShellBonus: String(gpShellBonus),
    gpPlayerPoints: String(meta.gpPlayerPoints ?? 0),
    gpTotalTime: fmtTime(meta.gpTotalTime),
  };
}

function buildRowCells(mode, meta) {
  const cols = MODE_COLUMNS[mode] || MODE_COLUMNS.practice;
  const values = cellValuesForMode(mode, meta);
  return cols.map((col) => ({
    key: col.key,
    header: col.header,
    value: values[col.key] ?? "—",
  }));
}

function compactLabel(mode, cells) {
  const player = cells.find((c) => c.key === "player")?.value ?? "—";
  const parts = cells
    .filter((c) => c.key !== "player")
    .map((c) => {
      if (c.key === "shells" || c.key === "gpTotalShells") return `🐚 ${c.value}`;
      if (c.key === "totalTime") return mode === "practice" ? `3 laps ${c.value}` : c.value;
      if (c.key === "longestDrift" || c.key === "endlessLongestDrift") return `drift ${c.value}`;
      if (c.key === "longestDriftTime" || c.key === "endlessLongestDriftTime") return `${c.value} drift`;
      if (c.key === "shellBonus") return `bonus 🐚 ${c.value}`;
      if (c.key === "gpPickupShells") return `race 🐚 ${c.value}`;
      if (c.key === "gpShellBonus") return `bonus 🐚 ${c.value}`;
      if (c.key === "gpPlayerPoints") return `${c.value} pts`;
      if (c.key === "gpTotalTime") return c.value;
      if (c.key === "distance") return c.value;
      return c.value;
    });
  return `${player} · ${parts.join(" · ")}`;
}

function formatRow(mode, meta, rank) {
  const walletShort = memberDisplayShort(meta.wallet || "", meta);
  const cells = buildRowCells(mode, meta);
  const base = { rank, wallet: meta.wallet || "", walletShort, cells, label: compactLabel(mode, cells) };
  switch (mode) {
    case "daily":
      return {
        ...base,
        shells: meta.shells ?? 0,
        longestDrift: meta.longestDrift ?? 0,
        longestDriftTime: meta.longestDriftTime ?? 0,
      };
    case "endless":
      return {
        ...base,
        distance: meta.distance ?? 0,
        endlessLongestDrift: meta.endlessLongestDrift ?? 0,
        endlessLongestDriftTime: meta.endlessLongestDriftTime ?? 0,
        shells: meta.shells ?? 0,
        shellBonus: meta.shellBonus ?? 0,
      };
    case "grandprix":
      return {
        ...base,
        gpPlayerPoints: meta.gpPlayerPoints ?? 0,
        gpTotalTime: meta.gpTotalTime ?? 0,
        gpTotalShells: meta.gpTotalShells ?? meta.shells ?? 0,
        gpPickupShells: meta.gpPickupShells ?? 0,
        gpShellBonus: meta.gpShellBonus ?? 0,
      };
    case "touge":
      return {
        ...base,
        totalTime: meta.totalTime ?? 0,
        shells: meta.shells ?? 0,
        longestDrift: meta.longestDrift ?? 0,
        longestDriftTime: meta.longestDriftTime ?? 0,
      };
    default:
      return {
        ...base,
        totalTime: meta.totalTime ?? 0,
        shells: meta.shells ?? 0,
      };
  }
}

function buildMeta(mode, walletOrDemoId, stats, opts = {}) {
  const isDemo = !!opts.isDemo;
  const member = isDemo ? demoMemberKey(walletOrDemoId) : String(walletOrDemoId || "").trim().toLowerCase();
  const playerName = isDemo && opts.playerName ? opts.playerName : "";
  const display = playerName || shortWallet(isDemo ? String(walletOrDemoId || "") : member);
  const gpTotalShells = Math.max(
    0,
    Math.floor(Number(stats.gpTotalShells ?? stats.shells) || 0),
  );
  const gpShellBonus = Math.max(
    0,
    Math.floor(Number(stats.gpShellBonus ?? stats.gpSeriesPayout) || 0),
  );
  const gpPickupShells = Math.max(
    0,
    Math.floor(Number(stats.gpPickupShells) || gpTotalShells - gpShellBonus),
  );

  return {
    wallet: member,
    walletShort: display,
    playerName: playerName || undefined,
    mode,
    dateISO: stats.dateISO || "",
    totalTime: Number(stats.totalTime) || 0,
    bestLap: Number(stats.bestLap) || 0,
    shells: Math.floor(Number(stats.shells) || 0),
    longestDrift: Number(stats.longestDrift) || 0,
    longestDriftTime: Number(stats.longestDriftTime) || 0,
    distance: Number(stats.distance) || 0,
    endlessLongestDrift: Number(stats.endlessLongestDrift) || 0,
    endlessLongestDriftTime: Number(stats.endlessLongestDriftTime) || 0,
    shellBonus: Math.floor(Number(stats.shellBonus ?? stats.endlessDistShellBonus) || 0),
    gpTotalTime: Number(stats.gpTotalTime) || 0,
    gpPlayerPoints: Math.floor(Number(stats.gpPlayerPoints) || 0),
    gpTotalShells,
    gpPickupShells,
    gpShellBonus,
    submittedAt: Date.now(),
  };
}

function shouldAcceptSubmission(mode, stats) {
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

function getModeColumns(mode) {
  return MODE_COLUMNS[mode] || MODE_COLUMNS.practice;
}

module.exports = {
  MODE_IDS,
  MODE_LABELS,
  MODE_COLUMNS,
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
  isDemoMember,
  memberDisplayShort,
};
