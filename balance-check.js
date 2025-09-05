// Quick futures balance checker using backend environment
require('dotenv').config();
const { FuturesMarginService } = require('./services/futuresMarginService');

async function checkBalance() {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
        console.log('❌ ERROR: Binance API credentials not found in environment');
        return;
    }
    
    console.log('🔍 Checking Futures Balance...');
    console.log('API Key:', apiKey.substring(0, 8) + '...' + apiKey.slice(-4));
    console.log('');
    
    try {
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        const account = await marginService.getAccountInfo();
        
        const usdtAsset = account.assets.find(a => a.asset === 'USDT') || {
            asset: 'USDT',
            walletBalance: '0',
            availableBalance: '0',
            marginBalance: '0',
            crossUnPnl: '0'
        };
        
        const openPositions = account.positions?.filter(p => parseFloat(p.positionAmt) !== 0) || [];
        
        console.log('✅ FUTURES ACCOUNT BALANCE');
        console.log('═══════════════════════════');
        console.log(`💰 Wallet Balance:      ${parseFloat(usdtAsset.walletBalance).toFixed(4)} USDT`);
        console.log(`💵 Available Balance:   ${parseFloat(usdtAsset.availableBalance).toFixed(4)} USDT`);
        console.log(`📊 Margin Balance:      ${parseFloat(usdtAsset.marginBalance).toFixed(4)} USDT`);
        console.log(`📈 Unrealized PnL:      ${parseFloat(usdtAsset.crossUnPnl).toFixed(4)} USDT`);
        console.log('');
        console.log(`🏦 Account Status:`);
        console.log(`   ✅ Can Trade:        ${account.canTrade ? 'YES' : 'NO'}`);
        console.log(`   ✅ Can Withdraw:     ${account.canWithdraw ? 'YES' : 'NO'}`);
        console.log(`   📋 Total Assets:     ${account.assets.length}`);
        console.log('');
        
        if (openPositions.length > 0) {
            console.log(`📍 OPEN POSITIONS (${openPositions.length})`);
            console.log('═══════════════════════════');
            openPositions.forEach((pos, index) => {
                const side = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
                const pnlColor = parseFloat(pos.unrealizedProfit) >= 0 ? '💚' : '❤️';
                console.log(`${index + 1}. ${pos.symbol} - ${side}`);
                console.log(`   Amount: ${Math.abs(parseFloat(pos.positionAmt))} | Entry: $${parseFloat(pos.entryPrice)}`);
                console.log(`   ${pnlColor} PnL: ${parseFloat(pos.unrealizedProfit).toFixed(4)} USDT (${parseFloat(pos.percentage).toFixed(2)}%)`);
            });
            console.log('');
        } else {
            console.log('📍 No open positions');
            console.log('');
        }
        
        // Check if balance is sufficient for trading
        const availableBalance = parseFloat(usdtAsset.availableBalance);
        const minTradingBalance = 10; // Minimum recommended USDT for trading
        if (availableBalance >= minTradingBalance) {
            console.log('🟢 TRADING STATUS: Ready for trading');
        } else {
            console.log('🟡 TRADING STATUS: Low balance - consider transferring more USDT to futures');
            console.log(`   Available: ${availableBalance.toFixed(4)} USDT | Recommended minimum: ${minTradingBalance} USDT`);
        }
        
    } catch (error) {
        console.log('❌ ERROR: Failed to check futures balance');
        console.log('Error:', error.message);
        
        if (error.message.includes('API-key format invalid')) {
            console.log('');
            console.log('💡 FIX: Check that your BINANCE_API_KEY is correct');
        } else if (error.message.includes('Signature for this request is not valid')) {
            console.log('');
            console.log('💡 FIX: Check that your BINANCE_API_SECRET is correct');
        } else if (error.message.includes('Invalid API-key')) {
            console.log('');
            console.log('💡 FIX: Your API key may be disabled or expired');
        }
    }
}

checkBalance().catch(console.error);
