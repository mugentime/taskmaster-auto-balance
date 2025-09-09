// Quick Spot Balance Check
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function checkSpotBalance() {
    console.log('🔍 CHECKING EXACT SPOT BALANCE');
    console.log('══════════════════════════════');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        const account = await client.accountInfo();
        const usdtBalance = account.balances.find(b => b.asset === 'USDT');
        
        console.log('💰 SPOT USDT BALANCE:');
        console.log(`   Free: ${parseFloat(usdtBalance?.free || 0).toFixed(4)} USDT`);
        console.log(`   Locked: ${parseFloat(usdtBalance?.locked || 0).toFixed(4)} USDT`);
        console.log(`   Total: ${(parseFloat(usdtBalance?.free || 0) + parseFloat(usdtBalance?.locked || 0)).toFixed(4)} USDT`);
        console.log('');
        
        const available = parseFloat(usdtBalance?.free || 0);
        console.log('📊 AVAILABLE FOR TRADING:');
        console.log(`   Can invest up to: $${available.toFixed(2)}`);
        console.log(`   Recommended max: $${Math.floor(available * 0.95).toFixed(2)} (5% buffer)`);
        
        return available;
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        return 0;
    }
}

checkSpotBalance().catch(console.error);
