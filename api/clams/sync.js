const { handleSyncStatusGet, handleSyncRetryPost } = require("../../lib/otterful-rewards/sync.js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Otterful-Clams-Secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    const query = req.query || {};
    const result = await handleSyncStatusGet(query, { headers: req.headers || {} });
    return res.status(result.status).json(result.json);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
    }
    const result = await handleSyncRetryPost(body, req.headers || {});
    return res.status(result.status).json(result.json);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
