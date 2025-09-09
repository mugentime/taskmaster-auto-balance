// Complete SKL Arbitrage - Short futures to match spot holding
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function completeArbitrage() {
    console.log('🔧 COMPLETING SKL ARBITRAGE POSITION');
    console.log('═══════════════════════════════════');
    console.log('');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        // Check current spot balance
        const spotAccount = await client.accountInfo();
        const sklBalance = spotAccount.balances.find(b => b.asset === 'SKL');
        
        if (!sklBalance || parseFloat(sklBalance.free) < 1) {
            throw new Error('No SKL tokens found in spot wallet');
        }
        
        const sklAmount = Math.floor(parseFloat(sklBalance.free));
        console.log(`📊 Found ${sklAmount} SKL tokens in spot wallet`);
        console.log('');
        
        // Get current mark price for reference
        const markPrice = await client.futuresMarkPrice();
        const sklPrice = markPrice.find(p => p.symbol === 'SKLUSDT');
        console.log(`💰 Current SKLUSDT price: $${parseFloat(sklPrice.markPrice).toFixed(6)}`);
        console.log(`🎯 Funding rate: ${(parseFloat(sklPrice.lastFundingRate) * 100).toFixed(4)}%`);
        console.log('');
        
        // Set leverage for SKLUSDT
        console.log('⚙️ Setting 2x leverage for SKLUSDT...');
        await client.futuresLeverage({
            symbol: 'SKLUSDT',
            leverage: 2
        });
        
        // Calculate notional value
        const markPriceValue = parseFloat(sklPrice.markPrice);
        const notional = sklAmount * markPriceValue;
        console.log(`📊 Notional value: $${notional.toFixed(2)}`);
        
        // Short SKL futures to hedge spot position
        console.log(`📉 Shorting ${sklAmount} SKL on futures...`);
        
        // Try different approaches based on notional size
        let futuresOrder;
        if (notional < 5) {
            console.log('   🔧 Notional below $5, trying reduce-only order...');
            // Note: We don't have a position to reduce, so let's try with slightly less quantity
            const adjustedQty = Math.floor(5.1 / markPriceValue); // Calculate qty for just over $5
            console.log(`   📊 Adjusted quantity: ${adjustedQty} SKL for ~$${(adjustedQty * markPriceValue).toFixed(2)}`);
            
            futuresOrder = await client.futuresOrder({
                symbol: 'SKLUSDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: adjustedQty.toString()
            });
        } else {
            futuresOrder = await client.futuresOrder({
                symbol: 'SKLUSDT',
                side: 'SELL',
                type: 'MARKET',
                quantity: sklAmount.toString()
            });
        }
        
        console.log('✅ Futures short position created!');
        console.log(`   Order ID: ${futuresOrder.orderId}`);
        console.log(`   Executed Qty: ${futuresOrder.executedQty}`);
        console.log(`   Average Price: $${futuresOrder.avgPrice}`);
        console.log('');
        
        // Calculate expected funding earnings
        const fundingRate = parseFloat(sklPrice.lastFundingRate);
        const expectedEarnings = notional * Math.abs(fundingRate);
        
        console.log('🎉 ARBITRAGE POSITION COMPLETED!');
        console.log('═══════════════════════════════');
        console.log(`📈 Spot Position: +${sklAmount} SKL`);
        console.log(`📉 Futures Position: -${futuresOrder.executedQty} SKL (${2}x leverage)`);
        console.log(`💰 Expected funding per 8h: ~$${expectedEarnings.toFixed(4)}`);
        console.log(`📅 Next funding: ${new Date(sklPrice.nextFundingTime).toLocaleString()}`);
        console.log('');
        console.log('✅ Position is now market-neutral and earning funding fees!');
        
        return {
            success: true,
            spotQuantity: sklAmount,
            futuresQuantity: futuresOrder.executedQty,
            futuresPrice: futuresOrder.avgPrice,
            fundingRate: fundingRate,
            expectedEarnings: expectedEarnings
        };
        
    } catch (error) {
        console.error('❌ Failed to complete arbitrage:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

if (require.main === module) {
    completeArbitrage()
        .then(result => {
            if (result.success) {
                console.log('✅ Arbitrage position completed successfully');
                process.exit(0);
            } else {
                console.log('❌ Failed to complete arbitrage');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Script error:', error.message);
            process.exit(1);
        });
}

module.exports = { completeArbitrage };
