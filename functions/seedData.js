// SEED DATA — used by adminSeedCatalog.js
// Edit this file to add real Amazon/Flipkart URLs for your products.
//
// To find Amazon URL: search amazon.in, click product, copy URL.
//   The /dp/B0XXXXXXX part is what matters.
// To find Flipkart URL: search flipkart.com, click product, copy URL.
//   The /p/itmXXXXX part is what matters.

const SEED_PRODUCTS = [
  {
    id: "iphone-16-128gb",
    displayName: "Apple iPhone 16 (128GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 128", "apple iphone 16"],
    amazonUrl: "https://www.amazon.in/dp/B0DGHT2H44",
    flipkartUrl: "",
    imageUrl: ""
  },
  {
    id: "iphone-16-256gb",
    displayName: "Apple iPhone 16 (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 256", "apple iphone 16"],
    amazonUrl: "https://www.amazon.in/dp/B0DGHQK3M2",
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
    id: "samsung-s24-ultra-256gb",
    displayName: "Samsung Galaxy S24 Ultra (256GB)",
    brand: "Samsung",
    category: "smartphones",
    searchTerms: ["samsung", "samsung s24 ultra", "galaxy s24 ultra", "s24 ultra"],
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
