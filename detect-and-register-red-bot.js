// Detect and Register RED Bot in Task Master
require('dotenv').config();
const axios = require('axios');

const TASK_MASTER_URL = 'http://localhost:3001';
const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;

console.log('🔍 DETECTING AND REGISTERING RED BOT');
console.log('═══════════════════════════════════════');

async function detectAndRegisterBot() {
    try {
        // Step 1: Detect arbitrage activity using Task Master
        console.log('[1] Detecting arbitrage activity...');
        const detection = await axios.post(`${TASK_MASTER_URL}/api/v1/detect-arbitrage-activity`, {
            apiKey: BINANCE_API_KEY,
            apiSecret: BINANCE_API_SECRET
        });

        console.log(`[✓] Detection completed: Found ${detection.data.detectedBots?.length || 0} bots`);

        if (detection.data.detectedBots && detection.data.detectedBots.length > 0) {
            // Step 2: Find the RED bot
            const redBot = detection.data.detectedBots.find(bot => 
                bot.symbol.includes('RED') || 
                bot.asset === 'RED' ||
                bot.name.includes('RED')
            );

            if (redBot) {
                console.log('[✓] Found RED bot:', redBot.name);
                console.log(`    Symbol: ${redBot.symbol}`);
                console.log(`    Status: ${redBot.status}`);
                console.log(`    Strategy: ${redBot.strategyType}`);
                
                // Step 3: Import the bot into Task Master
                console.log('[2] Importing RED bot into Task Master...');
                const importResult = await axios.post(`${TASK_MASTER_URL}/api/v1/import-detected-bots`, {
                    detectedBots: [redBot]
                });
                
                console.log(`[✓] Import successful: ${importResult.data.message}`);
                
                // Step 4: Verify the bot is now being managed
                const activeBots = await axios.get(`${TASK_MASTER_URL}/api/v1/bots`);
                console.log(`[✓] Active bots in Task Master: ${activeBots.data.length}`);
                
                const managedRedBot = activeBots.data.find(bot => 
                    bot.symbol.includes('RED') || bot.name.includes('RED')
                );
                
                if (managedRedBot) {
                    console.log('[✓] RED bot is now being supervised by Task Master');
                    console.log(`    Bot ID: ${managedRedBot.id}`);
                    console.log(`    Status: ${managedRedBot.status}`);
                    return managedRedBot;
                } else {
                    console.log('[!] RED bot imported but not found in active bots list');
                }
                
            } else {
                console.log('[!] RED bot not found in detected bots');
                console.log('Detected bots:', detection.data.detectedBots.map(b => `${b.name} (${b.symbol})`));
            }
        } else {
            console.log('[!] No bots detected - this might be normal if the bot was just launched');
            console.log('Detection summary:', detection.data.summary);
        }

        return null;
        
    } catch (error) {
        console.error('❌ Error detecting/registering bot:', error.message);
        if (error.response?.data) {
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Run the detection and registration
detectAndRegisterBot()
    .then(result => {
        if (result) {
            console.log('\n🎉 SUCCESS: RED bot is now under Task Master supervision!');
            console.log(`Monitor at: ${TASK_MASTER_URL}/api/v1/bots`);
        } else {
            console.log('\n⚠️  Could not automatically detect RED bot');
            console.log('This is normal if the bot was just launched. Try again in a few minutes.');
        }
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ FAILED:', error.message);
        process.exit(1);
    });
