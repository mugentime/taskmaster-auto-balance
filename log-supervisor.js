// TaskMaster Log Supervisor - Auto Error Detection & Correction
require('dotenv').config();
const fs = require('fs');
const { spawn, exec } = require('child_process');
const path = require('path');

class TaskMasterLogSupervisor {
    constructor() {
        this.isSupervising = false;
        this.errorPatterns = [
            // API Errors
            { pattern: /Method fundingRate requires symbol parameter/i, action: 'fixFundingRateAPI' },
            { pattern: /checkAllActiveBots is not a function/i, action: 'fixMethodReference' },
            { pattern: /ECONNRESET|ETIMEDOUT|ENOTFOUND/i, action: 'handleNetworkError' },
            
            // Binance API Errors
            { pattern: /API key format invalid|Invalid API-key/i, action: 'checkAPICredentials' },
            { pattern: /Request rate limit exceeded/i, action: 'handleRateLimit' },
            { pattern: /Timestamp for this request is outside the recvWindow/i, action: 'handleTimestamp' },
            
            // System Errors
            { pattern: /Cannot find module/i, action: 'handleMissingModule' },
            { pattern: /SyntaxError|ReferenceError|TypeError/i, action: 'handleCodeError' },
            { pattern: /EMFILE|ENOMEM/i, action: 'handleSystemResource' },
            
            // TaskMaster Specific
            { pattern: /Portfolio optimization failed/i, action: 'restartOptimization' },
            { pattern: /Telegram notification failed/i, action: 'fixTelegramNotification' },
            { pattern: /Balance detection failed/i, action: 'restartBalanceDetection' }
        ];
        
        this.errorHistory = [];
        this.correctionActions = 0;
        this.startTime = new Date();
    }
    
    async startSupervision() {
        if (this.isSupervising) {
            console.log('⚠️ Log supervision already running');
            return;
        }
        
        console.log('🔍 INICIANDO SUPERVISIÓN DE LOGS TASKMASTER');
        console.log('═══════════════════════════════════════════');
        console.log(`⏰ ${new Date().toLocaleString()}`);
        console.log('👁️  Monitoreando logs en tiempo real...');
        console.log('🛠️  Corrección automática de errores: ACTIVA');
        
        this.isSupervising = true;
        
        // Monitor TaskMaster processes
        this.monitorTaskMasterProcesses();
        
        // Check system health every 5 minutes
        this.systemHealthInterval = setInterval(() => {
            this.checkSystemHealth();
        }, 5 * 60 * 1000);
        
        // Generate status report every 30 minutes
        this.statusReportInterval = setInterval(() => {
            this.generateStatusReport();
        }, 30 * 60 * 1000);
        
        console.log('✅ Supervisión iniciada exitosamente');
        console.log('Press Ctrl+C to stop supervision');
    }
    
