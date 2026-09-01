const {
  isOtterKartRewardsRequest,
  handleOtterKartCheck,
  handleOtterKartAward,
} = require("../../lib/otter-kart-rewards/handlers.js");
const { handleShellSnagCheck, handleShellSnagAward } = require("../../lib/shell-rush-rewards/handlers.js");
const { handleRewardsLeaderboardGet } = require("../../lib/shell-rush-rewards/leaderboard-api.js");

function setCors(res, methods = "POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(req) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const action = String(req.query?.action || "").trim().toLowerCase();

  if (action === "leaderboard") {
    setCors(res, "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const result = await handleRewardsLeaderboardGet(req.query || {});
    return res.status(result.status).json(result.json);
  }

  if (action === "check" || action === "award") {
    setCors(res, "POST, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const body = parseBody(req);
    if (body == null) {
      return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
    }

    if (action === "check") {
      if (isOtterKartRewardsRequest(body)) {
        const result = await handleOtterKartCheck(body);
        return res.status(result.status).json(result.json);
      }
      const result = await handleShellSnagCheck(body);
      return res.status(result.status).json(result.json);
    }

    if (isOtterKartRewardsRequest(body)) {
      const result = await handleOtterKartAward(body);
      return res.status(result.status).json(result.json);
    }
    const result = await handleShellSnagAward(body);
    return res.status(result.status).json(result.json);
  }

  return res.status(404).json({ ok: false, code: "not_found", message: "Unknown rewards action." });
};
