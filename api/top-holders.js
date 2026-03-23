// Vercel serverless: fetch top NFT holders for Otterful Otters
// Uses OpenSea owner data first, then Reservoir as fallback.
const https = require('https');

const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
const OPENSEA_SLUG = 'otterful-otters';
const MAX_HOLDERS = 50;
const MAX_NFT_SCAN = 3000;
let lastSuccessfulPayload = null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sendError = (err, code = 500) => {
    try {
      let message = err && (err.message || err);
      if (typeof message !== 'string') message = 'Failed to fetch top holders';
      if (/ENOTFOUND|getaddrinfo|reservoir\.tools/i.test(message)) {
        message = 'Data provider temporarily unreachable. Try again later.';
      }
      const fallbackPayload = lastSuccessfulPayload || {
        error: message,
        holders: [],
        fetchedAt: new Date().toISOString(),
        source: 'unavailable',
      };
      // Return HTTP 200 so frontend doesn't break on transient provider outages.
      res.status(200).json({
        ...fallbackPayload,
        error: message,
        stale: !!lastSuccessfulPayload,
      });
    } catch (e) {
      res.status(200).json({
        error: 'Failed to fetch top holders',
        holders: [],
        fetchedAt: new Date().toISOString(),
        source: 'unavailable',
      });
    }
  };

  try {
    // 1) Try OpenSea collection NFTs and aggregate owners.
    const openSeaApiKey = process.env.OPENSEA_API_KEY || '';
    if (openSeaApiKey) {
      try {
      const holders = await fetchOpenSeaTopHolders();
      if (holders.length > 0) {
        const payload = {
          holders,
          fetchedAt: new Date().toISOString(),
          source: 'opensea',
        };
        lastSuccessfulPayload = payload;
        return res.status(200).json(payload);
      }
      } catch (_) {
      // fall through to Reservoir fallback
      }
    }

    // 2) Try Reservoir fallback
    const apiKey = process.env.RESERVOIR_API_KEY || '';
    const collectionIds = [`apechain:${CONTRACT}`, CONTRACT];
    let data = null;
    let lastError = null;
    for (const cid of collectionIds) {
      try {
        const path = `/owners/v2?collection=${encodeURIComponent(cid)}&limit=${MAX_HOLDERS}`;
        const opts = {
          hostname: 'api.reservoir.tools',
          path,
          method: 'GET',
          headers: { 'Accept': 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' },
        };
        if (apiKey) opts.headers['x-api-key'] = apiKey;
        data = await fetchJson(opts);
        if (data && (data.owners?.length || (Array.isArray(data) && data.length))) break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!data) throw lastError || new Error('No holder data from API');
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

    const payload = {
      holders,
      fetchedAt: new Date().toISOString(),
      source: 'reservoir',
    };
    lastSuccessfulPayload = payload;
    return res.status(200).json(payload);
  } catch (error) {
    console.error('top-holders error:', error);
    sendError(error);
    return;
  }
};

function fetchJson(opts) {
  const options = {
    method: 'GET',
    headers: { 'Accept': 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' },
    ...opts,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let body = '';
      resp.on('data', (chunk) => (body += chunk));
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
          return;
        }
        reject(new Error(`API ${resp.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

async function fetchOpenSeaTopHolders() {
  const apiKey = process.env.OPENSEA_API_KEY || '';
  const ownerCounts = new Map();
  let next = null;
  let scanned = 0;

  while (scanned < MAX_NFT_SCAN) {
    let path = `/api/v2/collection/${encodeURIComponent(OPENSEA_SLUG)}/nfts?limit=200`;
    if (next) path += `&next=${encodeURIComponent(next)}`;

    const headers = { 'Accept': 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' };
    if (apiKey) headers['x-api-key'] = apiKey;
    const data = await fetchJson({ hostname: 'api.opensea.io', path, method: 'GET', headers });

    const nfts = Array.isArray(data && data.nfts) ? data.nfts : [];
    if (nfts.length === 0) break;

    for (const nft of nfts) {
      const owners = Array.isArray(nft && nft.owners) ? nft.owners : [];

      // Most responses provide owners[].address and owners[].quantity.
      if (owners.length > 0) {
        for (const ownerEntry of owners) {
          const address = String(ownerEntry && ownerEntry.address || '').toLowerCase();
          if (!address) continue;
          const rawQty = ownerEntry.quantity ?? ownerEntry.count ?? 1;
          const qty = typeof rawQty === 'number' ? rawQty : parseInt(String(rawQty), 10) || 1;
          ownerCounts.set(address, (ownerCounts.get(address) || 0) + Math.max(1, qty));
        }
      } else {
        // Defensive fallback if owner appears as a single field.
        const singleOwner = String((nft && nft.owner && nft.owner.address) || nft && nft.owner || '').toLowerCase();
        if (singleOwner) ownerCounts.set(singleOwner, (ownerCounts.get(singleOwner) || 0) + 1);
      }
    }

    scanned += nfts.length;
    next = data && data.next;
    if (!next) break;
  }

  const sorted = Array.from(ownerCounts.entries())
    .map(([address, count]) => ({ address, count }))
    .filter((x) => x.address && x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_HOLDERS)
    .map((h, i) => ({
      rank: i + 1,
      address: shortenAddress(h.address),
      addressFull: h.address,
      count: h.count,
    }));

  return sorted;
}

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
