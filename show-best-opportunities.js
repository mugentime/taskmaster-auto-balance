// Show Best Opportunities - Analysis Only, No Launch
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function showBestOpportunities() {
    try {
        console.log('🔍 ANALYZING BEST ARBITRAGE OPPORTUNITIES...\n');
        
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
        
        console.log('📊 TOP 10 BEST OPPORTUNITIES:');
        console.log('═══════════════════════════════════');
        
        opportunities.slice(0, 10).forEach((opp, index) => {
            const strategy = opp.fundingRate < 0 ? 'Short Perp' : 'Long Perp';
            const profitability = opp.fundingRate < 0 ? 'EARNING ✅' : 'PAYING ❌';
            
            console.log(`\n${index + 1}. ${opp.symbol} (${strategy})`);
            console.log(`   💰 Funding Rate: ${opp.fundingRatePercent}% (${profitability})`);
            console.log(`   📈 APY: ${opp.annualizedRate}%`);
            console.log(`   💧 Liquidity: $${(opp.quoteVolume24h / 1000000).toFixed(2)}M`);
            console.log(`   📊 Score: ${opp.opportunityScore.toFixed(2)}`);
            console.log(`   🎯 Risk: ${opp.riskScore.toFixed(2)} | Volatility: ${opp.priceChange24h}%`);
        });
        
        console.log('\n🏆 CURRENT WINNER:');
        console.log('═══════════════════');
        const winner = opportunities[0];
        console.log(`Symbol: ${winner.symbol}`);
        console.log(`Funding Rate: ${winner.fundingRatePercent}%`);
        console.log(`Strategy: ${winner.fundingRate < 0 ? 'Short Perp' : 'Long Perp'}`);
        console.log(`Score: ${winner.opportunityScore.toFixed(2)}`);
        
        return opportunities;
        
    } catch (error) {
        console.error('❌ Error analyzing opportunities:', error.message);
        return [];
    }
}

if (require.main === module) {
    showBestOpportunities().then(() => {
        console.log('\n✅ Analysis completed');
    });
}

module.exports = { showBestOpportunities };
