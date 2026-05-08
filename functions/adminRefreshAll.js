// Manual trigger: refresh prices for products in the catalog.
//
// Two improvements vs v1:
// 1. 3-second pacing between scrape requests — avoids ScrapingBee 429 rate limits
// 2. Optional ?id=productId to refresh ONLY one product, saving credits during testing
//
// Usage:
//   /admin-refresh?token=...                   refresh all products
//   /admin-refresh?token=...&id=iphone-16-128gb   refresh just one (50 credits)

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { scrapeProduct, SCRAPINGBEE_KEY } = require("./scrapeHelpers");

const ADMIN_TOKEN = "change-me-to-something-random-12345";
const REQUEST_DELAY_MS = 3000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

exports.adminRefreshAll = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [SCRAPINGBEE_KEY]
  },
  async (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const db = admin.firestore();
    const now = Date.now();

    const onlyId = req.query.id;
    let docs;

    if (onlyId) {
      const doc = await db.collection("catalog").doc(onlyId).get();
      if (!doc.exists) {
        res.status(404).json({ error: `Product ${onlyId} not found` });
        return;
      }
      docs = [doc];
    } else {
      const snap = await db.collection("catalog").limit(50).get();
      if (snap.empty) {
        res.status(200).json({ message: "Catalog is empty. Seed it first." });
        return;
      }
      docs = snap.docs;
    }

    logger.info(`adminRefreshAll: ${docs.length} products`);

    let amazonOk = 0, amazonFail = 0, flipkartOk = 0, flipkartFail = 0;
    const errors = [];
    let isFirstRequest = true;

    for (const doc of docs) {
      const product = doc.data();
      const productId = doc.id;
      logger.info(`Processing ${productId}`);

      if (product.amazonUrl) {
        if (!isFirstRequest) await sleep(REQUEST_DELAY_MS);
        isFirstRequest = false;

        const r = await scrapeProduct("amazon", product.amazonUrl);
        if (r.price !== null) {
          await db.collection("catalog").doc(productId).collection("prices").doc("amazon")
            .set({ site: "amazon", price: r.price, inStock: r.inStock,
                   url: product.amazonUrl, checkedAt: now });
          amazonOk++;
        } else {
          amazonFail++;
          errors.push(`${productId} amazon: ${r.error}`);
        }
      }

      if (product.flipkartUrl) {
        if (!isFirstRequest) await sleep(REQUEST_DELAY_MS);
        isFirstRequest = false;

        const r = await scrapeProduct("flipkart", product.flipkartUrl);
        if (r.price !== null) {
          await db.collection("catalog").doc(productId).collection("prices").doc("flipkart")
            .set({ site: "flipkart", price: r.price, inStock: r.inStock,
                   url: product.flipkartUrl, checkedAt: now });
          flipkartOk++;
        } else {
          flipkartFail++;
          errors.push(`${productId} flipkart: ${r.error}`);
        }
      }

      await db.collection("catalog").doc(productId).update({ lastRefreshedAt: now });
    }

    const estimatedCredits = (amazonOk + amazonFail + flipkartOk + flipkartFail) * 25;

    res.status(200).json({
      productsRefreshed: docs.length,
      amazonOk, amazonFail,
      flipkartOk, flipkartFail,
      estimatedCreditsUsed: estimatedCredits,
      errors: errors.slice(0, 10)
    });
  }
);
