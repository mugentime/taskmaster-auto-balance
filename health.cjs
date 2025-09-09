/**
 * Health Endpoint for Trading System Diagnostics
 * Provides comprehensive system state for debugging
 */

const os = require('os');
const startTime = Date.now();

// If trading config exists, import it (otherwise provide defaults)
let tradingConfig;
try {
    tradingConfig = require('../config/trading.cjs');
} catch (error) {
    console.log('Trading config not found, using defaults for health check');
    tradingConfig = {
        BINANCE_ENV: process.env.BINANCE_ENV || 'live',
        IS_TESTNET: (process.env.BINANCE_ENV || 'live').toLowerCase() === 'testnet',
        DRY_RUN: process.env.DRY_RUN === 'true',
        FUTURES_BASE_URL: 'https://fapi.binance.com',
        getSanitized: () => ({
            BINANCE_ENV: process.env.BINANCE_ENV || 'live',
            IS_TESTNET: (process.env.BINANCE_ENV || 'live').toLowerCase() === 'testnet',
            DRY_RUN: process.env.DRY_RUN === 'true',
            API_KEY_LENGTH: process.env.BINANCE_API_KEY?.length || 0
        })
    };
}

/**
 * Health check for Binance API and time synchronization
 * @param {Object} futuresClient - Binance futures client instance
 */
async function getBinanceHealth(futuresClient) {
    try {
        // Check server time and calculate offset
        const timeStart = Date.now();
        const serverTime = await futuresClient.time();
        const timeEnd = Date.now();
        const responseTime = timeEnd - timeStart;
        
        const serverTimeMs = serverTime.serverTime;
        const localTimeMs = Math.floor((timeStart + timeEnd) / 2);
        const timeDelta = serverTimeMs - localTimeMs;
        
        // Check account info (only if API credentials are provided)
        let accountInfo = null;
        let positionCount = 0;
        
        try {
            const account = await futuresClient.futuresAccountInfo();
            accountInfo = {
                totalWalletBalance: parseFloat(account.totalWalletBalance),
                totalUnrealizedProfit: parseFloat(account.totalUnrealizedProfit),
                availableBalance: parseFloat(account.availableBalance)
            };
            
            const positions = account.positions.filter(p => Math.abs(parseFloat(p.positionAmt)) > 0);
            positionCount = positions.length;
        } catch (error) {
            console.log('Health check: Account info unavailable:', error.message);
        }
        
        return {
            pingMs: responseTime,
            timeSyncMs: timeDelta,
            serverTime: new Date(serverTimeMs).toISOString(),
            accountInfo,
            positionCount,
            connected: true
        };
    } catch (error) {
        console.error('Binance health check failed:', error.message);
        return {
            connected: false,
            error: error.message
        };
    }
}

/**
 * Generate complete health report for the system
 * @param {Object} options - Configuration options
 * @param {Object} options.futuresClient - Binance futures client
 * @param {Object} options.activeBots - Active trading bots
 */
async function generateHealthReport(options = {}) {
    const { futuresClient, activeBots = {} } = options;
    
    // Calculate uptime
    const uptime = Date.now() - startTime;
    const uptimeFormatted = formatUptime(uptime);
    
    // Get system information
    const systemInfo = {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
            total: formatBytes(os.totalmem()),
            free: formatBytes(os.freemem()),
            percentFree: Math.round((os.freemem() / os.totalmem()) * 100)
        },
        loadAvg: os.loadavg()
    };
    
    // Get active bots info (without secrets)
    const botCount = Object.keys(activeBots).length;
    const botSummary = Object.entries(activeBots || {}).map(([id, bot]) => ({
        id,
        symbol: bot.symbol,
        strategy: bot.strategyType,
        status: bot.status,
        createdAt: bot.createdAt
    }));
    
    // Get Binance connectivity info
    let binanceHealth = { connected: false };
    if (futuresClient) {
        binanceHealth = await getBinanceHealth(futuresClient);
    }
    
    return {
        success: true,
        status: 'operational',
        uptime: uptimeFormatted,
        uptimeMs: uptime,
        timestamp: new Date().toISOString(),
        environment: tradingConfig.getSanitized(),
        trading: {
            dryRun: tradingConfig.DRY_RUN,
            botCount,
            activeBots: botSummary,
            binance: binanceHealth
        },
        system: systemInfo
    };
}

// Helper: Format uptime in days, hours, minutes, seconds
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

// Helper: Format bytes in a human-readable way
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

module.exports = {
    generateHealthReport
};
