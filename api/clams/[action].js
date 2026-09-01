const { handleBalanceGet, handleHistoryGet, handleRecordPost } = require("../../lib/otterful-rewards/ledger.js");
const { handleSyncStatusGet, handleSyncRetryPost } = require("../../lib/otterful-rewards/sync.js");

function setCors(res, methods, extraHeaders = "Content-Type") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", extraHeaders);
}

module.exports = async (req, res) => {
  const action = String(req.query?.action || "").trim().toLowerCase();

  if (action === "balance") {
    setCors(res, "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const result = await handleBalanceGet(req.query || {});
    return res.status(result.status).json(result.json);
  }

  if (action === "history") {
    setCors(res, "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
    const result = await handleHistoryGet(req.query || {});
    return res.status(result.status).json(result.json);
  }

  if (action === "record") {
    setCors(res, "POST, OPTIONS", "Content-Type, X-Otterful-Clams-Secret");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
    }
    const result = await handleRecordPost(body, req.headers || {});
    return res.status(result.status).json(result.json);
  }

  if (action === "sync") {
    setCors(res, "GET, POST, OPTIONS", "Content-Type, X-Otterful-Clams-Secret");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method === "GET") {
      const result = await handleSyncStatusGet(req.query || {}, { headers: req.headers || {} });
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
  }

  return res.status(404).json({ ok: false, code: "not_found", message: "Unknown clams action." });
};
