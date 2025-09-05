// Simple Frontend Server for Working Version
const express = require('express');
const path = require('path');

const app = express();
const PORT = 8080;

// Serve the simple frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend-simple.html'));
});

// Proxy API requests to backend (simple passthrough)
app.use('/api', (req, res) => {
    const targetUrl = `http://localhost:3001${req.originalUrl}`;
    
    // Simple proxy without middleware
    const options = {
        method: req.method,
        headers: req.headers
    };
    
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            options.body = body;
            makeRequest();
        });
    } else {
        makeRequest();
    }
    
    function makeRequest() {
        const http = require('http');
        const url = require('url');
        const parsedUrl = url.parse(targetUrl);
        
        const proxyReq = http.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 3001,
            path: parsedUrl.path,
            method: options.method,
            headers: options.headers
        }, (proxyRes) => {
            res.status(proxyRes.statusCode);
            proxyRes.pipe(res);
        });
        
        proxyReq.on('error', (err) => {
            res.status(502).json({ error: 'Backend unavailable', details: err.message });
        });
        
        if (options.body) {
            proxyReq.write(options.body);
        }
        proxyReq.end();
    }
});

// Serve static assets
app.use(express.static('../'));

app.listen(PORT, () => {
    console.log(`🌐 Simple Frontend server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔧 Backend API: http://localhost:3001/api/v1/status`);
    
    // Auto-open browser after 2 seconds
    setTimeout(() => {
        const { exec } = require('child_process');
        exec(`start http://localhost:${PORT}`);
    }, 2000);
});
