// Silent Task Master - Background Mode
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Binance = require('binance-api-node').default;
const { FuturesMarginService } = require('./services/futuresMarginService');

const app = express();
const PORT = process.env.PORT || 3001;
const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;

// Redirect console.log to null for silent operation
const originalLog = console.log;
console.log = () => {}; // Silent mode

// Only log critical errors
console.error = originalLog;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- In-Memory Database ---
let activeBots = {};

// --- Simple Bot Management ---
app.get('/api/v1/bots', (req, res) => {
    res.json(Object.values(activeBots));
});

app.get('/api/v1/status', (req, res) => {
    res.json({ 
        status: 'running', 
        bots: Object.keys(activeBots).length,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/v1/import-detected-bots', (req, res) => {
    const { detectedBots } = req.body;
    
    if (!detectedBots || !Array.isArray(detectedBots)) {
        return res.status(400).json({ 
            success: false, 
            message: 'detectedBots array is required' 
        });
    }
    
    let importedCount = 0;
    const importedBots = [];
    
    for (const bot of detectedBots) {
        if (!activeBots[bot.id]) {
            const activeBot = {
                id: bot.id,
                name: bot.name,
                symbol: bot.symbol,
                asset: bot.asset,
                strategyType: bot.strategyType || 'Unknown',
                investment: bot.investment,
                leverage: bot.leverage || 1,
                autoManaged: bot.autoManaged || false,
                startTime: bot.startTime || new Date().toISOString(),
                status: bot.status || 'imported',
                fundingRevenue: 0,
                imported: true,
                originalDetection: bot,
                lastUpdate: new Date().toISOString()
            };
            
            activeBots[bot.id] = activeBot;
            importedBots.push(activeBot);
            importedCount++;
        }
    }
    
    res.json({
        success: true,
        message: `Successfully imported ${importedCount} bots`,
        imported: importedBots,
        totalActive: Object.keys(activeBots).length
    });
});

// Basic funding rate endpoint (simplified)
app.get('/api/v1/funding-rates', async (req, res) => {
    try {
        const client = Binance({ apiKey: BINANCE_API_KEY, apiSecret: BINANCE_API_SECRET });
        const funding = await client.futuresMarkPrice();
        const redData = funding.find(f => f.symbol === 'REDUSDT');
        
        res.json({
            REDUSDT: {
                rate: redData ? parseFloat(redData.lastFundingRate) : 0,
                nextFunding: redData ? new Date(redData.nextFundingTime).toISOString() : null
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch funding rates' });
    }
});

// Get best opportunity endpoint (completely dynamic)
app.get('/api/v1/get-best-opportunity', async (req, res) => {
    try {
        const client = Binance({ apiKey: BINANCE_API_KEY, apiSecret: BINANCE_API_SECRET });
        
        // Get funding rates for all pairs
        const fundingData = await client.futuresMarkPrice();
        
        // Get spot market symbols to filter viable pairs
        const spotPrices = await client.prices();
        const spotSymbols = new Set(Object.keys(spotPrices));
        
        // Get 24hr volume data for liquidity
        const tickerData = await client.futuresDailyStats();
        const tickerMap = {};
        tickerData.forEach(ticker => {
            tickerMap[ticker.symbol] = {
                volume: parseFloat(ticker.volume),
                quoteVolume: parseFloat(ticker.quoteVolume),
                priceChange: parseFloat(ticker.priceChangePercent),
                lastPrice: parseFloat(ticker.lastPrice)
            };
        });
        
        // Filter and score opportunities
        const opportunities = fundingData
            .filter(item => {
                // Only USDT pairs
                if (!item.symbol.endsWith('USDT')) return false;
                
                // Must exist in both spot and futures markets
                if (!spotSymbols.has(item.symbol)) return false;
                
                // Must have significant funding rate
                const fundingRate = Math.abs(parseFloat(item.lastFundingRate || 0));
                if (fundingRate < 0.0001) return false; // 0.01% minimum
                
                return true;
            })
            .map(item => {
                const ticker = tickerMap[item.symbol] || {};
                const fundingRate = parseFloat(item.lastFundingRate || 0);
                const markPrice = parseFloat(item.markPrice || 0);
                
                return {
                    symbol: item.symbol,
                    fundingRate: fundingRate,
                    fundingRatePercent: (fundingRate * 100).toFixed(4),
                    annualizedRate: (Math.abs(fundingRate) * 365 * 3 * 100).toFixed(2),
                    markPrice: markPrice,
                    nextFundingTime: item.nextFundingTime,
                    // Liquidity metrics
                    volume24h: ticker.volume || 0,
                    quoteVolume24h: ticker.quoteVolume || 0,
                    liquidity: ticker.quoteVolume || 100000,
                    // Volatility
                    priceChange24h: ticker.priceChangePercent || 0,
                    // Scoring
                    liquidityScore: Math.min((ticker.quoteVolume || 100000) / 1000000, 10),
                    riskScore: Math.abs(ticker.priceChangePercent || 0) / 10,
                    // Calculate opportunity score
                    opportunityScore: (Math.abs(fundingRate) * 1000) * 
                                    Math.min((ticker.quoteVolume || 100000) / 1000000, 10) / 
                                    (1 + Math.abs(ticker.priceChangePercent || 0) / 10)
                };
            })
            .sort((a, b) => b.opportunityScore - a.opportunityScore);
        
        if (opportunities.length > 0) {
            res.json({
                success: true,
                opportunity: opportunities[0],
                totalOpportunities: opportunities.length,
                alternatives: opportunities.slice(1, 5) // Top 5 alternatives
            });
        } else {
            res.json({
                success: false,
                message: 'No viable arbitrage opportunities found'
            });
        }
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to analyze opportunities',
            message: error.message 
        });
    }
});

// Start server silently
app.listen(PORT, () => {
    console.error(`🤖 Task Master running silently on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
    console.error('👋 Task Master shutting down...');
    process.exit(0);
});
