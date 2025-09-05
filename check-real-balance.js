// Check Real Available Capital - Both Spot & Futures
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false
});

async function checkRealBalance() {
    try {
        console.log('💰 CHECKING REAL AVAILABLE CAPITAL...\n');
        
        // Get Spot Account
        console.log('🏦 SPOT WALLET:');
        console.log('═══════════════');
        const spotAccount = await client.accountInfo();
        let totalSpotUSDT = 0;
        
        spotAccount.balances.forEach(balance => {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            if (total > 0 && (balance.asset === 'USDT' || total > 1)) {
                console.log(`   ${balance.asset}: ${total.toFixed(4)} (Free: ${free.toFixed(4)}, Locked: ${locked.toFixed(4)})`);
                
                if (balance.asset === 'USDT') {
                    totalSpotUSDT = total;
                }
            }
        });
        
        console.log(`\n💵 Total SPOT USDT: ${totalSpotUSDT.toFixed(2)}\n`);
        
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
        
        // Calculate total available capital
        const totalAvailableUSDT = totalSpotUSDT + totalFuturesUSDT;
        
        console.log('📊 TOTAL AVAILABLE CAPITAL:');
        console.log('═══════════════════════════');
        console.log(`💰 Combined USDT: $${totalAvailableUSDT.toFixed(2)}`);
        console.log(`🏦 Spot USDT: $${totalSpotUSDT.toFixed(2)}`);
        console.log(`🚀 Futures USDT: $${totalFuturesUSDT.toFixed(2)}`);
        
        // Show current vs configured
        console.log('\n⚙️  AUTOMATION CONFIGURATION:');
        console.log('═══════════════════════════════');
        console.log(`📝 Configured Capital: $100.00 (hardcoded)`);
        console.log(`💡 Real Available: $${totalAvailableUSDT.toFixed(2)}`);
        
        if (totalAvailableUSDT !== 100) {
            console.log(`\n🔧 RECOMMENDATION:`);
            if (totalAvailableUSDT > 100) {
                console.log(`   ⬆️  Increase config to $${Math.floor(totalAvailableUSDT)} to use more capital`);
            } else {
                console.log(`   ⬇️  Decrease config to $${Math.floor(totalAvailableUSDT)} to match available funds`);
            }
            console.log(`   📁 Edit automation-engine.js line ~30: totalCapital: ${Math.floor(totalAvailableUSDT)}`);
        }
        
        return {
            spotUSDT: totalSpotUSDT,
            futuresUSDT: totalFuturesUSDT,
            totalUSDT: totalAvailableUSDT,
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
