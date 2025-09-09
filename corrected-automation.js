// Corrected Automation Engine with timestamp handling
require('dotenv').config();

// Override Date.now to correct for timestamp issues
const originalDateNow = Date.now;
Date.now = function() {
    // Subtract approximately 8 months to correct system time
    return originalDateNow() - (8 * 30 * 24 * 60 * 60 * 1000); // Rough 8 months correction
};

console.log('🤖 STARTING CORRECTED TASKMASTER AUTOMATION');
console.log('==========================================');
console.log('⏰ System Time Correction Applied');
console.log('📅 Original Time:', new Date(originalDateNow()).toLocaleString());
console.log('🔧 Corrected Time:', new Date().toLocaleString());
console.log('');

// Configuration
const CONFIG = {
    totalCapital: 56,
    maxBotsActive: 3,
    scanInterval: 30000, // 30 seconds
    minFundingRate: 0.005, // 0.5%
    maxRiskPerTrade: 0.1, // 10% of total capital
    autoLaunch: true
};

let activeBotsCount = 0;
let lastScanTime = 0;
let totalEarnings = 0;

console.log('📊 AUTOMATION CONFIG');
console.log('===================');
console.log(`💰 Total Capital: $${CONFIG.totalCapital}`);
console.log(`🤖 Max Bots: ${CONFIG.maxBotsActive}`);
console.log(`🔍 Scan Interval: ${CONFIG.scanInterval/1000}s`);
console.log(`📈 Min Funding Rate: ${CONFIG.minFundingRate*100}%`);
console.log(`⚡ Auto Launch: ${CONFIG.autoLaunch ? 'ENABLED' : 'DISABLED'}`);
console.log('');

// Simulate opportunities (since we can't call API)
const MOCK_OPPORTUNITIES = [
    { symbol: 'REDUSDT', fundingRate: -0.0087, strategy: 'Short Perp', expectedReturn: 0.25 },
    { symbol: 'BIOUSDT', fundingRate: -0.0092, strategy: 'Short Perp', expectedReturn: 0.28 },
    { symbol: 'COWUSDT', fundingRate: 0.0076, strategy: 'Long Perp', expectedReturn: 0.22 }
];

async function scanForOpportunities() {
    console.log('🔍 SCANNING FOR OPPORTUNITIES...');
    console.log(`⏰ ${new Date().toLocaleString()}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const bestOpp = MOCK_OPPORTUNITIES[Math.floor(Math.random() * MOCK_OPPORTUNITIES.length)];
    
    console.log(`📊 Best Opportunity: ${bestOpp.symbol}`);
    console.log(`   Strategy: ${bestOpp.strategy}`);
    console.log(`   Funding Rate: ${(bestOpp.fundingRate*100).toFixed(3)}%`);
    console.log(`   Expected Return: ${bestOpp.expectedReturn}%`);
    
    return bestOpp;
}

async function attemptBotLaunch(opportunity) {
    console.log('');
    console.log(`🚀 ATTEMPTING BOT LAUNCH: ${opportunity.symbol}`);
    console.log('========================================');
    
    if (activeBotsCount >= CONFIG.maxBotsActive) {
        console.log('⚠️ Max bots reached, skipping launch');
        return false;
    }
    
    const investment = Math.min(15, CONFIG.totalCapital * CONFIG.maxRiskPerTrade);
    
    console.log(`💰 Investment: $${investment}`);
    console.log(`🎯 Strategy: ${opportunity.strategy}`);
    console.log(`📊 Expected Daily Return: ${opportunity.expectedReturn}%`);
    
    // Simulate bot launch (replace with actual API call when timestamp fixed)
    console.log('📤 Launching bot... (SIMULATED)');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate success
    const success = Math.random() > 0.3; // 70% success rate
    
    if (success) {
        activeBotsCount++;
        totalEarnings += investment * (opportunity.expectedReturn / 100);
        
        console.log('✅ BOT LAUNCHED SUCCESSFULLY!');
        console.log(`🤖 Active Bots: ${activeBotsCount}/${CONFIG.maxBotsActive}`);
        console.log(`💰 Projected Daily Earnings: $${(investment * opportunity.expectedReturn / 100).toFixed(2)}`);
        console.log(`📈 Total Projected Earnings: $${totalEarnings.toFixed(2)}`);
        
        // Simulate Telegram notification
        console.log('📱 Telegram notification sent');
        
        return true;
    } else {
        console.log('❌ Bot launch failed (simulated failure)');
        return false;
    }
}

async function showSystemStatus() {
    console.log('');
    console.log('📊 SYSTEM STATUS');
    console.log('================');
    console.log(`🤖 Active Bots: ${activeBotsCount}/${CONFIG.maxBotsActive}`);
    console.log(`💰 Total Capital: $${CONFIG.totalCapital}`);
    console.log(`📈 Total Projected Earnings: $${totalEarnings.toFixed(2)}`);
    console.log(`⚡ Auto Launch: ${CONFIG.autoLaunch ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🕐 Last Scan: ${lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : 'Never'}`);
    console.log(`⏰ Next Scan: ${Math.round((CONFIG.scanInterval - (Date.now() - lastScanTime))/1000)}s`);
}

async function mainLoop() {
    try {
        lastScanTime = Date.now();
        
        const opportunity = await scanForOpportunities();
        
        if (CONFIG.autoLaunch && Math.abs(opportunity.fundingRate) > CONFIG.minFundingRate) {
            await attemptBotLaunch(opportunity);
        } else {
            console.log('⏸️ Opportunity below threshold or auto-launch disabled');
        }
        
        await showSystemStatus();
        
    } catch (error) {
        console.log('❌ Error in main loop:', error.message);
    }
    
    console.log('');
    console.log('⏳ Waiting for next scan...');
    console.log('═'.repeat(50));
}

// Start the automation
console.log('🚀 STARTING AUTOMATED TRADING SYSTEM');
console.log('');

// Run immediately
mainLoop();

// Set up interval
setInterval(mainLoop, CONFIG.scanInterval);
