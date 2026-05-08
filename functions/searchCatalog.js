// HTTP function: search the catalog by query string.
// Returns matching products with current prices from all sites.
//
// This is what the user-facing frontend calls. It only reads from Firestore —
// no scraping happens here, so responses are instant.

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

const ALLOWED_ORIGINS = new Set([
  "https://pickleconnect.live",
  "https://www.pickleconnect.live",
  "https://pickleball-app-1bba7.web.app",
  "https://pickleball-app-1bba7.firebaseapp.com"
]);

exports.searchCatalog = onRequest(
  { cors: true, timeoutSeconds: 10, memory: "256MiB" },
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

    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (!q || q.length < 2) {
      res.status(400).json({ error: "Query too short" });
      return;
    }

    logger.info("searchCatalog", { query: q });

    const db = admin.firestore();

    // Simple substring matching against searchTerms array.
    // Firestore doesn't support true full-text search natively, but for a
    // small catalog (a few hundred products) this is fine.
    // For larger catalogs, you'd integrate Algolia or Typesense.
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    const firstToken = tokens[0];

    // array-contains-any can match up to 30 values. We use it on the first
    // token to narrow down, then filter the rest in memory.
    const candidatesSnap = await db.collection("catalog")
      .where("searchTerms", "array-contains", firstToken)
      .limit(30)
      .get();

    if (candidatesSnap.empty) {
      // Fallback: try matching the displayName loosely (case-insensitive prefix).
      // Not as efficient but covers terms not pre-tokenized.
      const allSnap = await db.collection("catalog").limit(100).get();
      const matched = allSnap.docs.filter(d => {
        const name = (d.data().displayName || "").toLowerCase();
        return tokens.every(t => name.includes(t));
      });

      if (matched.length === 0) {
        res.status(200).json({ query: q, results: [] });
        return;
      }

      const results = await hydrateWithPrices(db, matched);
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      res.status(200).json({ query: q, results });
      return;
    }

    // Filter candidates by remaining tokens
    let matched = candidatesSnap.docs;
    if (tokens.length > 1) {
      matched = matched.filter(d => {
        const data = d.data();
        const haystack = [
          (data.displayName || "").toLowerCase(),
          ...(data.searchTerms || [])
        ].join(" ");
        return tokens.every(t => haystack.includes(t));
      });
    }

    const results = await hydrateWithPrices(db, matched);

    // Cache 5 minutes — catalog changes infrequently, prices update on schedule
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ query: q, results });
  }
);

async function hydrateWithPrices(db, productDocs) {
  // For each matched product, fetch its prices subcollection
  const hydrated = await Promise.all(productDocs.map(async (doc) => {
    const product = doc.data();
    const pricesSnap = await db.collection("catalog").doc(doc.id)
      .collection("prices").get();

    const prices = {};
    pricesSnap.forEach(p => {
      const data = p.data();
      if (data.price !== undefined) {
        prices[data.site] = {
          price: data.price,
          inStock: data.inStock,
          url: data.url,
          checkedAt: data.checkedAt
        };
      }
    });

    return {
      id: doc.id,
      displayName: product.displayName,
      brand: product.brand,
      imageUrl: product.imageUrl || null,
      prices,
      lastRefreshedAt: product.lastRefreshedAt
    };
  }));

  // Sort by lowest current price (products with no price float to bottom)
  hydrated.sort((a, b) => {
    const aMin = Math.min(...Object.values(a.prices).map(p => p.price), Infinity);
    const bMin = Math.min(...Object.values(b.prices).map(p => p.price), Infinity);
    return aMin - bMin;
  });

  return hydrated;
}
