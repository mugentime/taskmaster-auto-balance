// Calculate Total Spot Wallet Value Including All Assets
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function getTotalWalletValue() {
    console.log('💰 CALCULATING TOTAL SPOT WALLET VALUE');
    console.log('═══════════════════════════════════════');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        // Get spot balances
        const account = await client.accountInfo();
        
        // Get current prices for all symbols
        const prices = await client.prices();
        
        let totalValue = 0;
        let breakdown = [];
        
        console.log('📊 ASSET BREAKDOWN:');
        console.log('─────────────────────');
        
        for (const balance of account.balances) {
            const asset = balance.asset;
            const total = parseFloat(balance.free) + parseFloat(balance.locked);
            
            if (total > 0) {
                let usdValue = 0;
                
                if (asset === 'USDT') {
                    usdValue = total;
                } else {
                    // Try to find price for ASSET/USDT pair
                    const symbol = asset + 'USDT';
                    const price = prices[symbol];
                    
                    if (price) {
                        usdValue = total * parseFloat(price);
                    }
                }
                
                if (usdValue > 0.01) { // Only show assets worth more than 1 cent
                    console.log(`   ${asset}: ${total.toFixed(6)} = $${usdValue.toFixed(4)}`);
                    breakdown.push({
                        asset,
                        quantity: total,
                        usdValue,
                        free: parseFloat(balance.free),
                        locked: parseFloat(balance.locked)
                    });
                    totalValue += usdValue;
                }
            }
        }
        
        console.log('─────────────────────');
        console.log(`💵 TOTAL SPOT VALUE: $${totalValue.toFixed(2)}`);
        console.log('');
        
        // Calculate available for new trades (excluding existing positions)
        const usdtFree = breakdown.find(b => b.asset === 'USDT')?.free || 0;
        const otherAssetsValue = totalValue - usdtFree;
        
        console.log('📈 TRADING CAPACITY:');
        console.log(`   Free USDT: $${usdtFree.toFixed(2)}`);
        console.log(`   Other Assets Value: $${otherAssetsValue.toFixed(2)}`);
        console.log(`   Total Available: $${totalValue.toFixed(2)}`);
        console.log('');
        
        if (usdtFree > 10) {
            console.log(`✅ Can execute trades up to $${Math.floor(usdtFree * 0.95)}`);
        } else if (totalValue > 20) {
            console.log(`💡 Consider converting some assets to USDT for larger trades`);
            console.log(`   Potential trading capacity: $${Math.floor(totalValue * 0.5)}`);
        }
        
        return {
            totalValue,
            freeUSDT: usdtFree,
            breakdown
        };
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

getTotalWalletValue().catch(console.error);
