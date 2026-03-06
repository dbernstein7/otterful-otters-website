// Vercel serverless proxy: GET /api/v2/chain/{chain}/contract/{address}/nfts/{token_id}
// Used by Rarity Rank Viewer. Set NFT_RARITY_API_BASE (and optional NFT_RARITY_API_KEY) in Vercel env.

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const chain = (req.query.chain || '').trim() || 'ape_chain';
    const contract = (req.query.contract || '').trim();
    const tokenId = (req.query.token_id ?? req.query.tokenId ?? '').toString().trim();

    if (!contract || !tokenId) {
        return res.status(400).json({
            error: 'Missing contract or token_id',
            usage: 'GET /api/nft-rarity?chain=ape_chain&contract=0x...&token_id=1'
        });
    }

    const base = (process.env.NFT_RARITY_API_BASE || '').trim();
    if (!base) {
        return res.status(503).json({
            error: 'Rarity API not configured',
            help: 'Set NFT_RARITY_API_BASE (and optionally NFT_RARITY_API_KEY) in Vercel environment variables.'
        });
    }

    const url = `${base.replace(/\/$/, '')}/api/v2/chain/${encodeURIComponent(chain)}/contract/${encodeURIComponent(contract)}/nfts/${encodeURIComponent(tokenId)}`;
    const headers = { 'Accept': 'application/json' };
    if (process.env.NFT_RARITY_API_KEY) headers['x-api-key'] = process.env.NFT_RARITY_API_KEY;

    try {
        const response = await fetch(url, { headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return res.status(response.status).json(data && typeof data === 'object' ? data : { error: 'Upstream error', status: response.status });
        }
        return res.status(200).json(data);
    } catch (err) {
        return res.status(502).json({ error: 'Rarity API request failed', message: err.message });
    }
};
