const { checkDripRealmMember, awardDripPointsServer } = require("./drip.js");
const { gateAwardPost, gateCheckPost } = require("./gate.js");
const { getDripConfig } = require("./env.js");

function isOtterKartRewardsRequest(body) {
  return body && body.game === "otter-kart";
}

async function handleOtterKartCheck(body) {
  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);

  const gated = await gateCheckPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return { status: gated.status, json: gated.json };
  }

  const { apiKey, realmId, currencyId } = getDripConfig();
  if (!apiKey) {
    return { status: 200, json: { ok: true, skipped: "not_configured" } };
  }

  const check = await checkDripRealmMember({
    apiKey,
    realmId,
    currencyId,
    wallet: gated.wallet,
    dripUserId: gated.dripUserId,
  });

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

  const { apiKey, realmId, currencyId, patchMode, initiatorId } = getDripConfig();
  if (!apiKey) {
    return { status: 200, json: { ok: true, skipped: "not_configured" } };
  }

  const result = await awardDripPointsServer({
    apiKey,
    realmId,
    currencyId,
    wallet: gated.wallet,
    dripUserId: gated.dripUserId,
    points: gated.effectivePoints,
    patchMode,
    initiatorId,
  });

  if (!result.ok) {
    if (result.code === "no_member") {
      return { status: 200, json: { ok: true, skipped: "no_member" } };
    }
    return { status: 200, json: { ok: false, code: result.code, message: result.message } };
  }

  try {
    const { upsertSessionLeaderboard, upsertLeaderboardEntry } = require("../otter-kart-leaderboard/handlers.js");
    await upsertSessionLeaderboard(
      gated.wallet,
      gated.effectivePoints,
      typeof body.shells === "number" ? body.shells : gated.effectivePoints,
    );
    const lb = body.leaderboard;
    if (lb && typeof lb === "object" && typeof lb.mode === "string") {
      await upsertLeaderboardEntry(gated.wallet, lb.mode.trim(), lb);
    }
  } catch {}

  return { status: 200, json: { ok: true, dripId: result.dripId, balance: result.balance } };
}

module.exports = { isOtterKartRewardsRequest, handleOtterKartCheck, handleOtterKartAward };
