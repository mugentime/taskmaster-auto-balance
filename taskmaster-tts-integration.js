// TaskMaster TTS Integration
// This script connects the TaskMaster system with Text-to-Speech notifications
require('dotenv').config();
const { exec } = require('child_process');

// TTS Functions
function speakMessage(message, taskType = 'status') {
    const escapedMessage = message.replace(/"/g, '\\"');
    const command = `powershell -Command "$env:USERPROFILE\\warp-tts-notify.ps1 -Message '${escapedMessage}' -TaskType '${taskType}'"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ TTS Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ TTS Warning: ${stderr}`);
        }
        console.log(`🎤 TTS Output: ${stdout}`);
    });
}

// Specialized notification functions
function notifyTaskCompleted(taskName, details = '') {
    const message = `Task "${taskName}" completed. ${details}`;
    speakMessage(message, 'completion');
}

function notifyBotLaunched(symbol, strategy, investment) {
    const message = `Bot launched for ${symbol} with ${strategy} strategy. Investment: $${investment}.`;
    speakMessage(message, 'bot-launch');
}

function notifyError(errorMessage, component = 'system') {
    const message = `Error in ${component}: ${errorMessage}`;
    speakMessage(message, 'error');
}

function notifyWarning(warningMessage) {
    speakMessage(warningMessage, 'warning');
}

function notifyStatusUpdate(status) {
    speakMessage(status, 'status');
}

// Integration with opportunity scanner
function notifyOpportunityFound(symbol, fundingRate, strategy) {
    const message = `Found opportunity for ${symbol} with ${Math.abs(fundingRate*100).toFixed(2)}% funding rate. Recommended strategy: ${strategy}.`;
    speakMessage(message, 'status');
}

// Integration with portfolio updates
function notifyPortfolioValue(totalValue, spotValue, futuresValue) {
    const message = `Portfolio valued at $${totalValue}. Spot: $${spotValue}, Futures: $${futuresValue}.`;
    speakMessage(message, 'status');
}

// Integration with system health monitoring
function notifySystemHealth(healthScore, issues = []) {
    let message = `System health at ${healthScore}%.`;
    if (issues.length > 0) {
        message += ` Issues detected: ${issues.join(', ')}.`;
    } else {
        message += ' All systems operational.';
    }
    speakMessage(message, healthScore < 70 ? 'warning' : 'status');
}

// Quick test
console.log('🎤 TASKMASTER TTS INTEGRATION');
console.log('==============================');
console.log('Testing TTS system...');

setTimeout(() => {
    notifyTaskCompleted('TTS Integration', 'System ready for voice notifications.');
}, 1000);

// Make functions available for the TaskMaster system
module.exports = {
    speakMessage,
    notifyTaskCompleted,
    notifyBotLaunched,
    notifyError,
    notifyWarning,
    notifyStatusUpdate,
    notifyOpportunityFound,
    notifyPortfolioValue,
    notifySystemHealth
};
