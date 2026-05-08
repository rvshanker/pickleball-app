// Shared scraping helpers used by refresh functions.
// Final Flipkart attempt: stealth_proxy=true (different IP pool than premium_proxy)
// plus diagnostic output on failure to see what's actually being returned.

const { defineSecret } = require("firebase-functions/params");
const SCRAPINGBEE_KEY = defineSecret("SCRAPINGBEE_KEY");

function buildScrapingBeeUrl(targetUrl, site) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY.value(),
    url: targetUrl,
    country_code: "in"
  });

  if (site === "flipkart") {
    // Stealth proxy is ScrapingBee's tier for sites with strong bot detection.
    // Don't combine with premium_proxy — they're alternatives, not stackable.
    params.set("stealth_proxy", "true");
    params.set("render_js", "true");
    params.set("wait", "5000");
  } else {
    params.set("premium_proxy", "true");
    params.set("render_js", "false");
  }

  return `https://app.scrapingbee.com/api/v1/?${params.toString()}`;
}

async function fetchPage(url, site) {
  const sbUrl = buildScrapingBeeUrl(url, site);
  const r = await fetch(sbUrl);
  const html = await r.text();
  return { status: r.status, html, ok: r.ok };
}

// ─────────────────────────────────────────────────────────────────────
function extractAmazonPrice(html) {
  const block = html.match(/corePriceDisplay_desktop_feature_div([\s\S]{0,3000})/);
  const haystack = block ? block[1] : html.slice(0, 200000);

  let m = haystack.match(/<span[^>]*class="a-offscreen"[^>]*>\s*₹\s*([\d,]+(?:\.\d+)?)\s*<\/span>/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  m = haystack.match(/<span[^>]*class="[^"]*a-price-whole[^"]*"[^>]*>([\d,]+)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  m = html.match(/id="priceblock_(?:our|deal|sale)price"[^>]*>\s*₹\s*([\d,]+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1].replace(/,/g, ""));

  return null;
}

function extractAmazonStock(html) {
  const block = html.match(/(buybox|availability|outOfStock)[\s\S]{0,1500}/i);
  const haystack = block ? block[0] : html;

  if (/Currently unavailable/i.test(haystack)) return false;
  if (/We don't know when or if this item will be back in stock/i.test(haystack)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
function extractFlipkartPrice(html) {
  if (/Oops!\s*Something broke/i.test(html)) return null;

  const head = html.slice(0, 800000);

  let m = head.match(/Buy now at[^₹]{0,200}₹\s*([\d,]+)/);
  if (m) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1000 && price <= 500000) return price;
  }

  m = head.match(/<meta[^>]*property="product:price:amount"[^>]*content="([\d.]+)"/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  m = head.match(/"finalPrice"\s*:\s*\{[^{}]*?"value"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  m = head.match(/"sellingPrice"\s*:\s*(?:\{[^{}]*?"(?:amount|value)"\s*:\s*)?(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy: find any standalone ₹ amount in a sensible price range
  const allPrices = [...head.matchAll(/₹\s*([\d,]+(?:\.\d{2})?)/g)]
    .map(x => parseFloat(x[1].replace(/,/g, "")))
    .filter(p => p >= 5000 && p <= 200000);

  if (allPrices.length > 0) {
    // Most common price in valid range = likely the actual price
    const counts = {};
    allPrices.forEach(p => counts[p] = (counts[p] || 0) + 1);
    const mostCommon = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
    if (mostCommon && mostCommon[1] >= 2) return parseFloat(mostCommon[0]);
  }

  return null;
}

function extractFlipkartStock(html) {
  if (/Oops!\s*Something broke/i.test(html)) return null;

  const head = html.slice(0, 800000);

  if (/Buy now at/i.test(head)) return true;
  if (/Add to cart/i.test(head)) return true;
  if (/"BUY_NOW"/i.test(head)) return true;
  if (/"ADD_TO_CART"/i.test(head)) return true;

  if (/Notify Me/i.test(head) && !/Buy now|Add to cart/i.test(head)) return false;
  if (/Sold Out/i.test(head)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────
async function scrapeProduct(site, url) {
  const result = { site, url, price: null, inStock: null, error: null, htmlLength: 0 };

  try {
    const { status, html, ok } = await fetchPage(url, site);
    result.htmlLength = html.length;

    if (!ok) {
      result.error = `Upstream HTTP ${status} (${html.length} bytes)`;
      return result;
    }
    if (html.length < 5000) {
      result.error = `Response too short (${html.length} bytes): ${html.slice(0, 200)}`;
      return result;
    }

    if (site === "flipkart" && /Oops!\s*Something broke/i.test(html)) {
      result.error = `Flipkart bot-block page (${html.length} bytes)`;
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
      // Diagnostic: include indicators of what's actually in the response
      const hasRupee = html.includes("₹");
      const hasBuyNow = /Buy now/i.test(html);
      const hasAddToCart = /Add to cart/i.test(html);
      const hasFinalPrice = html.includes("finalPrice");
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].slice(0, 80) : "no title";
      result.error = `No price extracted (${html.length} bytes, title="${title}", hasRupee=${hasRupee}, hasBuyNow=${hasBuyNow}, hasAddToCart=${hasAddToCart}, hasFinalPrice=${hasFinalPrice})`;
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
  extractFlipkartPrice,
  SCRAPINGBEE_KEY
};
