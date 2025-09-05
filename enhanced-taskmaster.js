// Enhanced TaskMaster - With Auto Balance Management Integration
require('dotenv').config();
const AutoBalanceManager = require('./auto-balance-manager.js');
const BalanceNotificationManager = require('./balance-notifications.js');

class EnhancedTaskMaster {
    constructor() {
        this.balanceManager = new AutoBalanceManager();
        this.notificationManager = new BalanceNotificationManager();
        this.isRunning = false;
        this.intervals = [];
        
        // Configuration
        this.config = {
            balanceCheckInterval: 30,      // minutes
            emergencyCheckInterval: 5,     // minutes for critical situations
            notificationCooldown: 60,      // minutes between similar notifications
            autoRebalanceEnabled: true,
            emergencyMode: false
        };
        
        this.lastNotifications = new Map(); // Track notification cooldowns
    }
    
    async initialize() {
        try {
            console.log('🚀 INICIALIZANDO ENHANCED TASKMASTER');
            console.log('═══════════════════════════════════════');
            
            // Test notification systems
            console.log('🧪 Testing notification systems...');
            await this.notificationManager.testNotifications();
            
            // Initial portfolio assessment
            console.log('\n📊 Initial portfolio assessment...');
            const initialCheck = await this.balanceManager.runBalanceManagement();
            
            if (initialCheck.success) {
                console.log('✅ TaskMaster initialized successfully');
                
                // Send startup notification
                await this.sendStartupNotification();
                
                return true;
            } else {
                console.log('❌ TaskMaster initialization failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error during initialization:', error.message);
            return false;
        }
    }
    
    async sendStartupNotification() {
        const message = `<b>🚀 TASKMASTER INICIADO</b>\n\n` +
                       `✅ Sistema de gestión automática de balances activado\n` +
                       `🔄 Monitoreo continuo habilitado\n` +
                       `⚡ Rebalance automático: ${this.config.autoRebalanceEnabled ? 'ON' : 'OFF'}\n` +
                       `⏰ ${new Date().toLocaleString()}`;
        
        await this.notificationManager.sendTelegramNotification(message, false);
    }
    
    async runEnhancedMonitoring() {
        try {
            console.log('\n' + '='.repeat(60));
            console.log('🔍 ENHANCED TASKMASTER - FULL MONITORING CYCLE');
            console.log('='.repeat(60));
            
            // 1. Run balance management
            const balanceResult = await this.balanceManager.runBalanceManagement();
            
            if (balanceResult && balanceResult.success) {
                // 2. Check if we need to send notifications
                if (balanceResult.executedActions && balanceResult.executedActions.length > 0) {
                    await this.handleRebalanceNotifications(balanceResult);
                }
                
                // 3. Check for emergency conditions
                await this.checkEmergencyConditions();
                
                // 4. Log activity
                this.logActivity('MONITORING_CYCLE', balanceResult);
                
            } else {
                console.log('⚠️ Balance management cycle failed');
            }
            
        } catch (error) {
            console.error('❌ Error in enhanced monitoring:', error.message);
            await this.handleErrorNotification(error);
        }
    }
    
    async handleRebalanceNotifications(rebalanceResult) {
        try {
            // Check if we should send notification (cooldown)
            const lastNotification = this.lastNotifications.get('rebalance');
            const now = Date.now();
            
            if (!lastNotification || (now - lastNotification) > (this.config.notificationCooldown * 60 * 1000)) {
                await this.notificationManager.notifyRebalanceAction(rebalanceResult);
                this.lastNotifications.set('rebalance', now);
                
                console.log('✅ Rebalance notification sent');
            } else {
                console.log('⏳ Rebalance notification on cooldown');
            }
            
        } catch (error) {
            console.error('❌ Error sending rebalance notification:', error.message);
        }
    }
    
    async checkEmergencyConditions() {
        try {
            const portfolio = this.balanceManager.lastKnownBalance;
            if (!portfolio) return;
            
            // Calculate real portfolio utilization
            const activeBots = await this.balanceManager.checkAllActiveBots();
            let totalInBots = 0;
            if (activeBots && Array.isArray(activeBots)) {
                activeBots.forEach(bot => {
                    totalInBots += bot.notionalValue || 0;
                });
            }
            const portfolioUtilization = (totalInBots / portfolio.totalPortfolioValue) * 100;
            
            const isEmergency = (
                portfolioUtilization > 95 ||          // >95% of portfolio in bots (real emergency)
                portfolio.totalUSDTLiquid < 3 ||      // <$3 USDT liquid (can't operate)
                portfolio.totalPortfolioValue < 30    // <$30 total portfolio
            );
            
            if (isEmergency && !this.config.emergencyMode) {
                console.log('🚨 EMERGENCY CONDITIONS DETECTED!');
                this.config.emergencyMode = true;
                
                // Switch to emergency monitoring interval
                this.restartWithEmergencyInterval();
                
                // Send emergency notification
                await this.handleEmergencyNotification(portfolio);
                
            } else if (!isEmergency && this.config.emergencyMode) {
                console.log('✅ Emergency conditions resolved');
                this.config.emergencyMode = false;
                
                // Return to normal interval
                this.restartWithNormalInterval();
            }
            
        } catch (error) {
            console.error('❌ Error checking emergency conditions:', error.message);
        }
    }
    
    async handleEmergencyNotification(portfolio) {
        const message = `<b>🚨 ALERTA CRÍTICA - TASKMASTER</b>\n\n` +
                       `⚠️ Condiciones de emergencia detectadas:\n\n` +
                       `💼 Portfolio Total: $${portfolio.totalPortfolioValue.toFixed(2)}\n` +
                       `💧 USDT Líquido: $${portfolio.totalUSDTLiquid.toFixed(2)}\n` +
                       `📊 Utilización: ${portfolio.liquidUtilization.toFixed(1)}%\n\n` +
                       `🚨 ACCIÓN REQUERIDA INMEDIATA\n` +
                       `⏰ ${new Date().toLocaleString()}`;
        
        await this.notificationManager.sendTelegramNotification(message, true);
    }
    
    async handleErrorNotification(error) {
        const message = `<b>❌ ERROR EN TASKMASTER</b>\n\n` +
                       `🔧 Error: ${error.message}\n` +
                       `⏰ ${new Date().toLocaleString()}\n\n` +
                       `🔍 Verifique el sistema manualmente`;
        
        await this.notificationManager.sendTelegramNotification(message, true);
    }
    
    restartWithEmergencyInterval() {
        console.log('🚨 Switching to EMERGENCY monitoring interval (5 minutes)');
        this.stop();
        this.startContinuousMonitoring(this.config.emergencyCheckInterval);
    }
    
    restartWithNormalInterval() {
        console.log('✅ Returning to NORMAL monitoring interval (30 minutes)');
        this.stop();
        this.startContinuousMonitoring(this.config.balanceCheckInterval);
    }
    
    logActivity(type, data) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            emergencyMode: this.config.emergencyMode,
            data: {
                success: data.success,
                actionsExecuted: data.executedActions ? data.executedActions.length : 0
            }
        };
        
