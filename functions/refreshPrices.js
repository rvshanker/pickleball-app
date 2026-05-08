// Scheduled function: refresh prices for products in the catalog.
// Runs every 6 hours, processes up to 20 stale products per run.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { scrapeProduct, SCRAPINGBEE_KEY } = require("./scrapeHelpers");

const PRODUCTS_PER_RUN = 20;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

exports.refreshPrices = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    timeoutSeconds: 540,
    secrets: [SCRAPINGBEE_KEY]   // <-- this is the new line: grants secret access
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const staleBefore = now - STALE_AFTER_MS;

    logger.info("refreshPrices: starting", { staleBefore });

    const snap = await db.collection("catalog")
      .where("lastRefreshedAt", "<=", staleBefore)
      .orderBy("lastRefreshedAt", "asc")
      .limit(PRODUCTS_PER_RUN)
      .get();

    if (snap.empty) {
      logger.info("refreshPrices: no stale products");
      return;
    }

    logger.info(`refreshPrices: refreshing ${snap.size} product(s)`);

    let successCount = 0, errorCount = 0, creditsUsed = 0;

    for (const doc of snap.docs) {
      const product = doc.data();
      const productId = doc.id;
      logger.info(`Refreshing ${productId}: ${product.displayName}`);

      const updates = [];

      if (product.amazonUrl) {
        creditsUsed += 25;
        const result = await scrapeProduct("amazon", product.amazonUrl);
        if (result.price !== null) {
          updates.push(
            db.collection("catalog").doc(productId).collection("prices").doc("amazon")
              .set({ site: "amazon", price: result.price, inStock: result.inStock,
                     url: product.amazonUrl, checkedAt: now })
          );
          successCount++;
          logger.info(`  amazon: ₹${result.price} (in stock: ${result.inStock})`);
        } else {
          errorCount++;
          logger.warn(`  amazon failed: ${result.error}`);
          updates.push(
            db.collection("catalog").doc(productId).collection("prices").doc("amazon")
              .set({ lastError: result.error, lastErrorAt: now }, { merge: true })
          );
        }
      }

      if (product.flipkartUrl) {
        creditsUsed += 25;
        const result = await scrapeProduct("flipkart", product.flipkartUrl);
        if (result.price !== null) {
          updates.push(
            db.collection("catalog").doc(productId).collection("prices").doc("flipkart")
              .set({ site: "flipkart", price: result.price, inStock: result.inStock,
                     url: product.flipkartUrl, checkedAt: now })
          );
          successCount++;
          logger.info(`  flipkart: ₹${result.price} (in stock: ${result.inStock})`);
        } else {
          errorCount++;
          logger.warn(`  flipkart failed: ${result.error}`);
          updates.push(
            db.collection("catalog").doc(productId).collection("prices").doc("flipkart")
              .set({ lastError: result.error, lastErrorAt: now }, { merge: true })
          );
        }
      }

      updates.push(
        db.collection("catalog").doc(productId).update({ lastRefreshedAt: now })
      );

      await Promise.all(updates);
    }

    logger.info("refreshPrices: complete",
      { successCount, errorCount, estimatedCreditsUsed: creditsUsed });
  }
);
