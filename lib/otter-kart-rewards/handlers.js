const { gateAwardPost, gateCheckPost } = require("./gate.js");
const { creditOtterKartClams } = require("./clams.js");
const {
  buildSyncFields,
  checkOtterKartDrip,
  handleOtterKartExternalRewards,
  syncUrnzForClam,
} = require("../otterful-rewards/providers.js");

function isOtterKartRewardsRequest(body) {
  return body && body.game === "otter-kart";
}

function buildClamFields(clam, sync) {
  if (!clam || clam.status === "skipped") return {};
  if (clam.status === "duplicate" || clam.status === "credited") {
    return {
      clamBalance: clam.clamBalance,
      clamTxId: clam.clamTxId,
      clamStatus: clam.status,
      ...buildSyncFields(sync),
    };
  }
  return {};
}

async function handleOtterKartCheck(body) {
  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);

  const gated = await gateCheckPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return { status: gated.status, json: gated.json };
  }

  const check = await checkOtterKartDrip(gated);
  if (check.skipped === "not_configured") {
    return { status: 200, json: { ok: true, skipped: "not_configured" } };
  }

  if (!check.ok) {
    return { status: 200, json: { ok: false, code: check.code, message: check.message } };
  }
  if (!check.found) {
    return { status: 200, json: { ok: true, found: false } };
  }

  return {
    status: 200,
    json: { ok: true, found: true, dripId: check.dripId, balance: check.balance },
  };
}

async function handleOtterKartAward(body) {
  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);

  const gated = await gateAwardPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return { status: gated.status, json: gated.json };
  }

  const clam = await creditOtterKartClams(gated);
  if (clam.status === "failed") {
    return {
      status: 200,
      json: {
        ok: false,
        code: clam.code || "clam_ledger_failed",
        message: clam.message,
        clamStatus: "failed",
      },
    };
  }

  if (clam.status === "duplicate") {
    const sync = await syncUrnzForClam(clam);
    return {
      status: 200,
      json: {
        ok: true,
        alreadyCredited: true,
        ...buildClamFields(clam, sync),
      },
    };
  }

  const external = await handleOtterKartExternalRewards(clam, gated);
  const syncFields = buildClamFields(clam, external.sync);

  if (!external.drip) {
    return {
      status: 200,
      json: {
        ok: true,
        alreadyCredited: false,
        ...syncFields,
      },
    };
  }

  const result = external.drip;

  if (result.skipped === "not_configured") {
    return {
      status: 200,
      json: {
        ok: true,
        skipped: "not_configured",
        alreadyCredited: false,
        ...syncFields,
      },
    };
  }

  if (!result.ok) {
    if (result.code === "no_member") {
      return {
        status: 200,
        json: {
          ok: true,
          skipped: "no_member",
          ...syncFields,
          ...(clam.status === "credited"
            ? { clamCredited: true, dripSkipped: "no_member" }
            : {}),
        },
      };
    }
    return {
      status: 200,
      json: {
        ok: false,
        code: result.code,
        message: result.message,
        ...syncFields,
        ...(clam.status === "credited"
          ? { clamCredited: true, dripStatus: "failed" }
          : {}),
      },
    };
  }

  return {
    status: 200,
    json: {
      ok: true,
      dripId: result.dripId,
      balance: result.balance,
      alreadyCredited: false,
      ...syncFields,
    },
  };
}

module.exports = { isOtterKartRewardsRequest, handleOtterKartCheck, handleOtterKartAward };
