const { verifyMessage } = require("viem");

const MAX_ISSUED_AGE_SEC = 900;

function isHexSig(s) {
  return /^0x[0-9a-fA-F]{130}$/.test(s) || /^0x[0-9a-fA-F]{128}$/.test(s);
}

function isEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
}

function buildSubmitMessage(wallet, mode, runId, issuedAtSec, stats) {
  const w = wallet.trim().toLowerCase();
  const lines = [
    "Otter Kart - Leaderboard Submit",
    "v1",
    `mode:${mode}`,
    `wallet:${w}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ];
  if (stats.dateISO) lines.push(`date:${stats.dateISO}`);
  if (Number(stats.totalTime) > 0) lines.push(`time:${Number(stats.totalTime).toFixed(3)}`);
  if (Number(stats.bestLap) > 0) lines.push(`bestLap:${Number(stats.bestLap).toFixed(3)}`);
  if (Number(stats.shells) >= 0) lines.push(`shells:${Math.floor(Number(stats.shells) || 0)}`);
  if (Number(stats.longestDrift) > 0)
    lines.push(`longestDrift:${Number(stats.longestDrift).toFixed(3)}`);
  if (Number(stats.longestDriftTime) > 0)
    lines.push(`longestDriftTime:${Number(stats.longestDriftTime).toFixed(3)}`);
  if (Number(stats.distance) > 0) lines.push(`distance:${Number(stats.distance).toFixed(3)}`);
  if (Number(stats.endlessLongestDrift) > 0)
    lines.push(`endlessLongestDrift:${Number(stats.endlessLongestDrift).toFixed(3)}`);
  if (Number(stats.gpPlayerPoints) > 0)
    lines.push(`gpPoints:${Math.floor(Number(stats.gpPlayerPoints) || 0)}`);
  if (Number(stats.gpTotalTime) > 0)
    lines.push(`gpTotalTime:${Number(stats.gpTotalTime).toFixed(3)}`);
  return lines.join("\n");
}

async function verifySubmitSignature(params) {
  const { wallet, mode, runId, issuedAtSec, signature, nowSec, stats } = params;
  if (!isEthAddress(wallet)) return false;
  if (!isHexSig(signature)) return false;
  if (typeof mode !== "string" || !mode.trim()) return false;
  if (typeof runId !== "string" || !runId.trim() || runId.length > 128) return false;
  if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) return false;
  if (Math.abs(nowSec - issuedAtSec) > MAX_ISSUED_AGE_SEC) return false;

  const msg = buildSubmitMessage(wallet, mode.trim(), runId.trim(), issuedAtSec, stats || {});
  try {
    return await verifyMessage({
      address: wallet.trim(),
      message: msg,
      signature,
    });
  } catch {
    return false;
  }
}

module.exports = { buildSubmitMessage, verifySubmitSignature };
