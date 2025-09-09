// Universal Bot Status Checker - Detects ALL active bots automatically
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false,
    getTime: () => Date.now() - 2000
});

async function checkAllActiveBots() {
    try {
        console.log('🔍 SCANNING FOR ALL ACTIVE BOTS...\n');
        
        // Get all positions with non-zero amounts
        const positions = await client.futuresPositionRisk();
        const activePositions = positions.filter(p => parseFloat(p.positionAmt) !== 0);
        
        // Get all spot balances > 0
        const account = await client.accountInfo();
        const activeSpotBalances = account.balances.filter(b => 
            parseFloat(b.free) + parseFloat(b.locked) > 0 && 
            b.asset !== 'USDT' && 
            b.asset !== 'BNB'
        );
        
        // Get funding rates for all symbols
        const fundingData = await client.futuresMarkPrice();
        const fundingMap = {};
        fundingData.forEach(f => {
            fundingMap[f.symbol] = {
                rate: parseFloat(f.lastFundingRate),
                nextTime: new Date(f.nextFundingTime),
                markPrice: parseFloat(f.markPrice)
            };
        });
        
        console.log('📊 ACTIVE BOTS DETECTED:');
        console.log('═══════════════════════════\n');
        
        let totalBots = 0;
        const detectedBots = [];
        
        // Check each active futures position
        for (const position of activePositions) {
            const symbol = position.symbol;
            const positionAmt = parseFloat(position.positionAmt);
            const baseAsset = symbol.replace('USDT', '');
            
            // Find corresponding spot balance
            const spotBalance = activeSpotBalances.find(b => b.asset === baseAsset);
            const spotAmount = spotBalance ? parseFloat(spotBalance.free) + parseFloat(spotBalance.locked) : 0;
            
            // Get funding info
            const funding = fundingMap[symbol];
            
            if (!funding) continue;
            
            // Determine if this looks like a funding rate arbitrage bot
            const isShortPerp = positionAmt < 0 && spotAmount > 0; // Short futures + long spot
            const isLongPerp = positionAmt > 0 && spotAmount < 0;  // Long futures + short spot (rare)
            
            if (isShortPerp || isLongPerp) {
                totalBots++;
                const strategy = isShortPerp ? 'Short Perp' : 'Long Perp';
                const fundingRate = funding.rate * 100;
                const hoursToNext = (funding.nextTime - new Date()) / (1000 * 60 * 60);
                
                // Calculate expected earnings
                const notional = Math.abs(positionAmt) * funding.markPrice;
                const expectedEarning = notional * Math.abs(funding.rate);
                
                // Determine profitability
                const isProfitable = (isShortPerp && funding.rate < 0) || (isLongPerp && funding.rate > 0);
                const status = isProfitable ? 'EARNING ✅' : 'PAYING ❌';
                
                console.log(`🤖 BOT ${totalBots}: ${baseAsset} ${strategy}`);
                console.log('─'.repeat(35));
                console.log(`💰 Funding Rate: ${fundingRate.toFixed(4)}% (${status})`);
                console.log(`📈 Futures Position: ${positionAmt} ${baseAsset}`);
                console.log(`🏦 Spot Balance: ${spotAmount.toFixed(4)} ${baseAsset}`);
                console.log(`💵 Notional Value: $${notional.toFixed(2)}`);
                console.log(`⏰ Next Funding: ${hoursToNext.toFixed(1)}h`);
                console.log(`💸 Expected Earning: $${expectedEarning.toFixed(4)}`);
                console.log(`📊 P&L: ${parseFloat(position.unrealizedProfit).toFixed(4)} USDT`);
                console.log('');
                
                detectedBots.push({
                    symbol,
                    baseAsset,
                    strategy,
                    fundingRate,
                    futuresPosition: positionAmt,
                    spotBalance: spotAmount,
                    notionalValue: notional,
                    expectedEarning,
                    unrealizedPnL: parseFloat(position.unrealizedProfit),
                    isProfitable,
                    hoursToNext
                });
            }
        }
        
        // Summary
        console.log('📋 SUMMARY:');
        console.log('═══════════');
        console.log(`🤖 Total Active Bots: ${totalBots}`);
        
        if (totalBots > 0) {
            const totalPnL = detectedBots.reduce((sum, bot) => sum + bot.unrealizedPnL, 0);
            const totalNotional = detectedBots.reduce((sum, bot) => sum + bot.notionalValue, 0);
            const totalExpectedEarnings = detectedBots.reduce((sum, bot) => sum + bot.expectedEarning, 0);
            const profitableBots = detectedBots.filter(bot => bot.isProfitable).length;
            
            console.log(`💰 Total P&L: ${totalPnL.toFixed(4)} USDT`);
            console.log(`💵 Total Notional: $${totalNotional.toFixed(2)}`);
            console.log(`💸 Next Round Earnings: $${totalExpectedEarnings.toFixed(4)}`);
            console.log(`✅ Profitable Bots: ${profitableBots}/${totalBots}`);
            
            // Show portfolio health
            const healthScore = (profitableBots / totalBots) * 100;
            console.log(`🏥 Portfolio Health: ${healthScore.toFixed(1)}%`);
            
            if (healthScore >= 80) {
                console.log('🟢 Status: EXCELLENT');
            } else if (healthScore >= 60) {
                console.log('🟡 Status: GOOD');
            } else if (healthScore >= 40) {
                console.log('🟠 Status: NEEDS ATTENTION');
            } else {
                console.log('🔴 Status: POOR - IMMEDIATE ACTION NEEDED');
            }
        } else {
            console.log('⚠️ No funding arbitrage bots detected');
            console.log('💡 Consider launching bots with: node launch-best-opportunity.js');
        }
        
        return detectedBots;
        
    } catch (error) {
        console.error('❌ Error scanning for bots:', error.message);
        return [];
    }
}

// Export for use by automation system
module.exports = { checkAllActiveBots };

// CLI usage
if (require.main === module) {
    checkAllActiveBots().then(() => {
        console.log('\n✅ Scan completed');
    }).catch(error => {
        console.error('❌ Scan failed:', error.message);
        process.exit(1);
    });
}
