const { zadd, zscore, isKvConfigured } = require("../otter-kart-leaderboard/kv.js");

const POINTS_KEY = "shellrush:leaderboard:points";
const SHELLS_KEY = "shellrush:leaderboard:shells";

async function updateShellRushLeaderboard(wallet, shells, points) {
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };

  const member = String(wallet || "").trim().toLowerCase();
  const shellVal = Math.max(0, Math.floor(Number(shells) || 0));
  const pointVal = Math.max(0, Math.floor(Number(points) || 0));
  if (!member || (shellVal <= 0 && pointVal <= 0)) {
    return { updated: false, reason: "empty" };
  }

  const bestPointsRaw = await zscore(POINTS_KEY, member).catch(() => null);
  const bestShellsRaw = await zscore(SHELLS_KEY, member).catch(() => null);
  const bestPoints = bestPointsRaw != null ? Number(bestPointsRaw) : 0;
  const bestShells = bestShellsRaw != null ? Number(bestShellsRaw) : 0;

  const shouldUpdate =
    (Number.isFinite(bestPoints) ? pointVal > bestPoints : pointVal > 0) ||
    (pointVal === bestPoints && shellVal > (Number.isFinite(bestShells) ? bestShells : 0));

  if (!shouldUpdate) return { updated: false, reason: "not_improved" };

  if (pointVal > 0) await zadd(POINTS_KEY, pointVal, member);
  if (shellVal > 0) await zadd(SHELLS_KEY, shellVal, member);
  return { updated: true };
}

module.exports = { POINTS_KEY, SHELLS_KEY, updateShellRushLeaderboard };
