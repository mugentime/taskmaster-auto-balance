// Portfolio Management Analysis - Current State Review
require('dotenv').config();
const Binance = require('binance-api-node').default;

class PortfolioAnalyzer {
    constructor() {
        this.client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
    }
    
    async analyzeCurrentPortfolio() {
        console.log('📊 ANÁLISIS COMPLETO DE CARTERA TASKMASTER');
        console.log('═══════════════════════════════════════════');
        
        try {
            // 1. BALANCES ACTUALES
            console.log('\n💰 STEP 1: BALANCES ACTUALES');
            console.log('────────────────────────────');
            const balances = await this.getDetailedBalances();
            
            // 2. POSICIONES ACTIVAS
            console.log('\n🤖 STEP 2: ANÁLISIS DE BOTS ACTIVOS');
            console.log('──────────────────────────────────');
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            // 3. CAPITAL UTILIZADO vs DISPONIBLE
            console.log('\n📈 STEP 3: USO DE CAPITAL');
            console.log('─────────────────────────');
            const capitalAnalysis = this.analyzeCapitalUsage(balances, activeBots);
            
            // 4. DIVERSIFICACIÓN
            console.log('\n🎯 STEP 4: DIVERSIFICACIÓN');
            console.log('─────────────────────────');
            this.analyzeDiversification(activeBots);
            
            // 5. RIESGO ACTUAL
            console.log('\n⚠️  STEP 5: ANÁLISIS DE RIESGO');
            console.log('─────────────────────────────');
            await this.analyzeRisk(activeBots);
            
            // 6. CONFIGURACIÓN DE AUTOMATIZACIÓN
            console.log('\n⚙️  STEP 6: CONFIGURACIÓN AUTOMÁTICA');
            console.log('───────────────────────────────────');
            this.analyzeAutomationConfig();
            
            // 7. RECOMENDACIONES
            console.log('\n💡 STEP 7: RECOMENDACIONES');
            console.log('─────────────────────────');
            this.generateRecommendations(balances, activeBots, capitalAnalysis);
            
        } catch (error) {
            console.error('❌ Error en análisis:', error.message);
        }
    }
    
    async getDetailedBalances() {
        // Spot balances
        const spotAccount = await this.client.accountInfo();
        const spotBalances = spotAccount.balances.filter(b => {
            const total = parseFloat(b.free) + parseFloat(b.locked);
            return total > 0.001; // Filter dust
        });
        
        // Futures balances
        const futuresAccount = await this.client.futuresAccountInfo();
        const futuresBalances = futuresAccount.assets.filter(a => 
            parseFloat(a.walletBalance) > 0.001
        );
        
        console.log('🏦 SPOT WALLET:');
        let totalSpotUSDT = 0;
        spotBalances.forEach(balance => {
            const total = parseFloat(balance.free) + parseFloat(balance.locked);
            console.log(`   ${balance.asset}: ${total.toFixed(4)} (Free: ${balance.free}, Locked: ${balance.locked})`);
            if (balance.asset === 'USDT') {
                totalSpotUSDT = total;
            }
        });
        
        console.log('\n🚀 FUTURES WALLET:');
        let totalFuturesUSDT = 0;
        futuresBalances.forEach(asset => {
            const balance = parseFloat(asset.walletBalance);
            console.log(`   ${asset.asset}: ${balance.toFixed(4)}`);
            if (asset.asset === 'USDT') {
                totalFuturesUSDT = balance;
            }
        });
        
        const totalUSDT = totalSpotUSDT + totalFuturesUSDT;
        console.log(`\n💵 TOTAL DISPONIBLE: $${totalUSDT.toFixed(2)} USDT`);
        
        return {
            spot: spotBalances,
            futures: futuresBalances,
            totalUSDT,
            spotUSDT: totalSpotUSDT,
            futuresUSDT: totalFuturesUSDT
        };
    }
    
