export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);

            if (url.pathname === '/health') {
                return new Response(JSON.stringify({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    env: {
                        hasKV: !!env.CURVE_GAUGES,
                        hasAPIKey: !!env.MORALIS_API_KEY
                    }
                }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            if (url.pathname.startsWith('/api/token-holders/')) {
                return handleTokenHolders(request, env, url);
            }

            return new Response(JSON.stringify({
                error: 'Not Found',
                path: url.pathname
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } catch (error) {
            console.error('Top-level worker error:', error);
            return new Response(JSON.stringify({
                error: 'Worker initialization error',
                message: error.message,
                stack: error.stack
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    },
};

async function handleTokenHolders(request, env, url) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        if (!env.MORALIS_API_KEY) {
            return new Response(JSON.stringify({
                error: 'MORALIS_API_KEY not configured'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (!env.CURVE_GAUGES) {
            return new Response(JSON.stringify({
                error: 'KV namespace not configured'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const pathParts = url.pathname.split('/');
        const tokenAddress = pathParts[3];
        const chain = url.searchParams.get('chain') || 'eth';
        const limit = 10;

        if (!tokenAddress) {
            return new Response(JSON.stringify({ error: 'Token address required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supportedChains = ['eth', 'polygon', 'arbitrum', 'base', 'optimism', 'gnosis'];
        if (!supportedChains.includes(chain)) {
            return new Response(JSON.stringify({
                error: 'Chain not supported by Moralis',
                supportedChains: supportedChains
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const cacheKey = `token-holders:${chain}:${tokenAddress}:${limit}`;

        let cachedData;
        try {
            cachedData = await env.CURVE_GAUGES.get(cacheKey);
        } catch (kvError) {
            console.error('KV get error:', kvError);
        }

        if (cachedData) {
            console.log('Returning cached data for:', cacheKey);
            return new Response(cachedData, {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'X-Cache': 'HIT'
                }
            });
        }

        console.log('Fetching fresh data from Moralis for:', tokenAddress);

        const moralisUrl = `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/owners?chain=${chain}&order=DESC&limit=${limit}`;

        const moralisResponse = await fetch(moralisUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-API-Key': env.MORALIS_API_KEY,
            },
        });

        if (!moralisResponse.ok) {
            const errorText = await moralisResponse.text();
            return new Response(JSON.stringify({
                error: `Moralis API error: ${moralisResponse.status}`,
                details: errorText
            }), {
                status: moralisResponse.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const data = await moralisResponse.json();
        const responseData = JSON.stringify(data);

        try {
            await env.CURVE_GAUGES.put(cacheKey, responseData, {
                expirationTtl: 24 * 60 * 60
            });
        } catch (kvError) {
            console.error('KV put error:', kvError);
        }

        return new Response(responseData, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'X-Cache': 'MISS'
            }
        });

    } catch (error) {
        console.error('Token holders error:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}