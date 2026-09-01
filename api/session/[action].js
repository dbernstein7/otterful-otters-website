const {
  issueNonce,
  createSessionFromSignature,
  validateSessionToken,
} = require("../../lib/otterful-session/handlers.js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const body = parseBody(req);
  if (body == null) {
    return res.status(400).json({ ok: false, code: "bad_json", message: "Invalid JSON body." });
  }

  if (action === "nonce") {
    const result = await issueNonce(body.wallet);
    if (!result.ok) {
      const status = result.code === "not_configured" ? 200 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  if (action === "verify") {
    const result = await createSessionFromSignature(body);
    if (!result.ok) {
      const status =
        result.code === "invalid_signature" || result.code === "invalid_nonce" ? 403 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  if (action === "validate") {
    const token =
      typeof body.sessionToken === "string"
        ? body.sessionToken.trim()
        : typeof req.headers?.["x-otterful-session"] === "string"
          ? req.headers["x-otterful-session"].trim()
          : "";

    const result = await validateSessionToken(token);
    if (!result.ok) {
      const status =
        result.code === "expired_session" || result.code === "invalid_session" ? 401 : 400;
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  return res.status(404).json({ ok: false, code: "not_found", message: "Unknown session action." });
};