    analyzeCapitalUsage(balances, activeBots) {
        const totalCapital = balances.totalUSDT;
        
        // Calculate capital used in bots
        let usedCapital = 0;
        activeBots.forEach(bot => {
            usedCapital += bot.notionalValue || 0;
        });
        
        const availableCapital = totalCapital - usedCapital;
        const utilizationRate = (usedCapital / totalCapital) * 100;
        
        console.log(`💰 Capital Total: $${totalCapital.toFixed(2)}`);
        console.log(`🤖 Capital en Bots: $${usedCapital.toFixed(2)}`);
        console.log(`💸 Capital Libre: $${availableCapital.toFixed(2)}`);
        console.log(`📊 Tasa de Utilización: ${utilizationRate.toFixed(1)}%`);
        
        // Risk assessment based on utilization
        if (utilizationRate > 90) {
            console.log('🚨 RIESGO ALTO: >90% del capital en uso');
        } else if (utilizationRate > 70) {
            console.log('⚠️  RIESGO MEDIO: >70% del capital en uso');
        } else {
            console.log('✅ RIESGO BAJO: <70% del capital en uso');
        }
        
        return {
            totalCapital,
            usedCapital,
            availableCapital,
            utilizationRate
        };
    }
    
    analyzeDiversification(activeBots) {
        if (activeBots.length === 0) {
            console.log('❌ No hay bots activos');
            return;
        }
        
        // Group by asset
        const assetGroups = {};
        let totalNotional = 0;
        
        activeBots.forEach(bot => {
            const asset = bot.baseAsset || bot.symbol.replace('USDT', '');
            if (!assetGroups[asset]) {
                assetGroups[asset] = {
                    count: 0,
                    notional: 0,
                    fundingRate: 0
                };
            }
            assetGroups[asset].count += 1;
            assetGroups[asset].notional += bot.notionalValue || 0;
            assetGroups[asset].fundingRate = bot.fundingRate || 0;
            totalNotional += bot.notionalValue || 0;
        });
        
        console.log(`🎯 Activos Diferentes: ${Object.keys(assetGroups).length}`);
        console.log(`🤖 Total Bots: ${activeBots.length}`);
        
        Object.keys(assetGroups).forEach(asset => {
            const group = assetGroups[asset];
            const percentage = (group.notional / totalNotional) * 100;
            console.log(`   ${asset}: ${group.count} bots, $${group.notional.toFixed(2)} (${percentage.toFixed(1)}%)`);
        });
        
        // Diversification score
        const diversificationScore = Object.keys(assetGroups).length / activeBots.length;
        if (diversificationScore === 1) {
            console.log('✅ DIVERSIFICACIÓN PERFECTA: Cada bot en diferente activo');
        } else if (diversificationScore > 0.7) {
            console.log('🟡 BUENA DIVERSIFICACIÓN');
        } else {
            console.log('🔴 CONCENTRACIÓN ALTA: Considerar más diversificación');
        }
    }
    
    async analyzeRisk(activeBots) {
        if (activeBots.length === 0) {
            console.log('❌ No hay bots activos para analizar');
            return;
        }
        
        // Get current funding rates
        const fundingData = await this.client.futuresMarkPrice();
        const fundingMap = {};
        fundingData.forEach(f => {
            fundingMap[f.symbol] = parseFloat(f.lastFundingRate);
        });
        
        // Risk metrics
        let totalEarnings = 0;
        let totalNotional = 0;
        let riskFactors = [];
        
        activeBots.forEach(bot => {
            const currentFunding = fundingMap[bot.symbol];
            const originalFunding = bot.fundingRate;
            
            totalEarnings += bot.expectedEarning || 0;
            totalNotional += bot.notionalValue || 0;
            
            // Check if funding rate changed significantly
            if (currentFunding && originalFunding) {
                const change = Math.abs((currentFunding - originalFunding) / originalFunding);
                if (change > 0.5) { // 50% change
                    riskFactors.push(`${bot.symbol}: Funding cambió ${(change * 100).toFixed(1)}%`);
                }
                
                // Check if funding flipped sign
                if (Math.sign(currentFunding) !== Math.sign(originalFunding)) {
                    riskFactors.push(`${bot.symbol}: ⚠️ Funding cambió de signo!`);
                }
            }
        });
        
        console.log(`💸 Ganancias Próximas: $${totalEarnings.toFixed(4)}`);
        console.log(`💰 Valor Total Notional: $${totalNotional.toFixed(2)}`);
        console.log(`📊 ROI Esperado: ${((totalEarnings / totalNotional) * 100).toFixed(3)}% por ronda`);
        
        if (riskFactors.length > 0) {
            console.log('\n🚨 FACTORES DE RIESGO DETECTADOS:');
            riskFactors.forEach(risk => console.log(`   • ${risk}`));
        } else {
            console.log('\n✅ No se detectaron riesgos inmediatos');
        }
    }
    
