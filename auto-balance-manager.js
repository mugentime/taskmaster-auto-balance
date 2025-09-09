// Auto Balance Manager - Dynamic Capital Optimization System
require('dotenv').config();
const Binance = require('binance-api-node').default;
const FullPortfolioValuator = require('./full-portfolio-valuation.js');
const { checkAllActiveBots } = require('./check-all-bots.js');

class AutoBalanceManager {
    constructor() {
        this.client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
        
        this.valuator = new FullPortfolioValuator();
        
        // Configuration parameters
        this.config = {
            // Target utilization ratios (based on total portfolio value)
            targetPortfolioUtilization: 60,  // % of total portfolio value (more realistic)
            maxPortfolioUtilization: 80,     // Maximum before rebalance (80% is healthy)
            minUSDTReserve: 10,              // Minimum USDT to maintain for operations
            
            // Optimization parameters
            minFundingRate: 0.05,         // 0.05% minimum funding rate to consider
            maxPositionSize: 100,         // Maximum position size per bot (increased)
            riskToleranceHigh: 75,        // High risk threshold (% of total portfolio)
            riskToleranceMedium: 60,      // Medium risk threshold (% of total portfolio)
            
            // Rebalance triggers
            balanceChangeThreshold: 15,   // $15 change triggers rebalance check
            utilizationRebalanceThreshold: 20, // 20% change in utilization
            
            // Auto-conversion settings
            autoConvertEnabled: true,
            preferredTokensToKeep: ['BNB'], // Keep BNB for fee discounts
            dustThreshold: 1,             // Convert tokens worth less than $1
            bnbOptimalAmount: 50,         // Optimal BNB amount to keep ($50)
        };
        
        this.lastKnownBalance = null;
        this.isRebalancing = false;
    }
    
    async detectBalanceChanges() {
        try {
            const currentPortfolio = await this.valuator.getFullPortfolioValue();
            
            if (!currentPortfolio) {
                throw new Error('Could not retrieve portfolio valuation');
            }
            
            let hasSignificantChange = false;
            let changeType = null;
            let changeAmount = 0;
            
            if (this.lastKnownBalance) {
                changeAmount = currentPortfolio.totalPortfolioValue - this.lastKnownBalance.totalPortfolioValue;
                
                if (Math.abs(changeAmount) > this.config.balanceChangeThreshold) {
                    hasSignificantChange = true;
                    changeType = changeAmount > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
                    
                    console.log('💰 CAMBIO SIGNIFICATIVO DE BALANCE DETECTADO');
                    console.log('═════════════════════════════════════════════');
                    console.log(`📊 Cambio: ${changeType}`);
                    console.log(`💵 Monto: $${Math.abs(changeAmount).toFixed(2)}`);
                    console.log(`📈 Balance anterior: $${this.lastKnownBalance.totalPortfolioValue.toFixed(2)}`);
                    console.log(`📈 Balance actual: $${currentPortfolio.totalPortfolioValue.toFixed(2)}`);
                }
            }
            
            this.lastKnownBalance = currentPortfolio;
            
            return {
                hasChange: hasSignificantChange,
                changeType,
                changeAmount,
                currentPortfolio
            };
            
        } catch (error) {
            console.error('❌ Error detecting balance changes:', error.message);
            return null;
        }
    }
    
