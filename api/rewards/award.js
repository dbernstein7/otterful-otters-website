// Shell Snag → verified gate + central Clams + upstream Drip; Otter Kart → local handler.

const {
  isOtterKartRewardsRequest,
  handleOtterKartAward,
} = require("../../lib/otter-kart-rewards/handlers.js");
const { handleShellSnagAward } = require("../../lib/shell-rush-rewards/handlers.js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let bodyObj;
  try {
    bodyObj = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
  }

  if (isOtterKartRewardsRequest(bodyObj)) {
    const result = await handleOtterKartAward(bodyObj);
    return res.status(result.status).json(result.json);
  }

  const result = await handleShellSnagAward(bodyObj);
  return res.status(result.status).json(result.json);
};
