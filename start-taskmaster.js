#!/usr/bin/env node

// TaskMaster - Master Startup Script
// Starts all components: Backend, Automation, Monitoring

require('dotenv').config();
const { spawn } = require('child_process');
const axios = require('axios');

console.log('🚀 TASKMASTER STARTUP SEQUENCE');
console.log('═══════════════════════════════════');

async function checkPort(port) {
    try {
        await axios.get(`http://localhost:${port}`, { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

async function startTaskMaster() {
    const processes = [];
    
    console.log('\n📊 STEP 1: Starting Backend Server...');
    
    // Check if backend is already running
    const backendRunning = await checkPort(3001);
    if (backendRunning) {
        console.log('✅ Backend already running on port 3001');
    } else {
        console.log('🔄 Starting backend server...');
        const backend = spawn('node', ['server.js'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        backend.unref();
        processes.push({ name: 'Backend Server', process: backend, port: 3001 });
        
        // Wait for backend to start
        let backendReady = false;
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (await checkPort(3001)) {
                backendReady = true;
                break;
            }
            console.log(`   ⏳ Waiting for backend... (${i + 1}/10)`);
        }
        
        if (backendReady) {
            console.log('✅ Backend server started successfully');
        } else {
            console.log('❌ Backend server failed to start');
            return;
        }
    }
    
    console.log('\n🤖 STEP 2: Starting Automation Engine...');
    const automation = spawn('node', ['automation-control.js', 'start'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    automation.unref();
    processes.push({ name: 'Automation Engine', process: automation });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Automation engine started');
    
    console.log('\n📡 STEP 3: Starting Remote Monitor...');
    const monitor = spawn('node', ['remote-monitor.js', 'start'], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    monitor.unref();
    processes.push({ name: 'Remote Monitor', process: monitor, port: 3002 });
    
    // Wait for monitor to start
    let monitorReady = false;
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (await checkPort(3002)) {
            monitorReady = true;
            break;
        }
        console.log(`   ⏳ Waiting for monitor... (${i + 1}/5)`);
    }
    
    if (monitorReady) {
        console.log('✅ Remote monitor started successfully');
    } else {
        console.log('❌ Remote monitor failed to start');
    }
    
    console.log('\n🎯 STEP 4: System Status Check...');
    
    // Give everything a moment to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check all components
    const backendStatus = await checkPort(3001);
    const monitorStatus = await checkPort(3002);
    
    console.log('\n📊 TASKMASTER STATUS:');
    console.log('═══════════════════════');
    console.log(`🖥️  Backend Server: ${backendStatus ? '✅ Running' : '❌ Down'} (port 3001)`);
    console.log(`🤖 Automation Engine: ✅ Running (background)`);
    console.log(`📡 Remote Monitor: ${monitorStatus ? '✅ Running' : '❌ Down'} (port 3002)`);
    console.log(`📱 Telegram Bot: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
    
    console.log('\n🌐 ACCESS POINTS:');
    console.log('════════════════');
    if (backendStatus) {
        console.log('📊 API: http://localhost:3001');
        console.log('🔍 Opportunities: http://localhost:3001/api/v1/arbitrage-opportunities');
    }
    if (monitorStatus) {
        console.log('📡 Remote Dashboard: http://localhost:3002');
        console.log('📱 Status API: http://localhost:3002/api/status');
    }
    
    console.log('\n🎮 CONTROL COMMANDS:');
    console.log('══════════════════');
    console.log('📊 Check bots: node check-all-bots.js');
    console.log('📡 Monitor status: node automation-control.js status');
    console.log('🧪 Test notifications: node remote-monitor.js test-notification');
    console.log('🚀 Launch best bot: node launch-best-opportunity.js 10 3');
    
    if (process.env.TELEGRAM_BOT_TOKEN) {
        console.log('\n📱 TELEGRAM NOTIFICATIONS:');
        console.log('═════════════════════════');
        console.log('✅ Telegram bot is configured');
        console.log('🔔 You will receive alerts when:');
        console.log('   • System goes down');
        console.log('   • System recovers');
        console.log('   • Bots stop working');
    }
    
    console.log('\n🎉 TASKMASTER READY!');
    console.log('Your trading bots are now running with full automation and remote monitoring.');
    
    // Keep process alive to show initial status
    setTimeout(() => {
        console.log('\n💡 System is running in background. You can close this terminal.');
        process.exit(0);
    }, 5000);
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('❌ Startup error:', error.message);
});

// Start everything
startTaskMaster().catch(error => {
    console.error('❌ Failed to start TaskMaster:', error.message);
    process.exit(1);
});
