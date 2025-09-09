// Send Manual Status Update to Telegram
require('dotenv').config();
const BalanceNotificationManager = require('./balance-notifications.js');

async function sendStatusUpdate() {
    const notifier = new BalanceNotificationManager();
    
    console.log('📱 Enviando actualización de status...');
    
    // Get current portfolio data
    const FullPortfolioValuator = require('./full-portfolio-valuation.js');
    const valuator = new FullPortfolioValuator();
    const portfolio = await valuator.getFullPortfolioValue();
    
    // Get current bots data
    const { checkAllActiveBots } = require('./check-all-bots.js');
    const activeBots = await checkAllActiveBots();
    
    // Format the status message
    const message = `<b>📊 TASKMASTER STATUS UPDATE</b>\\n\\n` +
                   `💰 <b>Portfolio Total:</b> $${portfolio.totalPortfolioValue.toFixed(2)}\\n` +
                   `💧 <b>USDT Líquido:</b> $${portfolio.totalUSDTLiquid.toFixed(2)}\\n` +
                   `📊 <b>Utilización:</b> ${portfolio.totalUtilization.toFixed(1)}%\\n\\n` +
                   `🤖 <b>Bots Activos:</b> ${activeBots.length}\\n`;
    
    let botsInfo = '';
    activeBots.forEach((bot, idx) => {
        const symbol = bot.symbol || 'Unknown';
        const funding = bot.fundingRate ? `${(bot.fundingRate * 100).toFixed(3)}%` : 'N/A';
        const earnings = bot.expectedEarning ? `$${bot.expectedEarning.toFixed(4)}` : 'N/A';
        botsInfo += `   • ${symbol}: ${funding} → ${earnings}\\n`;
    });
    
    const totalEarnings = activeBots.reduce((sum, bot) => sum + (bot.expectedEarning || 0), 0);
    
    const fullMessage = message + botsInfo + 
                       `\\n💸 <b>Próximas ganancias:</b> $${totalEarnings.toFixed(4)}\\n` +
                       `⏰ <b>Tiempo:</b> ${new Date().toLocaleString()}\\n\\n` +
                       `🟢 <b>Status:</b> EXCELLENT - Sistema funcionando\\n` +
                       `🔄 <b>TaskMaster:</b> Monitoreando automáticamente`;
    
    try {
        await notifier.sendTelegramNotification(fullMessage, false);
        console.log('✅ Status update enviado exitosamente');
    } catch (error) {
        console.error('❌ Error enviando status update:', error.message);
    }
}

// Run the status update
sendStatusUpdate();
