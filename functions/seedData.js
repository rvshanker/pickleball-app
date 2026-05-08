// SEED DATA — used by adminSeedCatalog.js
// Updated with 2026-current product identifiers

const SEED_PRODUCTS = [
  {
    id: "iphone-16-128gb",
    displayName: "Apple iPhone 16 (128GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 128", "apple iphone 16"],
    amazonUrl: "https://www.amazon.in/dp/B0DGHP679M",
    flipkartUrl: "https://www.flipkart.com/apple-iphone-16-black-128-gb/p/itmbe1317e00df03",
    imageUrl: "https://m.media-amazon.com/images/I/71657UrS8RL._SL1500_.jpg"
  },
  {
    id: "iphone-16-256gb",
    displayName: "Apple iPhone 16 (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16", "iphone 16 256", "apple iphone 16"],
    amazonUrl: "https://www.amazon.in/dp/B0DGHQK3M2",
    flipkartUrl: "https://www.flipkart.com/apple-iphone-16-ultramarine-256-gb/p/itm533513a968600",
    imageUrl: "https://m.media-amazon.com/images/I/71657UrS8RL._SL1500_.jpg"
  },
  {
    id: "iphone-16-pro-256gb",
    displayName: "Apple iPhone 16 Pro (256GB)",
    brand: "Apple",
    category: "smartphones",
    searchTerms: ["iphone", "iphone 16 pro", "iphone 16 pro 256"],
    amazonUrl: "https://www.amazon.in/dp/B0DGJ9B9N6",
    flipkartUrl: "https://www.flipkart.com/apple-iphone-16-pro-desert-titanium-256-gb/p/itm12d46e293623c",
    imageUrl: "https://m.media-amazon.com/images/I/81LmL9496vL._SL1500_.jpg"
  },
  {
    id: "samsung-s24-256gb",
    displayName: "Samsung Galaxy S24 (256GB)",
    brand: "Samsung",
    category: "smartphones",
    searchTerms: ["samsung", "samsung galaxy s24", "samsung s24", "galaxy s24"],
    amazonUrl: "https://www.amazon.in/dp/B0CS5X68L6",
    flipkartUrl: "https://www.flipkart.com/samsung-galaxy-s24-5g-amber-yellow-256-gb/p/itmd4e476be1be02",
    imageUrl: "https://m.media-amazon.com/images/I/71RQu9Ym+RL._SL1500_.jpg"
  },
  {
    id: "samsung-s24-ultra-256gb",
    displayName: "Samsung Galaxy S24 Ultra (256GB)",
    brand: "Samsung",
    category: "smartphones",
    searchTerms: ["samsung", "samsung s24 ultra", "galaxy s24 ultra", "s24 ultra"],
    amazonUrl: "https://www.amazon.in/dp/B0CS6DYC3T",
    flipkartUrl: "https://www.flipkart.com/samsung-galaxy-s24-ultra-5g-titanium-gray-256-gb/p/itm7e634e7f8e815",
    imageUrl: "https://m.media-amazon.com/images/I/71XN6PRu71L._SL1500_.jpg"
  },
  {
    id: "oneplus-13-256gb",
    displayName: "OnePlus 13 (12GB+256GB)",
    brand: "OnePlus",
    category: "smartphones",
    searchTerms: ["oneplus", "oneplus 13", "1+ 13"],
    amazonUrl: "https://www.amazon.in/dp/B0DQV2S8YF",
    flipkartUrl: "https://www.flipkart.com/oneplus-13-midnight-ocean-256-gb/p/itm123456789", // Note: OnePlus often sells exclusively on Amazon in India
    imageUrl: "https://m.media-amazon.com/images/I/610nIu6+4ML._SL1500_.jpg"
  }
];

module.exports = { SEED_PRODUCTS };
