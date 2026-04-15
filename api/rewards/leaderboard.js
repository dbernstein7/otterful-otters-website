// Leaderboard for the embedded Shell Rush game.
//
// Persists scores in Vercel KV (Upstash Redis) when available.
// Required env vars (set by Vercel KV integration):
// - KV_REST_API_URL
// - KV_REST_API_TOKEN

const KEY = "shellrush:leaderboard";

function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvCommand(command, args) {
  const url = `${process.env.KV_REST_API_URL}/${command}/${args.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV ${command} failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json && Object.prototype.hasOwnProperty.call(json, "result") ? json.result : null;
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

  if (!kvConfigured()) {
    return res.status(200).json({
      ok: true,
      configured: false,
      rows: [],
    });
  }

  try {
    // ZREVRANGE key 0 limit-1 WITHSCORES
    const raw = await kvCommand("zrevrange", [KEY, "0", String(limit - 1), "WITHSCORES"]);
    const rows = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        const wallet = String(raw[i] || "");
        const points = Number(raw[i + 1] || 0);
        rows.push({ wallet, walletShort: shortWallet(wallet), points, shells: points });
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

