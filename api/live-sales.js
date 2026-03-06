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
        // SaleEvent: buyer is string address
        let buyer = evt.buyer || evt.taker || (evt.winner_account && evt.winner_account.address) || '—';
        if (typeof buyer === 'object') buyer = buyer.address || '—';
        buyer = shortenAddress(buyer);

        // SaleEvent: payment has quantity (string, smallest unit), decimals, symbol
        let priceVal = 0;
        let symbol = 'APE';
        const payment = evt.payment;
        if (payment && payment.quantity != null) {
          const dec = Number(payment.decimals) !== undefined ? Number(payment.decimals) : 18;
          priceVal = Number(payment.quantity) / Math.pow(10, dec);
          symbol = (payment.symbol || 'APE').toUpperCase();
        }

        // SaleEvent: nft has identifier (token_id), opensea_url
        const nft = evt.nft || evt.asset || {};
        const tokenId = nft.identifier !== undefined ? nft.identifier : (nft.token_id || evt.token_id);
        let link = nft.opensea_url || nft.permalink || '';
        if (!link && tokenId) link = `https://opensea.io/assets/ape_chain/${CONTRACT}/${tokenId}`;

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
