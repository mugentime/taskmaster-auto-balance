// Test script to create a minimal bot and test position notifications
require('dotenv').config({ path: '../.env' });
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function testPositionNotifications() {
    console.log('🧪 TESTING POSITION NOTIFICATIONS WITH REAL BOT');
    console.log('═══════════════════════════════════════════════════════');
    
    try {
        // Test if server is running
        console.log('1. Testing server connectivity...');
        const testResponse = await axios.get(`${BASE_URL}/api/v1/test`);
        console.log('✅ Server is running:', testResponse.data);
        
        // Create a very small bot for testing
        console.log('\n2. Creating test bot...');
        const botConfig = {
            id: `test-notifications-${Date.now()}`,
            name: `Test Notifications Bot - ${new Date().toLocaleTimeString()}`,
            symbol: 'BTCUSDT',
            strategyType: 'Short Perp', // Short perp for better testing
            investment: 15, // Very small amount for testing
            leverage: 2, // Conservative leverage
            autoManaged: false, // Manual management
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET
        };
        
        console.log('Bot config:', {
            ...botConfig,
            apiKey: botConfig.apiKey ? `${botConfig.apiKey.substring(0, 8)}...` : 'MISSING',
            apiSecret: botConfig.apiSecret ? `${botConfig.apiSecret.substring(0, 8)}...` : 'MISSING'
        });
        
        const launchResponse = await axios.post(`${BASE_URL}/api/v1/launch-bot`, botConfig);
        
        if (launchResponse.data.success) {
            console.log('✅ Bot created successfully!');
            console.log('Bot ID:', launchResponse.data.bot.id);
            console.log('🔔 Check Telegram for position opened notification!');
            
            // Wait a bit for user to see the notification
            console.log('\n⏰ Waiting 10 seconds before stopping bot...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Stop the bot to test close notification
            console.log('3. Stopping bot to test close notification...');
            const stopResponse = await axios.post(`${BASE_URL}/api/v1/stop-bot`, {
                botId: launchResponse.data.bot.id,
                apiKey: botConfig.apiKey,
                apiSecret: botConfig.apiSecret
            });
            
            if (stopResponse.data.success) {
                console.log('✅ Bot stopped successfully!');
                console.log('🔔 Check Telegram for position closed notification!');
            } else {
                console.log('❌ Failed to stop bot:', stopResponse.data.message);
            }
            
        } else {
            console.log('❌ Bot creation failed:', launchResponse.data.message);
            console.log('Error details:', launchResponse.data);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response?.data) {
            console.error('Server response:', error.response.data);
        }
    }
    
    console.log('\n✅ TEST COMPLETED');
    console.log('Check your Telegram for both open and close notifications!');
}

testPositionNotifications();
