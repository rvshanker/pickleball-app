// Admin function: populate the catalog with seed products.
// Hit this once via browser to load initial products into Firestore.
// You can run it again later — it merges, doesn't duplicate.

const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { SEED_PRODUCTS } = require("./seedData");

const ADMIN_TOKEN = "change-me-to-something-random-12345";

exports.adminSeedCatalog = onRequest(
  { cors: true, timeoutSeconds: 120, memory: "256MiB" },
  async (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const db = admin.firestore();
    const now = Date.now();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const product of SEED_PRODUCTS) {
      const ref = db.collection("catalog").doc(product.id);
      const existing = await ref.get();

      // Don't seed if URLs are empty placeholders — would just waste credits
      if (!product.amazonUrl && !product.flipkartUrl) {
        skipped++;
        continue;
      }

      const docData = {
        ...product,
        // Set lastRefreshedAt to 0 so the next refresh job picks it up immediately
        lastRefreshedAt: existing.exists ? existing.data().lastRefreshedAt : 0,
        seededAt: existing.exists ? (existing.data().seededAt || now) : now
      };

      await ref.set(docData, { merge: true });
      if (existing.exists) updated++;
      else created++;
    }

    res.status(200).json({
      total: SEED_PRODUCTS.length,
      created,
      updated,
      skipped: skipped + " (no URLs filled in)",
      message: "Now hit /adminRefreshAll to populate prices"
    });
  }
);
