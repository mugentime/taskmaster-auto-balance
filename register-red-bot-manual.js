// Manually Register RED Bot in Task Master
require('dotenv').config();
const axios = require('axios');

const TASK_MASTER_URL = 'http://localhost:3001';

console.log('📝 MANUALLY REGISTERING RED BOT');
console.log('══════════════════════════════════');

async function registerRedBotManually() {
    try {
        // Create the RED bot definition based on our launch
        const redBotData = {
            id: 'red-live-' + Date.now(),
            name: 'RED Short Perp Bot',
            symbol: 'REDUSDT',
            asset: 'RED',
            strategyType: 'Short Perp',
            investment: 10,
            leverage: 3,
            status: 'active',
            startTime: new Date().toISOString(),
            autoManaged: true,
            lastActivity: new Date().toISOString(),
            detectedAt: new Date().toISOString(),
            // Data from our successful launch
            spotBalance: 7.3,     // Bought 7.3 RED tokens
            futuresPosition: -8,  // Sold 8 RED tokens short
            expectedFunding: 0.25, // 0.25% every 8 hours
            spots: [{
                orderId: '236895437',
                type: 'BUY',
                quantity: 7.3,
                symbol: 'REDUSDT'
            }],
            futures: [{
                orderId: '768984834', 
                type: 'SELL',
                quantity: 8,
                symbol: 'REDUSDT'
            }]
        };

        console.log('[1] Creating RED bot registration...');
        console.log(`    Name: ${redBotData.name}`);
        console.log(`    Symbol: ${redBotData.symbol}`);
        console.log(`    Strategy: ${redBotData.strategyType}`);
        console.log(`    Investment: $${redBotData.investment}`);

        // Register the bot using the import endpoint
        const importResult = await axios.post(`${TASK_MASTER_URL}/api/v1/import-detected-bots`, {
            detectedBots: [redBotData]
        });

        console.log(`[✓] Registration successful: ${importResult.data.message}`);
        
        // Verify the bot is now being managed
        const activeBots = await axios.get(`${TASK_MASTER_URL}/api/v1/bots`);
        console.log(`[✓] Active bots in Task Master: ${activeBots.data.length}`);
        
        const managedRedBot = activeBots.data.find(bot => 
            bot.symbol.includes('RED') || bot.name.includes('RED')
        );
        
        if (managedRedBot) {
            console.log('[✓] RED bot is now being supervised by Task Master');
            console.log(`    Bot ID: ${managedRedBot.id}`);
            console.log(`    Status: ${managedRedBot.status}`);
            console.log(`    Strategy: ${managedRedBot.strategyType}`);
            console.log(`    Investment: $${managedRedBot.investment}`);
            return managedRedBot;
        } else {
            console.log('[!] RED bot imported but not found in active bots list');
            console.log('All bots:', activeBots.data.map(b => `${b.name} (${b.symbol})`));
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Error registering bot:', error.message);
        if (error.response?.data) {
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Run the manual registration
registerRedBotManually()
    .then(result => {
        if (result) {
            console.log('\n🎉 SUCCESS: RED bot is now under Task Master supervision!');
            console.log('\n📊 Monitoring Dashboard:');
            console.log(`   • Bot Status: ${TASK_MASTER_URL}/api/v1/bots`);
            console.log('   • Expected earnings: ~0.25% every 8 hours');
            console.log('   • Strategy: Short Perp (earning from negative funding)');
        } else {
            console.log('\n❌ Failed to register RED bot');
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ REGISTRATION FAILED:', error.message);
        process.exit(1);
    });
