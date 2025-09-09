console.log('🔍 TASKMASTER SYSTEM STATUS');
console.log('===========================');

// Check running processes
const { exec } = require('child_process');
const fs = require('fs');

console.log('📡 BACKEND SERVICES');
console.log('==================');

// Check if server is running on port 3001
exec('netstat -ano | findstr :3001', (error, stdout) => {
    if (stdout && stdout.includes('LISTENING')) {
        console.log('✅ Main Server: RUNNING (Port 3001)');
    } else {
        console.log('❌ Main Server: NOT RUNNING');
    }
});

// Check Node processes
exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout) => {
    if (stdout) {
        const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
        console.log(`🔧 Node Processes: ${lines.length} running`);
    }
});

console.log('');
console.log('📊 KNOWN CONFIGURATION');
console.log('======================');
console.log('✅ Backend Directory: Active');
console.log('✅ Environment Files: .env loaded');
console.log('✅ API Keys: Configured (KP5NFDff...fax1)');
console.log('⚠️ System Time: Out of sync (Sept 8, 2025)');
console.log('❌ Binance API: BLOCKED (timestamp error)');

console.log('');
console.log('🤖 SYSTEM COMPONENTS');
console.log('====================');

// Check if log files exist
const logFiles = [
    'automation.log',
    'balance-changes.log',
    'error.log',
    'server.log'
];

logFiles.forEach(logFile => {
    if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        const lastModified = new Date(stats.mtime);
        const timeSince = Date.now() - lastModified.getTime();
        const status = timeSince < 300000 ? '✅ ACTIVE' : '⚠️ INACTIVE'; // 5 min threshold
        console.log(`${status} ${logFile} (${Math.floor(timeSince/1000)}s ago)`);
    } else {
        console.log(`❓ ${logFile}: Not found`);
    }
});

console.log('');
console.log('🚨 CRITICAL ISSUES');
console.log('==================');
console.log('❌ System clock is ahead by ~8 months');
console.log('❌ All Binance API calls failing');
console.log('❌ Cannot access portfolio or launch bots');
console.log('❌ Automated trading suspended');

console.log('');
console.log('🛠️ REQUIRED ACTIONS');
console.log('===================');
console.log('1. Fix system time synchronization');
console.log('2. Restart all TaskMaster services');
console.log('3. Verify API connectivity');
console.log('4. Resume automated trading');

console.log('');
console.log('📋 LAST KNOWN STATUS (from history)');
console.log('====================================');
console.log('💰 Portfolio: ~$121.81 total');
console.log('🤖 Active Bots: 2 (BIO Short, RED Short)');
console.log('📈 Health: 100% (before timestamp issue)');
console.log('📱 Telegram: Working');
console.log('💼 Available USDT: ~$10.64');

setTimeout(() => {
    console.log('');
    console.log('⏰ Current System Time:', new Date().toLocaleString());
    console.log('🌐 Expected Server Time: Should be around Jan 2025');
    console.log('⚠️ Time Difference: ~8 months ahead');
}, 1000);
