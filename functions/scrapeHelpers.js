// Shared scraping helpers used by refresh functions.
// Reads SCRAPINGBEE_KEY from Firebase Secret Manager at runtime.

const { defineSecret } = require("firebase-functions/params");
const SCRAPINGBEE_KEY = defineSecret("SCRAPINGBEE_KEY");

// Site-specific ScrapingBee options.
// Amazon: cheaper (25 credits) - their HTML is server-rendered with prices visible.
// Flipkart: needs full JS rendering (75 credits) - their pages load prices via JS
//   AND fingerprint plain proxy requests as bots, returning a fake "Oops" page.
function buildScrapingBeeUrl(targetUrl, site) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY.value(),
    url: targetUrl,
    country_code: "in",
    premium_proxy: "true"
  });

  if (site === "flipkart") {
    // Flipkart: render JS, wait for the price element to appear before returning.
    params.set("render_js", "true");
    // Wait until the main price element loads. CSS selector for the
    // primary "Buy now at ₹XXX" button block.
    params.set("wait_for", "div._30jeq3, div.Nx9bqj, div._16Jk6d");
    // 8-second cap so we don't burn credits on stuck pages
    params.set("wait", "5000");
  } else {
    // Amazon: SSR is enough, save credits
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
// Amazon product page extractor
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
// Flipkart product page extractor
// With render_js=true, the page is fully rendered. Price ends up in the DOM,
// not just in JSON state. So we look for both shapes.
// ─────────────────────────────────────────────────────────────────────
function extractFlipkartPrice(html) {
  // First check: did Flipkart serve the bot-block page?
  if (/Oops!\s*Something broke/i.test(html)) {
    return null;
  }

  const head = html.slice(0, 800000);

  // Strategy 1: rendered DOM — class names rotate but the price text is stable.
  // Look for the div that follows "Buy now at" pattern, or the primary price div.
  let m = head.match(/<div[^>]*class="[^"]*(?:_30jeq3|Nx9bqj|_16Jk6d)[^"]*"[^>]*>\s*₹([\d,]+)/);
  if (m) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 2: any price-like span/div with rupee symbol, scoped to the buying block
  m = head.match(/Buy now at[^₹]{0,200}₹\s*([\d,]+)/);
  if (m) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 3: JSON state fallback for sites that do SSR
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
      result.error = `Upstream HTTP ${status}`;
      return result;
    }
    if (html.length < 5000) {
      result.error = `Response too short (${html.length} bytes)`;
      return result;
    }

    // Detect Flipkart bot-block page
    if (site === "flipkart" && /Oops!\s*Something broke/i.test(html)) {
      result.error = "Flipkart served bot-block page (Oops Something broke)";
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
  extractFlipkartPrice,
  SCRAPINGBEE_KEY
};
