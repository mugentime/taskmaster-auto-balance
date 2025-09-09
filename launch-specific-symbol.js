// Launch Bot for Specific Symbol - Used by Automation Engine
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function launchSpecificSymbol(symbol, investment = 10, leverage = 3) {
    console.log(`🚀 LAUNCHING SPECIFIC SYMBOL: ${symbol}`);
    console.log(`   Investment: $${investment}, Leverage: ${leverage}x`);
    console.log('');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000 // Subtract 2 seconds to fix timestamp issues
    });
    
    try {
        // Step 1: Get funding rate for this specific symbol
        const fundingData = await client.futuresMarkPrice();
        const symbolData = fundingData.find(f => f.symbol === symbol);
        
        if (!symbolData) {
            throw new Error(`Symbol ${symbol} not found in futures market`);
        }
        
        const fundingRate = parseFloat(symbolData.lastFundingRate);
        console.log(`💰 ${symbol} Funding Rate: ${(fundingRate * 100).toFixed(4)}%`);
        
        // Step 2: Determine strategy
        const strategyType = fundingRate < 0 ? 'Short Perp' : 'Long Perp';
        console.log(`🎯 Strategy: ${strategyType}`);
        console.log('');
        
        // Step 3: Execute the trades
        const baseAsset = symbol.replace('USDT', '');
        
        if (strategyType === 'Short Perp') {
            // Buy spot, short futures
            console.log(`📈 SPOT: Buying ${baseAsset} with $${investment} USDT...`);
            const spotOrder = await client.order({
                symbol: symbol,
                side: 'BUY',
                type: 'MARKET',
                quoteOrderQty: investment.toString()
            });
            
            const baseQty = parseFloat(spotOrder.executedQty);
            console.log(`   ✅ Bought ${baseQty} ${baseAsset}`);
            
            // Set leverage
            console.log(`📉 FUTURES: Setting ${leverage}x leverage for ${symbol}...`);
            await client.futuresLeverage({
                symbol: symbol,
                leverage: leverage
            });
            
            // Check notional value before shorting
            const markPrice = parseFloat(spotOrder.fills?.[0]?.price || spotOrder.price || 1);
            const notionalValue = baseQty * markPrice;
            
            console.log(`📊 Notional Check: $${notionalValue.toFixed(2)} (min: $5.00)`);
            
            // Short futures with proper handling
            if (notionalValue < 5) {
                console.log(`🔧 Using quoteOrderQty due to small notional...`);
                await client.futuresOrder({
                    symbol: symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quoteOrderQty: investment.toString()
                });
            } else {
                // Round quantity to avoid precision errors
                const roundedQty = Math.floor(baseQty).toString();
                console.log(`📉 FUTURES: Shorting ${roundedQty} ${baseAsset}...`);
                
                await client.futuresOrder({
                    symbol: symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: roundedQty
                });
            }
            
            console.log(`   ✅ Shorted ${baseAsset}`);
            
        } else {
            // Long Perp strategy (rare)
            console.log(`📈 FUTURES: Longing ${baseAsset} with ${leverage}x leverage...`);
            
            await client.futuresLeverage({
                symbol: symbol,
                leverage: leverage
            });
            
            // Calculate quantity for Long Perp
            const markPrice = parseFloat(symbolData.markPrice);
            const quantity = ((investment * leverage) / markPrice).toFixed(6);
            
            await client.futuresOrder({
                symbol: symbol,
                side: 'BUY',
                type: 'MARKET',
                quantity: quantity
            });
            
            console.log(`   ✅ Longed ${symbol}`);
        }
        
        console.log('');
        console.log(`🎉 SUCCESS: ${symbol} ${strategyType} bot launched!`);
        console.log(`💰 Expected earnings: ~${Math.abs(fundingRate * 100).toFixed(4)}% every 8h`);
        
        return {
            success: true,
            symbol,
            strategy: strategyType,
            investment,
            leverage,
            fundingRate
        };
        
    } catch (error) {
        console.error(`❌ Failed to launch ${symbol} bot:`, error.message);
        return {
            success: false,
            error: error.message,
            symbol
        };
    }
}

// CLI usage
if (require.main === module) {
    const symbol = process.argv[2];
    const investment = parseFloat(process.argv[3]) || 10;
    const leverage = parseFloat(process.argv[4]) || 3;
    
    if (!symbol) {
        console.log('Usage: node launch-specific-symbol.js <SYMBOL> [INVESTMENT] [LEVERAGE]');
        console.log('Examples:');
        console.log('  node launch-specific-symbol.js BIOUSDT 10 3');
        console.log('  node launch-specific-symbol.js SKLUSDT 15 5');
        process.exit(1);
    }
    
    launchSpecificSymbol(symbol, investment, leverage)
        .then(result => {
            console.log('');
            if (result.success) {
                console.log('✅ Launch completed successfully');
            } else {
                console.log('❌ Launch failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Script error:', error.message);
            process.exit(1);
        });
}

module.exports = { launchSpecificSymbol };
