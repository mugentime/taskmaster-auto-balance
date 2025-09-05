// Debug margin calculations for RED trade
require('dotenv').config();
const { FuturesMarginService } = require('./services/futuresMarginService');

async function debugMargin() {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    console.log('🔬 DETAILED MARGIN DIAGNOSTIC');
    console.log('═══════════════════════════════');
    console.log('Symbol: REDUSDT');
    console.log('Investment: $10');
    console.log('Strategy: Short Perp');
    console.log('Leverage: 3x');
    console.log('');
    
    try {
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        
        // Get current account info
        console.log('📊 Step 1: Account Balance Check');
        const account = await marginService.getAccountInfo();
        const usdtAsset = account.assets.find(a => a.asset === 'USDT') || {
            walletBalance: '0', availableBalance: '0', marginBalance: '0'
        };
        
        console.log(`Available Balance: ${parseFloat(usdtAsset.availableBalance)} USDT`);
        console.log(`Wallet Balance: ${parseFloat(usdtAsset.walletBalance)} USDT`);
        console.log(`Margin Balance: ${parseFloat(usdtAsset.marginBalance)} USDT`);
        console.log('');
        
        // Get symbol information
        console.log('📊 Step 2: Symbol Information');
        const [filters, markPrice, leverageBracket] = await Promise.all([
            marginService.getSymbolFilters('REDUSDT'),
            marginService.getMarkPrice('REDUSDT'),
            marginService.getLeverageBracket('REDUSDT')
        ]);
        
        console.log(`Mark Price: $${markPrice}`);
        console.log(`Min Quantity: ${filters.minQty}`);
        console.log(`Step Size: ${filters.stepSize}`);
        console.log(`Min Notional: $${filters.minNotional}`);
        console.log(`Max Leverage: ${leverageBracket?.initialLeverage || 'Unknown'}x`);
        console.log('');
        
        // Calculate margin requirements step by step
        console.log('📊 Step 3: Margin Calculation Breakdown');
        
        // For Short Perp strategy: We need futures amount = half of investment
        const futuresInvestment = 10 / 2; // $5 for futures
        console.log(`Futures Investment: $${futuresInvestment}`);
        
        const quantity = futuresInvestment / markPrice;
        console.log(`Raw Quantity: ${quantity} RED`);
        
        const roundedQuantity = Math.floor(quantity / filters.stepSize) * filters.stepSize;
        console.log(`Rounded Quantity: ${roundedQuantity} RED`);
        
        const notionalValue = roundedQuantity * markPrice;
        console.log(`Notional Value: $${notionalValue.toFixed(4)}`);
        
        // Check min notional
        if (notionalValue < filters.minNotional) {
            console.log(`❌ ISSUE: Notional ${notionalValue.toFixed(4)} < Min Required ${filters.minNotional}`);
        } else {
            console.log(`✅ Notional check passed`);
        }
        
        // Calculate margin requirement
        const leverage = 3;
        const marginRequired = notionalValue / leverage;
        console.log(`Required Margin (${leverage}x): $${marginRequired.toFixed(4)}`);
        
        // Add fees
        const takerFee = notionalValue * 0.0004; // 0.04% taker fee
        console.log(`Estimated Fee: $${takerFee.toFixed(4)}`);
        
        const totalRequired = marginRequired + takerFee;
        console.log(`Total Required: $${totalRequired.toFixed(4)}`);
        
        const availableBalance = parseFloat(usdtAsset.availableBalance);
        console.log(`Available Balance: $${availableBalance.toFixed(4)}`);
        
        if (availableBalance >= totalRequired) {
            console.log('✅ MARGIN CHECK: PASS - Sufficient balance');
        } else {
            console.log('❌ MARGIN CHECK: FAIL - Insufficient balance');
            console.log(`Deficit: $${(totalRequired - availableBalance).toFixed(4)}`);
        }
        
        console.log('');
        
        // Test the actual preflight validation
        console.log('📊 Step 4: Testing Preflight Validation');
        const preflightResult = await marginService.preflightValidateFuturesOrder({
            symbol: 'REDUSDT',
            side: 'SELL',
            type: 'MARKET', 
            investment: futuresInvestment,
            leverage: leverage,
            correlationId: 'debug-test'
        });
        
        console.log('Preflight Result:');
        console.log(`Valid: ${preflightResult.valid}`);
        console.log(`Recommended Quantity: ${preflightResult.recommendedQuantity}`);
        
        if (!preflightResult.valid) {
            console.log(`Deficit: ${preflightResult.deficit}`);
            console.log('Full diagnostics:', JSON.stringify(preflightResult, null, 2));
        } else {
            console.log('✅ Preflight validation PASSED');
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

debugMargin().catch(console.error);
