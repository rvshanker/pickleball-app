// Shared scraping helpers used by refresh functions.

const { defineSecret } = require("firebase-functions/params");
const SCRAPINGBEE_KEY = defineSecret("SCRAPINGBEE_KEY");

function buildScrapingBeeUrl(targetUrl, site) {
  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY.value(),
    url: targetUrl,
    country_code: "in"
  });

  if (site === "flipkart") {
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
// Flipkart: target the JSON-LD block, which is canonical product data
// ─────────────────────────────────────────────────────────────────────
function extractFlipkartPrice(html) {
  if (/Oops!\s*Something broke/i.test(html)) return null;

  // JSON-LD structured data — Flipkart embeds this for SEO/Google rich snippets.
  // It's the most reliable canonical source. Format:
  //   <script type="application/ld+json">{"@type":"Product",...,"offers":{"price":62900,...}}</script>
  // There may be MULTIPLE ld+json blocks (breadcrumbs, page-level, product). We want the Product one.
  const ldJsonBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of ldJsonBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      // Could be a single object or an array
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item["@type"] === "Product" && item.offers) {
          // offers can be an object or array
          const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
          for (const offer of offers) {
            const price = parseFloat(offer.price);
            if (price >= 1000 && price <= 500000) return price;
          }
        }
      }
    } catch (e) {
      // Skip malformed JSON-LD blocks
    }
  }

  // Fallback: meta tag
  let m = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([\d.]+)"/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  // Fallback: og:price:amount
  m = html.match(/<meta[^>]*property="og:price:amount"[^>]*content="([\d.]+)"/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  // Fallback: JSON state (works on some Flipkart layouts)
  const head = html.slice(0, 800000);
  m = head.match(/"finalPrice"\s*:\s*\{[^{}]*?"value"\s*:\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    if (price >= 1000 && price <= 500000) return price;
  }

  return null;
}

function extractFlipkartStock(html) {
  if (/Oops!\s*Something broke/i.test(html)) return null;

  // Try JSON-LD first — it has authoritative availability
  const ldJsonBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of ldJsonBlocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item["@type"] === "Product" && item.offers) {
          const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
          for (const offer of offers) {
            if (offer.availability) {
              return /InStock/i.test(offer.availability);
            }
          }
        }
      }
    } catch (e) {}
  }

  const head = html.slice(0, 800000);
  if (/Buy now at/i.test(head)) return true;
  if (/Add to cart/i.test(head)) return true;
  if (/Notify Me/i.test(head) && !/Buy now|Add to cart/i.test(head)) return false;
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
      // Diagnostic
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].slice(0, 80) : "no title";
      const ldJsonCount = (html.match(/type="application\/ld\+json"/g) || []).length;
      const hasProductLd = /"@type"\s*:\s*"Product"/i.test(html);
      const hasOffers = /"offers"\s*:/.test(html);
      const ldPriceMatch = html.match(/"price"\s*:\s*"?(\d+)/);
      const ldPriceFound = ldPriceMatch ? ldPriceMatch[1] : "none";

      result.error = `No price (${html.length}b, title="${title}", ldJsonBlocks=${ldJsonCount}, ProductLd=${hasProductLd}, hasOffers=${hasOffers}, firstLdPrice=${ldPriceFound})`;
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
