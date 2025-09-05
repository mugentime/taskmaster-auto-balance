// Full Portfolio Valuation - Including all tokens at current market prices
require('dotenv').config();
const Binance = require('binance-api-node').default;

class FullPortfolioValuator {
    constructor() {
        this.client = Binance({
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
            testnet: false
        });
    }
    
    async getFullPortfolioValue() {
        try {
            console.log('💰 VALORACIÓN COMPLETA DE CARTERA');
            console.log('═══════════════════════════════════');
            
            // Get current prices for all symbols
            const prices = await this.client.prices();
            
            // Get spot account
            const spotAccount = await this.client.accountInfo();
            const spotBalances = spotAccount.balances.filter(b => {
                const total = parseFloat(b.free) + parseFloat(b.locked);
                return total > 0.001; // Filter dust
            });
            
            // Get futures account
            const futuresAccount = await this.client.futuresAccountInfo();
            const futuresBalances = futuresAccount.assets.filter(a => 
                parseFloat(a.walletBalance) > 0.001
            );
            
            console.log('\n🏦 VALORACIÓN SPOT WALLET:');
            let totalSpotValue = 0;
            let spotUSDT = 0;
            
            spotBalances.forEach(balance => {
                const total = parseFloat(balance.free) + parseFloat(balance.locked);
                const asset = balance.asset;
                
                if (asset === 'USDT') {
                    spotUSDT = total;
                    totalSpotValue += total;
                    console.log(`   ${asset}: ${total.toFixed(4)} = $${total.toFixed(2)}`);
                } else {
                    // Try to get price for this asset
                    const priceSymbol = `${asset}USDT`;
                    const price = prices[priceSymbol];
                    
                    if (price) {
                        const value = total * parseFloat(price);
                        totalSpotValue += value;
                        console.log(`   ${asset}: ${total.toFixed(4)} × $${parseFloat(price).toFixed(6)} = $${value.toFixed(2)}`);
                    } else {
                        console.log(`   ${asset}: ${total.toFixed(4)} × NO PRICE = $0.00 (⚠️ No se pudo valorar)`);
                    }
                }
            });
            
            console.log('\n🚀 VALORACIÓN FUTURES WALLET:');
            let totalFuturesValue = 0;
            let futuresUSDT = 0;
            
            futuresBalances.forEach(asset => {
                const balance = parseFloat(asset.walletBalance);
                const assetName = asset.asset;
                
                if (assetName === 'USDT') {
                    futuresUSDT = balance;
                    totalFuturesValue += balance;
                    console.log(`   ${assetName}: ${balance.toFixed(4)} = $${balance.toFixed(2)}`);
                } else {
                    // Try to get price for this asset
                    const priceSymbol = `${assetName}USDT`;
                    const price = prices[priceSymbol];
                    
                    if (price) {
                        const value = balance * parseFloat(price);
                        totalFuturesValue += value;
                        console.log(`   ${assetName}: ${balance.toFixed(4)} × $${parseFloat(price).toFixed(6)} = $${value.toFixed(2)}`);
                    } else {
                        console.log(`   ${assetName}: ${balance.toFixed(4)} × NO PRICE = $0.00 (⚠️ No se pudo valorar)`);
                    }
                }
            });
            
            const totalPortfolioValue = totalSpotValue + totalFuturesValue;
            const totalUSDTLiquid = spotUSDT + futuresUSDT;
            
            console.log('\n💵 RESUMEN TOTAL:');
            console.log('═══════════════════');
            console.log(`💰 Valor Total Cartera: $${totalPortfolioValue.toFixed(2)}`);
            console.log(`   • Spot Wallet: $${totalSpotValue.toFixed(2)}`);
            console.log(`   • Futures Wallet: $${totalFuturesValue.toFixed(2)}`);
            console.log('');
            console.log(`💧 USDT Líquido: $${totalUSDTLiquid.toFixed(2)}`);
            console.log(`   • Spot USDT: $${spotUSDT.toFixed(2)}`);
            console.log(`   • Futures USDT: $${futuresUSDT.toFixed(2)}`);
            console.log('');
            console.log(`🪙 Valor en Tokens: $${(totalPortfolioValue - totalUSDTLiquid).toFixed(2)}`);
            
            // Now get current bot positions
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            let totalInBots = 0;
            activeBots.forEach(bot => {
                totalInBots += bot.notionalValue || 0;
            });
            
            console.log('\n📊 ANÁLISIS DE UTILIZACIÓN:');
            console.log('═════════════════════════════');
            console.log(`🤖 Capital en Bots: $${totalInBots.toFixed(2)}`);
            
            // Calculate utilization based on different metrics
            const liquidUtilization = (totalInBots / totalUSDTLiquid) * 100;
            const totalUtilization = (totalInBots / totalPortfolioValue) * 100;
            
            console.log('\n📈 MÉTRICAS DE UTILIZACIÓN:');
            console.log(`   VS USDT Líquido: ${liquidUtilization.toFixed(1)}%`);
            console.log(`   VS Cartera Total: ${totalUtilization.toFixed(1)}%`);
            
            // Risk assessment based on total portfolio utilization
            console.log('\n⛖️  EVALUACIÓN DE RIESGO:');
            
            // Portfolio-based risk assessment (more realistic)
            if (totalUtilization > 90) {
                console.log('🚨 RIESGO EXTREMO: >90% del portfolio en bots');
                console.log('   Recomendación: Reducir posiciones inmediatamente');
            } else if (totalUtilization > 75) {
                console.log('🔴 RIESGO ALTO: >75% del portfolio en bots');
                console.log('   Recomendación: Considerar reducir exposición');
            } else if (totalUtilization > 50) {
                console.log('🟡 RIESGO MEDIO: >50% del portfolio en bots');
                console.log('   Recomendación: Utilización saludable, monitorear');
            } else if (totalUtilization > 25) {
                console.log('✅ RIESGO BAJO: Utilización conservadora');
                console.log('   Oportunidad: Considerar aumentar exposición si hay buenas oportunidades');
            } else {
                console.log('🟡 INFRAUTILIZADO: <25% del portfolio en uso');
                console.log('   Recomendación: Buscar más oportunidades de funding');
            }
            
            // USDT operational buffer assessment
            const optimalUSDT = totalPortfolioValue * 0.08; // 8% for operations
            if (totalUSDTLiquid < optimalUSDT) {
                const deficit = optimalUSDT - totalUSDTLiquid;
                console.log(`💵 USDT OPERACIONAL: Insuficiente (faltan $${deficit.toFixed(2)} para operaciones óptimas)`);
            } else {
                console.log('✅ USDT OPERACIONAL: Suficiente para operaciones');
            }
            
            return {
                totalPortfolioValue,
                totalSpotValue,
                totalFuturesValue,
                totalUSDTLiquid,
                spotUSDT,
                futuresUSDT,
                totalInBots,
                liquidUtilization,
                totalUtilization
            };
            
        } catch (error) {
            console.error('❌ Error en valoración:', error.message);
            return null;
        }
    }
}

// CLI execution
if (require.main === module) {
    const valuator = new FullPortfolioValuator();
    valuator.getFullPortfolioValue().then((result) => {
        if (result) {
            console.log('\n✅ Valoración completa terminada');
        }
    }).catch(error => {
        console.error('❌ Error:', error.message);
    });
}

module.exports = FullPortfolioValuator;
