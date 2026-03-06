// Vercel serverless: GET /api/live-sales — last 10 sales via OpenSea v2 (uses OPENSEA_API_KEY)
const https = require('https');
const COLLECTION_SLUG = 'otterful-otters';
const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';

function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function fetchJson(url, apiKey) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'otterful-otters-dashboard/1.0',
        'x-api-key': apiKey,
      },
    }, (resp) => {
      let body = '';
      resp.on('data', (chunk) => (body += chunk));
      resp.on('end', () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON from OpenSea'));
          }
          return;
        }
        reject(new Error(`HTTP ${resp.statusCode}: ${body.slice(0, 200)}`));
      });
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('Timeout')));
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENSEA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Missing OPENSEA_API_KEY',
      help: 'Add OPENSEA_API_KEY to Vercel project environment variables.',
    });
  }

  try {
    // OpenSea v2 events (requires x-api-key)
    const url = `https://api.opensea.io/api/v2/events?collection_slug=${COLLECTION_SLUG}&event_type=sale&limit=10`;
    const data = await fetchJson(url, apiKey);
    const events = data.events || data.asset_events || [];
    const sales = [];

    for (const evt of events) {
      try {
        // v2: taker/buyer vs maker/seller; or winner_account (v1)
        const buyerObj = evt.taker || evt.buyer || evt.winner_account;
        let buyer = buyerObj?.address || (typeof buyerObj === 'string' ? buyerObj : null) || '—';
        buyer = shortenAddress(buyer);

        // v2: price in event or order; can be in wei/smallest unit
        let priceVal = 0;
        let symbol = 'APE';
        const priceObj = evt.payment_token || evt.price || evt.total_price;
        if (priceObj) {
          if (typeof priceObj === 'object' && priceObj.value != null) {
            const dec = Number(priceObj.decimals) || 18;
            priceVal = Number(priceObj.value) / Math.pow(10, dec);
            symbol = (priceObj.symbol || priceObj.currency_symbol || 'APE').toUpperCase();
          } else if (typeof priceObj === 'string' || typeof priceObj === 'number') {
            priceVal = Number(priceObj) / 1e18;
          }
        }
        if (evt.total_price != null && priceVal === 0) {
          const token = evt.payment_token || {};
          const dec = Number(token.decimals) || 18;
          priceVal = Number(evt.total_price) / Math.pow(10, dec);
          symbol = (token.symbol || 'APE').toUpperCase();
        }

        const asset = evt.asset || evt.nft || {};
        const tokenId = asset.token_id || asset.identifier || evt.token_id;
        let link = asset.permalink || evt.permalink || '';
        if (!link && tokenId) link = `https://magiceden.us/item-details/apechain/${CONTRACT}/${tokenId}`;

        sales.push({
          buyer,
          price: Math.round(priceVal * 1e4) / 1e4,
          symbol,
          link,
          token_id: tokenId,
        });
      } catch (_) {}
    }

    return res.status(200).json({ sales: sales.slice(0, 10) });
  } catch (e) {
    console.error('live-sales error:', e.message);
    return res.status(200).json({ sales: [], error: e.message });
  }
};
