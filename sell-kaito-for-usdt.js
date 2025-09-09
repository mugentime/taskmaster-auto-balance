// Sell KAITO tokens to get USDT for larger arbitrage trades
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function sellKaitoForUSDT(percentage = 50) {
    console.log(`🔄 SELLING ${percentage}% OF KAITO FOR USDT`);
    console.log('═══════════════════════════════════════');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        // Check current KAITO balance
        const account = await client.accountInfo();
        const kaitoBalance = account.balances.find(b => b.asset === 'KAITO');
        
        if (!kaitoBalance || parseFloat(kaitoBalance.free) < 1) {
            throw new Error('No KAITO tokens found in spot wallet');
        }
        
        const totalKaito = parseFloat(kaitoBalance.free);
        const sellAmount = Math.floor(totalKaito * (percentage / 100));
        
        // Get current KAITO price
        const prices = await client.prices();
        const kaitoPrice = parseFloat(prices['KAITOUSDT']);
        const estimatedUSDT = sellAmount * kaitoPrice;
        
        console.log(`📊 Current KAITO Holdings:`);
        console.log(`   Total KAITO: ${totalKaito.toFixed(6)}`);
        console.log(`   Selling: ${sellAmount.toFixed(6)} KAITO (${percentage}%)`);
        console.log(`   Price: $${kaitoPrice.toFixed(6)}`);
        console.log(`   Expected USDT: ~$${estimatedUSDT.toFixed(4)}`);
        console.log('');
        
        // Execute the sell order
        console.log('📤 Executing SELL order...');
        const sellOrder = await client.order({
            symbol: 'KAITOUSDT',
            side: 'SELL',
            type: 'MARKET',
            quantity: sellAmount.toString()
        });
        
        console.log('✅ KAITO sold successfully!');
        console.log(`   Order ID: ${sellOrder.orderId}`);
        console.log(`   Executed Qty: ${sellOrder.executedQty}`);
        console.log(`   USDT Received: $${parseFloat(sellOrder.cummulativeQuoteQty).toFixed(4)}`);
        console.log('');
        
        // Check new balances
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newAccount = await client.accountInfo();
        const newUSDT = newAccount.balances.find(b => b.asset === 'USDT');
        const newKAITO = newAccount.balances.find(b => b.asset === 'KAITO');
        
        console.log('📊 Updated Balances:');
        console.log(`   USDT: ${parseFloat(newUSDT?.free || 0).toFixed(4)}`);
        console.log(`   KAITO: ${parseFloat(newKAITO?.free || 0).toFixed(6)}`);
        console.log('');
        console.log('🎉 Ready for larger arbitrage trades!');
        
        return {
            success: true,
            soldKaito: sellOrder.executedQty,
            receivedUSDT: parseFloat(sellOrder.cummulativeQuoteQty),
            newUSDTBalance: parseFloat(newUSDT?.free || 0)
        };
        
    } catch (error) {
        console.error('❌ Failed to sell KAITO:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// CLI usage
if (require.main === module) {
    const percentage = parseFloat(process.argv[2]) || 50;
    
    console.log('🔄 KAITO → USDT CONVERTER');
    console.log('Usage: node sell-kaito-for-usdt.js [percentage]');
    console.log('Example: node sell-kaito-for-usdt.js 60');
    console.log('');
    
    sellKaitoForUSDT(percentage)
        .then(result => {
            if (result.success) {
                console.log('✅ KAITO conversion completed successfully');
                process.exit(0);
            } else {
                console.log('❌ KAITO conversion failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Script error:', error.message);
            process.exit(1);
        });
}

module.exports = { sellKaitoForUSDT };
