/** Wallet message templates — must match games/otter-kart-rewards.mjs exactly. */

function buildCheckAttestation(wallet, issuedAtSec) {
  return [
    "Otter Kart - Rewards Check",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

function buildAwardAttestation(wallet, shells, runId, issuedAtSec) {
  return [
    "Otter Kart - Shells Collected",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `shells:${shells}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

module.exports = { buildCheckAttestation, buildAwardAttestation };
