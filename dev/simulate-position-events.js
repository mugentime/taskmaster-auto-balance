// Simulation script for position events
require('dotenv').config({ path: '../.env' });
const BalanceNotificationManager = require('../balance-notifications.js');

const notifier = new BalanceNotificationManager();

console.log('🧪 SIMULANDO EVENTOS DE POSICIONES...');
console.log('════════════════════════════════════════');

async function simulatePositionEvents() {
    try {
        // Simulate position opened
        console.log('\n📈 Simulando apertura de posición...');
        await notifier.notifyPositionOpened({
            symbol: 'BTCUSDT',
            side: 'LONG',
            quantity: 0.001,
            entryPrice: 60000,
            leverage: 10,
            notionalUSD: 60,
            botId: 'test-bot-001',
            orderId: 'SIM-OPEN-1',
            strategy: 'Long Perp',
            exchange: 'BINANCE',
            timestamp: Date.now()
        });

        // Wait 3 seconds
        console.log('\n⏰ Esperando 3 segundos...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Simulate position closed with profit
        console.log('\n📉 Simulando cierre de posición con ganancia...');
        await notifier.notifyPositionClosed({
            symbol: 'BTCUSDT',
            side: 'LONG',
            quantity: 0.001,
            entryPrice: 60000,
            exitPrice: 60100,
            leverage: 10,
            notionalUSD: 60,
            realizedPnlUSD: 0.1,
            roiPct: 0.17,
            duration: '00:05:00',
            reason: 'Take Profit',
            botId: 'test-bot-001',
            orderId: 'SIM-CLOSE-1',
            exchange: 'BINANCE',
            timestamp: Date.now()
        });

        // Wait 3 seconds
        console.log('\n⏰ Esperando 3 segundos...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Simulate position closed with loss
        console.log('\n📉 Simulando cierre de posición con pérdida...');
        await notifier.notifyPositionClosed({
            symbol: 'ETHUSDT',
            side: 'SHORT',
            quantity: 0.05,
            entryPrice: 3200,
            exitPrice: 3250,
            leverage: 5,
            notionalUSD: 160,
            realizedPnlUSD: -2.5,
            roiPct: -1.56,
            duration: '01:23:45',
            reason: 'Stop Loss',
            botId: 'test-bot-002',
            orderId: 'SIM-CLOSE-2',
            exchange: 'BINANCE',
            timestamp: Date.now()
        });

        console.log('\n✅ SIMULACIÓN COMPLETADA');
        console.log('Revisa tu Telegram para los mensajes de prueba');

    } catch (error) {
        console.error('❌ Error en simulación:', error.message);
    }
}

simulatePositionEvents();
