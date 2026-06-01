// Shell Snag → Shell Rush proxy; Otter Kart → local Drip handler (same route, no extra function).

const {
  isOtterKartRewardsRequest,
  handleOtterKartCheck,
} = require("../../lib/otter-kart-rewards/handlers.js");

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

  const upstream = "https://shell-rush-otterful-otters.vercel.app/api/rewards/check";

  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstreamRes.text();

    res.status(upstreamRes.status);
    res.setHeader("Content-Type", upstreamRes.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (e) {
    return res.status(200).json({
      ok: true,
      skipped: "upstream_unreachable",
      message: e && e.message ? e.message : "Could not reach upstream rewards service.",
    });
  }
};