    analyzeAutomationConfig() {
        // Read automation engine config
        try {
            const fs = require('fs');
            const path = require('path');
            const AutomationEngine = require('./automation-engine.js');
            const engine = new AutomationEngine();
            const config = engine.config;
            
            console.log('⚙️  CONFIGURACIÓN ACTUAL:');
            console.log(`   Capital Configurado: $${config.portfolio.totalCapital}`);
            console.log(`   Máximo por Bot: $${config.portfolio.maxPerBot}`);
            console.log(`   Bots Concurrentes: ${config.autoLaunch.maxConcurrentBots}`);
            console.log(`   Funding Mínimo: ${(config.autoLaunch.minFundingRate * 100).toFixed(4)}%`);
            console.log(`   Max Drawdown: ${(config.risk.maxDrawdown * 100).toFixed(1)}%`);
            console.log(`   Profit Target: ${(config.risk.profitTarget * 100).toFixed(1)}%`);
            
        } catch (error) {
            console.log('❌ No se pudo leer la configuración de automatización');
        }
    }
    
    generateRecommendations(balances, activeBots, capitalAnalysis) {
        const recommendations = [];
        
        // Capital utilization recommendations
        if (capitalAnalysis.utilizationRate < 30) {
            recommendations.push('📈 OPORTUNIDAD: Solo usas ' + capitalAnalysis.utilizationRate.toFixed(1) + '% del capital. Podrías aumentar maxConcurrentBots');
        } else if (capitalAnalysis.utilizationRate > 85) {
            recommendations.push('⚠️  RIESGO: Usas ' + capitalAnalysis.utilizationRate.toFixed(1) + '% del capital. Considerar reducir maxPerBot');
        }
        
        // Diversification recommendations  
        if (activeBots.length > 0) {
            const uniqueAssets = new Set(activeBots.map(bot => bot.symbol.replace('USDT', '')));
            if (uniqueAssets.size < activeBots.length) {
                recommendations.push('🎯 DIVERSIFICACIÓN: Tienes múltiples bots en los mismos activos. Considerar diversificar más');
            }
        }
        
        // Balance recommendations
        const spotPercentage = (balances.spotUSDT / balances.totalUSDT) * 100;
        if (spotPercentage < 20) {
            recommendations.push('💰 BALANCE: Muy poco USDT en spot (' + spotPercentage.toFixed(1) + '%). Difícil lanzar nuevos bots');
        }
        
        // Performance recommendations
        if (activeBots.length > 0) {
            const avgFunding = activeBots.reduce((sum, bot) => sum + Math.abs(bot.fundingRate || 0), 0) / activeBots.length;
            if (avgFunding < 0.001) { // < 0.1%
                recommendations.push('📉 RENDIMIENTO: Funding rates promedio muy bajos (' + (avgFunding * 100).toFixed(3) + '%). Considerar criterios más selectivos');
            }
        }
        
        if (recommendations.length === 0) {
            console.log('✅ LA GESTIÓN DE CARTERA ESTÁ BIEN CONFIGURADA');
            console.log('   No se detectaron problemas mayores');
        } else {
            console.log('💡 RECOMENDACIONES DE MEJORA:');
            recommendations.forEach((rec, index) => {
                console.log(`   ${index + 1}. ${rec}`);
            });
        }
        
        // Summary recommendations
        console.log('\n🎯 RESUMEN EJECUTIVO:');
        console.log(`   • Capital Total: $${balances.totalUSDT.toFixed(2)}`);
        console.log(`   • Bots Activos: ${activeBots.length}`);
        console.log(`   • Utilización: ${capitalAnalysis.utilizationRate.toFixed(1)}%`);
        console.log(`   • Próximas Ganancias: $${activeBots.reduce((sum, bot) => sum + (bot.expectedEarning || 0), 0).toFixed(4)}`);
        
        const healthStatus = recommendations.length === 0 ? 'EXCELENTE ✅' : 
                           recommendations.length <= 2 ? 'BUENA 🟡' : 'NECESITA ATENCIÓN 🔴';
        console.log(`   • Salud de Cartera: ${healthStatus}`);
    }
}

// CLI execution
if (require.main === module) {
    const analyzer = new PortfolioAnalyzer();
    analyzer.analyzeCurrentPortfolio().then(() => {
        console.log('\n✅ Análisis de cartera completado');
    }).catch(error => {
        console.error('❌ Error:', error.message);
    });
}

module.exports = PortfolioAnalyzer;
