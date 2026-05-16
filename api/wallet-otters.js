/**
 * List Otterful token IDs owned by a wallet on ApeChain.
 * The collection contract is not ERC721Enumerable, so we use OpenSea / Reservoir.
 *
 * GET /api/wallet-otters?wallet=0x...
 * Env: OPENSEA_API_KEY, RESERVOIR_API_KEY (optional but recommended)
 */
const https = require('https');

const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
const OPENSEA_SLUG = 'otterful-otters';
const MAX_IDS = 500;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const wallet = String(req.query.wallet || req.query.address || '')
    .trim()
    .toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address. Use ?wallet=0x…' });
  }

  try {
    const openSeaIds = await fetchOpenSeaWalletOtters(wallet).catch(() => []);
    if (openSeaIds.length > 0) {
      return res.status(200).json({
        wallet,
        tokenIds: openSeaIds,
        source: 'opensea',
        fetchedAt: new Date().toISOString(),
      });
    }

    const reservoirIds = await fetchReservoirWalletOtters(wallet).catch(() => []);
    if (reservoirIds.length > 0) {
      return res.status(200).json({
        wallet,
        tokenIds: reservoirIds,
        source: 'reservoir',
        fetchedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      wallet,
      tokenIds: [],
      source: 'none',
      fetchedAt: new Date().toISOString(),
      hint:
        'No otters found for this wallet, or the NFT indexer is unavailable. If you own otters, try again in a minute.',
    });
  } catch (err) {
    console.error('wallet-otters error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to load wallet otters',
      tokenIds: [],
    });
  }
};

function fetchJson(opts) {
  const options = {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' },
    ...opts,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let body = '';
      resp.on('data', (chunk) => {
        body += chunk;
      });
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON from indexer'));
          }
          return;
        }
        reject(new Error(`Indexer ${resp.statusCode}: ${body.slice(0, 240)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Indexer timeout')));
    req.end();
  });
}

function parseTokenId(nft) {
  const raw =
    nft?.identifier ??
    nft?.token_id ??
    nft?.tokenId ??
    nft?.token?.tokenId ??
    nft?.token?.token_id;
  const id = parseInt(String(raw), 10);
  if (!id || id < 1 || id > 2222) return null;
  return id;
}

function dedupeSort(ids) {
  return [...new Set(ids)].sort((a, b) => a - b).slice(0, MAX_IDS);
}

async function fetchOpenSeaWalletOtters(wallet) {
  const apiKey = process.env.OPENSEA_API_KEY || '';
  if (!apiKey) return [];

  const ids = [];
  const bases = [
    `/api/v2/chain/ape_chain/account/${wallet}/nfts?limit=200&contract=${CONTRACT}`,
    `/api/v2/chain/ape_chain/account/${wallet}/nfts?limit=200&collection=${OPENSEA_SLUG}`,
  ];

  for (const basePath of bases) {
    let next = null;
    ids.length = 0;

    do {
      let path = basePath;
      if (next) path += `&next=${encodeURIComponent(next)}`;

      const headers = { Accept: 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const data = await fetchJson({ hostname: 'api.opensea.io', path, method: 'GET', headers });
      const nfts = Array.isArray(data?.nfts) ? data.nfts : [];
      for (const nft of nfts) {
        const id = parseTokenId(nft);
        if (id) ids.push(id);
      }
      next = data?.next;
    } while (next && ids.length < MAX_IDS);

    if (ids.length > 0) return dedupeSort(ids);
  }

  return [];
}

async function fetchReservoirWalletOtters(wallet) {
  const apiKey = process.env.RESERVOIR_API_KEY || '';
  const collectionIds = [`apechain:${CONTRACT}`, CONTRACT];
  const ids = [];

  for (const cid of collectionIds) {
    let continuation = null;
    ids.length = 0;

    do {
      let path = `/users/${wallet}/tokens/v10?collection=${encodeURIComponent(cid)}&limit=200&includeAttributes=false`;
      if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`;

      const opts = {
        hostname: 'api.reservoir.tools',
        path,
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' },
      };
      if (apiKey) opts.headers['x-api-key'] = apiKey;

      const data = await fetchJson(opts);
      const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
      for (const row of tokens) {
        const id = parseTokenId(row?.token || row);
        if (id) ids.push(id);
      }
      continuation = data?.continuation;
    } while (continuation && ids.length < MAX_IDS);

    if (ids.length > 0) return dedupeSort(ids);
  }

  return [];
}
