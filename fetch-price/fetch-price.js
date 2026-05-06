// Vercel serverless function. Place this file at /api/fetch-price.js in your repo.
// It will automatically be served at https://your-domain/api/fetch-price
//
// No Express, no app.listen() — Vercel wraps it for you.

const ALLOWED_HOSTS = new Set([
  'www.amazon.in',
  'www.flipkart.com',
  'amazon.in',
  'flipkart.com'
]);

const ALLOWED_ORIGINS = new Set([
  'https://pickleconnect.live',
  'https://www.pickleconnect.live'
]);

function getStealthHeaders(targetUrl) {
  const isAmazon = targetUrl.includes('amazon.in');
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9,hi-IN;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'Referer': isAmazon ? 'https://www.amazon.in/' : 'https://www.google.com/'
  };
}

module.exports = async function handler(req, res) {
  // CORS — restrict to your own origin so randoms can't use your proxy
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    res.status(400).json({ error: 'No url query param' });
    return;
  }

  // Validate the URL is one of our allowed sites
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ error: 'Host not allowed' });
    return;
  }

  console.log('[Proxy] Fetching:', targetUrl);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: getStealthHeaders(targetUrl),
      // Vercel serverless has its own timeout — no need to set one explicitly
    });

    const html = await response.text();

    // Quick bot-detection sniff
    if (html.includes('api-services-support@amazon.com') || html.toLowerCase().includes('captcha')) {
      console.warn('[Proxy] Bot detection page returned for', parsed.hostname);
      // Still return the body — frontend can decide what to do
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache 5 minutes at the edge to soften load on the upstream sites
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(response.status).send(html);
  } catch (err) {
    console.error('[Proxy] Error:', err.message);
    res.status(502).json({ error: 'Failed to reach upstream', detail: err.message });
  }
};
