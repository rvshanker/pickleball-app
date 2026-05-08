// Shared scraping helpers used by refresh functions.
// Reads SCRAPINGBEE_KEY from Firebase Secret Manager at runtime.

const { defineSecret } = require("firebase-functions/params");
const SCRAPINGBEE_KEY = defineSecret("SCRAPINGBEE_KEY");

function buildScrapingBeeUrl(targetUrl) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY.value(),
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
  // Scope to the corePriceDisplay block so we don't catch unrelated prices
  // (related products, "Compare with similar items", etc.)
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
  // Only check the buying-options block, not the whole page (related items can mention "out of stock")
  const block = html.match(/(buybox|availability|outOfStock)[\s\S]{0,1500}/i);
  const haystack = block ? block[0] : html;

  if (/Currently unavailable/i.test(haystack)) return false;
  if (/We don't know when or if this item will be back in stock/i.test(haystack)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// Flipkart product page extractor
// ─────────────────────────────────────────────────────────────────────
//
// Flipkart embeds canonical product data in a JSON blob inside the HTML.
// The structure has several stable keys we can target:
//   - "finalPrice": { "value": <number> }     <- the displayed selling price
//   - "totalPrice": { "value": <number> }     <- often same as finalPrice
//   - "mrp":        { "value": <number> }     <- MRP (struck-through price)
//
// We need the SELECTED variant's price specifically. Flipkart embeds prices
// for ALL variants on the page (different storage tiers, colors), and the
// selected variant is typically the FIRST occurrence in the JSON.
//
// To avoid grabbing accessory/EMI/related-product prices, we constrain the
// search to a window early in the HTML where the main product data lives.
//
function extractFlipkartPrice(html) {
  // Look only in the first 500KB of HTML — main product data is at the top.
  // Beyond that we hit recommendations, accessories, related items.
  const head = html.slice(0, 500000);

  // Strategy 1: finalPrice with value (most reliable)
  let m = head.match(/"finalPrice"\s*:\s*\{[^{}]*?"value"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    // Sanity: phones aren't ₹100, accessories aren't ₹500k. Reject obvious junk.
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 2: totalPrice with value
  m = head.match(/"totalPrice"\s*:\s*\{[^{}]*?"value"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  // Strategy 3: pricingData fields (newer Flipkart shape)
  m = head.match(/"pricingData"\s*:\s*\{[^{}]*?"value"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  return null;
}

function extractFlipkartStock(html) {
  // Flipkart shows "Out of Stock" / "Sold Out" / "Coming Soon" for unavailable items.
  // BUT these strings can also appear in other variants on the same page.
  //
  // The reliable signal: presence of "Buy now" / "Add to cart" / "Go to cart" buttons
  // for the selected variant means it's in stock.
  const head = html.slice(0, 500000);

  // Look for affirmative in-stock signals
  if (/"BUY_NOW"/i.test(head)) return true;
  if (/"ADD_TO_CART"/i.test(head)) return true;
  if (/"GO_TO_CART"/i.test(head)) return true;
  if (/Buy with EMI/i.test(head)) return true;  // appears next to price when buyable

  // Negative signal — only trust this if there's no positive signal AND
  // the global state is clearly out of stock
  if (/"NOTIFY_ME"/i.test(head) && !/"BUY_NOW"|"ADD_TO_CART"/i.test(head)) return false;
  if (/"OUT_OF_STOCK"\s*:\s*true/i.test(head)) return false;

  // Default: assume in stock if we found a price (price extractors will catch the no-price case)
  return true;
}

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
      result.error = `Response too short (${html.length} bytes)`;
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
