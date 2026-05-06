const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// 1. Enable CORS for your domain
app.use(cors({
    origin: 'https://pickleconnect.live' 
}));

// 2. Stealth Header Generator
const getStealthHeaders = (url) => {
    const isAmazon = url.includes('amazon.in');
    
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9,hi-IN;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        // Amazon specific referer helps bypass basic blocks
        'Referer': isAmazon ? 'https://www.amazon.in/' : 'https://www.google.com/',
    };
};

// 3. The Proxy Endpoint
app.get('/fetch-price', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send("No URL provided");
    }

    console.log(`[Proxy] Fetching: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            headers: getStealthHeaders(targetUrl),
            timeout: 10000, // 10 second timeout
            validateStatus: false // Allow us to see 404/503 responses for debugging
        });

        // If Amazon/Flipkart serves a "Robot Check" page, it usually has a 200/503 status
        if (response.data.includes("api-services-support@amazon.com") || response.data.includes("captcha")) {
            console.warn("⚠️ Bot detection triggered on server.");
        }

        // Send the HTML back to your frontend
        res.setHeader('Content-Type', 'text/html');
        res.send(response.data);

    } catch (error) {
        console.error("❌ Proxy Error:", error.message);
        res.status(500).send("Failed to reach e-commerce site.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Price Comparison Proxy running on port ${PORT}`);
});
