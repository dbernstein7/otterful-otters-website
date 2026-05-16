/**
 * List Otterful token IDs owned by a wallet on ApeChain.
 * Indexers can over-report; we always verify with on-chain ownerOf.
 *
 * GET /api/wallet-otters?wallet=0x...
 * Env: OPENSEA_API_KEY, RESERVOIR_API_KEY (optional)
 */
const https = require('https');

const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';
const CONTRACT_LOWER = CONTRACT.toLowerCase();
const OPENSEA_SLUG = 'otterful-otters';
const APECHAIN_RPC = 'https://rpc.apechain.com/http';
const MAX_CANDIDATES = 800;
const OWNER_OF_SELECTOR = '6352211e'; // ownerOf(uint256)

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
    const candidates = new Set();
    let indexerSource = 'none';

    const openSeaIds = await fetchOpenSeaWalletOtters(wallet).catch(() => []);
    if (openSeaIds.length > 0) {
      openSeaIds.forEach((id) => candidates.add(id));
      indexerSource = 'opensea';
    } else {
      const reservoirIds = await fetchReservoirWalletOtters(wallet).catch(() => []);
      if (reservoirIds.length > 0) {
        reservoirIds.forEach((id) => candidates.add(id));
        indexerSource = 'reservoir';
      }
    }

    const candidateList = [...candidates].slice(0, MAX_CANDIDATES);
    const tokenIds = await verifyOwnershipOnChain(wallet, candidateList);

    return res.status(200).json({
      wallet,
      tokenIds,
      source: indexerSource,
      verifiedOnChain: true,
      indexerCandidates: candidateList.length,
      fetchedAt: new Date().toISOString(),
      hint:
        tokenIds.length === 0
          ? 'No Otterful Otters found for this wallet on ApeChain.'
          : undefined,
    });
  } catch (err) {
    console.error('wallet-otters error:', err);
    return res.status(500).json({
      error: err.message || 'Failed to load wallet otters',
      tokenIds: [],
    });
  }
};

function fetchJson(opts, body) {
  const options = {
    method: body ? 'POST' : 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'otterful-otters-dashboard/1.0',
      ...(opts.headers || {}),
    },
    ...opts,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => {
        data += chunk;
      });
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON'));
          }
          return;
        }
        reject(new Error(`HTTP ${resp.statusCode}: ${data.slice(0, 240)}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('Timeout')));
    if (body) req.write(JSON.stringify(body));
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

function isOtterfulContract(nft) {
  const c = String(nft?.contract || nft?.contract_address || nft?.token?.contract || '')
    .trim()
    .toLowerCase();
  return !c || c === CONTRACT_LOWER;
}

function dedupeSort(ids) {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** OpenSea account NFTs — only `collection` is a valid filter (not `contract`). */
async function fetchOpenSeaWalletOtters(wallet) {
  const apiKey = process.env.OPENSEA_API_KEY || '';
  if (!apiKey) return [];

  const ids = [];
  let next = null;
  const basePath = `/api/v2/chain/ape_chain/account/${wallet}/nfts?limit=200&collection=${encodeURIComponent(OPENSEA_SLUG)}`;

  do {
    let path = basePath;
    if (next) path += `&next=${encodeURIComponent(next)}`;

    const headers = { Accept: 'application/json', 'User-Agent': 'otterful-otters-dashboard/1.0' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const data = await fetchJson({ hostname: 'api.opensea.io', path, method: 'GET', headers });
    const nfts = Array.isArray(data?.nfts) ? data.nfts : [];
    for (const nft of nfts) {
      if (!isOtterfulContract(nft)) continue;
      const id = parseTokenId(nft);
      if (id) ids.push(id);
    }
    next = data?.next;
  } while (next && ids.length < MAX_CANDIDATES);

  return dedupeSort(ids);
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
        const token = row?.token || row;
        const contract = String(token?.contract || '').toLowerCase();
        if (contract && contract !== CONTRACT_LOWER) continue;
        const id = parseTokenId(token);
        if (id) ids.push(id);
      }
      continuation = data?.continuation;
    } while (continuation && ids.length < MAX_CANDIDATES);

    if (ids.length > 0) return dedupeSort(ids);
  }

  return [];
}

function encodeOwnerOfCall(tokenId) {
  const hex = BigInt(tokenId).toString(16).padStart(64, '0');
  return '0x' + OWNER_OF_SELECTOR + hex;
}

function decodeAddressFromRpcResult(result) {
  if (!result || result === '0x') return null;
  const h = String(result).replace(/^0x/i, '');
  if (h.length < 40) return null;
  return ('0x' + h.slice(-40)).toLowerCase();
}

async function rpcOwnerOf(tokenId) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [
      { to: CONTRACT, data: encodeOwnerOfCall(tokenId) },
      'latest',
    ],
  };
  const data = await fetchJson(
    {
      hostname: 'rpc.apechain.com',
      path: '/http',
      method: 'POST',
    },
    body
  );
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return decodeAddressFromRpcResult(data.result);
}

/** Source of truth — only tokens where ownerOf(id) === wallet. */
async function verifyOwnershipOnChain(wallet, candidateIds) {
  if (!candidateIds.length) return [];

  const owned = [];
  const batchSize = 24;

  for (let i = 0; i < candidateIds.length; i += batchSize) {
    const chunk = candidateIds.slice(i, i + batchSize);
    const owners = await Promise.all(
      chunk.map((id) =>
        rpcOwnerOf(id).catch(() => null)
      )
    );
    for (let j = 0; j < chunk.length; j += 1) {
      if (owners[j] === wallet) owned.push(chunk[j]);
    }
  }

  return owned.sort((a, b) => a - b);
}
