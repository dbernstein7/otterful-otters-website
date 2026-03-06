// Vercel serverless: GET /api/live-sales — last 10 sales for Otterful Otters
const COLLECTION_SLUG = 'otterful-otters';
const CONTRACT = '0x4e5913922b7ddf916c8d27d1016827f799687e66';

function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = `https://api.opensea.io/api/v1/events?collection_slug=${COLLECTION_SLUG}&event_type=successful&limit=10`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    const events = data.asset_events || [];
    const sales = [];

    for (const evt of events) {
      try {
        const winner = evt.winner_account || evt.buyer;
        let buyer = winner?.address || winner;
        if (typeof buyer !== 'string') buyer = '—';
        buyer = shortenAddress(buyer);

        const token = evt.payment_token || {};
        const decimals = Number(token.decimals) || 18;
        const total = evt.total_price;
        const priceVal = total != null ? Number(total) / Math.pow(10, decimals) : 0;
        const symbol = (token.symbol || 'ETH').toUpperCase();

        const asset = evt.asset || {};
        const tokenId = asset.token_id || evt.asset?.token_id;
        let link = asset.permalink || '';
        if (!link && tokenId) link = `https://magiceden.us/item-details/apechain/${CONTRACT}/${tokenId}`;

        sales.push({ buyer, price: Math.round(priceVal * 1e4) / 1e4, symbol, link, token_id: tokenId });
      } catch (_) {}
    }

    return res.status(200).json({ sales: sales.slice(0, 10) });
  } catch (e) {
    return res.status(200).json({ sales: [], error: String(e.message) });
  }
};