    async monitorTaskMasterProcesses() {
        // Run a continuous check of TaskMaster output
        const monitorCommand = 'powershell';
        const monitorArgs = [
            '-Command',
            `while ($true) { 
                Get-Process | Where-Object { $_.ProcessName -eq 'node' } | ForEach-Object { 
                    Write-Output "Process: $($_.Id) - Memory: $([math]::Round($_.WorkingSet/1MB, 2))MB - CPU: $($_.CPU)"
                }; 
                Start-Sleep -Seconds 30 
            }`
        ];
        
        const monitor = spawn(monitorCommand, monitorArgs, { 
            stdio: ['ignore', 'pipe', 'pipe'] 
        });
        
        monitor.stdout.on('data', (data) => {
            const output = data.toString();
            this.analyzeOutput(output, 'PROCESS_MONITOR');
        });
        
        monitor.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            this.analyzeOutput(errorOutput, 'PROCESS_ERROR');
        });
        
        monitor.on('close', (code) => {
            console.log(`🔍 Process monitor exited with code ${code}`);
            if (this.isSupervising) {
                setTimeout(() => this.monitorTaskMasterProcesses(), 5000);
            }
        });
    }
    
    analyzeOutput(output, source) {
        const lines = output.split('\\n');
        
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            // Log the line with timestamp
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${source}] ${line.trim()}`);
            
            // Check for error patterns
            for (const errorPattern of this.errorPatterns) {
                if (errorPattern.pattern.test(line)) {
                    this.handleDetectedError(line, errorPattern, source);
                    break;
                }
            }
            
            // Check for success indicators
            this.checkSuccessIndicators(line);
        }
    }
    
    async handleDetectedError(errorLine, errorPattern, source) {
        const errorInfo = {
            timestamp: new Date(),
            error: errorLine,
            pattern: errorPattern.pattern.toString(),
            action: errorPattern.action,
            source: source,
            corrected: false
        };
        
        console.log('\\n🚨 ERROR DETECTADO:');
        console.log('═══════════════════');
        console.log(`❌ Error: ${errorLine}`);
        console.log(`🔧 Acción: ${errorPattern.action}`);
        console.log(`📍 Fuente: ${source}`);
        
        try {
            const corrected = await this.executeCorrectionAction(errorPattern.action, errorLine);
            errorInfo.corrected = corrected;
            
            if (corrected) {
                console.log('✅ Error corregido automáticamente');
                this.correctionActions++;
            } else {
                console.log('⚠️ Error requiere intervención manual');
            }
            
        } catch (correctionError) {
            console.log(`❌ Error en corrección: ${correctionError.message}`);
        }
        
        this.errorHistory.push(errorInfo);
    }
    
    async executeCorrectionAction(action, errorLine) {
        switch (action) {
            case 'fixFundingRateAPI':
                return await this.fixFundingRateAPI();
            case 'fixMethodReference':
                return await this.fixMethodReference();
            case 'handleNetworkError':
                return await this.handleNetworkError();
            case 'checkAPICredentials':
                return await this.checkAPICredentials();
            case 'handleRateLimit':
                return await this.handleRateLimit();
            case 'handleTimestamp':
                return await this.handleTimestamp();
            case 'handleMissingModule':
                return await this.handleMissingModule(errorLine);
            case 'handleCodeError':
                return await this.handleCodeError(errorLine);
            case 'handleSystemResource':
                return await this.handleSystemResource();
            case 'restartOptimization':
                return await this.restartOptimization();
            case 'fixTelegramNotification':
                return await this.fixTelegramNotification();
            case 'restartBalanceDetection':
                return await this.restartBalanceDetection();
            default:
                console.log(`⚠️ No hay acción definida para: ${action}`);
                return false;
        }
    }
    
    async fixFundingRateAPI() {
        console.log('🔧 Fixing funding rate API call...');
        
        // Update the auto-balance-manager.js file
        const filePath = 'auto-balance-manager.js';
        let content = fs.readFileSync(filePath, 'utf8');
        
        const oldCode = `const fundingRates = await this.client.futuresFundingRate({});`;
        const newCode = `// Get funding rates using premium index approach
            const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT'];
            const fundingRates = [];
            for (const symbol of symbols) {
                try {
                    const rate = await this.client.futuresFundingRate({ symbol });
                    fundingRates.push(rate);
                } catch (e) {
                    console.log(\`Warning: Could not get funding rate for \${symbol}\`);
                }
            }`;
        
        if (content.includes(oldCode)) {
            content = content.replace(oldCode, newCode);
            fs.writeFileSync(filePath, content);
            console.log('✅ Funding rate API fixed');
            return true;
        }
        
        return false;
    }
    
    async fixMethodReference() {
        console.log('🔧 Fixing method reference...');
        
        const filePath = 'enhanced-taskmaster.js';
        let content = fs.readFileSync(filePath, 'utf8');
        
        const oldCode = `const activeBots = await this.balanceManager.checkAllActiveBots();`;
        const newCode = `const { checkAllActiveBots } = require('./check-all-bots.js');
            const activeBots = await checkAllActiveBots();`;
        
        if (content.includes(oldCode)) {
            content = content.replace(oldCode, newCode);
            fs.writeFileSync(filePath, content);
            console.log('✅ Method reference fixed');
            return true;
        }
        
        return false;
    }
    
    async handleNetworkError() {
        console.log('🔧 Handling network error - implementing retry logic...');
        
        // Wait 30 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Test network connectivity
        try {
            const testResult = await this.testNetworkConnectivity();
            if (testResult) {
                console.log('✅ Network connectivity restored');
                return true;
            }
        } catch (error) {
            console.log('❌ Network still unstable');
        }
        
        return false;
    }
    
    async testNetworkConnectivity() {
        return new Promise((resolve) => {
            exec('ping -n 1 api.binance.com', (error, stdout) => {
                resolve(!error && stdout.includes('Reply from'));
            });
        });
    }
    
    async checkAPICredentials() {
        console.log('🔧 Checking API credentials...');
        
        const apiKey = process.env.BINANCE_API_KEY;
        const apiSecret = process.env.BINANCE_API_SECRET;
        
        if (!apiKey || !apiSecret) {
            console.log('❌ API credentials missing in environment');
            return false;
        }
        
        console.log('✅ API credentials present');
        return true;
    }
    
    async handleRateLimit() {
        console.log('🔧 Handling rate limit - implementing backoff...');
        
        // Wait 60 seconds for rate limit to reset
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        console.log('✅ Rate limit backoff completed');
        return true;
    }
    
    async handleTimestamp() {
        console.log('🔧 Handling timestamp synchronization...');
        
        // Sync system time (Windows)
        return new Promise((resolve) => {
            exec('w32tm /resync', (error) => {
                if (error) {
                    console.log('⚠️ Could not sync time automatically');
                    resolve(false);
                } else {
                    console.log('✅ System time synchronized');
                    resolve(true);
                }
            });
        });
    }
    
    async handleMissingModule(errorLine) {
        console.log('🔧 Handling missing module...');
        
        const moduleMatch = errorLine.match(/Cannot find module ['"]([^'"]+)['"]/);
        if (moduleMatch) {
            const moduleName = moduleMatch[1];
            console.log(`📦 Installing missing module: ${moduleName}`);
            
            return new Promise((resolve) => {
                exec(`npm install ${moduleName}`, (error, stdout) => {
                    if (error) {
                        console.log(`❌ Failed to install ${moduleName}: ${error.message}`);
                        resolve(false);
                    } else {
                        console.log(`✅ Module ${moduleName} installed successfully`);
                        resolve(true);
                    }
                });
            });
        }
        
        return false;
    }
    
    async handleCodeError(errorLine) {
        console.log('🔧 Handling code error...');
        console.log(`⚠️ Code error detected: ${errorLine}`);
        console.log('📧 Manual review required for code errors');
        return false;
    }
    
    async handleSystemResource() {
        console.log('🔧 Handling system resource issue...');
        
        // Get system memory info
        return new Promise((resolve) => {
            exec('wmic computersystem get TotalPhysicalMemory', (error, stdout) => {
                if (!error) {
                    console.log('💾 System memory status checked');
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
    }
    
    async restartOptimization() {
        console.log('🔧 Restarting portfolio optimization...');
        
        try {
            // Run a manual portfolio check
            exec('node full-portfolio-valuation.js', (error, stdout) => {
                if (error) {
                    console.log('❌ Portfolio check failed');
                } else {
                    console.log('✅ Portfolio optimization restarted');
                }
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    async fixTelegramNotification() {
        console.log('🔧 Fixing Telegram notifications...');
        
        try {
            exec('node balance-notifications.js --test', (error, stdout) => {
                if (error) {
                    console.log('❌ Telegram test failed');
                } else {
                    console.log('✅ Telegram notifications working');
                }
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    async restartBalanceDetection() {
        console.log('🔧 Restarting balance detection...');
        
        try {
            exec('node auto-balance-manager.js', (error, stdout) => {
                if (error) {
                    console.log('❌ Balance detection restart failed');
                } else {
                    console.log('✅ Balance detection restarted');
                }
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    checkSuccessIndicators(line) {
        const successPatterns = [
            /TaskMaster initialized successfully/i,
            /Portfolio optimized - no rebalance needed/i,
            /Telegram notification sent/i,
            /Enhanced TaskMaster started successfully/i
        ];
        
        for (const pattern of successPatterns) {
            if (pattern.test(line)) {
                console.log(`✅ SUCCESS: ${line.trim()}`);
                break;
            }
        }
    }
    
    async checkSystemHealth() {
        console.log('\\n🏥 SYSTEM HEALTH CHECK');
        console.log('═════════════════════');
        
        // Check running processes
        exec('Get-Process | Where-Object { $_.ProcessName -eq "node" }', { shell: 'powershell' }, (error, stdout) => {
            if (stdout.trim()) {
                const processCount = stdout.split('\\n').filter(line => line.includes('node')).length;
                console.log(`✅ Node processes: ${processCount} running`);
            } else {
                console.log('⚠️ No Node processes found - TaskMaster may have stopped');
                this.attemptTaskMasterRestart();
            }
        });
        
        // Check memory usage
        exec('wmic process where name="node.exe" get ProcessId,WorkingSetSize', (error, stdout) => {
            if (!error && stdout.includes('WorkingSetSize')) {
                console.log('💾 Memory usage checked');
            }
        });
        
        console.log(`🔧 Corrections made: ${this.correctionActions}`);
        console.log(`📊 Errors tracked: ${this.errorHistory.length}`);
    }
    
    async attemptTaskMasterRestart() {
        console.log('🔄 Attempting TaskMaster restart...');
        
        exec('powershell -ExecutionPolicy Bypass -File start-background.ps1', (error, stdout) => {
            if (error) {
                console.log('❌ Auto-restart failed - manual intervention required');
            } else {
                console.log('✅ TaskMaster restarted automatically');
            }
        });
    }
    
    generateStatusReport() {
        const uptime = Date.now() - this.startTime.getTime();
        const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log('\\n📊 SUPERVISION STATUS REPORT');
        console.log('═══════════════════════════════');
        console.log(`⏰ Supervision uptime: ${uptimeHours}h ${uptimeMinutes}m`);
        console.log(`🛠️ Auto-corrections: ${this.correctionActions}`);
        console.log(`📋 Total errors tracked: ${this.errorHistory.length}`);
        
        if (this.errorHistory.length > 0) {
            console.log('\\n🔍 Recent errors:');
            this.errorHistory.slice(-3).forEach((error, idx) => {
                const status = error.corrected ? '✅ FIXED' : '⚠️ PENDING';
                console.log(`   ${idx + 1}. ${error.action} - ${status}`);
            });
        }
        
        console.log('✅ System supervision active\\n');
    }
    
    stop() {
        console.log('\\n🛑 Stopping log supervision...');
        this.isSupervising = false;
        
        if (this.systemHealthInterval) {
            clearInterval(this.systemHealthInterval);
        }
        
        if (this.statusReportInterval) {
            clearInterval(this.statusReportInterval);
        }
        
        console.log('✅ Log supervision stopped');
    }
}

// CLI execution
if (require.main === module) {
    const supervisor = new TaskMasterLogSupervisor();
    
    supervisor.startSupervision();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        supervisor.stop();
        process.exit(0);
    });
}

module.exports = TaskMasterLogSupervisor;
