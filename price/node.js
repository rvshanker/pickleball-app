const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors()); // This allows your frontend to talk to this backend

app.get('/fetch-price', async (req, res) => {
    const targetUrl = req.query.url;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-IN,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send("Error fetching data: " + error.message);
    }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