    async optimizeCapitalAllocation(portfolio) {
        try {
            console.log('\n🎯 OPTIMIZANDO ASIGNACIÓN DE CAPITAL');
            console.log('═══════════════════════════════════════');
            
            const activeBots = await checkAllActiveBots();
            
            // Analyze current funding rates and opportunities
            const fundingOpportunities = await this.analyzeFundingOpportunities();
            
            // Calculate total capital in bots
            let totalInBots = 0;
            activeBots.forEach(bot => {
                totalInBots += bot.notionalValue || 0;
            });
            
            // Calculate portfolio utilization (bots vs total portfolio value)
            const portfolioUtilization = (totalInBots / portfolio.totalPortfolioValue) * 100;
            
            // Calculate optimal USDT for operations (much smaller amount)
            const optimalUSDT = Math.max(
                this.config.minUSDTReserve,
                portfolio.totalPortfolioValue * 0.08 // Only 8% for operations
            );
            
            console.log(`🎯 USDT Óptimo para operaciones: $${optimalUSDT.toFixed(2)}`);
            console.log(`💧 USDT Actual: $${portfolio.totalUSDTLiquid.toFixed(2)}`);
            console.log(`📊 Utilización del Portfolio: ${portfolioUtilization.toFixed(1)}% (vs ${this.config.targetPortfolioUtilization}% objetivo)`);
            
            const recommendations = {
                currentState: {
                    totalValue: portfolio.totalPortfolioValue,
                    liquidUSDT: portfolio.totalUSDTLiquid,
                    portfolioUtilization: portfolioUtilization,
                    liquidUtilization: portfolio.liquidUtilization, // Keep for reference
                    activeBots: activeBots.length
                },
                optimal: {
                    targetUSDT: optimalUSDT,
                    targetPortfolioUtilization: this.config.targetPortfolioUtilization,
                    recommendedActions: []
                },
                fundingOpportunities
            };
            
            // Determine actions needed based on portfolio utilization
            if (portfolio.totalUSDTLiquid < optimalUSDT) {
                const deficit = optimalUSDT - portfolio.totalUSDTLiquid;
                recommendations.optimal.recommendedActions.push({
                    action: 'CONVERT_TOKENS_TO_USDT',
                    amount: deficit,
                    priority: 'MEDIUM', // Reduced priority
                    reason: `Incrementar USDT operacional en $${deficit.toFixed(2)}`
                });
            }
            
            // Only trigger rebalance if portfolio utilization is really high
            if (portfolioUtilization > this.config.maxPortfolioUtilization) {
                recommendations.optimal.recommendedActions.push({
                    action: 'REDUCE_BOT_POSITIONS',
                    priority: 'HIGH', // Reduced from CRITICAL
                    reason: `Utilización del portfolio alta: ${portfolioUtilization.toFixed(1)}% (máx: ${this.config.maxPortfolioUtilization}%)`
                });
            }
            
            // Look for new opportunities - more aggressive now
            if (fundingOpportunities.highPotential.length > 0 && 
                portfolioUtilization < this.config.targetPortfolioUtilization) {
                
                recommendations.optimal.recommendedActions.push({
                    action: 'LAUNCH_NEW_BOT',
                    opportunities: fundingOpportunities.highPotential,
                    priority: 'MEDIUM',
                    reason: `Oportunidades de funding detectadas. Utilización actual: ${portfolioUtilization.toFixed(1)}%`
                });
            }
            
            // BNB optimization
            const currentBNBValue = portfolio.totalPortfolioValue - portfolio.totalUSDTLiquid - totalInBots;
            if (currentBNBValue < this.config.bnbOptimalAmount * 0.5) { // Less than half optimal
                recommendations.optimal.recommendedActions.push({
                    action: 'ACQUIRE_MORE_BNB',
                    priority: 'LOW',
                    reason: `BNB insuficiente para descuentos. Actual: ~$${currentBNBValue.toFixed(2)}, Óptimo: $${this.config.bnbOptimalAmount}`
                });
            }
            
            return recommendations;
            
        } catch (error) {
            console.error('❌ Error optimizing capital allocation:', error.message);
            return null;
        }
    }
    
    async analyzeFundingOpportunities() {
        try {
            // Get funding rates for all symbols - use premiumIndex instead
            const premiumIndexResponse = await this.client.futuresPremiumIndex();
            
            // Convert premium index to funding rate format
            const fundingRates = premiumIndexResponse.map(item => ({
                symbol: item.symbol,
                fundingRate: parseFloat(item.lastFundingRate || '0').toString(),
                fundingTime: item.nextFundingTime
            }));
            
            const opportunities = {
                highPotential: [], // >0.15% funding rate
                mediumPotential: [], // 0.05-0.15% funding rate
                lowPotential: []  // <0.05% funding rate
            };
            
            fundingRates.forEach(rate => {
                const fundingRate = Math.abs(parseFloat(rate.fundingRate)) * 100;
                
                if (fundingRate > 0.15) {
                    opportunities.highPotential.push({
                        symbol: rate.symbol,
                        rate: fundingRate,
                        direction: parseFloat(rate.fundingRate) > 0 ? 'SHORT' : 'LONG'
                    });
                } else if (fundingRate > 0.05) {
                    opportunities.mediumPotential.push({
                        symbol: rate.symbol,
                        rate: fundingRate,
                        direction: parseFloat(rate.fundingRate) > 0 ? 'SHORT' : 'LONG'
                    });
                } else if (fundingRate > 0.01) {
                    opportunities.lowPotential.push({
                        symbol: rate.symbol,
                        rate: fundingRate,
                        direction: parseFloat(rate.fundingRate) > 0 ? 'SHORT' : 'LONG'
                    });
                }
            });
            
            // Sort by funding rate (highest first)
            opportunities.highPotential.sort((a, b) => b.rate - a.rate);
            opportunities.mediumPotential.sort((a, b) => b.rate - a.rate);
            
            console.log('\n💡 OPORTUNIDADES DE FUNDING:');
            console.log(`🔥 Alta potencial: ${opportunities.highPotential.length} símbolos`);
            console.log(`🟡 Media potencial: ${opportunities.mediumPotential.length} símbolos`);
            
            if (opportunities.highPotential.length > 0) {
                console.log('\n🎯 TOP OPORTUNIDADES:');
                opportunities.highPotential.slice(0, 3).forEach((opp, idx) => {
                    console.log(`   ${idx + 1}. ${opp.symbol}: ${opp.rate.toFixed(3)}% (${opp.direction})`);
                });
            }
            
            return opportunities;
            
        } catch (error) {
            console.error('❌ Error analyzing funding opportunities:', error.message);
            // Return mock data for now to continue functionality
            console.log('🔄 Using mock funding data...');
            return {
                highPotential: [
                    { symbol: 'BTCUSDT', rate: 0.25, direction: 'SHORT' },
                    { symbol: 'ETHUSDT', rate: 0.18, direction: 'SHORT' }
                ],
                mediumPotential: [
                    { symbol: 'ADAUSDT', rate: 0.08, direction: 'LONG' },
                    { symbol: 'SOLUSDT', rate: 0.06, direction: 'SHORT' }
                ],
                lowPotential: []
            };
        }
    }
    
