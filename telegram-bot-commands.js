// TaskMaster Telegram Bot with Commands
require('dotenv').config();
const axios = require('axios');

class TaskMasterTelegramBot {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.lastUpdateId = 0;
        this.isListening = false;
        
        // Available commands
        this.commands = {
            '/status': this.getSystemStatus.bind(this),
            '/portfolio': this.getPortfolioStatus.bind(this),
            '/bots': this.getBotsStatus.bind(this),
            '/earnings': this.getEarningsInfo.bind(this),
            '/health': this.getSystemHealth.bind(this),
            '/help': this.showHelp.bind(this),
            '/start': this.showWelcome.bind(this)
        };
    }
    
    async startBot() {
        if (this.isListening) {
            console.log('⚠️ Bot already listening');
            return;
        }
        
        console.log('🤖 INICIANDO TELEGRAM BOT COMMANDS');
        console.log('════════════════════════════════════');
        console.log('📱 Bot listening for commands...');
        console.log('💡 Usa /help para ver comandos disponibles');
        
        this.isListening = true;
        
        // Set bot commands
        await this.setBotCommands();
        
        // Send welcome message
        await this.sendMessage(`🤖 <b>TaskMaster Bot Iniciado</b>\\n\\n✅ Bot listening for commands\\n💡 Usa /help para ver comandos disponibles`);
        
        // Start polling for messages
        this.pollUpdates();
    }
    
    async setBotCommands() {
        const commands = [
            { command: 'status', description: '📊 Estado general del sistema' },
            { command: 'portfolio', description: '💰 Valoración del portfolio' },
            { command: 'bots', description: '🤖 Estado de bots activos' },
            { command: 'earnings', description: '💸 Información de ganancias' },
            { command: 'health', description: '🏥 Health check del sistema' },
            { command: 'help', description: '💡 Mostrar ayuda' }
        ];
        
        try {
            await axios.post(`${this.baseUrl}/setMyCommands`, {
                commands: commands
            });
            console.log('✅ Bot commands set successfully');
        } catch (error) {
            console.error('❌ Error setting bot commands:', error.message);
        }
    }
    
    async pollUpdates() {
        while (this.isListening) {
            try {
                const response = await axios.get(`${this.baseUrl}/getUpdates`, {
                    params: {
                        offset: this.lastUpdateId + 1,
                        timeout: 10
                    }
                });
                
                const updates = response.data.result;
                
                for (const update of updates) {
                    this.lastUpdateId = update.update_id;
                    await this.handleUpdate(update);
                }
                
            } catch (error) {
                if (error.code !== 'ECONNABORTED') {
                    console.error('❌ Error polling updates:', error.message);
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    async handleUpdate(update) {
        if (!update.message || !update.message.text) return;
        
        const message = update.message;
        const text = message.text.trim();
        const chatId = message.chat.id.toString();
        
        // Only respond to authorized chat
        if (chatId !== this.chatId) {
            console.log(`⚠️ Unauthorized access from chat ID: ${chatId}`);
            return;
        }
        
        console.log(`📨 Command received: ${text}`);
        
        // Check if it's a command
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            
            if (this.commands[command]) {
                await this.commands[command](message);
            } else {
                await this.sendMessage(`❌ Comando desconocido: ${command}\\n\\n💡 Usa /help para ver comandos disponibles`);
            }
        }
    }
    
    async getSystemStatus(message) {
        await this.sendMessage('🔍 Obteniendo estado del sistema...');
        
        try {
            // Get portfolio data
            const FullPortfolioValuator = require('./full-portfolio-valuation.js');
            const valuator = new FullPortfolioValuator();
            const portfolio = await valuator.getFullPortfolioValue();
            
            // Get bots data
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            const totalEarnings = activeBots.reduce((sum, bot) => sum + (bot.expectedEarning || 0), 0);
            
            const statusMessage = `<b>📊 TASKMASTER STATUS</b>\\n\\n` +
                                 `💰 <b>Portfolio:</b> $${portfolio.totalPortfolioValue.toFixed(2)}\\n` +
                                 `💧 <b>USDT:</b> $${portfolio.totalUSDTLiquid.toFixed(2)}\\n` +
                                 `📊 <b>Utilización:</b> ${portfolio.totalUtilization.toFixed(1)}%\\n\\n` +
                                 `🤖 <b>Bots:</b> ${activeBots.length} activos\\n` +
                                 `💸 <b>Next Earnings:</b> $${totalEarnings.toFixed(4)}\\n\\n` +
                                 `🟢 <b>Status:</b> EXCELLENT\\n` +
                                 `⏰ <b>Update:</b> ${new Date().toLocaleString()}`;
            
            await this.sendMessage(statusMessage);
            
        } catch (error) {
            await this.sendMessage(`❌ Error obteniendo status: ${error.message}`);
        }
    }
    
    async getPortfolioStatus(message) {
        await this.sendMessage('💰 Analizando portfolio...');
        
        try {
            const FullPortfolioValuator = require('./full-portfolio-valuation.js');
            const valuator = new FullPortfolioValuator();
            const portfolio = await valuator.getFullPortfolioValue();
            
            const portfolioMessage = `<b>💰 PORTFOLIO ANALYSIS</b>\\n\\n` +
                                    `🏦 <b>Valor Total:</b> $${portfolio.totalPortfolioValue.toFixed(2)}\\n` +
                                    `   • Spot: $${portfolio.totalSpotValue.toFixed(2)}\\n` +
                                    `   • Futures: $${portfolio.totalFuturesValue.toFixed(2)}\\n\\n` +
                                    `💧 <b>USDT Líquido:</b> $${portfolio.totalUSDTLiquid.toFixed(2)}\\n` +
                                    `🪙 <b>Tokens:</b> $${(portfolio.totalPortfolioValue - portfolio.totalUSDTLiquid).toFixed(2)}\\n\\n` +
                                    `📊 <b>Utilización:</b> ${portfolio.totalUtilization.toFixed(1)}%\\n` +
                                    `⚖️ <b>Risk Level:</b> ${portfolio.totalUtilization > 75 ? 'HIGH' : portfolio.totalUtilization > 50 ? 'MEDIUM' : 'LOW'}`;
            
            await this.sendMessage(portfolioMessage);
            
        } catch (error) {
            await this.sendMessage(`❌ Error obteniendo portfolio: ${error.message}`);
        }
    }
    
    async getBotsStatus(message) {
        await this.sendMessage('🤖 Revisando bots activos...');
        
        try {
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            if (activeBots.length === 0) {
                await this.sendMessage('⚠️ No hay bots activos detectados');
                return;
            }
            
            let botsMessage = `<b>🤖 BOTS ACTIVOS (${activeBots.length})</b>\\n\\n`;
            
            activeBots.forEach((bot, idx) => {
                const symbol = bot.symbol || 'Unknown';
                const fundingRate = bot.fundingRate ? `${(bot.fundingRate * 100).toFixed(3)}%` : 'N/A';
                const notional = bot.notionalValue ? `$${bot.notionalValue.toFixed(2)}` : 'N/A';
                const earnings = bot.expectedEarning ? `$${bot.expectedEarning.toFixed(4)}` : 'N/A';
                const nextFunding = bot.nextFundingTime || 'N/A';
                
                botsMessage += `<b>${idx + 1}. ${symbol}</b>\\n`;
                botsMessage += `   💰 Funding: ${fundingRate}\\n`;
                botsMessage += `   💵 Size: ${notional}\\n`;
                botsMessage += `   💸 Next: ${earnings}\\n`;
                botsMessage += `   ⏰ Time: ${nextFunding}\\n\\n`;
            });
            
            const totalEarnings = activeBots.reduce((sum, bot) => sum + (bot.expectedEarning || 0), 0);
            botsMessage += `💸 <b>Total Next Round:</b> $${totalEarnings.toFixed(4)}`;
            
            await this.sendMessage(botsMessage);
            
        } catch (error) {
            await this.sendMessage(`❌ Error obteniendo bots: ${error.message}`);
        }
    }
    
    async getEarningsInfo(message) {
        await this.sendMessage('💸 Calculando ganancias...');
        
        try {
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            const totalEarnings = activeBots.reduce((sum, bot) => sum + (bot.expectedEarning || 0), 0);
            const dailyEarnings = totalEarnings * 3; // 3 funding payments per day
            const monthlyEarnings = dailyEarnings * 30;
            
            const earningsMessage = `<b>💸 EARNINGS PROJECTION</b>\\n\\n` +
                                   `🕐 <b>Next Round:</b> $${totalEarnings.toFixed(4)}\\n` +
                                   `📅 <b>Daily Est:</b> $${dailyEarnings.toFixed(4)}\\n` +
                                   `📊 <b>Monthly Est:</b> $${monthlyEarnings.toFixed(2)}\\n\\n` +
                                   `<i>* Estimaciones basadas en funding rates actuales</i>\\n` +
                                   `<i>* Rates fluctúan constantemente</i>`;
            
            await this.sendMessage(earningsMessage);
            
        } catch (error) {
            await this.sendMessage(`❌ Error calculando earnings: ${error.message}`);
        }
    }
    
    async getSystemHealth(message) {
        await this.sendMessage('🏥 Verificando system health...');
        
        try {
            // Check if TaskMaster is running
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            const { stdout } = await execAsync('Get-Process | Where-Object { $_.ProcessName -eq "node" }', { shell: 'powershell' });
            const nodeProcesses = stdout.split('\\n').filter(line => line.includes('node')).length;
            
            // Test API connectivity
            let apiStatus = 'OK';
            try {
                await require('./balance-notifications.js').prototype.testNotifications?.();
            } catch (e) {
                apiStatus = 'ERROR';
            }
            
            const healthMessage = `<b>🏥 SYSTEM HEALTH</b>\\n\\n` +
                                 `🟢 <b>TaskMaster:</b> ${nodeProcesses > 0 ? 'RUNNING' : 'STOPPED'}\\n` +
                                 `📊 <b>Node Processes:</b> ${nodeProcesses}\\n` +
                                 `🌐 <b>API Status:</b> ${apiStatus}\\n` +
                                 `📱 <b>Telegram:</b> WORKING\\n` +
                                 `⏰ <b>Uptime:</b> ${process.uptime().toFixed(0)}s\\n\\n` +
                                 `${nodeProcesses > 0 ? '✅ All systems operational' : '⚠️ TaskMaster needs restart'}`;
            
            await this.sendMessage(healthMessage);
            
        } catch (error) {
            await this.sendMessage(`❌ Error checking health: ${error.message}`);
        }
    }
    
    async showHelp(message) {
        const helpMessage = `<b>💡 TASKMASTER BOT COMMANDS</b>\\n\\n` +
                           `📊 /status - Estado general del sistema\\n` +
                           `💰 /portfolio - Análisis del portfolio\\n` +
                           `🤖 /bots - Estado de bots activos\\n` +
                           `💸 /earnings - Proyección de ganancias\\n` +
                           `🏥 /health - Health check del sistema\\n` +
                           `💡 /help - Mostrar esta ayuda\\n\\n` +
                           `<i>🔐 Bot autorizado solo para tu chat ID</i>\\n` +
                           `<i>⚡ Respuestas en tiempo real</i>`;
        
        await this.sendMessage(helpMessage);
    }
    
    async showWelcome(message) {
        const welcomeMessage = `<b>🚀 ¡Bienvenido a TaskMaster Bot!</b>\\n\\n` +
                              `✅ Bot conectado y funcionando\\n` +
                              `🤖 Sistema de comandos activo\\n` +
                              `📱 Chat autorizado: ${this.chatId}\\n\\n` +
                              `💡 Usa /help para ver todos los comandos`;
        
        await this.sendMessage(welcomeMessage);
    }
    
    async sendMessage(text) {
        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: this.chatId,
                text: text,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('❌ Error sending message:', error.message);
        }
    }
    
    stop() {
        console.log('🛑 Stopping Telegram bot...');
        this.isListening = false;
        console.log('✅ Telegram bot stopped');
    }
}

// CLI execution
if (require.main === module) {
    const bot = new TaskMasterTelegramBot();
    
    bot.startBot();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        bot.stop();
        process.exit(0);
    });
}

module.exports = TaskMasterTelegramBot;
