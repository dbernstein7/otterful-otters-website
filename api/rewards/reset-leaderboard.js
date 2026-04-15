// One-time admin endpoint to reset Shell Rush leaderboard data.
// Protected by LEADERBOARD_RESET_TOKEN.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const expected = String(process.env.LEADERBOARD_RESET_TOKEN || "").trim();
  const provided =
    (typeof req.query?.token === "string" ? req.query.token : "") ||
    (typeof req.headers["x-reset-token"] === "string" ? req.headers["x-reset-token"] : "");
  const providedTrim = String(provided || "").trim();

  if (!expected || !providedTrim || providedTrim !== expected) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const pointsKey = "shellrush:leaderboard:points";
  const shellsKey = "shellrush:leaderboard:shells";

  const redisUrl = process.env.KV_REDIS_URL;
  if (!redisUrl) {
    return res.status(500).json({ ok: false, error: "KV_REDIS_URL not configured" });
  }

  try {
    const { createClient } = require("redis");
    const client = createClient({ url: redisUrl });
    await client.connect();
    const results = await Promise.allSettled([
      client.sendCommand(["DEL", pointsKey]),
      client.sendCommand(["DEL", shellsKey]),
    ]);
    await client.quit().catch(() => {});

    const deleted = results.map((r) => (r.status === "fulfilled" ? Number(r.value) : 0));
    return res.status(200).json({
      ok: true,
      deleted: { points: deleted[0] || 0, shells: deleted[1] || 0 },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : "Reset failed" });
  }
};

