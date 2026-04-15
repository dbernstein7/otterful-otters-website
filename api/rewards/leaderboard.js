// Leaderboard for the embedded Shell Rush game.
//
// Persists scores in Vercel KV / Redis when available.
// Supported env var sets:
// - KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV integration)
// - KV_REDIS_URL (Vercel Storage Redis; connects via TCP using `redis` client)

const POINTS_KEY = "shellrush:leaderboard:points";
const SHELLS_KEY = "shellrush:leaderboard:shells";

function getKvRestConfig() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }

  return null;
}

async function kvCommand(command, args) {
  const cfg = getKvRestConfig();
  if (!cfg) throw new Error("KV not configured.");

  const url = `${cfg.url}/${command}/${args.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV ${command} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json && Object.prototype.hasOwnProperty.call(json, "result") ? json.result : null;
}

let redisClientPromise = null;
async function getRedisClient() {
  if (!process.env.KV_REDIS_URL) return null;
  if (!redisClientPromise) {
    const { createClient } = require("redis");
    const client = createClient({ url: process.env.KV_REDIS_URL });
    redisClientPromise = client
      .connect()
      .then(() => client)
      .catch((e) => {
        redisClientPromise = null;
        throw e;
      });
  }
  return redisClientPromise;
}

function shortWallet(w) {
  if (!w || typeof w !== "string") return "—";
  const s = w.trim();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const limitRaw = typeof req.query?.limit === "string" ? req.query.limit : "";
  const limit = Math.min(50, Math.max(3, Number.isFinite(Number(limitRaw)) ? Math.floor(Number(limitRaw)) : 10));

  if (!getKvRestConfig() && !process.env.KV_REDIS_URL) {
    return res.status(200).json({
      ok: true,
      configured: false,
      rows: [],
    });
  }

  try {
    const rows = [];
    const restCfg = getKvRestConfig();
    if (restCfg) {
      // ZREVRANGE key 0 limit-1 WITHSCORES
      const raw = await kvCommand("zrevrange", [POINTS_KEY, "0", String(limit - 1), "WITHSCORES"]);
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i += 2) {
          const wallet = String(raw[i] || "");
          const points = Number(raw[i + 1] || 0);
          let shells = 0;
          try {
            const s = await kvCommand("zscore", [SHELLS_KEY, wallet]);
            shells = s != null ? Number(s) : 0;
          } catch {}
          rows.push({ wallet, walletShort: shortWallet(wallet), points, shells: Number.isFinite(shells) ? shells : 0 });
        }
      }
    } else {
      const client = await getRedisClient();
      if (!client) {
        return res.status(200).json({ ok: true, configured: false, rows: [] });
      }
      const raw = await client.sendCommand(["ZREVRANGE", POINTS_KEY, "0", String(limit - 1), "WITHSCORES"]);
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i += 2) {
          const wallet = String(raw[i] || "");
          const points = Number(raw[i + 1] || 0);
          let shells = 0;
          try {
            const s = await client.sendCommand(["ZSCORE", SHELLS_KEY, wallet]);
            shells = s != null ? Number(s) : 0;
          } catch {}
          rows.push({ wallet, walletShort: shortWallet(wallet), points, shells: Number.isFinite(shells) ? shells : 0 });
        }
      }
    }
    return res.status(200).json({ ok: true, configured: true, rows });
  } catch (e) {
    return res.status(200).json({
      ok: true,
      configured: true,
      rows: [],
      error: e && e.message ? e.message : "Failed to read leaderboard.",
    });
  }
};

