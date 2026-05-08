// SEED DATA — used by adminSeedCatalog.js
//
// To find URLs:
//   Amazon:   amazon.in → search → click ORGANIC result (skip "Sponsored" tag) → copy URL → keep only /dp/XXXXXXXXXX
//   Flipkart: flipkart.com → search → click result → copy URL → keep only /p/itmXXXXX
//
// Empty URLs are skipped during refresh — won't waste credits.

const SEED_PRODUCTS = [
  {
    id: "iphone-air-256gb",
    displayName: "Apple iPhone Air (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone air", "apple iphone air"],
    amazonUrl: "https://www.amazon.in/dp/B0FQFBDQJ1",
    flipkartUrl: "",
    imageUrl: ""
  },
  {
    id: "iphone-16-128gb-ultramarine",
    displayName: "Apple iPhone 16 (128GB, Ultramarine)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 128", "apple iphone 16"],
    amazonUrl: "",
    flipkartUrl: "https://www.flipkart.com/apple-iphone-16-ultramarine-128-gb/p/itmcc210cae43fba",
    imageUrl: ""
  },
  // ─────────────────────────────────────────────────────────────────
  // Skeleton entries below — add real URLs as you find them.
  // Don't seed them with empty URLs (they'll be skipped) until ready.
  // ─────────────────────────────────────────────────────────────────
  {
    id: "iphone-16-256gb",
    displayName: "Apple iPhone 16 (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 256", "apple iphone 16"],
    amazonUrl: "",
    flipkartUrl: "",
    imageUrl: ""
  },
  {
    id: "iphone-16-pro-256gb",
    displayName: "Apple iPhone 16 Pro (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16 pro", "iphone 16 pro 256"],
    amazonUrl: "",
    flipkartUrl: "",
    imageUrl: ""
  },
  {
    id: "samsung-s24-256gb",
    displayName: "Samsung Galaxy S24 (256GB)",
    brand: "Samsung",
    category: "smartphones",
    searchTerms: ["samsung", "samsung galaxy s24", "samsung s24", "galaxy s24"],
    amazonUrl: "",
    flipkartUrl: "",
    imageUrl: ""
  },
  {
    id: "oneplus-13-256gb",
    displayName: "OnePlus 13 (12GB+256GB)",
    brand: "OnePlus",
    category: "smartphones",
    searchTerms: ["oneplus", "oneplus 13", "1+ 13"],
    amazonUrl: "",
    flipkartUrl: "",
    imageUrl: ""
  }
];

module.exports = { SEED_PRODUCTS };
