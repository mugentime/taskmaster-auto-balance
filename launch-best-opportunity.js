// Launch Bot with Best Available Opportunity (Generic)
require('dotenv').config();
const axios = require('axios');
const Binance = require('binance-api-node').default;

async function executeBotDirectly(client, botConfig) {
    try {
        console.log(`🚀 Executing ${botConfig.strategyType} strategy for ${botConfig.symbol}...`);
        
        const baseAsset = botConfig.symbol.replace('USDT', '');
        const investment = botConfig.investment;
        
        if (botConfig.strategyType === 'Short Perp') {
            // Step 1: Buy spot asset with USDT
            console.log(`   📈 SPOT: Buying ${baseAsset} with $${investment} USDT...`);
            const spotOrder = await client.order({
                symbol: botConfig.symbol,
                side: 'BUY',
                type: 'MARKET',
                quoteOrderQty: investment.toString()
            });
            
            const baseQty = parseFloat(spotOrder.executedQty);
            console.log(`   ✅ SPOT: Bought ${baseQty} ${baseAsset}`);
            
            // Step 2: Short futures with leverage
            console.log(`   📉 FUTURES: Shorting ${baseQty} ${baseAsset} with ${botConfig.leverage}x leverage...`);
            
            // Set leverage
            await client.futuresLeverage({
                symbol: botConfig.symbol,
                leverage: botConfig.leverage
            });
            
            // Calculate notional value to check minimum
            const markPrice = parseFloat(spotOrder.fills?.[0]?.price || spotOrder.price || 1);
            const notionalValue = baseQty * markPrice;
            
            console.log(`   📊 Notional Check: $${notionalValue.toFixed(2)} (min: $5.00)`);
            
            // Short futures with proper notional handling
            if (notionalValue < 5) {
                console.log(`   🔧 Using quoteOrderQty due to small notional...`);
                const futuresOrder = await client.futuresOrder({
                    symbol: botConfig.symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quoteOrderQty: investment.toString() // Use USDT amount
                });
            } else {
                // Round quantity to avoid precision errors
                const roundedQty = Math.floor(baseQty).toString();
                console.log(`   🔧 Rounded quantity: ${roundedQty} ${baseAsset}`);
                
                const futuresOrder = await client.futuresOrder({
                    symbol: botConfig.symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: roundedQty
                });
            }
            
            console.log(`   ✅ FUTURES: Shorted ${baseAsset}`);
            console.log(`   🎯 Bot successfully launched!`);
            
            return true;
            
        } else if (botConfig.strategyType === 'Long Perp') {
            // Long Perp strategy (rare, when funding is positive)
            console.log(`   📈 FUTURES: Longing ${baseAsset} with ${botConfig.leverage}x leverage...`);
            
            await client.futuresLeverage({
                symbol: botConfig.symbol,
                leverage: botConfig.leverage
            });
            
            const futuresOrder = await client.futuresOrder({
                symbol: botConfig.symbol,
                side: 'BUY',
                type: 'MARKET',
                quoteOrderQty: (investment * botConfig.leverage).toString()
            });
            
            console.log(`   ✅ FUTURES: Longed ${botConfig.symbol}`);
            console.log(`   🎯 Bot successfully launched!`);
            
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error(`❌ Direct execution failed: ${error.message}`);
        return false;
    }
}

async function getBestOpportunity() {
    try {
        console.log('🔍 Analyzing market for best arbitrage opportunities...');
        
        const client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
        
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
            
        return opportunities;
        
    } catch (error) {
        console.error('❌ Error analyzing opportunities:', error.message);
        return [];
    }
}

async function launchBestOpportunity(investment = 10, leverage = 3) {
    console.log('🚀 LAUNCHING BOT WITH BEST OPPORTUNITY');
    console.log('════════════════════════════════════');
    console.log(`Investment: $${investment} USDT`);
    console.log(`Leverage: ${leverage}x`);
    console.log(`Auto Convert: Enabled`);
    console.log('');
    
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
        console.log('❌ ERROR: API credentials not found');
        return;
    }
    
    try {
        // Step 1: Find best opportunity
        const opportunities = await getBestOpportunity();
        
        if (opportunities.length === 0) {
            console.log('❌ No viable arbitrage opportunities found');
            return;
        }
        
        const bestOpportunity = opportunities[0];
        console.log('📊 BEST OPPORTUNITY IDENTIFIED:');
        console.log(`   Symbol: ${bestOpportunity.symbol}`);
        console.log(`   Funding Rate: ${bestOpportunity.fundingRatePercent}%`);
        console.log(`   Annualized Return: ~${bestOpportunity.annualizedRate}% APY`);
        console.log(`   Liquidity (24h): $${(bestOpportunity.quoteVolume24h / 1000000).toFixed(2)}M`);
        console.log(`   Opportunity Score: ${bestOpportunity.opportunityScore.toFixed(2)}`);
        console.log('');
        
        // Step 2: Determine optimal strategy
        const fundingRate = bestOpportunity.fundingRate;
        const optimalStrategy = fundingRate < 0 ? 'Short Perp' : 'Long Perp';
        const strategyExplanation = fundingRate < 0 
            ? 'Negative funding → Short Perp (earn from longs paying shorts)'
            : 'Positive funding → Long Perp (earn from shorts paying longs)';
            
        console.log('🎯 STRATEGY SELECTION:');
        console.log(`   Strategy: ${optimalStrategy}`);
        console.log(`   Logic: ${strategyExplanation}`);
        console.log(`   Expected Return: ~${Math.abs(fundingRate * 100).toFixed(4)}% every 8 hours`);
        console.log('');
        
        // Step 3: Show alternative opportunities
        if (opportunities.length > 1) {
            console.log('📋 TOP 3 ALTERNATIVES:');
            opportunities.slice(1, 4).forEach((opp, index) => {
                console.log(`   ${index + 2}. ${opp.symbol}: ${opp.fundingRatePercent}% (Score: ${opp.opportunityScore.toFixed(2)})`);
            });
            console.log('');
        }
        
        // Step 4: Prepare bot configuration
        const botConfig = {
            id: `${bestOpportunity.symbol.toLowerCase()}-${Date.now()}`,
            name: `${bestOpportunity.symbol} ${optimalStrategy} Bot`,
            symbol: bestOpportunity.symbol,
            strategyType: optimalStrategy,
            investment: investment,
            leverage: leverage,
            autoManaged: true,
            autoConvert: true,
            dryRun: false, // LIVE TRADING
            apiKey: apiKey,
            apiSecret: apiSecret
        };
        
        console.log('📤 LAUNCHING BOT...');
        console.log('⚠️  LIVE TRADING MODE - Real money will be used!');
        console.log('');
        
        console.log('🔄 Using direct Binance API execution (more reliable)...');
        
        // Execute bot directly using Binance API instead of server endpoint
        const client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
        
        // Launch the bot directly
        const success = await executeBotDirectly(client, botConfig);
        
        if (success) {
            console.log('🎉 SUCCESS: Bot launched successfully!');
            console.log('');
            console.log('📋 Bot Details:');
            console.log(`   Bot ID: ${botConfig.id}`);
            console.log(`   Name: ${botConfig.name}`);
            console.log(`   Symbol: ${botConfig.symbol}`);
            console.log(`   Strategy: ${botConfig.strategyType}`);
            console.log(`   Investment: $${botConfig.investment} USDT`);
            console.log(`   Leverage: ${botConfig.leverage}x`);
            console.log('');
            console.log('📊 Expected Binance Activity:');
            if (optimalStrategy === 'Short Perp') {
                console.log(`   📈 SPOT: BUY ${bestOpportunity.symbol.replace('USDT', '')} tokens`);
                console.log(`   📉 FUTURES: SELL ${bestOpportunity.symbol} (${leverage}x leverage)`);
            } else {
                console.log(`   📉 SPOT: SELL ${bestOpportunity.symbol.replace('USDT', '')} tokens`);
                console.log(`   📈 FUTURES: BUY ${bestOpportunity.symbol} (${leverage}x leverage)`);
            }
            console.log(`   💰 Funding collected every 8 hours from ${bestOpportunity.symbol}`);
            console.log('');
            console.log('✅ Check your Binance account now!');
            
        } else {
            console.log('❌ Bot launch failed:');
            console.log('   Error:', response.data.message);
            
            if (response.data.marginDiagnostics) {
                console.log('');
                console.log('📊 Margin Diagnostics:');
                console.log(JSON.stringify(response.data.marginDiagnostics, null, 2));
            }
        }
        
    } catch (error) {
        console.log('❌ Launch failed:');
        
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Error:', error.response.data.message || 'Unknown error');
            
            if (error.response.data.marginDiagnostics) {
                console.log('');
                console.log('📊 Detailed Diagnostics:');
                console.log(JSON.stringify(error.response.data.marginDiagnostics, null, 2));
            }
        } else {
            console.log('   Error:', error.message);
        }
    }
}

// Parse command line arguments
const investment = parseFloat(process.argv[2]) || 10;
const leverage = parseInt(process.argv[3]) || 3;

console.log('🤖 SMART BOT LAUNCHER');
console.log('Automatically selects the best arbitrage opportunity');
console.log('');
console.log(`Usage: node launch-best-opportunity.js [investment] [leverage]`);
console.log(`Example: node launch-best-opportunity.js 50 5`);
console.log('');

// Safety countdown
let countdown = 5;
const timer = setInterval(() => {
    if (countdown > 0) {
        console.log(`🚀 Analyzing market and launching in ${countdown}...`);
        countdown--;
    } else {
        clearInterval(timer);
        console.log('🔥 ANALYZING & LAUNCHING NOW!');
        console.log('');
        launchBestOpportunity(investment, leverage).catch(console.error);
    }
}, 1000);
