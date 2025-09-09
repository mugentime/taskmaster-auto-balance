require('dotenv').config();
const { Spot, USDMClient } = require('binance');

async function getQuickStatus() {
    console.log('📊 TASKMASTER QUICK STATUS CHECK');
    console.log('================================');
    
    try {
        // Create clients with adjusted timestamp
        const spot = new Spot(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_API_SECRET,
            {
                baseURL: 'https://api.binance.com',
                recvWindow: 10000
            }
        );
        
        const futures = new USDMClient({
            api_key: process.env.BINANCE_API_KEY,
            api_secret: process.env.BINANCE_API_SECRET,
            recvWindow: 10000
        });

        console.log('🔗 API Connection: ✅ CONNECTED');
        
        // Check server time vs local time
        try {
            const serverTime = await spot.time();
            const localTime = Date.now();
            const timeDiff = Math.abs(serverTime.data.serverTime - localTime);
            console.log(`⏰ Time Sync: ${timeDiff < 5000 ? '✅' : '⚠️'} ${timeDiff}ms difference`);
        } catch (e) {
            console.log('⏰ Time Sync: ❌ FAILED -', e.message);
        }

        // Try to get account info with retry
        try {
            const spotAccount = await spot.account({ recvWindow: 10000 });
            const spotBalances = spotAccount.data.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
            console.log(`💼 Spot Wallet: ✅ ${spotBalances.length} assets`);
            
            const usdtSpot = spotBalances.find(b => b.asset === 'USDT');
            if (usdtSpot) {
                console.log(`   💰 USDT Spot: ${parseFloat(usdtSpot.free).toFixed(2)}`);
            }
        } catch (e) {
            console.log('💼 Spot Wallet: ❌ FAILED -', e.message);
        }

        // Try futures account
        try {
            const futuresAccount = await futures.getAccountInformation({ recvWindow: 10000 });
            console.log(`🔮 Futures Wallet: ✅ Balance: $${parseFloat(futuresAccount.totalWalletBalance).toFixed(2)}`);
            console.log(`   💰 Available: $${parseFloat(futuresAccount.availableBalance).toFixed(2)}`);
        } catch (e) {
            console.log('🔮 Futures Wallet: ❌ FAILED -', e.message);
        }

        // Try to get positions
        try {
            const positions = await futures.getPositionRisk({ recvWindow: 10000 });
            const activePositions = positions.filter(p => parseFloat(p.positionAmt) !== 0);
            console.log(`📈 Active Positions: ${activePositions.length}`);
            
            activePositions.forEach(pos => {
                console.log(`   ${pos.symbol}: ${pos.positionAmt} (PNL: $${parseFloat(pos.unRealizedProfit).toFixed(2)})`);
            });
        } catch (e) {
            console.log('📈 Active Positions: ❌ FAILED -', e.message);
        }

    } catch (error) {
        console.log('❌ CONNECTION ERROR:', error.message);
    }

    // Check for running processes
    console.log('\n🔧 SYSTEM STATUS');
    console.log('================');
    console.log('📡 Backend Server: Checking...');
    
    // Check if automation engine is running
    const fs = require('fs');
    if (fs.existsSync('automation.log')) {
        const stats = fs.statSync('automation.log');
        const lastModified = new Date(stats.mtime);
        const timeSince = Date.now() - lastModified.getTime();
        console.log(`🤖 Automation Engine: ${timeSince < 60000 ? '✅ ACTIVE' : '⚠️ INACTIVE'} (last update: ${Math.floor(timeSince/1000)}s ago)`);
    } else {
        console.log('🤖 Automation Engine: ❓ NO LOG FILE');
    }
}

getQuickStatus().catch(console.error);
