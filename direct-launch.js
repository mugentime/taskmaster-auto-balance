// Direct RED bot launch  
require('dotenv').config();
const axios = require('axios');

async function directLaunch() {
    console.log('🚀 DIRECT RED BOT LAUNCH');
    console.log('═══════════════════════');
    
    const botConfig = {
        id: `red-live-${Date.now()}`,
        name: 'RED Short Perp Bot',
        symbol: 'REDUSDT',
        strategyType: 'Short Perp', // Correct for negative funding rate
        investment: 10,
        leverage: 3,
        autoManaged: false,
        autoConvert: true,
        dryRun: false, // LIVE MODE
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET
    };
    
    console.log('Configuration:');
    console.log(`  Symbol: ${botConfig.symbol}`);
    console.log(`  Strategy: ${botConfig.strategyType}`);
    console.log(`  Investment: $${botConfig.investment}`);
    console.log(`  Leverage: ${botConfig.leverage}x`);
    console.log(`  Auto Convert: ${botConfig.autoConvert}`);
    console.log(`  Live Mode: ${!botConfig.dryRun}`);
    console.log('');
    
    try {
        console.log('📤 Sending launch request...');
        const response = await axios.post('http://localhost:3001/api/v1/launch-bot', botConfig, {
            timeout: 60000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.data.success) {
            console.log('🎉 SUCCESS! Bot launched successfully!');
            console.log('');
            console.log('📊 Check your Binance account now:');
            console.log('   1. FUTURES tab - Look for RED short position');
            console.log('   2. SPOT wallet - Check for RED token purchase');
            console.log('   3. Recent Orders - Verify both orders executed');
            console.log('');
            console.log('💰 Expected funding collection: ~0.25% every 8 hours');
            console.log('🔥 Bot is now LIVE and earning!');
            
        } else {
            console.log('❌ Launch failed:', response.data.message);
            if (response.data.error) {
                console.log('Error details:', response.data.error);
            }
        }
        
    } catch (error) {
        console.log('❌ Request error:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

directLaunch();
