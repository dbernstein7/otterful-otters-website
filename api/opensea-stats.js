// Vercel serverless function to proxy OpenSea API calls
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const collectionSlug = 'otterful-otters';
        
        // Fetch collection stats
        const statsUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}/stats`;
        const statsResponse = await fetch(statsUrl, {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!statsResponse.ok) {
            throw new Error(`OpenSea API error: ${statsResponse.status} ${statsResponse.statusText}`);
        }

        const statsData = await statsResponse.json();

        // Fetch collection data for best offer
        let collectionData = {};
        try {
            const collectionUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}`;
            const collectionResponse = await fetch(collectionUrl, {
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (collectionResponse.ok) {
                collectionData = await collectionResponse.json();
            }
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
            error: error.message || 'Failed to fetch OpenSea data' 
        });
    }
}