        // You could extend this to write to a file or database
        console.log('📝 Activity logged:', JSON.stringify(logEntry, null, 2));
    }
    
    startContinuousMonitoring(intervalMinutes = null) {
        if (this.isRunning) {
            console.log('⚠️ Enhanced TaskMaster already running');
            return false;
        }
        
        const interval = intervalMinutes || this.config.balanceCheckInterval;
        
        console.log(`🔄 Starting Enhanced TaskMaster monitoring (${interval} min intervals)`);
        
        // Start the monitoring interval
        const monitoringInterval = setInterval(async () => {
            await this.runEnhancedMonitoring();
        }, interval * 60 * 1000);
        
        this.intervals.push(monitoringInterval);
        this.isRunning = true;
        
        // Run initial check immediately
        this.runEnhancedMonitoring();
        
        console.log('✅ Enhanced TaskMaster started successfully');
        console.log('Press Ctrl+C to stop monitoring');
        
        return true;
    }
    
    stop() {
        if (!this.isRunning) {
            console.log('ℹ️ Enhanced TaskMaster not running');
            return;
        }
        
        console.log('🛑 Stopping Enhanced TaskMaster...');
        
        // Clear all intervals
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
        this.isRunning = false;
        
        console.log('✅ Enhanced TaskMaster stopped');
    }
    
    async getSystemStatus() {
        try {
            const portfolio = this.balanceManager.lastKnownBalance;
            
            return {
                running: this.isRunning,
                emergencyMode: this.config.emergencyMode,
                lastCheck: portfolio ? new Date().toISOString() : null,
                portfolio: portfolio ? {
                    totalValue: portfolio.totalPortfolioValue,
                    liquidUSDT: portfolio.totalUSDTLiquid,
                    utilization: portfolio.liquidUtilization
                } : null,
                config: this.config
            };
        } catch (error) {
            return {
                running: this.isRunning,
                error: error.message
            };
        }
    }
}

// CLI execution
if (require.main === module) {
    const taskMaster = new EnhancedTaskMaster();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--status')) {
        taskMaster.getSystemStatus().then(status => {
            console.log('📊 TaskMaster Status:', JSON.stringify(status, null, 2));
        });
    } else if (args.includes('--stop')) {
        taskMaster.stop();
    } else {
        // Initialize and start
        taskMaster.initialize().then(success => {
            if (success) {
                const interval = args.includes('--fast') ? 15 : 30;
                taskMaster.startContinuousMonitoring(interval);
                
                // Handle graceful shutdown
                process.on('SIGINT', () => {
                    console.log('\n🛑 Shutdown signal received');
                    taskMaster.stop();
                    process.exit(0);
                });
                
            } else {
                console.log('❌ Failed to initialize TaskMaster');
                process.exit(1);
            }
        });
    }
}

module.exports = EnhancedTaskMaster;
