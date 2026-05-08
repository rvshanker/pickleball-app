// Shared scraping helpers used by refreshPrices.
// Extracts price + stock info from Amazon and Flipkart product pages.

const SCRAPINGBEE_KEY = "PASTE_YOUR_SCRAPINGBEE_KEY_HERE";

function buildScrapingBeeUrl(targetUrl) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY,
    url: targetUrl,
    render_js: "false",
    country_code: "in",
    premium_proxy: "true"
  });
  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

async function fetchPage(url) {
  const sbUrl = buildScrapingBeeUrl(url);
  const r = await fetch(sbUrl);
  const html = await r.text();
  return { status: r.status, html, ok: r.ok };
}

// ─────────────────────────────────────────────────────────────────────
// Amazon product page extractor
// ─────────────────────────────────────────────────────────────────────
function extractAmazonPrice(html) {
  // Amazon product pages have multiple price selectors depending on layout
  // We use regex over the raw HTML because we don't have DOMParser in Node.

  // 1. Try priceToPay (most current layout)
  let m = html.match(/<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([\d,]+)<\/span>/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  // 2. Try the offscreen format that's used by screen readers (most reliable)
  m = html.match(/<span class="a-offscreen">\s*₹\s*([\d,]+(?:\.\d+)?)\s*<\/span>/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  // 3. Try priceblock
  m = html.match(/id="priceblock_(?:our|deal|sale)price"[^>]*>\s*₹\s*([\d,]+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  return null;
}

function extractAmazonStock(html) {
  // Detect "out of stock" indicators
  if (/Currently unavailable/i.test(html)) return false;
  if (/We don't know when or if this item will be back in stock/i.test(html)) return false;
  if (/temporarily out of stock/i.test(html)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Flipkart product page extractor
// ─────────────────────────────────────────────────────────────────────
function extractFlipkartPrice(html) {
  // Flipkart embeds prices in JSON state and rotates class names regularly.
  // Try multiple strategies.

  // 1. JSON state — most stable across class-name rotations
  let m = html.match(/"finalPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
  if (m) return parseFloat(m[1]);

  m = html.match(/"sellingPrice"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1]);

  m = html.match(/"value"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"decimalValue"/);
  if (m) return parseFloat(m[1]);

  // 2. Visible price markup fallback
  m = html.match(/₹\s*([\d,]+(?:\.\d{2})?)\s*<\/div>/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  return null;
}

function extractFlipkartStock(html) {
  if (/Out of Stock/i.test(html)) return false;
  if (/Sold Out/i.test(html)) return false;
  if (/Notify Me/.test(html) && !/Add to Cart|Buy Now/i.test(html)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Public API: scrape a product from a specific site
// ─────────────────────────────────────────────────────────────────────
async function scrapeProduct(site, url) {
  const result = { site, url, price: null, inStock: null, error: null, htmlLength: 0 };

  try {
    const { status, html, ok } = await fetchPage(url);
    result.htmlLength = html.length;

    if (!ok) {
      result.error = `Upstream HTTP ${status}`;
      return result;
    }

    if (html.length < 5000) {
      result.error = `Response too short (${html.length} bytes) — likely blocked`;
      return result;
    }

    if (site === "amazon") {
      result.price = extractAmazonPrice(html);
      result.inStock = extractAmazonStock(html);
    } else if (site === "flipkart") {
      result.price = extractFlipkartPrice(html);
      result.inStock = extractFlipkartStock(html);
    }

    if (result.price === null) {
      result.error = "Could not extract price from HTML";
    }

    return result;
  } catch (e) {
    result.error = e.message;
    return result;
  }
}

module.exports = {
  scrapeProduct,
  extractAmazonPrice,
  extractFlipkartPrice
};
