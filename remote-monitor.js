// Remote Monitoring System - Check system status from anywhere
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class RemoteMonitor {
    constructor() {
        this.config = {
            // Health check settings
            healthCheck: {
                interval: 60000, // Check every minute
                endpoints: [
                    'http://localhost:3001/api/v1/arbitrage-opportunities',
                    'http://localhost:3001/api/v1/funding-rates/monitor-status'
                ]
            },
            
            // Notification settings
            notifications: {
                webhook: process.env.WEBHOOK_URL || null, // Discord/Slack webhook
                telegram: {
                    botToken: process.env.TELEGRAM_BOT_TOKEN || null,
                    chatId: process.env.TELEGRAM_CHAT_ID || null
                },
                email: {
                    enabled: false // Can be configured later
                }
            },
            
            // Status tracking
            status: {
                lastCheck: null,
                isHealthy: true,
                consecutiveFailures: 0,
                maxFailures: 3,
                uptime: 0,
                startTime: Date.now()
            }
        };
        
        this.statusFile = path.join(__dirname, 'system-status.json');
        this.logFile = path.join(__dirname, 'monitor.log');
        
        this.loadStatus();
    }
    
    // ==========================================
    // STATUS MANAGEMENT
    // ==========================================
    
    loadStatus() {
        try {
            if (fs.existsSync(this.statusFile)) {
                const saved = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
                this.config.status = { ...this.config.status, ...saved };
            }
        } catch (error) {
            this.log('Warning: Could not load status file', 'warn');
        }
    }
    
    saveStatus() {
        try {
            fs.writeFileSync(this.statusFile, JSON.stringify(this.config.status, null, 2));
        } catch (error) {
            this.log('Error: Could not save status file', 'error');
        }
    }
    
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
        
        console.log(`[${level.toUpperCase()}] ${message}`);
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            console.error('Failed to write to log file');
        }
    }
    
    // ==========================================
    // HEALTH MONITORING
    // ==========================================
    
    async checkSystemHealth() {
        const results = {
            timestamp: new Date().toISOString(),
            backend: false,
            automation: false,
            bots: 0,
            errors: []
        };
        
        try {
            // Check backend API
            const backendResponse = await axios.get('http://localhost:3001/api/v1/arbitrage-opportunities', {
                timeout: 10000
            });
            results.backend = backendResponse.status === 200;
            
            // Check automation engine
            const automationResponse = await axios.get('http://localhost:3001/api/v1/funding-rates/monitor-status', {
                timeout: 5000
            });
            results.automation = automationResponse.status === 200;
            
        } catch (error) {
            results.errors.push(`API Check Failed: ${error.message}`);
        }
        
        try {
            // Check active bots
            const { checkAllActiveBots } = require('./check-all-bots.js');
            const bots = await checkAllActiveBots();
            results.bots = bots.length;
            
        } catch (error) {
            results.errors.push(`Bot Check Failed: ${error.message}`);
        }
        
        // Update status
        const isHealthy = results.backend && results.errors.length === 0;
        
        if (isHealthy) {
            this.config.status.consecutiveFailures = 0;
            this.config.status.isHealthy = true;
        } else {
            this.config.status.consecutiveFailures++;
            if (this.config.status.consecutiveFailures >= this.config.status.maxFailures) {
                this.config.status.isHealthy = false;
            }
        }
        
        this.config.status.lastCheck = new Date().toISOString();
        this.config.status.uptime = Date.now() - this.config.status.startTime;
        
        this.saveStatus();
        
        return results;
    }
    
    // ==========================================
    // NOTIFICATION SYSTEM
    // ==========================================
    
    async sendNotification(message, level = 'info') {
        const notifications = [];
        
        // Discord/Slack Webhook
        if (this.config.notifications.webhook) {
            try {
                const emoji = level === 'error' ? '🚨' : level === 'warning' ? '⚠️' : '✅';
                await axios.post(this.config.notifications.webhook, {
                    content: `${emoji} **TaskMaster Alert**\n${message}`,
                    username: 'TaskMaster Monitor'
                });
                notifications.push('webhook');
            } catch (error) {
                this.log(`Webhook notification failed: ${error.message}`, 'error');
            }
        }
        
        // Telegram
        if (this.config.notifications.telegram.botToken && this.config.notifications.telegram.chatId) {
            try {
                const emoji = level === 'error' ? '🚨' : level === 'warning' ? '⚠️' : '✅';
                const telegramMessage = `${emoji} *TaskMaster Alert*\n${message}`;
                
                await axios.post(`https://api.telegram.org/bot${this.config.notifications.telegram.botToken}/sendMessage`, {
                    chat_id: this.config.notifications.telegram.chatId,
                    text: telegramMessage,
                    parse_mode: 'Markdown'
                });
                notifications.push('telegram');
            } catch (error) {
                this.log(`Telegram notification failed: ${error.message}`, 'error');
            }
        }
        
        return notifications;
    }
    
    // ==========================================
    // MONITORING LOOP
    // ==========================================
    
    async startMonitoring() {
        this.log('🔍 Starting remote monitoring system...', 'info');
        
        // Send startup notification
        await this.sendNotification('TaskMaster monitoring started ✅', 'info');
        
        // Start monitoring loop
        setInterval(async () => {
            try {
                const health = await this.checkSystemHealth();
                
                this.log(`Health check: Backend=${health.backend}, Bots=${health.bots}, Errors=${health.errors.length}`, 'info');
                
                // Send alerts for failures
                if (!this.config.status.isHealthy && this.config.status.consecutiveFailures === this.config.status.maxFailures) {
                    const message = `🚨 SYSTEM DOWN!\nBackend: ${health.backend ? '✅' : '❌'}\nActive Bots: ${health.bots}\nErrors: ${health.errors.join(', ')}`;
                    await this.sendNotification(message, 'error');
                }
                
                // Send recovery notification
                if (this.config.status.isHealthy && this.config.status.consecutiveFailures === 0) {
                    const wasDown = this.config.status.lastNotification === 'down';
                    if (wasDown) {
                        await this.sendNotification('✅ System recovered and running normally!', 'info');
                        this.config.status.lastNotification = 'up';
                    }
                }
                
            } catch (error) {
                this.log(`Monitoring error: ${error.message}`, 'error');
            }
        }, this.config.healthCheck.interval);
    }
    
    // ==========================================
    // STATUS API
    // ==========================================
    
    getStatus() {
        return {
            ...this.config.status,
            uptime: {
                ms: this.config.status.uptime,
                hours: (this.config.status.uptime / (1000 * 60 * 60)).toFixed(2),
                days: (this.config.status.uptime / (1000 * 60 * 60 * 24)).toFixed(2)
            },
            notifications: {
                webhook: !!this.config.notifications.webhook,
                telegram: !!(this.config.notifications.telegram.botToken && this.config.notifications.telegram.chatId)
            }
        };
    }
    
    // ==========================================
    // REMOTE COMMANDS
    // ==========================================
    
    async executeRemoteCommand(command) {
        try {
            this.log(`Executing remote command: ${command}`, 'info');
            
            switch (command) {
                case 'status':
                    const { checkAllActiveBots } = require('./check-all-bots.js');
                    const bots = await checkAllActiveBots();
                    return {
                        success: true,
                        data: {
                            activeBots: bots.length,
                            status: this.getStatus(),
                            timestamp: new Date().toISOString()
                        }
                    };
                
                case 'restart-automation':
                    // This would restart the automation engine
                    return { success: true, message: 'Restart command sent' };
                
                default:
                    return { success: false, error: 'Unknown command' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// ==========================================
// WEB DASHBOARD
// ==========================================

function createWebDashboard(monitor) {
    const express = require('express');
    const app = express();
    
    app.use(express.json());
    app.use(express.static('public'));
    
    // Status API endpoint
    app.get('/api/status', (req, res) => {
        res.json(monitor.getStatus());
    });
    
    // Remote command endpoint
    app.post('/api/command', async (req, res) => {
        const { command } = req.body;
        const result = await monitor.executeRemoteCommand(command);
        res.json(result);
    });
    
    // Simple HTML dashboard
    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>TaskMaster Remote Monitor</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                    .container { max-width: 800px; margin: 0 auto; }
                    .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .status-good { color: #22c55e; }
                    .status-bad { color: #ef4444; }
                    .refresh-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🤖 TaskMaster Remote Monitor</h1>
                    <div class="card">
                        <h3>System Status</h3>
                        <div id="status">Loading...</div>
                        <button class="refresh-btn" onclick="refreshStatus()">Refresh Status</button>
                    </div>
                </div>
                
                <script>
                    async function refreshStatus() {
                        try {
                            const response = await fetch('/api/status');
                            const status = await response.json();
                            
                            document.getElementById('status').innerHTML = \`
                                <p><strong>Health:</strong> <span class="\${status.isHealthy ? 'status-good' : 'status-bad'}">\${status.isHealthy ? '✅ Healthy' : '❌ Down'}</span></p>
                                <p><strong>Last Check:</strong> \${status.lastCheck}</p>
                                <p><strong>Uptime:</strong> \${status.uptime.hours} hours (\${status.uptime.days} days)</p>
                                <p><strong>Consecutive Failures:</strong> \${status.consecutiveFailures}</p>
                                <p><strong>Notifications:</strong> Webhook: \${status.notifications.webhook ? '✅' : '❌'}, Telegram: \${status.notifications.telegram ? '✅' : '❌'}</p>
                            \`;
                        } catch (error) {
                            document.getElementById('status').innerHTML = '<p class="status-bad">❌ Failed to load status</p>';
                        }
                    }
                    
                    // Auto refresh every 30 seconds
                    setInterval(refreshStatus, 30000);
                    refreshStatus();
                </script>
            </body>
            </html>
        `);
    });
    
    const PORT = process.env.MONITOR_PORT || 3002;
    app.listen(PORT, () => {
        console.log(`📊 Web dashboard available at http://localhost:${PORT}`);
    });
}

// ==========================================
// CLI USAGE
// ==========================================

if (require.main === module) {
    const monitor = new RemoteMonitor();
    
    const command = process.argv[2] || 'start';
    
    switch (command) {
        case 'start':
            monitor.startMonitoring();
            createWebDashboard(monitor);
            break;
        
        case 'status':
            console.log('📊 Current Status:');
            console.log(JSON.stringify(monitor.getStatus(), null, 2));
            break;
        
        case 'test-notification':
            monitor.sendNotification('Test notification from TaskMaster 🚀', 'info')
                .then(() => console.log('✅ Test notification sent'))
                .catch(err => console.error('❌ Test failed:', err.message));
            break;
        
        default:
            console.log('Usage: node remote-monitor.js [start|status|test-notification]');
            break;
    }
}

module.exports = RemoteMonitor;
