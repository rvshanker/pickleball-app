const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

// ────────────────────────────────────────────────────────────────────
// IMPORTANT: paste your ScrapingBee API key here.
// This file is for use in a PRIVATE GitHub repo only.
// If you ever make the repo public, rotate the key immediately.
// You can rotate the key in your ScrapingBee dashboard.
// ────────────────────────────────────────────────────────────────────
const SCRAPINGBEE_KEY = "PASTE_YOUR_SCRAPINGBEE_KEY_HERE";

const ALLOWED_HOSTS = new Set([
  "www.amazon.in",
  "www.flipkart.com",
  "amazon.in",
  "flipkart.com"
]);

const ALLOWED_ORIGINS = new Set([
  "https://pickleconnect.live",
  "https://www.pickleconnect.live",
  "https://pickleball-app-1bba7.web.app",
  "https://pickleball-app-1bba7.firebaseapp.com"
]);

function buildScrapingBeeUrl(targetUrl) {
  // ScrapingBee documentation: https://www.scrapingbee.com/documentation/
  // - render_js=false : cheaper and faster. Both Amazon and Flipkart SSR enough product data.
  // - country_code=in : routes through Indian residential/mobile IPs.
  // - premium_proxy=true : uses ScrapingBee's residential pool (not datacenter IPs).
  //   Costs 25 credits per request but is what gets us past Amazon/Flipkart blocks.
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY,
    url: targetUrl,
    render_js: "false",
    country_code: "in",
    premium_proxy: "true"
  });
  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

exports.fetchPrice = onRequest(
  {
    cors: true,
    timeoutSeconds: 60,    // ScrapingBee can take 10-30s
    memory: "256MiB"
  },
  async (req, res) => {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    // Sanity check that you actually pasted a key
    if (!SCRAPINGBEE_KEY || SCRAPINGBEE_KEY === "PASTE_YOUR_SCRAPINGBEE_KEY_HERE") {
      logger.error("SCRAPINGBEE_KEY not set in fetchPrice.js");
      res.status(500).json({ error: "Proxy API key not configured" });
      return;
    }

    const targetUrl = req.query.url;
    if (!targetUrl) {
      res.status(400).json({ error: "No url query param" });
      return;
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      res.status(403).json({ error: "Host not allowed", host: parsed.hostname });
      return;
    }

    const scrapingBeeUrl = buildScrapingBeeUrl(targetUrl);
    logger.info("fetchPrice via ScrapingBee", { host: parsed.hostname });

    try {
      const upstream = await fetch(scrapingBeeUrl, { method: "GET" });
      const html = await upstream.text();

      const cost = upstream.headers.get("Spb-cost");
      const remaining = upstream.headers.get("Spb-monthly-credits-remaining");

      logger.info("ScrapingBee response", {
        status: upstream.status,
        bytes: html.length,
        host: parsed.hostname,
        cost,
        creditsRemaining: remaining
      });

      // Surface ScrapingBee headers to the client for debugging
      if (cost) res.setHeader("X-ScrapingBee-Cost", cost);
      if (remaining) res.setHeader("X-ScrapingBee-Remaining", remaining);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      // Cache 6 hours at the edge — repeated searches don't burn credits
      res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");
      res.status(upstream.status).send(html);
    } catch (err) {
      logger.error("fetchPrice failed", { error: err.message });
      res.status(502).json({ error: "Failed to reach ScrapingBee", detail: err.message });
    }
  }
);
