// Warp TaskMaster - Automation Engine
// Comprehensive automation system for funding rate arbitrage

require('dotenv').config();
const axios = require('axios');
const Binance = require('binance-api-node').default;

class AutomationEngine {
    constructor() {
        this.client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
        
        // Initialize with default config, will be updated with real balance
        this.realCapitalDetected = false;
        
        this.config = {
            // Auto-launch settings
            autoLaunch: {
                enabled: true,
                minFundingRate: 0.0002, // 0.02% minimum
                minLiquidity: 1000000,  // $1M minimum
                maxConcurrentBots: 1,
                minInvestment: 2,
                defaultLeverage: 3
            },
            
            // Portfolio management
            portfolio: {
                totalCapital: 7,        // $7 total available (micro-capital mode)
                maxPerBot: 2,           // $2 max per bot (micro-capital)
                rebalanceThreshold: 0.25, // 25% performance difference
                diversificationLimit: 2  // Max 2 bots per asset class
            },
            
            // Risk management
            risk: {
                maxDrawdown: 0.1,       // 10% max loss per bot
                profitTarget: 0.2,      // 20% profit target
                stalePositionHours: 48, // Close after 48h no funding
                emergencyStop: true
            },
            
            // Monitoring intervals
            intervals: {
                opportunityCheck: 30000,    // 30 seconds
                portfolioRebalance: 300000, // 5 minutes
                healthCheck: 60000,         // 1 minute
                riskCheck: 120000          // 2 minutes
            }
        };
        
        this.state = {
            activeBots: new Map(),
            opportunities: [],
            lastRebalance: 0,
            alerts: [],
            performance: {
                totalPnL: 0,
                dailyPnL: 0,
                successRate: 0
            }
        };
        
        this.intervals = new Map();
        this.isRunning = false;
        
        // Environment overrides for runtime configuration
        const num = k => process.env[k] ? Number(process.env[k]) : undefined;
        const ovMinInv = num('ENGINE_MIN_INVESTMENT');
        const ovMaxBots = num('ENGINE_MAX_CONCURRENT_BOTS');
        const ovMinFR = num('ENGINE_MIN_FUNDING_RATE');
        const ovMinLiq = num('ENGINE_MIN_LIQUIDITY');
        
        if (ovMinInv) this.config.autoLaunch.minInvestment = ovMinInv;
        if (ovMaxBots) this.config.autoLaunch.maxConcurrentBots = ovMaxBots;
        if (ovMinFR) this.config.autoLaunch.minFundingRate = ovMinFR;
        if (ovMinLiq) this.config.autoLaunch.minLiquidity = ovMinLiq;
        
        console.log('🤖 Automation Engine initialized');
    }
    
    // ==========================================
    // CAPITAL DETECTION
    // ==========================================
    
