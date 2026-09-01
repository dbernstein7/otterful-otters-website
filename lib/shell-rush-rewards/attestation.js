/** Wallet message templates — must match games/shell-rush-rewards.mjs and Shell Snag bundle. */

function buildCheckAttestation(wallet, issuedAtSec) {
  return [
    "Otter Shell Rush — rewards status check",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

function buildAwardAttestation(wallet, shells, runId, issuedAtSec) {
  return [
    "Otter Shell Rush — shells collected attestation",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `shells:${shells}`,
    `runId:${runId}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

module.exports = { buildCheckAttestation, buildAwardAttestation };
