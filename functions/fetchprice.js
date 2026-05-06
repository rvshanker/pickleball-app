// Add this to your existing functions/index.js (or create it if you have separate files).
// This uses the v2 Functions API. If your existing functions use v1, see the v1 alternative below.
//
// Required at the top of your functions/index.js if you don't already have it:
//   const { onRequest } = require("firebase-functions/v2/https");
//   const logger = require("firebase-functions/logger");

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const ALLOWED_HOSTS = new Set([
  "www.amazon.in",
  "www.flipkart.com",
  "amazon.in",
  "flipkart.com"
]);

const ALLOWED_ORIGINS = new Set([
  "https://pickleconnect.live",
  "https://www.pickleconnect.live"
]);

function getStealthHeaders(targetUrl) {
  const isAmazon = targetUrl.includes("amazon.in");
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi-IN;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
    Referer: isAmazon ? "https://www.amazon.in/" : "https://www.google.com/"
  };
}

exports.fetchPrice = onRequest(
  { cors: true, timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    // Restrict CORS to your own origin
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).end();
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
      res.status(403).json({ error: "Host not allowed" });
      return;
    }

    logger.info("Fetching", { url: targetUrl });

    try {
      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: getStealthHeaders(targetUrl)
      });

      const html = await upstream.text();

      logger.info("Upstream response", {
        status: upstream.status,
        bytes: html.length,
        host: parsed.hostname
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      res.status(upstream.status).send(html);
    } catch (err) {
      logger.error("Fetch failed", { error: err.message });
      res.status(502).json({ error: "Failed to reach upstream", detail: err.message });
    }
  }
);
