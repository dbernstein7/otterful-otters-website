function buildSessionMessage(wallet, nonce, issuedAtSec) {
  return [
    "Otterful Otters — wallet session",
    "v1",
    `wallet:${wallet.toLowerCase()}`,
    `nonce:${nonce}`,
    `issuedAt:${issuedAtSec}`,
  ].join("\n");
}

module.exports = { buildSessionMessage };
