const { handleGet, handlePost } = require("../../lib/otter-kart-leaderboard/handlers.js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    const result = await handleGet(req.query || {});
    return res.status(result.status).json(result.json);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON body." });
    }
    const result = await handlePost(body);
    return res.status(result.status).json(result.json);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