    async detectRealCapital() {
        if (this.realCapitalDetected) return;
        
        try {
            console.log('💰 Detecting real available capital...');
            
            // Get spot account
            const spotAccount = await this.client.accountInfo();
            const spotUSDT = parseFloat(spotAccount.balances.find(b => b.asset === 'USDT')?.free || '0');
            
            // Get futures account
            const futuresAccount = await this.client.futuresAccountInfo();
            const futuresUSDT = parseFloat(futuresAccount.assets.find(a => a.asset === 'USDT')?.walletBalance || '0');
            
            const totalUSDT = spotUSDT + futuresUSDT;
            
            console.log(`📊 Real Capital Detected:`);
            console.log(`   Spot USDT: $${spotUSDT.toFixed(2)}`);
            console.log(`   Futures USDT: $${futuresUSDT.toFixed(2)}`);
            console.log(`   Total Available: $${totalUSDT.toFixed(2)}`);
            
            // Update configuration with real capital
            if (totalUSDT > 1) { // Only update if we have reasonable amount (lowered for micro-capital)
                const adjustedTotal = Math.floor(totalUSDT * 0.9); // Use 90% for safety
                const adjustedMaxPerBot = Math.floor(adjustedTotal / 3); // Allow up to 3 bots
                
                this.config.portfolio.totalCapital = adjustedTotal;
                this.config.portfolio.maxPerBot = Math.max(1, Math.floor(adjustedTotal / Math.max(1, this.config.autoLaunch.maxConcurrentBots)));
                
                // Ensure minInvestment fits tiny balances
                if (this.config.autoLaunch.minInvestment && this.config.autoLaunch.minInvestment > this.config.portfolio.maxPerBot) {
                    this.config.autoLaunch.minInvestment = this.config.portfolio.maxPerBot;
                }
                
                console.log(`⚙️ Updated Portfolio Config:`);
                console.log(`   Total Capital: $${adjustedTotal} (90% of available)`);
                console.log(`   Max Per Bot: $${this.config.portfolio.maxPerBot}`);
                
                this.realCapitalDetected = true;
            } else {
                console.log(`⚠️ Low capital detected ($${totalUSDT.toFixed(2)}), using default config`);
            }
            
        } catch (error) {
            console.error(`❌ Failed to detect real capital:`, error.message);
            console.log(`📝 Using default configuration`);
        }
    }
    
    // ==========================================
    // MAIN AUTOMATION METHODS
    // ==========================================
    
    async start() {
        if (this.isRunning) {
            console.log('⚠️ Automation Engine already running');
            return;
        }
        
        this.isRunning = true;
        console.log('🚀 Starting Automation Engine...');
        
        // Detect real available capital first
        await this.detectRealCapital();
        
        // Start all automation intervals
        this.startOpportunityScanner();
        this.startPortfolioManager();
        this.startHealthMonitor();
        this.startRiskManager();
        
        // Initial scan
        await this.scanAndLaunch();
        
        console.log('✅ Automation Engine started successfully');
        this.logStatus();
    }
    
    async stop() {
        if (!this.isRunning) return;
        
        console.log('🛑 Stopping Automation Engine...');
        this.isRunning = false;
        
        // Clear all intervals
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
            console.log(`   Stopped ${name}`);
        }
        this.intervals.clear();
        
