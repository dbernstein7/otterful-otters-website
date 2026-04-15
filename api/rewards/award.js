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

  const upstream = "https://shell-rush-otterful-otters.vercel.app/api/rewards/award";
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const leaderboardKey = "shellrush:leaderboard";

  try {
    const bodyObj = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    });
    const text = await upstreamRes.text();

    // Best-effort: if KV is configured and the request looks like a valid award, track it locally.
    try {
      if (kvUrl && kvToken) {
        const wallet = typeof bodyObj.wallet === "string" ? bodyObj.wallet.trim().toLowerCase() : "";
        const shellsRaw =
          typeof bodyObj.shells === "number"
            ? bodyObj.shells
            : typeof bodyObj.points === "number"
              ? bodyObj.points
              : 0;
        const shells = Number.isFinite(Number(shellsRaw)) ? Math.max(0, Math.floor(Number(shellsRaw))) : 0;
        if (wallet && shells > 0) {
          const zIncrUrl = `${kvUrl}/zincrby/${encodeURIComponent(leaderboardKey)}/${encodeURIComponent(
            String(shells),
          )}/${encodeURIComponent(wallet)}`;
          await fetch(zIncrUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${kvToken}` },
          }).catch(() => {});
        }
      }
    } catch {}

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

