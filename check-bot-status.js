// Quick Bot Status Check - No verbose logs
require('dotenv').config();
const axios = require('axios');
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false
});

async function quickStatusCheck() {
    try {
        // Get funding rate
        const funding = await client.futuresMarkPrice();
        const red = funding.find(f => f.symbol === 'REDUSDT');
        const rate = parseFloat(red.lastFundingRate) * 100;
        
        // Get position
        const positions = await client.futuresPositionRisk();
        const redPos = positions.find(p => p.symbol === 'REDUSDT' && parseFloat(p.positionAmt) !== 0);
        
        // Get spot balance
        const account = await client.accountInfo();
        const redBalance = account.balances.find(b => b.asset === 'RED');
        
        // Calculate earnings
        const nextFunding = new Date(red.nextFundingTime);
        const hoursToNext = (nextFunding - new Date()) / (1000 * 60 * 60);
        
        console.log('🤖 RED BOT STATUS SUMMARY');
        console.log('========================');
        console.log(`💰 Funding: ${rate.toFixed(4)}% (${rate < 0 ? 'EARNING ✅' : 'PAYING ❌'})`);
        console.log(`📈 Position: ${redPos ? parseFloat(redPos.positionAmt) : 0} RED futures`);
        console.log(`🏦 Spot: ${redBalance ? (parseFloat(redBalance.free) + parseFloat(redBalance.locked)).toFixed(4) : 0} RED`);
        console.log(`⏰ Next funding: ${hoursToNext.toFixed(1)}h`);
        
        if (rate < 0 && redPos && parseFloat(redPos.positionAmt) < 0) {
            const notional = Math.abs(parseFloat(redPos.positionAmt)) * parseFloat(red.markPrice);
            const earning8h = notional * Math.abs(rate/100);
            console.log(`💵 Expected next earning: $${earning8h.toFixed(4)}`);
            console.log('✅ Bot Status: ACTIVE & PROFITABLE');
        } else {
            console.log('⚠️  Bot Status: CHECK REQUIRED');
        }
        
    } catch (error) {
        console.error('❌ Error checking status:', error.message);
    }
}

if (require.main === module) {
    quickStatusCheck();
}
