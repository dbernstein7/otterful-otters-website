const { recordClamReward } = require("../otterful-rewards/ledger.js");

const OTTER_KART_GAME = "otter-kart";

/**
 * Credit the central Clam ledger after Otter Kart award gate passes.
 * @param {{ wallet?: string, runId: string, effectivePoints: number, issuedAtSec: number }} gated
 */
async function creditOtterKartClams(gated) {
  if (!gated.wallet) {
    return { status: "skipped", reason: "no_wallet" };
  }

  const result = await recordClamReward({
    wallet: gated.wallet,
    game: OTTER_KART_GAME,
    runId: gated.runId,
    amount: gated.effectivePoints,
    metadata: {
      source: "otter-kart-award",
      issuedAtSec: gated.issuedAtSec,
    },
  });

  if (!result.ok) {
    if (result.code === "not_configured") {
      return { status: "skipped", reason: "not_configured" };
    }
    return {
      status: "failed",
      code: result.code,
      message: result.message || "Clam ledger update failed.",
    };
  }

  if (result.duplicate) {
    return {
      status: "duplicate",
      clamTxId: result.txId,
      clamBalance: result.balance,
    };
  }

  return {
    status: "credited",
    clamTxId: result.txId,
    clamBalance: result.balance,
  };
}

module.exports = { creditOtterKartClams, OTTER_KART_GAME };
