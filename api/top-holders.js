// Vercel serverless: fetch top NFT holders for Otterful Otters (Reservoir API, ApeChain)
const https = require('https');

const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
const MAX_HOLDERS = 50;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sendError = (err, code = 500) => {
    try {
      res.status(code).json({
        error: err.message || 'Failed to fetch top holders',
        holders: [],
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).end();
    }
  };

  try {
    const apiKey = process.env.RESERVOIR_API_KEY || '';
    const path = `/owners/v2?collection=${encodeURIComponent(CONTRACT)}&limit=${MAX_HOLDERS}`;
    const opts = {
      hostname: 'api.reservoir.tools',
      path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'otterful-otters-dashboard/1.0',
      },
    };
    if (apiKey) opts.headers['x-api-key'] = apiKey;

    const data = await fetchJson(opts);
    const rawOwners = data.owners || (Array.isArray(data) ? data : []);
    if (!Array.isArray(rawOwners)) {
      return res.status(200).json({
        holders: [],
        fetchedAt: new Date().toISOString(),
        source: 'reservoir',
        error: 'Unexpected response shape',
      });
    }

    const withCount = rawOwners
      .map((o) => {
        const address = (o.owner || o.address || o.wallet || '').toLowerCase();
        const raw = o.tokenCount ?? o.ownership?.tokenCount ?? o.count ?? o.token_count ?? 0;
        const count = typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0;
        return { address, count };
      })
      .filter((o) => o.address && o.count > 0);

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
    sendError(error);
  }
};

function fetchJson(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (resp) => {
      let body = '';
      resp.on('data', (chunk) => (body += chunk));
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON from Reservoir'));
          }
          return;
        }
        reject(new Error(`Reservoir API ${resp.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
