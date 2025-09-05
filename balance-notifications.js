// Balance Change Notifications - Auto alerts for portfolio changes
require('dotenv').config();
const axios = require('axios');

class BalanceNotificationManager {
    constructor() {
        this.telegramBot = {
            token: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID
        };
        
        this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
        this.slackWebhook = process.env.SLACK_WEBHOOK_URL;
    }
    
    async sendTelegramNotification(message, isEmergency = false) {
        if (!this.telegramBot.token || !this.telegramBot.chatId) {
            console.log('⚠️ Telegram credentials not configured');
            return false;
        }
        
        try {
            const emoji = isEmergency ? '🚨' : '💰';
            const priority = isEmergency ? '❗URGENTE❗' : '';
            const formattedMessage = `${emoji} ${priority}\\n\\n${message}`;
            
            const url = `https://api.telegram.org/bot${this.telegramBot.token}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: this.telegramBot.chatId,
                text: formattedMessage,
                parse_mode: 'HTML'
            });
            
            console.log('✅ Telegram notification sent');
            return true;
        } catch (error) {
            console.error('❌ Telegram notification failed:', error.message);
            return false;
        }
    }
    
    async sendDiscordNotification(message, isEmergency = false) {
        if (!this.discordWebhook) {
            console.log('⚠️ Discord webhook not configured');
            return false;
        }
        
        try {
            const color = isEmergency ? 16711680 : 3447003; // Red : Blue
            const title = isEmergency ? '🚨 BALANCE ALERT - URGENT' : '💰 Balance Update';
            
            const embed = {
                title: title,
                description: message,
                color: color,
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'TaskMaster Auto Balance Manager'
                }
            };
            
            await axios.post(this.discordWebhook, {
                embeds: [embed]
            });
            
            console.log('✅ Discord notification sent');
            return true;
        } catch (error) {
            console.error('❌ Discord notification failed:', error.message);
            return false;
        }
    }
    
    async notifyBalanceChange(changeData) {
        const { hasChange, changeType, changeAmount, currentPortfolio } = changeData;
        
        if (!hasChange) return;
        
        const message = this.formatBalanceChangeMessage(changeType, changeAmount, currentPortfolio);
        const isEmergency = Math.abs(changeAmount) > 50; // Alert if >$50 change
        
        // Send notifications to all configured channels
        const notifications = [
            this.sendTelegramNotification(message, isEmergency),
            this.sendDiscordNotification(message, isEmergency)
        ];
        
        await Promise.allSettled(notifications);
        
        return {
            sent: true,
            channels: ['telegram', 'discord'],
            emergency: isEmergency,
            message
        };
    }
    
    async notifyRebalanceAction(rebalanceResult) {
        if (!rebalanceResult.success) return;
        
        const message = this.formatRebalanceMessage(rebalanceResult);
        const isEmergency = rebalanceResult.executedActions.some(
            action => action.result === 'MANUAL_REQUIRED'
        );
        
        // Send notifications
        const notifications = [
            this.sendTelegramNotification(message, isEmergency),
            this.sendDiscordNotification(message, isEmergency)
        ];
        
        await Promise.allSettled(notifications);
        
        return {
            sent: true,
            emergency: isEmergency,
            message
        };
    }
    
    async notifyOptimizationOpportunity(opportunities) {
        if (opportunities.highPotential.length === 0) return;
        
        const message = this.formatOpportunityMessage(opportunities);
        
        // Send notifications
        const notifications = [
            this.sendTelegramNotification(message, false),
            this.sendDiscordNotification(message, false)
        ];
        
        await Promise.allSettled(notifications);
        
        return {
            sent: true,
            message
        };
    }
    
    async notifyPortfolioHealth(portfolio, utilization) {
        let message = '';
        let isEmergency = false;
        
        if (utilization > 500) {
            message = this.formatHealthMessage('CRÍTICO', portfolio, utilization, 
                'Utilización extrema detectada. Riesgo de liquidación.');
            isEmergency = true;
        } else if (utilization > 300) {
            message = this.formatHealthMessage('ALTO', portfolio, utilization,
                'Utilización alta. Considerar reducir exposición.');
            isEmergency = true;
        } else if (utilization < 50) {
            message = this.formatHealthMessage('INFRAUTILIZADO', portfolio, utilization,
                'Capital infrautilizado. Considerar nuevas oportunidades.');
        }
        
        if (message) {
            const notifications = [
                this.sendTelegramNotification(message, isEmergency),
                this.sendDiscordNotification(message, isEmergency)
            ];
            
            await Promise.allSettled(notifications);
            
            return {
                sent: true,
                emergency: isEmergency,
                message
            };
        }
        
        return { sent: false };
    }
    
    formatBalanceChangeMessage(changeType, changeAmount, portfolio) {
        const direction = changeAmount > 0 ? '📈' : '📉';
        const action = changeType === 'DEPOSIT' ? 'Depósito' : 'Retiro';
        
        return `<b>💰 CAMBIO DE BALANCE DETECTADO</b>\n\n` +
               `${direction} <b>${action}:</b> $${Math.abs(changeAmount).toFixed(2)}\n` +
               `💼 <b>Portfolio Total:</b> $${portfolio.totalPortfolioValue.toFixed(2)}\n` +
               `💧 <b>USDT Líquido:</b> $${portfolio.totalUSDTLiquid.toFixed(2)}\n` +
               `📊 <b>Utilización:</b> ${portfolio.liquidUtilization.toFixed(1)}%\n\n` +
               `⏰ <i>${new Date().toLocaleString()}</i>`;
    }
    
    formatRebalanceMessage(rebalanceResult) {
        let message = `<b>🔄 REBALANCE AUTOMÁTICO EJECUTADO</b>\n\n`;
        
        rebalanceResult.executedActions.forEach((action, idx) => {
            const status = action.result === 'SUCCESS' ? '✅' : 
                          action.result === 'MANUAL_REQUIRED' ? '⚠️' : '💡';
            
            message += `${status} <b>${idx + 1}. ${action.action.replace(/_/g, ' ')}</b>\n`;
            
            if (action.details && action.details.totalConverted) {
                message += `   Convertido: $${action.details.totalConverted.toFixed(2)}\n`;
            }
            
            if (action.result === 'MANUAL_REQUIRED') {
                message += `   <i>❗ Requiere intervención manual</i>\n`;
            }
            
            message += '\n';
        });
        
        message += `⏰ <i>${new Date().toLocaleString()}</i>`;
        
        return message;
    }
    
    formatOpportunityMessage(opportunities) {
        let message = `<b>💡 NUEVAS OPORTUNIDADES DETECTADAS</b>\n\n`;
        
        message += `🔥 <b>Alta Potencial:</b> ${opportunities.highPotential.length} símbolos\n`;
        
        if (opportunities.highPotential.length > 0) {
            message += `\n<b>🎯 TOP OPORTUNIDADES:</b>\n`;
            opportunities.highPotential.slice(0, 3).forEach((opp, idx) => {
                message += `   ${idx + 1}. <code>${opp.symbol}</code>: ${opp.rate.toFixed(3)}% (${opp.direction})\n`;
            });
        }
        
        message += `\n⏰ <i>${new Date().toLocaleString()}</i>`;
        
        return message;
    }
    
    formatHealthMessage(riskLevel, portfolio, utilization, recommendation) {
        const riskEmoji = {
            'CRÍTICO': '🚨',
            'ALTO': '🔴', 
            'INFRAUTILIZADO': '🟡'
        };
        
        return `${riskEmoji[riskLevel]} <b>ALERTA DE PORTFOLIO - ${riskLevel}</b>\n\n` +
               `💼 <b>Valor Total:</b> $${portfolio.totalPortfolioValue.toFixed(2)}\n` +
               `💧 <b>USDT Líquido:</b> $${portfolio.totalUSDTLiquid.toFixed(2)}\n` +
               `📊 <b>Utilización:</b> ${utilization.toFixed(1)}%\n\n` +
               `💡 <b>Recomendación:</b>\n<i>${recommendation}</i>\n\n` +
               `⏰ <i>${new Date().toLocaleString()}</i>`;
    }
    
    async testNotifications() {
        console.log('🧪 Testing notification systems...');
        
        const testMessage = `<b>🧪 TEST NOTIFICATION</b>\n\n` +
                          `✅ Balance Manager está funcionando correctamente\n` +
                          `⏰ ${new Date().toLocaleString()}`;
        
        const results = await Promise.allSettled([
            this.sendTelegramNotification(testMessage),
            this.sendDiscordNotification(testMessage)
        ]);
        
        console.log('📊 Test results:');
        results.forEach((result, idx) => {
            const platform = idx === 0 ? 'Telegram' : 'Discord';
            const status = result.status === 'fulfilled' && result.value ? '✅' : '❌';
            console.log(`   ${platform}: ${status}`);
        });
        
        return results;
    }
}

// CLI execution
if (require.main === module) {
    const notifier = new BalanceNotificationManager();
    
    if (process.argv.includes('--test')) {
        notifier.testNotifications();
    } else {
        console.log('Balance Notification Manager loaded');
        console.log('Use --test to test notifications');
    }
}

module.exports = BalanceNotificationManager;
