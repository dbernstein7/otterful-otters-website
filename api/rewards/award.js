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
  const kvRedisUrl = process.env.KV_REDIS_URL;
  const pointsKey = "shellrush:leaderboard:points";
  const shellsKey = "shellrush:leaderboard:shells";

  function getKvRest() {
    if (kvUrl && kvToken) return { url: kvUrl, token: kvToken };
    return null;
  }

  let clientPromise = null;
  async function getRedisClient() {
    if (!kvRedisUrl) return null;
    if (!clientPromise) {
      const { createClient } = require("redis");
      const client = createClient({ url: kvRedisUrl });
      clientPromise = client
        .connect()
        .then(() => client)
        .catch((e) => {
          clientPromise = null;
          throw e;
        });
    }
    return clientPromise;
  }

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
      const kv = getKvRest();
      const wallet = typeof bodyObj.wallet === "string" ? bodyObj.wallet.trim().toLowerCase() : "";

      const shellsRaw = typeof bodyObj.shells === "number" ? bodyObj.shells : 0;
      const shells = Number.isFinite(Number(shellsRaw)) ? Math.max(0, Math.floor(Number(shellsRaw))) : 0;

      const pointsRaw =
        typeof bodyObj.score === "number"
          ? bodyObj.score
          : typeof bodyObj.points === "number"
            ? bodyObj.points
            : shells;
      const points = Number.isFinite(Number(pointsRaw)) ? Math.max(0, Math.floor(Number(pointsRaw))) : 0;

      async function getBestRest(key) {
        const headers = { Authorization: `Bearer ${kv.token}` };
        const url = `${kv.url}/zscore/${encodeURIComponent(key)}/${encodeURIComponent(wallet)}`;
        const r = await fetch(url, { method: "GET", headers });
        if (!r.ok) return null;
        const j = await r.json().catch(() => null);
        return j && Object.prototype.hasOwnProperty.call(j, "result") ? j.result : null;
      }

      async function setBestRest(key, value) {
        const headers = { Authorization: `Bearer ${kv.token}` };
        const url = `${kv.url}/zadd/${encodeURIComponent(key)}/${encodeURIComponent(String(value))}/${encodeURIComponent(
          wallet,
        )}`;
        await fetch(url, { method: "GET", headers }).catch(() => {});
      }

      if (wallet && (shells > 0 || points > 0)) {
        if (kv) {
          const bestPointsRaw = await getBestRest(pointsKey).catch(() => null);
          const bestShellsRaw = await getBestRest(shellsKey).catch(() => null);
          const bestPoints = bestPointsRaw != null ? Number(bestPointsRaw) : 0;
          const bestShells = bestShellsRaw != null ? Number(bestShellsRaw) : 0;

          const shouldUpdate =
            (Number.isFinite(bestPoints) ? points > bestPoints : points > 0) ||
            (points === bestPoints && shells > (Number.isFinite(bestShells) ? bestShells : 0));

          if (shouldUpdate) {
            if (points > 0) await setBestRest(pointsKey, points);
            if (shells > 0) await setBestRest(shellsKey, shells);
          }
        } else if (kvRedisUrl) {
          const client = await getRedisClient();
          if (client) {
            const bestPointsRaw = await client.sendCommand(["ZSCORE", pointsKey, wallet]).catch(() => null);
            const bestShellsRaw = await client.sendCommand(["ZSCORE", shellsKey, wallet]).catch(() => null);
            const bestPoints = bestPointsRaw != null ? Number(bestPointsRaw) : 0;
            const bestShells = bestShellsRaw != null ? Number(bestShellsRaw) : 0;

            const shouldUpdate =
              (Number.isFinite(bestPoints) ? points > bestPoints : points > 0) ||
              (points === bestPoints && shells > (Number.isFinite(bestShells) ? bestShells : 0));

            if (shouldUpdate) {
              if (points > 0) await client.sendCommand(["ZADD", pointsKey, String(points), wallet]).catch(() => {});
              if (shells > 0) await client.sendCommand(["ZADD", shellsKey, String(shells), wallet]).catch(() => {});
            }
          }
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

