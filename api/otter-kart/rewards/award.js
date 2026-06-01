const { awardDripPointsServer } = require("../../../lib/otter-kart-rewards/drip.js");
const { gateAwardPost } = require("../../../lib/otter-kart-rewards/gate.js");
const { getDripConfig } = require("../../../lib/otter-kart-rewards/env.js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, code: "method_not_allowed", message: "Use POST." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
  }

  const envRecord = { ...process.env };
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const nowSec = Math.floor(Date.now() / 1000);

  const gated = await gateAwardPost({ body, env: envRecord, mode, nowSec });
  if (!gated.ok) {
    return res.status(gated.status).json(gated.json);
  }

  const { apiKey, realmId, currencyId, patchMode, initiatorId } = getDripConfig();
  if (!apiKey) {
    return res.status(200).json({ ok: true, skipped: "not_configured" });
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
      return res.status(200).json({ ok: true, skipped: "no_member" });
    }
    return res.status(200).json({ ok: false, code: result.code, message: result.message });
  }

  return res.status(200).json({ ok: true, dripId: result.dripId, balance: result.balance });
};