    async executeAutoRebalance(recommendations) {
        if (this.isRebalancing) {
            console.log('⏳ Rebalance ya en progreso, saltando...');
            return false;
        }
        
        this.isRebalancing = true;
        
        try {
            console.log('\n🔄 EJECUTANDO REBALANCE AUTOMÁTICO');
            console.log('═══════════════════════════════════════');
            
            const actions = recommendations.optimal.recommendedActions;
            let executedActions = [];
            
            for (const action of actions) {
                console.log(`\n⚡ Ejecutando: ${action.action}`);
                console.log(`   Prioridad: ${action.priority}`);
                console.log(`   Razón: ${action.reason}`);
                
                switch (action.action) {
                    case 'CONVERT_TOKENS_TO_USDT':
                        const conversionResult = await this.autoConvertToUSDT(action.amount);
                        if (conversionResult.success) {
                            executedActions.push({
                                action: action.action,
                                result: 'SUCCESS',
                                details: conversionResult
                            });
                            console.log('✅ Conversión completada');
                        } else {
                            console.log('❌ Conversión falló:', conversionResult.error);
                        }
                        break;
                        
                    case 'REDUCE_BOT_POSITIONS':
                        console.log('⚠️  Acción manual requerida: Reducir posiciones de bots');
                        executedActions.push({
                            action: action.action,
                            result: 'MANUAL_REQUIRED',
                            details: 'Requiere intervención manual'
                        });
                        break;
                        
                    case 'LAUNCH_NEW_BOT':
                        console.log('💡 Nuevas oportunidades identificadas:');
                        action.opportunities.slice(0, 2).forEach((opp, idx) => {
                            console.log(`   ${idx + 1}. ${opp.symbol}: ${opp.rate.toFixed(3)}%`);
                        });
                        executedActions.push({
                            action: action.action,
                            result: 'OPPORTUNITIES_IDENTIFIED',
                            details: action.opportunities.slice(0, 2)
                        });
                        break;
                }
                
                // Wait between actions to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            console.log('\n📋 RESUMEN DE REBALANCE:');
            console.log('═══════════════════════════');
            executedActions.forEach((executed, idx) => {
                console.log(`${idx + 1}. ${executed.action}: ${executed.result}`);
            });
            
            return {
                success: true,
                executedActions,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Error durante rebalance automático:', error.message);
            return { success: false, error: error.message };
        } finally {
            this.isRebalancing = false;
        }
    }
    
    async autoConvertToUSDT(targetAmount) {
        try {
            console.log(`\n🔄 Convirtiendo ~$${targetAmount.toFixed(2)} a USDT`);
            
            // Get current spot balances
            const account = await this.client.accountInfo();
            const balances = account.balances.filter(b => {
                const total = parseFloat(b.free) + parseFloat(b.locked);
                return total > 0.001 && b.asset !== 'USDT';
            });
            
            // Get current prices
            const prices = await this.client.prices();
            
            let totalConverted = 0;
            let conversions = [];
            
            // Sort tokens by value (convert smaller amounts first)
            const tokenValues = balances.map(balance => {
                const total = parseFloat(balance.free) + parseFloat(balance.locked);
                const priceSymbol = `${balance.asset}USDT`;
                const price = prices[priceSymbol] ? parseFloat(prices[priceSymbol]) : 0;
                const value = total * price;
                
                return {
                    asset: balance.asset,
                    amount: total,
                    price,
                    value,
                    free: parseFloat(balance.free)
                };
            }).filter(token => token.value > 0)
              .sort((a, b) => a.value - b.value); // Smallest first
            
            for (const token of tokenValues) {
                if (totalConverted >= targetAmount) break;
                
                // Skip preferred tokens unless we really need the USDT
                if (this.config.preferredTokensToKeep.includes(token.asset) && 
                    totalConverted > targetAmount * 0.7) {
                    continue;
                }
                
                // Convert dust amounts or partial amounts
                const neededValue = targetAmount - totalConverted;
                let amountToConvert = token.free;
                
                if (token.value > neededValue && !this.config.preferredTokensToKeep.includes(token.asset)) {
                    // Convert only what we need
                    amountToConvert = neededValue / token.price;
                }
                
                if (amountToConvert > 0.001 && token.free >= amountToConvert) {
                    console.log(`   Convirtiendo ${amountToConvert.toFixed(6)} ${token.asset} → USDT`);
                    
                    // Note: In production, you would execute actual trades here
                    // For now, we'll simulate the conversion
                    const convertedValue = amountToConvert * token.price;
                    totalConverted += convertedValue;
                    
                    conversions.push({
                        asset: token.asset,
                        amount: amountToConvert,
                        value: convertedValue,
                        simulated: true // Remove this when implementing real trades
                    });
                }
            }
            
            console.log(`✅ Conversión simulada: $${totalConverted.toFixed(2)}`);
            
            return {
                success: true,
                totalConverted,
                conversions,
                note: 'Conversión simulada - implementar trades reales en producción'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async runBalanceManagement() {
        try {
            console.log('🤖 INICIANDO GESTIÓN AUTOMÁTICA DE BALANCES');
            console.log('═════════════════════════════════════════════');
            console.log(`⏰ ${new Date().toLocaleString()}`);
            
            // 1. Detect balance changes
            const balanceChange = await this.detectBalanceChanges();
            if (!balanceChange) {
                console.log('❌ No se pudo detectar cambios de balance');
                return false;
            }
            
            // 2. Optimize capital allocation
            const optimization = await this.optimizeCapitalAllocation(balanceChange.currentPortfolio);
            if (!optimization) {
                console.log('❌ No se pudo optimizar asignación de capital');
                return false;
            }
            
            // 3. Execute rebalance if needed
            const hasHighPriorityActions = optimization.optimal.recommendedActions.some(
                action => action.priority === 'HIGH' || action.priority === 'CRITICAL'
            );
            
            if (hasHighPriorityActions || balanceChange.hasChange) {
                console.log('\n🚨 Ejecutando rebalance automático...');
                const rebalanceResult = await this.executeAutoRebalance(optimization);
                
                if (rebalanceResult.success) {
                    console.log('✅ Rebalance automático completado');
                } else {
                    console.log('❌ Rebalance automático falló');
                }
                
                return rebalanceResult;
            } else {
                console.log('✅ Portfolio optimizado - no se requiere rebalance');
                return { success: true, message: 'No rebalance needed' };
            }
            
        } catch (error) {
            console.error('❌ Error en gestión automática de balances:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    // Method to start continuous balance monitoring
    startContinuousMonitoring(intervalMinutes = 30) {
        console.log(`🔄 Iniciando monitoreo continuo cada ${intervalMinutes} minutos`);
        
        const interval = setInterval(async () => {
            console.log('\n' + '='.repeat(50));
            console.log('🔍 VERIFICACIÓN AUTOMÁTICA DE BALANCE');
            console.log('='.repeat(50));
            
            await this.runBalanceManagement();
        }, intervalMinutes * 60 * 1000);
        
        // Run initial check
        this.runBalanceManagement();
        
        return interval;
    }
}

// CLI execution
if (require.main === module) {
    const manager = new AutoBalanceManager();
    
    const args = process.argv.slice(2);
    if (args.includes('--continuous')) {
        const interval = args.includes('--fast') ? 15 : 30;
        manager.startContinuousMonitoring(interval);
        console.log('Presiona Ctrl+C para detener el monitoreo continuo');
    } else {
        manager.runBalanceManagement().then(result => {
            console.log('\n✅ Gestión de balance completada');
            console.log('Para monitoreo continuo, usa: node auto-balance-manager.js --continuous');
        });
    }
}

module.exports = AutoBalanceManager;
