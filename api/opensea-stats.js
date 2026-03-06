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

        const [statsData, collectionData, offersData, collectionPageText] = await Promise.all([
            fetchJson(statsUrl, apiKey),
            fetchJson(collectionUrl, apiKey),
            fetchJson(offersUrl, apiKey).catch(() => null),
            fetchText(`https://opensea.io/collection/${collectionSlug}`).catch(() => null),
        ]);

        const topOffer = extractTopOffer(offersData);
        const displayed = collectionPageText ? extractDisplayedStats(collectionPageText) : null;

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
            openseaDisplayed: displayed,
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

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'Accept': 'text/html',
                'Accept-Encoding': 'identity',
                'User-Agent': 'otterful-otters-dashboard/1.0',
            },
        }, (resp) => {
            let body = '';
            resp.on('data', (chunk) => (body += chunk));
            resp.on('end', () => {
                if (resp.statusCode >= 200 && resp.statusCode < 300) {
                    resolve(body);
                    return;
                }
                reject(new Error(`HTTP ${resp.statusCode}: ${resp.statusMessage}`));
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

function extractDisplayedStats(text) {
    // The rendered HTML contains plain text blocks like:
    // "Total volume\n33.8K33.8K APE"
    // We capture the first occurrence and parse K/M suffixes.
    const floor = matchCompact(text, /Floor price\s*([\d.,]+)\s*([\d.,]+)?\s*([A-Z]{2,10})/i);
    const topOffer = matchCompact(text, /Top offer\s*([\d.,]+)\s*([\d.,]+)?\s*([A-Z]{2,10})/i);
    const vol24h = matchCompact(text, /24h volume\s*([\d.,]+(?:[KM])?)\s*([\d.,]+(?:[KM])?)?\s*([A-Z]{2,10})/i);
    const totalVol = matchCompact(text, /Total volume\s*([\d.,]+(?:[KM])?)\s*([\d.,]+(?:[KM])?)?\s*([A-Z]{2,10})/i);
    const listed = matchPercent(text, /Listed\s*([\d.,]+%)/i);
    const owners = matchOwners(text);

    return {
        floor_price: floor ? parseNumber(floor.value) : null,
        floor_price_symbol: floor?.symbol || null,
        top_offer: topOffer ? parseNumber(topOffer.value) : null,
        top_offer_symbol: topOffer?.symbol || null,
        volume_24h: vol24h ? parseCompactNumber(vol24h.value) : null,
        volume_24h_symbol: vol24h?.symbol || null,
        total_volume: totalVol ? parseCompactNumber(totalVol.value) : null,
        total_volume_symbol: totalVol?.symbol || null,
        listed_percent: listed ? parsePercent(listed) : null,
        owners: owners?.count ?? null,
        owners_percent: owners?.percent ?? null,
    };
}

function matchCompact(text, regex) {
    const m = text.match(regex);
    if (!m) return null;
    return { value: m[1], symbol: m[3] };
}

function matchPercent(text, regex) {
    const m = text.match(regex);
    return m ? m[1] : null;
}

function matchOwners(text) {
    // "Owners (Unique)641641 (28.9%28.9%)"
    const m = text.match(/Owners\s*\(Unique\)\s*([\d,]+)\s*[\d,]*\s*\(([\d.,]+)%/i);
    if (!m) return null;
    return { count: parseInt(m[1].replace(/,/g, ''), 10), percent: parseFloat(m[2]) };
}

function parseNumber(str) {
    const v = Number(String(str).replace(/,/g, ''));
    return Number.isFinite(v) ? v : null;
}

function parsePercent(str) {
    const v = parseFloat(String(str).replace('%', ''));
    return Number.isFinite(v) ? v : null;
}

function parseCompactNumber(str) {
    const s = String(str).trim().replace(/,/g, '');
    const m = s.match(/^([\d.]+)([KM])?$/i);
    if (!m) return parseNumber(s);
    const base = parseFloat(m[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = (m[2] || '').toUpperCase();
    if (suffix === 'K') return base * 1000;
    if (suffix === 'M') return base * 1000000;
    return base;
}
