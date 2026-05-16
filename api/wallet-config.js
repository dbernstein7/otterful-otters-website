/**
 * Public WalletConnect / Reown project id for 3D Builder (client-side; not secret).
 * Set REOWN_PROJECT_ID or WALLETCONNECT_PROJECT_ID in Vercel env.
 * Create a project at https://cloud.reown.com/
 */
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const projectId =
    (process.env.REOWN_PROJECT_ID || process.env.WALLETCONNECT_PROJECT_ID || '').trim();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({ projectId });
};
