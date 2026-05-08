// Scheduled function: refresh prices for products in the catalog.
// Runs every 6 hours. Picks products whose lastRefreshedAt is oldest first.
// Limits to 20 products per run to bound ScrapingBee credit usage.
//
// Cost math: 20 products × 2 sites × 25 credits = 1000 credits per run.
// 4 runs per day × 1000 = 4000 credits/day = 120,000/month.
// Fits in ScrapingBee's $49/month plan (150,000 credits).

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { scrapeProduct } = require("./scrapeHelpers");

const PRODUCTS_PER_RUN = 20;
const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

exports.refreshPrices = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Asia/Kolkata",
    memory: "512MiB",
    timeoutSeconds: 540 // 9 minutes — ScrapingBee can be slow
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const staleBefore = now - STALE_AFTER_MS;

    logger.info("refreshPrices: starting", { staleBefore });

    // Find products that need refreshing
    const snap = await db.collection("catalog")
      .where("lastRefreshedAt", "<=", staleBefore)
      .orderBy("lastRefreshedAt", "asc")
      .limit(PRODUCTS_PER_RUN)
      .get();

    if (snap.empty) {
      logger.info("refreshPrices: no stale products to refresh");
      return;
    }

    logger.info(`refreshPrices: refreshing ${snap.size} product(s)`);

    let successCount = 0;
    let errorCount = 0;
    let creditsUsed = 0;

    // Process products serially so we don't slam ScrapingBee in parallel
    // (parallel requests can trigger their own rate limits and cost more)
    for (const doc of snap.docs) {
      const product = doc.data();
      const productId = doc.id;
      logger.info(`Refreshing ${productId}: ${product.displayName}`);

      const updates = [];

      // Amazon
      if (product.amazonUrl) {
        creditsUsed += 25; // premium_proxy = 25 credits
        const result = await scrapeProduct("amazon", product.amazonUrl);
        if (result.price !== null) {
          updates.push(
            db.collection("catalog").doc(productId)
              .collection("prices").doc("amazon")
              .set({
                site: "amazon",
                price: result.price,
                inStock: result.inStock,
                url: product.amazonUrl,
                checkedAt: now
              })
          );
          successCount++;
          logger.info(`  amazon: ₹${result.price} (in stock: ${result.inStock})`);
        } else {
          errorCount++;
          logger.warn(`  amazon failed: ${result.error}`);
          // Mark the existing price as stale, don't delete it
          updates.push(
            db.collection("catalog").doc(productId)
              .collection("prices").doc("amazon")
              .set({
                lastError: result.error,
                lastErrorAt: now
              }, { merge: true })
          );
        }
      }

      // Flipkart
      if (product.flipkartUrl) {
        creditsUsed += 25;
        const result = await scrapeProduct("flipkart", product.flipkartUrl);
        if (result.price !== null) {
          updates.push(
            db.collection("catalog").doc(productId)
              .collection("prices").doc("flipkart")
              .set({
                site: "flipkart",
                price: result.price,
                inStock: result.inStock,
                url: product.flipkartUrl,
                checkedAt: now
              })
          );
          successCount++;
          logger.info(`  flipkart: ₹${result.price} (in stock: ${result.inStock})`);
        } else {
          errorCount++;
          logger.warn(`  flipkart failed: ${result.error}`);
          updates.push(
            db.collection("catalog").doc(productId)
              .collection("prices").doc("flipkart")
              .set({
                lastError: result.error,
                lastErrorAt: now
              }, { merge: true })
          );
        }
      }

      // Mark product as refreshed even if some sites failed
      updates.push(
        db.collection("catalog").doc(productId)
          .update({ lastRefreshedAt: now })
      );

      await Promise.all(updates);
    }

    logger.info("refreshPrices: complete", {
      successCount,
      errorCount,
      estimatedCreditsUsed: creditsUsed
    });
  }
);
