// Convert available assets to USDT for trading capital
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false
});

async function convertAssetsToUSDT(targetUSDTAmount = 15) {
    try {
        console.log(`🎯 Target: Convert assets to get $${targetUSDTAmount} USDT for trading`);
        
        // Check current balances
        const spotAccount = await client.accountInfo();
        const currentUSDT = parseFloat(spotAccount.balances.find(b => b.asset === 'USDT')?.free || '0');
        console.log(`💰 Current USDT: $${currentUSDT.toFixed(2)}`);
        
        if (currentUSDT >= targetUSDTAmount) {
            console.log(`✅ Already have enough USDT for trading!`);
            return;
        }
        
        const neededUSDT = targetUSDTAmount - currentUSDT;
        console.log(`📊 Need to convert: $${neededUSDT.toFixed(2)} worth of assets\n`);
        
        // Get all non-zero balances
        const nonZeroBalances = spotAccount.balances.filter(b => 
            parseFloat(b.free) > 0 && b.asset !== 'USDT'
        );
        
        // Get prices
        const prices = await client.prices();
        
        // Calculate asset values
        const convertibleAssets = [];
        for (const balance of nonZeroBalances) {
            const symbol = balance.asset + 'USDT';
            if (prices[symbol]) {
                const free = parseFloat(balance.free);
                const value = free * parseFloat(prices[symbol]);
                if (value > 0.5) { // Only consider assets worth more than $0.50
                    convertibleAssets.push({
                        asset: balance.asset,
                        amount: free,
                        price: parseFloat(prices[symbol]),
                        value: value,
                        symbol: symbol
                    });
                }
            }
        }
        
        // Sort by value (largest first)
        convertibleAssets.sort((a, b) => b.value - a.value);
        
        console.log('🪙 Available assets to convert:');
        convertibleAssets.forEach(asset => {
            console.log(`   ${asset.asset}: ${asset.amount.toFixed(6)} = $${asset.value.toFixed(2)}`);
        });
        
        // Start converting assets until we have enough USDT
        let convertedValue = 0;
        
        for (const asset of convertibleAssets) {
            if (convertedValue >= neededUSDT) break;
            
            // Calculate how much to sell
            const remainingNeeded = neededUSDT - convertedValue;
            const maxToSell = Math.min(asset.amount, remainingNeeded / asset.price);
            
            if (maxToSell * asset.price < 1) continue; // Skip if less than $1
            
            try {
                console.log(`\n🔄 Converting ${asset.asset} to USDT...`);
                console.log(`   Selling: ${maxToSell.toFixed(6)} ${asset.asset} ≈ $${(maxToSell * asset.price).toFixed(2)}`);
                
                // Get symbol info for precision
                const exchangeInfo = await client.exchangeInfo();
                const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === asset.symbol);
                if (!symbolInfo) {
                    console.log(`❌ Cannot find symbol info for ${asset.symbol}`);
                    continue;
                }
                
                // Find quantity precision
                const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
                const stepSize = parseFloat(lotSizeFilter.stepSize);
                const precision = Math.max(0, -Math.log10(stepSize));
                
                // Round to proper precision
                const quantity = parseFloat((Math.floor(maxToSell / stepSize) * stepSize).toFixed(precision));
                
                if (quantity <= 0) {
                    console.log(`❌ Quantity too small after precision adjustment`);
                    continue;
                }
                
                console.log(`   Adjusted quantity: ${quantity} ${asset.asset}`);
                
                // Place market sell order
                const order = await client.order({
                    symbol: asset.symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: quantity.toString()
                });
                
                console.log(`✅ Sold ${quantity} ${asset.asset} for ${order.cummulativeQuoteQty} USDT`);
                convertedValue += parseFloat(order.cummulativeQuoteQty);
                
            } catch (error) {
                console.log(`❌ Failed to convert ${asset.asset}:`, error.message);
                continue;
            }
        }
        
        // Check final balance
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for settlement
        const finalAccount = await client.accountInfo();
        const finalUSDT = parseFloat(finalAccount.balances.find(b => b.asset === 'USDT')?.free || '0');
        
        console.log(`\n✅ CONVERSION COMPLETE`);
        console.log(`   Previous USDT: $${currentUSDT.toFixed(2)}`);
        console.log(`   Final USDT: $${finalUSDT.toFixed(2)}`);
        console.log(`   Converted: $${(finalUSDT - currentUSDT).toFixed(2)}`);
        
        return finalUSDT;
        
    } catch (error) {
        console.error('❌ Error in asset conversion:', error.message);
        throw error;
    }
}

// If called directly
if (require.main === module) {
    const targetAmount = parseFloat(process.argv[2]) || 15;
    convertAssetsToUSDT(targetAmount)
        .then(finalUSDT => {
            console.log(`\n🎯 Ready for trading with $${finalUSDT.toFixed(2)} USDT`);
            process.exit(0);
        })
        .catch(error => {
            console.error('Failed:', error.message);
            process.exit(1);
        });
}

module.exports = { convertAssetsToUSDT };
