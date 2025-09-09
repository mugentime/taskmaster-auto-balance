// Transfer USDT from Futures to Spot Wallet
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function transferFundsForTrading(amount = 3) {
    console.log('💸 TRANSFERRING FUNDS FOR TRADING');
    console.log('═══════════════════════════════');
    console.log(`Transferring ${amount} USDT from Futures → Spot wallet`);
    console.log('');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        // Check current balances first
        console.log('🔍 Checking current balances...');
        
        const futuresAccount = await client.futuresAccountInfo();
        const spotAccount = await client.accountInfo();
        
        const futuresUSDT = futuresAccount.assets.find(a => a.asset === 'USDT');
        const spotUSDT = spotAccount.balances.find(b => b.asset === 'USDT');
        
        console.log(`📊 Current balances:`);
        console.log(`   Futures USDT: ${futuresUSDT ? parseFloat(futuresUSDT.availableBalance).toFixed(4) : '0.0000'}`);
        console.log(`   Spot USDT: ${spotUSDT ? parseFloat(spotUSDT.free).toFixed(4) : '0.0000'}`);
        console.log('');
        
        // Check if we have enough in futures
        const availableFutures = futuresUSDT ? parseFloat(futuresUSDT.availableBalance) : 0;
        if (availableFutures < amount) {
            throw new Error(`Insufficient futures balance. Have: ${availableFutures}, need: ${amount}`);
        }
        
        // Execute transfer: Futures → Spot using universalTransfer
        console.log('🔄 Executing transfer...');
        const transferResult = await client.universalTransfer({
            type: 'UMFUTURE_MAIN', // Futures to Spot
            asset: 'USDT',
            amount: amount.toString()
        });
        
        console.log('✅ Transfer completed successfully!');
        console.log(`   Transfer ID: ${transferResult.tranId}`);
        console.log('');
        
        // Wait a moment and check new balances
        console.log('⏳ Waiting 3 seconds for balance update...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const newSpotAccount = await client.accountInfo();
        const newSpotUSDT = newSpotAccount.balances.find(b => b.asset === 'USDT');
        
        console.log('📊 New balances:');
        console.log(`   Spot USDT: ${newSpotUSDT ? parseFloat(newSpotUSDT.free).toFixed(4) : '0.0000'}`);
        console.log('');
        console.log('🎉 Ready for trading!');
        
        return {
            success: true,
            transferId: transferResult.tranId,
            amount,
            newSpotBalance: newSpotUSDT ? parseFloat(newSpotUSDT.free) : 0
        };
        
    } catch (error) {
        console.error('❌ Transfer failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// CLI usage
if (require.main === module) {
    const amount = parseFloat(process.argv[2]) || 3;
    
    console.log('💸 FUTURES → SPOT TRANSFER TOOL');
    console.log('Usage: node transfer-funds.js [amount]');
    console.log('Example: node transfer-funds.js 3');
    console.log('');
    
    transferFundsForTrading(amount)
        .then(result => {
            if (result.success) {
                console.log('✅ Transfer completed successfully');
                process.exit(0);
            } else {
                console.log('❌ Transfer failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Script error:', error.message);
            process.exit(1);
        });
}

module.exports = { transferFundsForTrading };