        console.log('✅ Automation Engine stopped');
    }
    
    // ==========================================
    // OPPORTUNITY SCANNING & AUTO-LAUNCH
    // ==========================================
    
    startOpportunityScanner() {
        const interval = setInterval(async () => {
            if (!this.config.autoLaunch.enabled) return;
            
            try {
                await this.scanAndLaunch();
            } catch (error) {
                this.addAlert('error', `Opportunity scan failed: ${error.message}`);
            }
        }, this.config.intervals.opportunityCheck);
        
        this.intervals.set('opportunityScanner', interval);
        console.log('🔍 Opportunity scanner started');
    }
    
    async scanAndLaunch() {
        try {
            // Get current opportunities
            const opportunities = await this.getOpportunities();
            
            // Filter viable opportunities
            const viable = opportunities.filter(opp => 
                Math.abs(opp.fundingRate) >= this.config.autoLaunch.minFundingRate &&
                opp.liquidity >= this.config.autoLaunch.minLiquidity
            );
            
            if (viable.length === 0) {
                return { action: 'scan', result: 'no_viable_opportunities' };
            }
            
            // Check if we can launch more bots
            const activeBotCount = this.state.activeBots.size;
            const maxBots = this.config.autoLaunch.maxConcurrentBots;
            
            if (activeBotCount >= maxBots) {
                return { action: 'scan', result: 'max_bots_reached', count: activeBotCount };
            }
            
            // Get best opportunity not already active
            const activeSymbols = new Set([...this.state.activeBots.values()].map(bot => bot.symbol));
            const newOpportunities = viable.filter(opp => !activeSymbols.has(opp.symbol));
            
            if (newOpportunities.length === 0) {
                return { action: 'scan', result: 'all_opportunities_active' };
            }
            
            const bestOpportunity = newOpportunities[0];
            
            // Auto-launch if significantly better than current worst performer
            const shouldLaunch = await this.shouldLaunchBot(bestOpportunity);
            
            if (shouldLaunch) {
                return await this.autoLaunchBot(bestOpportunity);
            }
            
            return { action: 'scan', result: 'opportunity_below_threshold' };
            
        } catch (error) {
            console.error('❌ Scan and launch failed:', error.message);
            return { action: 'scan', error: error.message };
        }
    }
    
    async shouldLaunchBot(opportunity) {
        // Always launch if under max concurrent bots
        if (this.state.activeBots.size < this.config.autoLaunch.maxConcurrentBots) {
            return true;
        }
        
        // If at max, only launch if significantly better than worst performer
        const botPerformances = [...this.state.activeBots.values()].map(bot => ({
            id: bot.id,
            score: Math.abs(bot.currentFundingRate || 0)
        }));
        
        if (botPerformances.length === 0) return true;
        
        const worstBot = botPerformances.sort((a, b) => a.score - b.score)[0];
        const improvementRatio = Math.abs(opportunity.fundingRate) / worstBot.score;
        
        return improvementRatio > (1 + this.config.portfolio.rebalanceThreshold);
    }
    
    async autoLaunchBot(opportunity) {
        try {
            const strategy = opportunity.fundingRate < 0 ? 'Short Perp' : 'Long Perp';
            const perBotCap = Math.max(1, Math.floor(this.config.portfolio.totalCapital / Math.max(1, this.config.autoLaunch.maxConcurrentBots)));
            const investment = Math.max(this.config.autoLaunch.minInvestment, Math.min(this.config.portfolio.maxPerBot, perBotCap));
            
            console.log(`🚀 AUTO-LAUNCHING: ${opportunity.symbol} ${strategy}`);
            console.log(`   Funding Rate: ${(opportunity.fundingRate * 100).toFixed(4)}%`);
            console.log(`   Investment: $${investment}`);
            console.log(`   Expected APY: ${opportunity.annualizedRate}%`);
            
            const botConfig = {
                id: `auto-${opportunity.symbol.toLowerCase()}-${Date.now()}`,
                name: `Auto ${opportunity.symbol} ${strategy} Bot`,
                symbol: opportunity.symbol,
                strategyType: strategy,
                investment: investment,
                leverage: this.config.autoLaunch.defaultLeverage,
                autoManaged: true,
                autoLaunched: true,
                launchedAt: new Date().toISOString(),
                expectedFunding: opportunity.fundingRate
            };
            
            // Launch via direct script (most reliable)
            const launchResult = await this.executeLaunch(botConfig);
            
            if (launchResult.success) {
                // Register in our state
                this.state.activeBots.set(botConfig.id, {
                    ...botConfig,
                    startTime: Date.now(),
                    currentFundingRate: opportunity.fundingRate,
                    totalEarnings: 0,
                    status: 'active'
                });
                
                this.addAlert('success', `Auto-launched ${opportunity.symbol} ${strategy} bot`);
                
                return {
                    action: 'launch',
                    result: 'success',
                    bot: botConfig,
                    opportunity
                };
            } else {
                throw new Error(launchResult.error || 'Launch failed');
            }
            
        } catch (error) {
            console.error(`❌ Auto-launch failed for ${opportunity.symbol}:`, error.message);
            this.addAlert('error', `Auto-launch failed: ${opportunity.symbol} - ${error.message}`);
            
            return {
                action: 'launch',
                result: 'failed',
                error: error.message,
                opportunity
            };
        }
    }
    
    async executeLaunch(botConfig) {
        try {
            // Use the integrated auto-launch script for better control
            const { autoLaunchOpportunity } = require('./auto-launch-integration.js');
            const result = await autoLaunchOpportunity(
                botConfig.symbol,
                botConfig.investment,
                botConfig.leverage
            );
            
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // ==========================================
    // PORTFOLIO MANAGEMENT
    // ==========================================
    
    startPortfolioManager() {
        const interval = setInterval(async () => {
            try {
                await this.rebalancePortfolio();
            } catch (error) {
                this.addAlert('error', `Portfolio rebalance failed: ${error.message}`);
            }
        }, this.config.intervals.portfolioRebalance);
        
        this.intervals.set('portfolioManager', interval);
        console.log('💼 Portfolio manager started');
    }
    
    async rebalancePortfolio() {
        if (this.state.activeBots.size < 2) {
            return { action: 'rebalance', result: 'insufficient_bots' };
        }
        
        // Get current performance of all bots
        const botPerformances = [];
        
        for (const [botId, bot] of this.state.activeBots) {
            const performance = await this.getBotPerformance(bot);
            botPerformances.push({
                botId,
                bot,
                performance,
                score: performance.fundingRateScore + performance.pnlScore
            });
        }
        
        // Sort by performance (worst first)
        botPerformances.sort((a, b) => a.score - b.score);
        
        // Check if worst bot should be replaced
        const worstBot = botPerformances[0];
        const bestBot = botPerformances[botPerformances.length - 1];
        
        // If performance gap is significant, consider rebalancing
        const performanceGap = (bestBot.score - worstBot.score) / bestBot.score;
        
        if (performanceGap > this.config.portfolio.rebalanceThreshold) {
            // Look for better opportunity than worst bot
            const opportunities = await this.getOpportunities();
            const betterOpportunities = opportunities.filter(opp => 
                Math.abs(opp.fundingRate) > Math.abs(worstBot.bot.currentFundingRate || 0) * 1.25
            );
            
            if (betterOpportunities.length > 0) {
                console.log('🔄 Portfolio rebalancing triggered');
                console.log(`   Closing: ${worstBot.bot.symbol} (score: ${worstBot.score.toFixed(2)})`);
                console.log(`   Opening: ${betterOpportunities[0].symbol} (rate: ${(betterOpportunities[0].fundingRate * 100).toFixed(4)}%)`);
                
                // Close worst bot
                await this.closeBotPosition(worstBot.botId);
                
                // Launch better opportunity
                await this.autoLaunchBot(betterOpportunities[0]);
                
                this.addAlert('info', `Rebalanced: ${worstBot.bot.symbol} → ${betterOpportunities[0].symbol}`);
                
                return {
                    action: 'rebalance',
                    result: 'executed',
                    closed: worstBot.bot.symbol,
                    opened: betterOpportunities[0].symbol
                };
            }
        }
        
        return { action: 'rebalance', result: 'no_action_needed' };
    }
    
    // ==========================================
    // HEALTH MONITORING
    // ==========================================
    
    startHealthMonitor() {
        const interval = setInterval(async () => {
            try {
                await this.healthCheck();
            } catch (error) {
                this.addAlert('error', `Health check failed: ${error.message}`);
            }
        }, this.config.intervals.healthCheck);
        
        this.intervals.set('healthMonitor', interval);
        console.log('🏥 Health monitor started');
    }
    
    async healthCheck() {
        const issues = [];
        
        // Check each active bot
        for (const [botId, bot] of this.state.activeBots) {
            try {
                const health = await this.checkBotHealth(bot);
                
                if (!health.healthy) {
                    issues.push({
                        botId,
                        symbol: bot.symbol,
                        issues: health.issues
                    });
                }
                
                // Update bot state
                this.state.activeBots.set(botId, {
                    ...bot,
                    lastHealthCheck: Date.now(),
                    health: health.status
                });
                
            } catch (error) {
                issues.push({
                    botId,
                    symbol: bot.symbol,
                    issues: [`Health check failed: ${error.message}`]
                });
            }
        }
        
        // Report issues
        if (issues.length > 0) {
            console.log(`⚠️ Health issues detected in ${issues.length} bots:`);
            issues.forEach(issue => {
                console.log(`   ${issue.symbol}: ${issue.issues.join(', ')}`);
            });
            
            this.addAlert('warning', `Health issues in ${issues.length} bots`);
        }
        
        return { action: 'health_check', issues };
    }
    
    async checkBotHealth(bot) {
        const health = { healthy: true, issues: [], status: 'healthy' };
        
        try {
            // Check if positions still exist
            const positions = await this.client.futuresPositionRisk();
            const spotAccount = await this.client.accountInfo();
            
            const baseAsset = bot.symbol.replace('USDT', '');
            const futuresPos = positions.find(p => p.symbol === bot.symbol && parseFloat(p.positionAmt) !== 0);
            const spotBalance = spotAccount.balances.find(b => b.asset === baseAsset);
            
            // Validate positions match expected strategy
            if (bot.strategyType === 'Short Perp') {
                if (!futuresPos || parseFloat(futuresPos.positionAmt) >= 0) {
                    health.healthy = false;
                    health.issues.push('Missing or incorrect futures short position');
                }
                if (!spotBalance || parseFloat(spotBalance.free) + parseFloat(spotBalance.locked) <= 0) {
                    health.healthy = false;
                    health.issues.push('Missing spot balance');
                }
            }
            
            // Check funding rate hasn't flipped significantly
            const fundingData = await this.client.futuresMarkPrice();
            const currentFunding = fundingData.find(f => f.symbol === bot.symbol);
            
            if (currentFunding) {
                const currentRate = parseFloat(currentFunding.lastFundingRate);
                const expectedRate = bot.expectedFunding;
                
                // If funding rate flipped sign or decreased significantly
                if (Math.sign(currentRate) !== Math.sign(expectedRate) || 
                    Math.abs(currentRate) < Math.abs(expectedRate) * 0.3) {
                    health.issues.push('Funding rate significantly changed');
                }
                
                // Update current rate
                bot.currentFundingRate = currentRate;
            }
            
        } catch (error) {
            health.healthy = false;
            health.issues.push(`Health check error: ${error.message}`);
        }
        
        if (!health.healthy) {
            health.status = 'unhealthy';
        }
        
        return health;
    }
    
    // ==========================================
    // RISK MANAGEMENT
    // ==========================================
    
    startRiskManager() {
        const interval = setInterval(async () => {
            try {
                await this.riskCheck();
            } catch (error) {
                this.addAlert('error', `Risk check failed: ${error.message}`);
            }
        }, this.config.intervals.riskCheck);
        
        this.intervals.set('riskManager', interval);
        console.log('🛡️ Risk manager started');
    }
    
    async riskCheck() {
        const actions = [];
        
        for (const [botId, bot] of this.state.activeBots) {
            try {
                const risk = await this.assessBotRisk(bot);
                
                if (risk.shouldClose) {
                    console.log(`🚨 RISK: Closing ${bot.symbol} - ${risk.reason}`);
                    await this.closeBotPosition(botId);
                    actions.push({
                        action: 'close',
                        botId,
                        symbol: bot.symbol,
                        reason: risk.reason
                    });
                    
                    this.addAlert('warning', `Risk closure: ${bot.symbol} - ${risk.reason}`);
                }
                
            } catch (error) {
                console.error(`Risk check failed for ${bot.symbol}:`, error.message);
            }
        }
        
        return { action: 'risk_check', actions };
    }
    
    async assessBotRisk(bot) {
        const risk = { shouldClose: false, reason: null, level: 'low' };
        
        try {
            // Check position P&L
            const positions = await this.client.futuresPositionRisk();
            const position = positions.find(p => p.symbol === bot.symbol && parseFloat(p.positionAmt) !== 0);
            
            if (position) {
                const pnl = parseFloat(position.unrealizedProfit);
                const investment = bot.investment;
                const pnlPercent = pnl / investment;
                
                // Check max drawdown
                if (pnlPercent < -this.config.risk.maxDrawdown) {
                    risk.shouldClose = true;
                    risk.reason = `Max drawdown exceeded: ${(pnlPercent * 100).toFixed(2)}%`;
                    return risk;
                }
                
                // Check profit target
                if (pnlPercent > this.config.risk.profitTarget) {
                    risk.shouldClose = true;
                    risk.reason = `Profit target reached: ${(pnlPercent * 100).toFixed(2)}%`;
                    return risk;
                }
            }
            
            // Check position age
            const ageHours = (Date.now() - bot.startTime) / (1000 * 60 * 60);
            if (ageHours > this.config.risk.stalePositionHours) {
                risk.shouldClose = true;
                risk.reason = `Position too old: ${ageHours.toFixed(1)}h`;
                return risk;
            }
            
            // Check funding rate reversal
            if (bot.currentFundingRate && bot.expectedFunding) {
                if (Math.sign(bot.currentFundingRate) !== Math.sign(bot.expectedFunding)) {
                    risk.shouldClose = true;
                    risk.reason = 'Funding rate reversed sign';
                    return risk;
                }
            }
            
        } catch (error) {
            risk.level = 'high';
            console.error(`Risk assessment failed for ${bot.symbol}:`, error.message);
        }
        
        return risk;
    }
    
    // ==========================================
    // UTILITY METHODS
    // ==========================================
    
    async getOpportunities() {
        try {
            const response = await axios.get('http://localhost:3001/api/v1/arbitrage-opportunities');
            if (response.data.success && response.data.opportunities) {
                return response.data.opportunities;
            }
            return [];
        } catch (error) {
            console.error('Failed to get opportunities:', error.message);
            
            // Fallback: get opportunities directly from Binance
            try {
                const mp = await this.client.futuresMarkPrice();
                const top = mp.filter(m => m.symbol.endsWith('USDT')).map(m => ({ 
                    symbol: m.symbol, 
                    fundingRate: parseFloat(m.lastFundingRate), 
                    liquidity: 5000000, 
                    annualizedRate: ((parseFloat(m.lastFundingRate) * 3 * 365) * 100).toFixed(2) 
                })).sort((a,b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate)).slice(0,5);
                if (top.length) return top;
            } catch (fallbackError) {
                console.error('Fallback opportunities also failed:', fallbackError.message);
            }
            
            return [];
        }
    }
    
    async getBotPerformance(bot) {
        try {
            // Simple performance scoring
            const fundingRateScore = Math.abs(bot.currentFundingRate || bot.expectedFunding || 0) * 1000;
            
            // Get P&L if available
            let pnlScore = 0;
            try {
                const positions = await this.client.futuresPositionRisk();
                const position = positions.find(p => p.symbol === bot.symbol && parseFloat(p.positionAmt) !== 0);
                if (position) {
                    pnlScore = parseFloat(position.unrealizedProfit) / bot.investment * 100;
                }
            } catch (error) {
                // PnL not available, use funding rate only
            }
            
            return {
                fundingRateScore,
                pnlScore,
                totalScore: fundingRateScore + pnlScore,
                age: Date.now() - bot.startTime
            };
        } catch (error) {
            return { fundingRateScore: 0, pnlScore: 0, totalScore: 0, age: 0 };
        }
    }
    
    async closeBotPosition(botId) {
        const bot = this.state.activeBots.get(botId);
        if (!bot) return;
        
        try {
            console.log(`🔄 Closing position for ${bot.symbol}...`);
            
            // Close futures position
            const positions = await this.client.futuresPositionRisk();
            const position = positions.find(p => p.symbol === bot.symbol && parseFloat(p.positionAmt) !== 0);
            
            if (position) {
                const quantity = Math.abs(parseFloat(position.positionAmt));
                const side = parseFloat(position.positionAmt) > 0 ? 'SELL' : 'BUY';
                
                await this.client.futuresOrder({
                    symbol: bot.symbol,
                    side,
                    type: 'MARKET',
                    quantity: quantity.toString()
                });
                
                console.log(`   ✅ Closed futures position: ${side} ${quantity} ${bot.symbol}`);
            }
            
            // Sell spot balance
            const account = await this.client.accountInfo();
            const baseAsset = bot.symbol.replace('USDT', '');
            const spotBalance = account.balances.find(b => b.asset === baseAsset);
            
            if (spotBalance && parseFloat(spotBalance.free) > 0) {
                await this.client.order({
                    symbol: bot.symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: spotBalance.free
                });
                
                console.log(`   ✅ Sold spot balance: ${spotBalance.free} ${baseAsset}`);
            }
            
            // Remove from our tracking
            this.state.activeBots.delete(botId);
            
            console.log(`✅ Successfully closed ${bot.symbol} bot`);
            
        } catch (error) {
            console.error(`❌ Failed to close ${bot.symbol} position:`, error.message);
            throw error;
        }
    }
    
    async runScript(scriptName, args = []) {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const process = spawn('node', [scriptName, ...args], { 
                stdio: 'pipe',
                cwd: __dirname 
            });
            
            let output = '';
            let error = '';
            
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(error || `Script exited with code ${code}`));
                }
            });
        });
    }
    
    addAlert(type, message) {
        const alert = {
            type,
            message,
            timestamp: new Date().toISOString(),
            id: Date.now().toString()
        };
        
        this.state.alerts.unshift(alert);
        
        // Keep only last 100 alerts
        if (this.state.alerts.length > 100) {
            this.state.alerts.pop();
        }
        
        // Log important alerts
        if (type === 'error' || type === 'warning') {
            console.log(`🚨 ${type.toUpperCase()}: ${message}`);
        }
    }
    
    logStatus() {
        console.log('\n📊 AUTOMATION ENGINE STATUS');
        console.log('════════════════════════════');
        console.log(`🤖 Active Bots: ${this.state.activeBots.size}/${this.config.autoLaunch.maxConcurrentBots}`);
        console.log(`💼 Total Capital: $${this.config.portfolio.totalCapital}`);
        console.log(`⚡ Auto-Launch: ${this.config.autoLaunch.enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🔍 Scanning every: ${this.config.intervals.opportunityCheck/1000}s`);
        console.log(`🚨 Recent Alerts: ${this.state.alerts.slice(0, 3).length}`);
        
        if (this.state.activeBots.size > 0) {
            console.log('\n🤖 Active Bots:');
            for (const [botId, bot] of this.state.activeBots) {
                const age = ((Date.now() - bot.startTime) / (1000 * 60 * 60)).toFixed(1);
                console.log(`   ${bot.symbol} ${bot.strategyType} - ${age}h old`);
            }
        }
        console.log('');
    }
    
    // Status API for external monitoring
    getStatus() {
        return {
            isRunning: this.isRunning,
            config: this.config,
            state: {
                activeBots: [...this.state.activeBots.values()],
                opportunities: this.state.opportunities.slice(0, 5),
                recentAlerts: this.state.alerts.slice(0, 10),
                performance: this.state.performance
            }
        };
    }
}

// Export for external use
module.exports = AutomationEngine;

// CLI usage
if (require.main === module) {
    const engine = new AutomationEngine();
    
    const command = process.argv[2] || 'start';
    
    switch (command) {
        case 'start':
            engine.start();
            break;
        case 'stop':
            engine.stop();
            process.exit(0);
        case 'status':
            console.log(JSON.stringify(engine.getStatus(), null, 2));
            break;
        default:
            console.log('Usage: node automation-engine.js [start|stop|status]');
            console.log('  start  - Start the automation engine');
            console.log('  stop   - Stop the automation engine');
            console.log('  status - Show current status');
            break;
    }
}
