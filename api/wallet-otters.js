/**
 * GET /api/wallet-otters?wallet=0x...
 * Env: OPENSEA_API_KEY, RESERVOIR_API_KEY (optional)
 */
const { fetchWalletOtterIds } = require("../lib/wallet-otters/lookup.js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const wallet = String(req.query.wallet || req.query.address || "")
    .trim()
    .toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: "Invalid wallet address. Use ?wallet=0x…" });
  }

  try {
    const result = await fetchWalletOtterIds(wallet);
    return res.status(200).json(result);
  } catch (err) {
    console.error("wallet-otters error:", err);
    return res.status(500).json({
      error: err.message || "Failed to load wallet otters",
      tokenIds: [],
    });
  }
};
