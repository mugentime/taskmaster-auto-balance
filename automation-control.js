#!/usr/bin/env node

// Automation Control Script
// Provides easy control and monitoring of the automation system

require('dotenv').config();
const { spawn } = require('child_process');

class AutomationController {
    constructor() {
        this.engineProcess = null;
        this.isStarted = false;
    }

    startBackground() {
        if (this.isStarted) {
            console.log('⚠️ Automation engine is already running');
            return false;
        }

        console.log('🚀 Starting Automation Engine in background...');
        
        // Start the automation engine as a background process
        this.engineProcess = spawn('node', ['automation-engine.js', 'start'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: __dirname
        });

        this.engineProcess.unref(); // Allow parent to exit while child continues

        // Capture output for monitoring
        this.engineProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) {
                console.log('🤖', output);
            }
        });

        this.engineProcess.stderr.on('data', (data) => {
            const error = data.toString().trim();
            if (error && !error.includes('Health issues')) { // Filter out routine health warnings
                console.log('⚠️', error);
            }
        });

        this.engineProcess.on('close', (code) => {
            console.log(`🛑 Automation engine stopped with code ${code}`);
            this.isStarted = false;
            this.engineProcess = null;
        });

        this.engineProcess.on('error', (error) => {
            console.error('❌ Failed to start automation engine:', error.message);
            this.isStarted = false;
            this.engineProcess = null;
        });

        this.isStarted = true;
        console.log('✅ Automation Engine started in background');
        console.log('   Use "node automation-control.js status" to monitor');
        console.log('   Use "node automation-control.js stop" to stop');
        
        return true;
    }

    async getStatus() {
        try {
            // Use the universal bot scanner to get real active bots
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();
            
            // Also get automation engine status
            const AutomationEngine = require('./automation-engine.js');
            const engine = new AutomationEngine();
            const engineStatus = engine.getStatus();
            
            console.log('\n📊 AUTOMATION SYSTEM STATUS');
            console.log('═══════════════════════════════');
            console.log(`🤖 Real Active Bots: ${activeBots.length}`);
            console.log(`⚡ Auto-Launch: ${engineStatus.config.autoLaunch.enabled ? 'ENABLED' : 'DISABLED'}`);
            console.log(`💰 Total Capital: $${engineStatus.config.portfolio.totalCapital}`);
            console.log(`🔍 Scan Interval: ${engineStatus.config.intervals.opportunityCheck/1000}s`);
            
            return { activeBots, engineStatus };
            
        } catch (error) {
            console.error('❌ Failed to get status:', error.message);
            return null;
        }
    }

    stop() {
        if (this.engineProcess) {
            console.log('🛑 Stopping Automation Engine...');
            this.engineProcess.kill('SIGTERM');
            this.isStarted = false;
            this.engineProcess = null;
            console.log('✅ Stop signal sent');
        } else {
            console.log('⚠️ No automation engine process found to stop');
        }
    }

    showHelp() {
        console.log('\n🤖 AUTOMATION CONTROL - Task Master');
        console.log('═══════════════════════════════════');
        console.log('Commands:');
        console.log('  start    - Start automation engine in background');
        console.log('  stop     - Stop automation engine');
        console.log('  status   - Show current status');
        console.log('  help     - Show this help');
        console.log('');
        console.log('Examples:');
        console.log('  node automation-control.js start');
        console.log('  node automation-control.js status');
        console.log('  node automation-control.js stop');
        console.log('');
    }
}

// CLI execution
if (require.main === module) {
    const controller = new AutomationController();
    const command = process.argv[2] || 'help';

    switch (command.toLowerCase()) {
        case 'start':
            const started = controller.startBackground();
            if (started) {
                // Keep process alive to show initial output
                setTimeout(() => {
                    console.log('\n💡 Engine is running in background. Check status with:');
                    console.log('   node automation-control.js status');
                    console.log('');
                    process.exit(0);
                }, 5000);
            } else {
                process.exit(1);
            }
            break;

        case 'stop':
            controller.stop();
            setTimeout(() => process.exit(0), 1000);
            break;

        case 'status':
            controller.getStatus().then(() => process.exit(0));
            break;

        case 'help':
        default:
            controller.showHelp();
            process.exit(0);
    }
}

module.exports = AutomationController;
