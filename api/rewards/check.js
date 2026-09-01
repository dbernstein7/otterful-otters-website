// Shell Snag → verified gate + upstream Drip check; Otter Kart → local handler.

const {
  isOtterKartRewardsRequest,
  handleOtterKartCheck,
} = require("../../lib/otter-kart-rewards/handlers.js");
const { handleShellSnagCheck } = require("../../lib/shell-rush-rewards/handlers.js");

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

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
  }

  if (isOtterKartRewardsRequest(body)) {
    const result = await handleOtterKartCheck(body);
    return res.status(result.status).json(result.json);
  }

  const result = await handleShellSnagCheck(body);
  return res.status(result.status).json(result.json);
};
