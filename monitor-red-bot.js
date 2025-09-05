// RED Bot Monitoring Dashboard
require('dotenv').config();
const axios = require('axios');
const Binance = require('binance-api-node').default;

const TASK_MASTER_URL = 'http://localhost:3001';
const { BINANCE_API_KEY, BINANCE_API_SECRET } = process.env;

// Initialize Binance client
const client = Binance({
    apiKey: BINANCE_API_KEY,
    apiSecret: BINANCE_API_SECRET,
    testnet: false
});

console.log('📊 RED BOT MONITORING DASHBOARD');
console.log('════════════════════════════════');

async function getREDFundingRate() {
    try {
        const fundingData = await client.futuresMarkPrice();
        const redData = fundingData.find(item => item.symbol === 'REDUSDT');
        
        if (redData) {
            const fundingRate = parseFloat(redData.lastFundingRate);
            const fundingRatePercent = (fundingRate * 100).toFixed(4);
            const annualizedRate = (Math.abs(fundingRate) * 365 * 3 * 100).toFixed(2);
            const nextFunding = new Date(redData.nextFundingTime).toLocaleString();
            
            return {
                rate: fundingRate,
                percentage: fundingRatePercent,
                annualized: annualizedRate,
                nextFunding,
                isNegative: fundingRate < 0,
                markPrice: parseFloat(redData.markPrice)
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching funding rate:', error.message);
        return null;
    }
}

async function getPositionStatus() {
    try {
        // Get futures positions
        const positions = await client.futuresPositionRisk();
        const redPosition = positions.find(p => p.symbol === 'REDUSDT' && parseFloat(p.positionAmt) !== 0);
        
        // Get spot balance
        const account = await client.accountInfo();
        const redBalance = account.balances.find(b => b.asset === 'RED');
        
        return {
            futuresPosition: redPosition ? {
                amount: parseFloat(redPosition.positionAmt),
                entryPrice: parseFloat(redPosition.entryPrice),
                unrealizedPnl: parseFloat(redPosition.unrealizedProfit),
                percentage: parseFloat(redPosition.percentage)
            } : null,
            spotBalance: redBalance ? {
                free: parseFloat(redBalance.free),
                locked: parseFloat(redBalance.locked),
                total: parseFloat(redBalance.free) + parseFloat(redBalance.locked)
            } : null
        };
    } catch (error) {
        console.error('Error fetching positions:', error.message);
        return null;
    }
}

async function monitorBot() {
    try {
        console.clear();
        console.log('📊 RED BOT MONITORING DASHBOARD');
        console.log('════════════════════════════════');
        console.log(`⏰ ${new Date().toLocaleString()}\n`);

        // Get Task Master status
        const taskMasterBots = await axios.get(`${TASK_MASTER_URL}/api/v1/bots`);
        const redBot = taskMasterBots.data.find(bot => bot.symbol === 'REDUSDT');
        
        if (redBot) {
            console.log('🤖 TASK MASTER STATUS:');
            console.log(`   Bot ID: ${redBot.id}`);
            console.log(`   Status: ${redBot.status.toUpperCase()}`);
            console.log(`   Strategy: ${redBot.originalDetection?.strategyType || redBot.strategyType}`);
            console.log(`   Investment: $${redBot.originalDetection?.investment || redBot.investment}`);
            console.log(`   Auto-Managed: ${redBot.originalDetection?.autoManaged ? 'YES' : 'NO'}`);
            console.log('');
        } else {
            console.log('❌ RED bot not found in Task Master\n');
        }

        // Get funding rate
        const fundingInfo = await getREDFundingRate();
        if (fundingInfo) {
            console.log('💰 FUNDING RATE STATUS:');
            console.log(`   Current Rate: ${fundingInfo.percentage}% (${fundingInfo.isNegative ? '✅ EARNING' : '❌ PAYING'})`);
            console.log(`   Annualized: ~${fundingInfo.annualized}% APY`);
            console.log(`   Next Payment: ${fundingInfo.nextFunding}`);
            console.log(`   Mark Price: $${fundingInfo.markPrice}`);
            console.log('');
        }

        // Get position status
        const positions = await getPositionStatus();
        if (positions) {
            console.log('📈 POSITION STATUS:');
            
            if (positions.futuresPosition) {
                const pos = positions.futuresPosition;
                const side = pos.amount > 0 ? 'LONG' : 'SHORT';
                const pnlColor = pos.unrealizedPnl >= 0 ? '🟢' : '🔴';
                
                console.log(`   Futures: ${side} ${Math.abs(pos.amount)} RED`);
                console.log(`   Entry Price: $${pos.entryPrice}`);
                console.log(`   Unrealized P&L: ${pnlColor} $${pos.unrealizedPnl.toFixed(4)}`);
                console.log(`   ROE: ${pos.percentage.toFixed(2)}%`);
            } else {
                console.log('   Futures: No position');
            }
            
            if (positions.spotBalance) {
                const spot = positions.spotBalance;
                console.log(`   Spot: ${spot.total} RED (${spot.free} free, ${spot.locked} locked)`);
            } else {
                console.log('   Spot: No RED balance');
            }
            console.log('');
        }

        // Calculate expected earnings
        if (fundingInfo && positions?.futuresPosition && fundingInfo.isNegative) {
            const futuresNotional = Math.abs(positions.futuresPosition.amount) * fundingInfo.markPrice;
            const expectedEarning8h = futuresNotional * Math.abs(fundingInfo.rate);
            const expectedEarningDaily = expectedEarning8h * 3;
            
            console.log('💵 EXPECTED EARNINGS:');
            console.log(`   Next 8h: ~$${expectedEarning8h.toFixed(4)}`);
            console.log(`   Daily: ~$${expectedEarningDaily.toFixed(2)}`);
            console.log(`   Monthly: ~$${(expectedEarningDaily * 30).toFixed(2)}`);
            console.log('');
        }

        console.log('🔄 Refreshing in 30 seconds... (Ctrl+C to stop)');
        
    } catch (error) {
        console.error('❌ Error in monitoring:', error.message);
    }
}

// Start monitoring
console.log('Starting RED bot monitoring...\n');
monitorBot();

// Refresh every 30 seconds
const interval = setInterval(monitorBot, 30000);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Stopping monitor...');
    clearInterval(interval);
    process.exit(0);
});
