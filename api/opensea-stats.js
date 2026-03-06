// Vercel serverless function to proxy OpenSea API calls
// Using legacy format for maximum compatibility
const https = require('https');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const collectionSlug = 'otterful-otters';
        const apiKey = process.env.OPENSEA_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'Missing OPENSEA_API_KEY. OpenSea v2 endpoints require an API key.',
                help: 'Add OPENSEA_API_KEY to Vercel project environment variables (Production + Preview).'
            });
        }

        // OpenSea v2 endpoints (require x-api-key)
        const statsUrl = `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`;
        const collectionUrl = `https://api.opensea.io/api/v2/collections/${collectionSlug}`;
        const offersUrl = `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}?limit=1`;

        const [statsData, collectionData, offersData] = await Promise.all([
            fetchJson(statsUrl, apiKey),
            fetchJson(collectionUrl, apiKey),
            fetchJson(offersUrl, apiKey).catch(() => null),
        ]);

        const topOffer = extractTopOffer(offersData);

        return res.status(200).json({
            slug: collectionSlug,
            fetchedAt: new Date().toISOString(),
            stats: statsData,
            collection: {
                total_supply: collectionData?.total_supply ?? null,
                unique_item_count: collectionData?.unique_item_count ?? null,
                created_date: collectionData?.created_date ?? null,
                contracts: collectionData?.contracts ?? null,
            },
            topOffer,
        });
    } catch (error) {
        console.error('Error fetching OpenSea data:', error);
        return res.status(500).json({ 
            error: error.message || 'Failed to fetch OpenSea data',
            details: error.stack
        });
    }
};

function fetchJson(url, apiKey) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'Accept': 'application/json',
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
                        reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
                    }
                    return;
                }
                reject(new Error(`HTTP ${resp.statusCode}: ${resp.statusMessage} - ${body}`));
            });
        });

        request.on('error', reject);
        request.setTimeout(15000, () => {
            request.destroy(new Error(`Timeout fetching ${url}`));
        });
    });
}

function extractTopOffer(offersData) {
    const offer = offersData?.offers?.[0];
    const price = offer?.price;
    if (!price) return null;

    const currency = price.currency || null;
    const decimals = typeof price.decimals === 'number' ? price.decimals : null;
    const rawValue = price.value;

    if (!currency || decimals === null || rawValue === undefined || rawValue === null) return null;

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return null;

    const value = parsed / Math.pow(10, decimals);
    return { currency, value };
}
