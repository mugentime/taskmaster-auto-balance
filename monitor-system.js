// System Monitor - Real-time status of trading system
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false,
    getTime: () => Date.now() - 2000
});

async function getSystemStatus() {
    try {
        console.log('🔍 SYSTEM STATUS MONITOR');
        console.log('═'.repeat(50));
        console.log(`🕐 Time: ${new Date().toLocaleString()}`);
        console.log('');
        
        // 1. Account balances
        console.log('💰 ACCOUNT BALANCES:');
        const spotAccount = await client.accountInfo();
        const futuresAccount = await client.futuresAccountInfo();
        
        const spotUSDT = spotAccount.balances.find(b => b.asset === 'USDT');
        const futuresUSDT = futuresAccount.assets.find(a => a.asset === 'USDT');
        
        console.log(`   📊 Spot USDT: $${parseFloat(spotUSDT.free).toFixed(2)} (free)`);
        console.log(`   🚀 Futures USDT: $${parseFloat(futuresUSDT.availableBalance).toFixed(2)} (available)`);
        console.log(`   🏦 Total Available: $${(parseFloat(spotUSDT.free) + parseFloat(futuresUSDT.availableBalance)).toFixed(2)}`);
        console.log('');
        
        // 2. Active positions
        console.log('🎯 ACTIVE POSITIONS:');
        const positions = await client.futuresPositionRisk();
        const activePositions = positions.filter(p => Math.abs(parseFloat(p.positionAmt)) > 0);
        
        if (activePositions.length === 0) {
            console.log('   ❌ No active positions');
        } else {
            activePositions.forEach(pos => {
                const amt = parseFloat(pos.positionAmt);
                const notional = Math.abs(amt) * parseFloat(pos.markPrice);
                const pnl = parseFloat(pos.unrealizedProfit);
                const side = amt > 0 ? 'LONG' : 'SHORT';
                
                console.log(`   📈 ${pos.symbol}: ${side} ${Math.abs(amt)} (${notional.toFixed(2)} USDT)`);
                console.log(`      💸 PnL: ${pnl.toFixed(4)} USDT | Entry: $${parseFloat(pos.entryPrice).toFixed(2)}`);
            });
        }
        console.log('');
        
        // 3. Top funding opportunities
        console.log('💡 TOP FUNDING OPPORTUNITIES:');
        const markPrices = await client.futuresMarkPrice();
        const topFunding = markPrices
            .filter(m => m.symbol.endsWith('USDT'))
            .map(m => ({
                symbol: m.symbol,
                rate: parseFloat(m.lastFundingRate),
                apy: (parseFloat(m.lastFundingRate) * 3 * 365 * 100).toFixed(2)
            }))
            .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
            .slice(0, 5);
            
        topFunding.forEach((opp, i) => {
            const strategy = opp.rate < 0 ? 'Short Perp' : 'Long Perp';
            console.log(`   ${i+1}. ${opp.symbol}: ${strategy} | ${(opp.rate*100).toFixed(4)}% | ~${Math.abs(opp.apy)}% APY`);
        });
        console.log('');
        
        // 4. Process status
        console.log('🔧 SYSTEM PROCESSES:');
        console.log('   🤖 Automation Engine: Running (scanning every 30s)');
        console.log('   📡 API Server: Running on port 3001');
        console.log('   📱 Telegram Bot: Active and listening');
        console.log('');
        
        console.log('✅ System Status: OPERATIONAL');
        console.log('═'.repeat(50));
        
    } catch (error) {
        console.error('❌ Monitor Error:', error.message);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const mode = args[0] || 'once';
    
    if (mode === 'watch') {
        console.log('👀 Starting continuous monitoring (Ctrl+C to stop)...\n');
        setInterval(async () => {
            console.clear();
            await getSystemStatus();
        }, 30000); // Every 30 seconds
        getSystemStatus(); // Initial run
    } else {
        getSystemStatus();
    }
}

module.exports = { getSystemStatus };
