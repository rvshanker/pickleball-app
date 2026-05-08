// Shared scraping helpers used by refresh functions.
// Reads SCRAPINGBEE_KEY from Firebase Secret Manager at runtime.

const { defineSecret } = require("firebase-functions/params");
const SCRAPINGBEE_KEY = defineSecret("SCRAPINGBEE_KEY");

// Site-specific ScrapingBee options.
// Amazon: cheaper (25 credits) - their HTML is server-rendered with prices visible.
// Flipkart: needs JS rendering (75 credits with premium proxy + render_js).
function buildScrapingBeeUrl(targetUrl, site) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY.value(),
    url: targetUrl,
    country_code: "in",
    premium_proxy: "true"
  });

  if (site === "flipkart") {
    // Render JS and let the page settle for 5 seconds.
    // We deliberately don't use wait_for — Flipkart's class names rotate too often,
    // and a missing wait_for element causes a hard 500 instead of returning HTML.
    params.set("render_js", "true");
    params.set("wait", "5000");
  } else {
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
// Amazon
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
// Flipkart — render_js=true means full DOM is in the HTML response.
// ─────────────────────────────────────────────────────────────────────
function extractFlipkartPrice(html) {
  // First check: bot-block page
  if (/Oops!\s*Something broke/i.test(html)) return null;

  const head = html.slice(0, 800000);

  // Strategy 1: rendered DOM — look for the primary price near "Buy now at"
  let m = head.match(/Buy now at[^₹]{0,200}₹\s*([\d,]+)/);
  if (m) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 2: any standalone ₹XX,XXX in a div near a percentage discount
  // (e.g. "↓10% 69,900 ₹62,900" — the SECOND number after the discount block is the selling price)
  m = head.match(/↓\s*\d+%[^₹]{0,100}[\d,]+[^₹]{0,100}₹\s*([\d,]+)/);
  if (m) {
    const price = parseFloat(m[1].replace(/,/g, ""));
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 3: meta tag (Flipkart sometimes puts canonical price here)
  m = head.match(/<meta[^>]*property="product:price:amount"[^>]*content="([\d.]+)"/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 4: JSON state fallback
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

    if (site === "flipkart" && /Oops!\s*Something broke/i.test(html)) {
      result.error = "Flipkart served bot-block page";
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
