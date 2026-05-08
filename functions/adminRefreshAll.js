// Manual trigger: refresh prices for all products right now.
// Use after seeding to populate initial prices.

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { scrapeProduct, SCRAPINGBEE_KEY } = require("./scrapeHelpers");

const ADMIN_TOKEN = "change-me-to-something-random-12345";

exports.adminRefreshAll = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [SCRAPINGBEE_KEY]   // <-- grants secret access
  },
  async (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const db = admin.firestore();
    const now = Date.now();

    const snap = await db.collection("catalog").limit(50).get();
    if (snap.empty) {
      res.status(200).json({ message: "Catalog is empty. Seed it first." });
      return;
    }

    logger.info(`adminRefreshAll: refreshing ${snap.size} products`);

    let amazonOk = 0, amazonFail = 0, flipkartOk = 0, flipkartFail = 0;
    const errors = [];

    for (const doc of snap.docs) {
      const product = doc.data();
      const productId = doc.id;

      if (product.amazonUrl) {
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
      productsRefreshed: snap.size,
      amazonOk, amazonFail,
      flipkartOk, flipkartFail,
      estimatedCreditsUsed: estimatedCredits,
      errors: errors.slice(0, 10)
    });
  }
);
