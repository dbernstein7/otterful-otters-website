// Vercel serverless: fetch top NFT holders for Otterful Otters (Reservoir API, ApeChain)
const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
const MAX_HOLDERS = 50;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.RESERVOIR_API_KEY || '';
    // Reservoir: collection can be contract; for ApeChain some docs use collection id from /collections
    const url = `https://api.reservoir.tools/owners/v2?collection=${CONTRACT}&limit=${MAX_HOLDERS}&sortBy=tokenCount&sortDirection=desc`;
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'otterful-otters-dashboard/1.0',
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Reservoir API ${response.status}: ${text || response.statusText}`);
    }

    const data = await response.json();
    const rawOwners = data.owners || data || [];
    if (!Array.isArray(rawOwners)) {
      return res.status(200).json({
        holders: [],
        fetchedAt: new Date().toISOString(),
        source: 'reservoir',
        error: 'Unexpected response shape',
      });
    }

    const withCount = rawOwners.map((o) => {
      const address = (o.owner || o.address || o.wallet || '').toLowerCase();
      const raw = o.tokenCount ?? o.ownership?.tokenCount ?? o.count ?? o.token_count ?? 0;
      const count = typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0;
      return { address, count };
    }).filter((o) => o.address && o.count > 0);

    withCount.sort((a, b) => b.count - a.count);

    const holders = withCount.slice(0, MAX_HOLDERS).map((h, i) => ({
      rank: i + 1,
      address: shortenAddress(h.address),
      addressFull: h.address,
      count: h.count,
    }));

    return res.status(200).json({
      holders,
      fetchedAt: new Date().toISOString(),
      source: 'reservoir',
    });
  } catch (error) {
    console.error('top-holders error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch top holders',
      holders: [],
      fetchedAt: new Date().toISOString(),
    });
  }
};

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
