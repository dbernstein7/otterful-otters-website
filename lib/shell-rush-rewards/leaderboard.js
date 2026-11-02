const kv = require("../otter-kart-leaderboard/kv.js");
const { zadd, zscore, isKvConfigured } = require("../otter-kart-leaderboard/kv.js");

const POINTS_KEY = "shellrush:leaderboard:points";
const SHELLS_KEY = "shellrush:leaderboard:shells";

function leaderboardKeys(mode) {
  const prefix = mode === "timed" || mode === "endless" ? `shellsnag:leaderboard:${mode}` : "shellrush:leaderboard";
  return {points: `${prefix}:points`, shells: `${prefix}:shells`};
}

async function updateShellRushLeaderboard(wallet, shells, points, mode) {
  const keys = leaderboardKeys(mode);
  if (!isKvConfigured()) return { updated: false, reason: "not_configured" };

  const member = String(wallet || "").trim().toLowerCase();
  const shellVal = Math.max(0, Math.floor(Number(shells) || 0));
  const pointVal = Math.max(0, Math.floor(Number(points) || 0));
  if (!member || (shellVal <= 0 && pointVal <= 0)) {
    return { updated: false, reason: "empty" };
  }

  if (typeof kv.evalScript === "function") {
    const script = `local p=tonumber(redis.call('ZSCORE',KEYS[1],ARGV[1]) or '-1')
local s=tonumber(redis.call('ZSCORE',KEYS[2],ARGV[1]) or '-1')
if tonumber(ARGV[2])>p or (tonumber(ARGV[2])==p and tonumber(ARGV[3])>s) then
redis.call('ZADD',KEYS[1],ARGV[2],ARGV[1]) redis.call('ZADD',KEYS[2],ARGV[3],ARGV[1]) return 1 end return 0`;
    const updated = await kv.evalScript(script,[keys.points,keys.shells],[member,pointVal,shellVal]);
    return {updated:Number(updated)===1};
  }
  const bestPointsRaw = await zscore(keys.points, member).catch(() => null);
  const bestShellsRaw = await zscore(keys.shells, member).catch(() => null);
  const bestPoints = bestPointsRaw != null ? Number(bestPointsRaw) : 0;
  const bestShells = bestShellsRaw != null ? Number(bestShellsRaw) : 0;

  const shouldUpdate =
    (Number.isFinite(bestPoints) ? pointVal > bestPoints : pointVal > 0) ||
    (pointVal === bestPoints && shellVal > (Number.isFinite(bestShells) ? bestShells : 0));

  if (!shouldUpdate) return { updated: false, reason: "not_improved" };

  if (pointVal > 0) await zadd(keys.points, pointVal, member);
  if (shellVal > 0) await zadd(keys.shells, shellVal, member);
  return { updated: true };
}

module.exports = { POINTS_KEY, SHELLS_KEY, leaderboardKeys, updateShellRushLeaderboard };
