// Vercel serverless function to proxy OpenSea API calls
// Using legacy format for maximum compatibility
const https = require('https');
const http = require('http');

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
        
        // Fetch collection stats using Node.js https module
        const statsUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}/stats`;
        const statsData = await fetchUrl(statsUrl);

        // Fetch collection data for best offer
        let collectionData = {};
        try {
            const collectionUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}`;
            collectionData = await fetchUrl(collectionUrl);
        } catch (collectionError) {
            console.warn('Could not fetch collection data:', collectionError);
        }

        // Combine the data
        const result = {
            stats: statsData.stats || {},
            collection: collectionData.collection || {},
        };

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching OpenSea data:', error);
        return res.status(500).json({ 
            error: error.message || 'Failed to fetch OpenSea data',
            details: error.stack
        });
    }
};

// Helper function to fetch URL using Node.js https
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            }
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} - ${data}`));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}
