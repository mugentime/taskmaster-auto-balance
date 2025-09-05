// Get Telegram Chat ID - Run after sending /start to your bot
require('dotenv').config();
const axios = require('axios');

async function getTelegramChatId() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || "8220024038:AAF9pY8vb6CkOjWSu0vXTzYVUNfpMiGEGZA";
    
    if (!botToken) {
        console.log('❌ TELEGRAM_BOT_TOKEN not configured');
        return;
    }
    
    try {
        console.log('🔍 Getting updates from Telegram bot...');
        console.log(`📱 Bot Token: ${botToken.substring(0, 10)}...`);
        
        const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`);
        
        if (response.data.ok && response.data.result.length > 0) {
            console.log('\n✅ Found messages! Here are the details:');
            
            response.data.result.forEach((update, index) => {
                if (update.message) {
                    const chat = update.message.chat;
                    const from = update.message.from;
                    
                    console.log(`\n📨 Message ${index + 1}:`);
                    console.log(`   Chat ID: ${chat.id}`);
                    console.log(`   Chat Type: ${chat.type}`);
                    console.log(`   From: ${from.first_name} ${from.last_name || ''} (@${from.username || 'no username'})`);
                    console.log(`   Message: "${update.message.text}"`);
                    console.log(`   Date: ${new Date(update.message.date * 1000).toLocaleString()}`);
                }
            });
            
            // Get the most recent chat ID
            const latestMessage = response.data.result[response.data.result.length - 1];
            if (latestMessage.message) {
                const chatId = latestMessage.message.chat.id;
                console.log(`\n🎯 USE THIS CHAT ID: ${chatId}`);
                console.log(`\n💡 Add to your .env file:`);
                console.log(`TELEGRAM_CHAT_ID=${chatId}`);
                
                // Test sending a message to this chat ID
                try {
                    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        chat_id: chatId,
                        text: '🎉 *TaskMaster Bot Connected!*\n\nYour notifications are now configured.\nYou will receive alerts when:\n• System goes down 🚨\n• System recovers ✅\n• Bots stop working ⚠️',
                        parse_mode: 'Markdown'
                    });
                    
                    console.log('\n✅ Test message sent successfully!');
                    console.log('Check your Telegram for the confirmation message.');
                    
                } catch (error) {
                    console.log(`\n⚠️ Could not send test message: ${error.response?.data?.description || error.message}`);
                }
            }
            
        } else {
            console.log('\n❌ No messages found.');
            console.log('\n📱 TO FIX THIS:');
            console.log('1. Open Telegram');
            console.log('2. Search for your bot (should be in your bot list)');
            console.log('3. Send /start to the bot');
            console.log('4. Run this script again');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            console.log('\n🔑 TOKEN ERROR:');
            console.log('The bot token is invalid or expired.');
            console.log('Make sure you copied the full token from BotFather.');
        }
    }
}

// CLI usage
if (require.main === module) {
    getTelegramChatId();
}

module.exports = { getTelegramChatId };
