// Check Real Available Capital - Both Spot & Futures (FIXED: Includes all asset values)
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false,
    getTime: () => Date.now() - 2000
});

async function checkRealBalance() {
    try {
        console.log('💰 CHECKING REAL AVAILABLE CAPITAL (ALL ASSETS)...\n');
        
        // Get current prices for all symbols
        const prices = await client.prices();
        
        // Get Spot Account
        console.log('🏦 SPOT WALLET:');
        console.log('═══════════════');
        const spotAccount = await client.accountInfo();
        
        let totalSpotValue = 0;
        let totalSpotUSDT = 0;
        
        spotAccount.balances.forEach(balance => {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            if (total > 0) {
                let usdValue = 0;
                
                if (balance.asset === 'USDT') {
                    usdValue = total;
                    totalSpotUSDT = total;
                } else {
                    const symbol = balance.asset + 'USDT';
                    const price = prices[symbol];
                    if (price) {
                        usdValue = total * parseFloat(price);
                    }
                }
                
                if (usdValue > 0.01) { // Only show assets worth more than 1 cent
                    console.log(`   ${balance.asset}: ${total.toFixed(4)} (Free: ${free.toFixed(4)}, Locked: ${locked.toFixed(4)}) = $${usdValue.toFixed(4)}`);
                    totalSpotValue += usdValue;
                }
            }
        });
        
        console.log(`\n💵 Total SPOT Value: $${totalSpotValue.toFixed(2)} (USDT: $${totalSpotUSDT.toFixed(2)})\n`);
        
        // Get Futures Account
        console.log('🚀 FUTURES WALLET:');
        console.log('══════════════════');
        const futuresAccount = await client.futuresAccountInfo();
        
        let totalFuturesUSDT = 0;
        futuresAccount.assets.forEach(asset => {
            const balance = parseFloat(asset.walletBalance);
            if (balance > 0) {
                console.log(`   ${asset.asset}: ${balance.toFixed(4)}`);
                if (asset.asset === 'USDT') {
                    totalFuturesUSDT = balance;
                }
            }
        });
        
        console.log(`\n💵 Total FUTURES USDT: ${totalFuturesUSDT.toFixed(2)}\n`);
        
        // Calculate total available capital (FIXED: Uses spot portfolio value, not just USDT)
        const totalAvailableCapital = totalSpotValue + totalFuturesUSDT;
        
        console.log('📊 TOTAL AVAILABLE CAPITAL:');
        console.log('═══════════════════════════');
        console.log(`💰 Total Portfolio Value: $${totalAvailableCapital.toFixed(2)}`);
        console.log(`🏦 Spot Portfolio: $${totalSpotValue.toFixed(2)}`);
        console.log(`🚀 Futures USDT: $${totalFuturesUSDT.toFixed(2)}`);
        console.log(`💵 Liquid USDT: $${(totalSpotUSDT + totalFuturesUSDT).toFixed(2)}`);
        
        // Show current vs configured
        console.log('\n⚙️  AUTOMATION CONFIGURATION:');
        console.log('═══════════════════════════════');
        console.log(`📝 Configured Capital: $100.00 (hardcoded)`);
        console.log(`💡 Real Available: $${totalAvailableCapital.toFixed(2)}`);
        
        if (Math.abs(totalAvailableCapital - 100) > 5) {
            console.log(`\n🔧 RECOMMENDATION:`);
            if (totalAvailableCapital > 100) {
                console.log(`   ⬆️  Increase config to $${Math.floor(totalAvailableCapital)} to use more capital`);
            } else {
                console.log(`   ⬇️  Decrease config to $${Math.floor(totalAvailableCapital)} to match available funds`);
            }
            console.log(`   📁 Edit automation-engine.js line ~30: totalCapital: ${Math.floor(totalAvailableCapital)}`);
        }
        
        return {
            spotValue: totalSpotValue,
            spotUSDT: totalSpotUSDT,
            futuresUSDT: totalFuturesUSDT,
            totalValue: totalAvailableCapital,
            liquidUSDT: totalSpotUSDT + totalFuturesUSDT,
            configuredCapital: 100
        };
        
    } catch (error) {
        console.error('❌ Error checking balance:', error.message);
        return null;
    }
}

if (require.main === module) {
    checkRealBalance().then(result => {
        if (result) {
            console.log(`\n✅ Balance check completed`);
        }
    });
}

module.exports = { checkRealBalance };
