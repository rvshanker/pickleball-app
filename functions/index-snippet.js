// Add these three lines at the bottom of your existing functions/index.js,
// right next to the existing tnResults and fetchPrice lines.

exports.refreshPrices = require("./refreshPrices").refreshPrices;
exports.searchCatalog = require("./searchCatalog").searchCatalog;
exports.adminRefreshAll = require("./adminRefreshAll").adminRefreshAll;

// You can keep the existing fetchPrice export too — it's still useful
// if you ever want to fall back to live scraping.
