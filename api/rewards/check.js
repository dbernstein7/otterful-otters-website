// Vercel serverless function used by the embedded Shell Snag game.
// Proxies to the dedicated Shell Rush deployment so the iframe behaves identically.

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

  const upstream = "https://shell-rush-otterful-otters.vercel.app/api/rewards/check";

  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}),
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

