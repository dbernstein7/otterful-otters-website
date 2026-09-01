const { recordClamReward } = require("../otterful-rewards/ledger.js");

const SHELL_SNAG_GAME = "shell-snag";

async function creditShellSnagClams(gated) {
  if (!gated.wallet) {
    return { status: "skipped", reason: "no_wallet" };
  }

  const result = await recordClamReward({
    wallet: gated.wallet,
    game: SHELL_SNAG_GAME,
    runId: gated.runId,
    amount: gated.effectiveShells,
    metadata: {
      source: "shell-snag-award",
      issuedAtSec: gated.issuedAtSec,
      score: gated.effectiveScore,
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

module.exports = { creditShellSnagClams, SHELL_SNAG_GAME };
