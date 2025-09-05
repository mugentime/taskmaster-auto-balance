// Launch RED bot with correct strategy and fixed margin validation
require('dotenv').config();
const axios = require('axios');

async function launchREDBot() {
    console.log('🚀 LAUNCHING RED BOT WITH ALL FIXES');
    console.log('═══════════════════════════════════');
    console.log('Symbol: REDUSDT');
    console.log('Strategy: Short Perp (optimal for negative funding rate)');
    console.log('Investment: $10 USDT');
    console.log('Leverage: 3x');
    console.log('Auto Convert: Enabled');
    console.log('');
    
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
        console.log('❌ ERROR: API credentials not found');
        return;
    }
    
    console.log('🔑 API Key:', apiKey.substring(0, 8) + '...' + apiKey.slice(-4));
    console.log('');
    
    try {
        // First, check current funding rate to confirm optimal strategy
        console.log('📊 Step 1: Checking current funding rate...');
        const fundingResponse = await axios.get('http://localhost:3001/api/v1/funding-rates/REDUSDT');
        
        if (fundingResponse.data.success) {
            const fundingRate = fundingResponse.data.data.fundingRate;
            const optimalStrategy = fundingRate < 0 ? 'Short Perp' : 'Long Perp';
            
            console.log(`✅ Current REDUSDT funding rate: ${(fundingRate * 100).toFixed(4)}%`);
            console.log(`✅ Optimal strategy: ${optimalStrategy}`);
            console.log(`✅ Expected return: ~${Math.abs(fundingRate * 100).toFixed(4)}% every 8 hours`);
            console.log(`✅ Annualized return: ~${Math.abs(fundingRate * 365 * 3 * 100).toFixed(2)}% APY`);
            console.log('');
        }
        
        // Prepare bot configuration
        const botConfig = {
            id: `red-live-bot-${Date.now()}`,
            name: 'RED Short Perp Bot (Live)',
            symbol: 'REDUSDT',
            strategyType: 'Short Perp', // Correct strategy for negative funding rate
            investment: 10,
            leverage: 3,
            autoManaged: false,
            autoConvert: true, // Enable auto asset conversion
            dryRun: false, // LIVE TRADING
            apiKey: apiKey,
            apiSecret: apiSecret
        };
        
        console.log('📤 Step 2: Launching bot...');
        console.log('⚠️  LIVE TRADING MODE - Real money will be used!');
        console.log('');
        
        const response = await axios.post('http://localhost:3001/api/v1/launch-bot', botConfig, {
            timeout: 60000 // 60 second timeout
        });
        
        if (response.data.success) {
            console.log('🎉 SUCCESS: Bot launched successfully!');
            console.log('');
            console.log('📋 Bot Details:');
            console.log(`   Bot ID: ${botConfig.id}`);
            console.log(`   Name: ${botConfig.name}`);
            console.log(`   Symbol: ${botConfig.symbol}`);
            console.log(`   Strategy: ${botConfig.strategyType}`);
            console.log(`   Investment: $${botConfig.investment} USDT`);
            console.log(`   Leverage: ${botConfig.leverage}x`);
            console.log('');
            console.log('📊 What should happen in your Binance account:');
            console.log('   📈 SPOT: BUY ~7-8 RED tokens');
            console.log('   📉 FUTURES: SELL ~8 RED tokens (3x leverage)');
            console.log('   💰 Funding payments collected every 8 hours');
            console.log('');
            console.log('✅ Check your Binance Futures terminal now!');
            console.log('   - Look for new RED position in Futures');
            console.log('   - Check Recent Orders for SPOT RED purchase');
            console.log('   - Verify FUTURES RED sell order');
            console.log('');
            
            if (response.data.dryRun) {
                console.log('🧪 This was a DRY RUN - no real orders placed');
            } else {
                console.log('🔥 LIVE ORDERS PLACED - Check your positions!');
            }
            
        } else {
            console.log('❌ Bot launch failed:');
            console.log('   Error:', response.data.message);
            
            if (response.data.marginDiagnostics) {
                console.log('');
                console.log('📊 Margin Diagnostics:');
                console.log(JSON.stringify(response.data.marginDiagnostics, null, 2));
            }
        }
        
    } catch (error) {
        console.log('❌ Request failed:');
        
        if (error.response) {
            console.log('   Status:', error.response.status);
            console.log('   Error:', error.response.data.message || 'Unknown error');
            
            if (error.response.data.marginDiagnostics) {
                console.log('');
                console.log('📊 Detailed Diagnostics:');
                console.log(JSON.stringify(error.response.data.marginDiagnostics, null, 2));
            }
        } else {
            console.log('   Error:', error.message);
        }
    }
}

console.log('⚠️  READY TO LAUNCH LIVE RED BOT');
console.log('This will place real orders with real money!');
console.log('');

// Countdown for safety
let countdown = 3;
const timer = setInterval(() => {
    if (countdown > 0) {
        console.log(`🚀 Launching in ${countdown}...`);
        countdown--;
    } else {
        clearInterval(timer);
        console.log('🔥 LAUNCHING NOW!');
        console.log('');
        launchREDBot().catch(console.error);
    }
}, 1000);
