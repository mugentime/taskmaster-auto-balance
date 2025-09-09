// Task Completion Webhook with Sound Notifications
require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

// Configuration
const WEBHOOK_PORT = 3002;
const SOUND_CONFIG = {
    success: 'SystemAsterisk',     // Success sound
    error: 'SystemExclamation',    // Error sound
    warning: 'SystemQuestion',     // Warning sound
    notification: 'SystemNotification' // General notification
};

// Sound notification function for Windows
function playSound(soundType = 'success') {
    const soundName = SOUND_CONFIG[soundType] || SOUND_CONFIG.success;
    
    // PowerShell command to play system sound
    const psCommand = `[System.Media.SystemSounds]::${soundName}.Play()`;
    const fullCommand = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; ${psCommand}"`;
    
    exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
            console.log(`🔇 Sound error: ${error.message}`);
        }
    });
}

// Advanced sound with custom beep patterns
function playCustomSound(pattern = 'success') {
    const patterns = {
        success: [800, 100, 1000, 150, 1200, 200],     // Rising tone
        error: [400, 200, 300, 200, 200, 300],         // Descending tone
        warning: [600, 100, 600, 100, 600, 200],       // Triple beep
        notification: [750, 150, 500, 100, 750, 150]   // Notification pattern
    };
    
    const beepPattern = patterns[pattern] || patterns.success;
    
    // Create PowerShell beep sequence
    let psScript = 'Add-Type -AssemblyName System.Windows.Forms; ';
    for (let i = 0; i < beepPattern.length; i += 2) {
        const freq = beepPattern[i];
        const duration = beepPattern[i + 1];
        psScript += `[console]::beep(${freq}, ${duration}); `;
    }
    
    const fullCommand = `powershell -Command "${psScript}"`;
    
    exec(fullCommand, (error) => {
        if (error) {
            console.log(`🔇 Custom sound error: ${error.message}`);
            // Fallback to system sound
            playSound(pattern);
        }
    });
}

// Webhook endpoints
app.post('/webhook/task-completed', (req, res) => {
    const { taskName, status, message, soundType, useCustomSound } = req.body;
    
    console.log('🎯 TASK COMPLETION NOTIFICATION');
    console.log('================================');
    console.log(`📋 Task: ${taskName || 'Unknown Task'}`);
    console.log(`✅ Status: ${status || 'Completed'}`);
    console.log(`📝 Message: ${message || 'Task finished successfully'}`);
    console.log(`🔊 Sound Type: ${soundType || 'success'}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    
    // Play appropriate sound
    if (useCustomSound) {
        playCustomSound(soundType || 'success');
        console.log('🎵 Playing custom sound pattern...');
    } else {
        playSound(soundType || 'success');
        console.log('🔊 Playing system sound...');
    }
    
    res.json({
        success: true,
        message: 'Task completion notification received',
        timestamp: new Date().toISOString(),
        soundPlayed: true
    });
});

// Bot launch notification
app.post('/webhook/bot-launched', (req, res) => {
    const { botName, symbol, strategy, investment } = req.body;
    
    console.log('🚀 BOT LAUNCH NOTIFICATION');
    console.log('==========================');
    console.log(`🤖 Bot: ${botName || 'Trading Bot'}`);
    console.log(`💱 Symbol: ${symbol || 'Unknown'}`);
    console.log(`🎯 Strategy: ${strategy || 'Unknown'}`);
    console.log(`💰 Investment: $${investment || 'Unknown'}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    
    // Play success sound for bot launches
    playCustomSound('success');
    console.log('🎵 Bot launch sound played!');
    
    res.json({
        success: true,
        message: 'Bot launch notification received',
        timestamp: new Date().toISOString()
    });
});

// Error notification
app.post('/webhook/error', (req, res) => {
    const { errorMessage, component, severity } = req.body;
    
    console.log('❌ ERROR NOTIFICATION');
    console.log('=====================');
    console.log(`🚨 Error: ${errorMessage || 'Unknown error'}`);
    console.log(`🔧 Component: ${component || 'Unknown'}`);
    console.log(`⚠️ Severity: ${severity || 'Medium'}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    
    // Play error sound
    const soundType = severity === 'High' ? 'error' : 'warning';
    playCustomSound(soundType);
    console.log('🔊 Error sound played!');
    
    res.json({
        success: true,
        message: 'Error notification received',
        timestamp: new Date().toISOString()
    });
});

// System status update
app.post('/webhook/status-update', (req, res) => {
    const { component, status, details } = req.body;
    
    console.log('📊 STATUS UPDATE');
    console.log('================');
    console.log(`🔧 Component: ${component || 'System'}`);
    console.log(`📈 Status: ${status || 'Updated'}`);
    console.log(`📝 Details: ${details || 'No details provided'}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    
    // Play notification sound for status updates
    playSound('notification');
    console.log('🔔 Status update sound played!');
    
    res.json({
        success: true,
        message: 'Status update notification received',
        timestamp: new Date().toISOString()
    });
});

// Test endpoint
app.get('/webhook/test-sound', (req, res) => {
    const { type = 'success', custom = 'false' } = req.query;
    
    console.log('🧪 TESTING SOUND NOTIFICATION');
    console.log(`🔊 Type: ${type}`);
    console.log(`🎵 Custom: ${custom}`);
    
    if (custom === 'true') {
        playCustomSound(type);
    } else {
        playSound(type);
    }
    
    res.json({
        success: true,
        message: `Test sound played: ${type}`,
        custom: custom === 'true',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/webhook/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Task Completion Webhook',
        port: WEBHOOK_PORT,
        timestamp: new Date().toISOString(),
        soundsAvailable: Object.keys(SOUND_CONFIG)
    });
});

// Start webhook server
app.listen(WEBHOOK_PORT, () => {
    console.log('🎵 TASK COMPLETION WEBHOOK STARTED');
    console.log('==================================');
    console.log(`🌐 Server: http://localhost:${WEBHOOK_PORT}`);
    console.log('📡 Endpoints:');
    console.log('   POST /webhook/task-completed - Task completion notifications');
    console.log('   POST /webhook/bot-launched - Bot launch notifications');
    console.log('   POST /webhook/error - Error notifications');
    console.log('   POST /webhook/status-update - Status updates');
    console.log('   GET  /webhook/test-sound - Test sound notifications');
    console.log('   GET  /webhook/health - Health check');
    console.log('');
    console.log('🔊 Sound Types Available:');
    console.log('   - success: Rising success tone');
    console.log('   - error: Descending error tone');
    console.log('   - warning: Triple warning beep');
    console.log('   - notification: General notification');
    console.log('');
    
    // Play startup sound
    playCustomSound('success');
    console.log('🎵 Webhook service ready! Startup sound played.');
});

module.exports = { playSound, playCustomSound };
