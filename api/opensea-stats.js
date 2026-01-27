// Vercel serverless function to proxy OpenSea API calls
// Using Web Standard Request/Response API
export default async function handler(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    try {
        const collectionSlug = 'otterful-otters';
        
        // Fetch collection stats
        const statsUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}/stats`;
        const statsResponse = await fetch(statsUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0',
            },
        });

        if (!statsResponse.ok) {
            const errorText = await statsResponse.text();
            throw new Error(`OpenSea API error: ${statsResponse.status} ${statsResponse.statusText} - ${errorText}`);
        }

        const statsData = await statsResponse.json();

        // Fetch collection data for best offer
        let collectionData = {};
        try {
            const collectionUrl = `https://api.opensea.io/api/v1/collection/${collectionSlug}`;
            const collectionResponse = await fetch(collectionUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0',
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

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
            },
        });
    } catch (error) {
        console.error('Error fetching OpenSea data:', error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Failed to fetch OpenSea data',
            details: error.stack
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}
