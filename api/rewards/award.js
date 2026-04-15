// Vercel serverless function used by the embedded Shell Snag game.
// The upstream game expects POST /api/rewards/award to exist.
//
// If DRIP integration isn't configured on this site, we return a benign
// "skipped" response so the game can continue without crashing.

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

  // Future: wire this up to DRIP if you want live rewards on otterfulotters.xyz.
  return res.status(200).json({ ok: true, skipped: "not_configured" });
};

