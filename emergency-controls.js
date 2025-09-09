// Emergency Controls - Quick position management and system control
require('dotenv').config();
const Binance = require('binance-api-node').default;

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: false,
    getTime: () => Date.now() - 2000
});

async function closeAllPositions() {
    try {
        console.log('🚨 EMERGENCY: Closing all futures positions...');
        const positions = await client.futuresPositionRisk();
        const activePositions = positions.filter(p => Math.abs(parseFloat(p.positionAmt)) > 0);
        
        if (activePositions.length === 0) {
            console.log('✅ No active positions to close');
            return { closed: 0 };
        }
        
        const closedPositions = [];
        for (const pos of activePositions) {
            const amt = parseFloat(pos.positionAmt);
            const side = amt > 0 ? 'SELL' : 'BUY';
            const quantity = Math.abs(amt).toString();
            
            try {
                console.log(`   🔄 Closing ${pos.symbol}: ${side} ${quantity}`);
                const order = await client.futuresOrder({
                    symbol: pos.symbol,
                    side: side,
                    type: 'MARKET',
                    quantity: quantity
                });
                
                closedPositions.push({
                    symbol: pos.symbol,
                    side: side,
                    quantity: quantity,
                    orderId: order.orderId
                });
                
                console.log(`   ✅ Closed ${pos.symbol} (Order: ${order.orderId})`);
            } catch (error) {
                console.error(`   ❌ Failed to close ${pos.symbol}: ${error.message}`);
            }
        }
        
        console.log(`🎉 Emergency closure complete: ${closedPositions.length}/${activePositions.length} positions closed`);
        return { closed: closedPositions.length, details: closedPositions };
        
    } catch (error) {
        console.error('❌ Emergency closure failed:', error.message);
        return { closed: 0, error: error.message };
    }
}

async function showQuickStatus() {
    try {
        const positions = await client.futuresPositionRisk();
        const activePositions = positions.filter(p => Math.abs(parseFloat(p.positionAmt)) > 0);
        
        console.log('⚡ QUICK STATUS:');
        console.log(`   Active Positions: ${activePositions.length}`);
        
        if (activePositions.length > 0) {
            let totalNotional = 0;
            let totalPnL = 0;
            
            activePositions.forEach(pos => {
                const amt = parseFloat(pos.positionAmt);
                const notional = Math.abs(amt) * parseFloat(pos.markPrice);
                const pnl = parseFloat(pos.unrealizedProfit);
                const side = amt > 0 ? 'LONG' : 'SHORT';
                
                totalNotional += notional;
                totalPnL += pnl;
                
                console.log(`   📊 ${pos.symbol}: ${side} ~$${notional.toFixed(0)} (${pnl > 0 ? '+' : ''}${pnl.toFixed(2)} USDT)`);
            });
            
            console.log(`   💰 Total Exposure: $${totalNotional.toFixed(2)}`);
            console.log(`   💸 Total PnL: ${totalPnL > 0 ? '+' : ''}${totalPnL.toFixed(4)} USDT`);
        }
        
        return { positions: activePositions.length };
    } catch (error) {
        console.error('❌ Status check failed:', error.message);
        return { positions: 0, error: error.message };
    }
}

// CLI usage
if (require.main === module) {
    const command = process.argv[2];
    
    switch (command) {
        case 'close-all':
            console.log('⚠️  WARNING: This will close ALL active positions!');
            console.log('⏱️  Starting in 5 seconds... (Ctrl+C to cancel)');
            setTimeout(() => {
                closeAllPositions();
            }, 5000);
            break;
            
        case 'status':
            showQuickStatus();
            break;
            
        default:
            console.log('📋 EMERGENCY CONTROLS');
            console.log('Usage: node emergency-controls.js <command>');
            console.log('');
            console.log('Commands:');
            console.log('  status    - Quick position summary');
            console.log('  close-all - Close all active positions (DANGER!)');
            console.log('');
            console.log('Examples:');
            console.log('  node emergency-controls.js status');
            console.log('  node emergency-controls.js close-all');
            break;
    }
}

module.exports = { closeAllPositions, showQuickStatus };
