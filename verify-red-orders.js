// Verify RED Orders in Binance
const Binance = require('binance-api-node').default;
require('dotenv').config();

const client = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET
});

async function verifyREDOrders() {
    console.log('🔍 VERIFICANDO ÓRDENES RED EN BINANCE...');
    console.log('════════════════════════════════════════');
    console.log('');
    
    try {
        // 1. Check recent spot orders for RED
        console.log('📈 SPOT ORDERS (REDUSDT):');
        const spotOrders = await client.allOrders({ symbol: 'REDUSDT', limit: 10 });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const recentSpot = spotOrders.filter(o => 
            new Date(o.time) >= today && o.status === 'FILLED'
        );
        
        if (recentSpot.length > 0) {
            recentSpot.forEach(order => {
                const time = new Date(order.time).toLocaleTimeString();
                const date = new Date(order.time).toLocaleDateString();
                console.log(`   ✅ ${order.side} ${order.executedQty} RED at ${time} (${date})`);
                console.log(`      Price: $${order.price}, Total: $${(parseFloat(order.executedQty) * parseFloat(order.price)).toFixed(2)}`);
            });
        } else {
            console.log('   ❌ No spot orders found for today');
        }
        
        console.log('');
        
        // 2. Check futures position
        console.log('📉 FUTURES POSITION (REDUSDT):');
        const positions = await client.futuresPositionRisk();
        const redPos = positions.find(p => p.symbol === 'REDUSDT' && parseFloat(p.positionAmt) !== 0);
        
        if (redPos) {
            console.log(`   ✅ Active Position: ${redPos.positionAmt} RED tokens`);
            console.log(`   💰 Entry Price: $${redPos.entryPrice}`);
            console.log(`   📊 Mark Price: $${redPos.markPrice}`);
            console.log(`   💸 Unrealized P&L: $${redPos.unrealizedProfit}`);
            console.log(`   📈 ROE: ${redPos.percentage}%`);
        } else {
            console.log('   ❌ No active futures position found');
        }
        
        console.log('');
        
        // 3. Check recent futures orders
        console.log('📉 RECENT FUTURES ORDERS (REDUSDT):');
        try {
            const futuresOrders = await client.futuresAllOrders({ symbol: 'REDUSDT', limit: 5 });
            const recentFutures = futuresOrders.filter(o => 
                new Date(o.time) >= today && o.status === 'FILLED'
            );
            
            if (recentFutures.length > 0) {
                recentFutures.forEach(order => {
                    const time = new Date(order.time).toLocaleTimeString();
                    const date = new Date(order.time).toLocaleDateString();
                    console.log(`   ✅ ${order.side} ${order.executedQty} RED at ${time} (${date})`);
                    console.log(`      Price: $${order.avgPrice || order.price}, Type: ${order.type}`);
                });
            } else {
                console.log('   ❌ No futures orders found for today');
            }
        } catch (futuresError) {
            console.log('   ⚠️ Could not fetch futures orders:', futuresError.message);
        }
        
        console.log('');
        
        // 4. Check current spot balance
        console.log('🏦 CURRENT SPOT BALANCE:');
        const account = await client.accountInfo();
        const redBalance = account.balances.find(b => b.asset === 'RED');
        
        if (redBalance) {
            const total = parseFloat(redBalance.free) + parseFloat(redBalance.locked);
            if (total > 0) {
                console.log(`   ✅ RED Balance: ${total} tokens (${redBalance.free} free, ${redBalance.locked} locked)`);
            } else {
                console.log('   ❌ No RED balance found');
            }
        } else {
            console.log('   ❌ RED not in balance list');
        }
        
        console.log('');
        console.log('🎯 RESUMEN:');
        console.log('══════════');
        
        if (recentSpot.length > 0 && redPos) {
            console.log('✅ Bot Status: ACTIVE & CONFIRMED');
            console.log('📈 Spot Operation: CONFIRMED');
            console.log('📉 Futures Operation: CONFIRMED'); 
            console.log('💰 Arbitrage Strategy: WORKING');
            console.log('');
            console.log('🔍 En tu terminal Binance deberías ver:');
            console.log('   • Spot Wallet → Transaction History → BUY RED');
            console.log('   • Derivatives → USD-M Futures → Positions → REDUSDT SHORT');
            console.log('   • Derivatives → USD-M Futures → Order History → SELL RED');
        } else {
            console.log('⚠️ Bot Status: PARTIAL/ISSUE DETECTED');
            if (recentSpot.length === 0) console.log('❌ No spot orders found');
            if (!redPos) console.log('❌ No futures position found');
        }
        
    } catch (error) {
        console.error('❌ Error verifying orders:', error.message);
    }
}

verifyREDOrders().catch(console.error);
