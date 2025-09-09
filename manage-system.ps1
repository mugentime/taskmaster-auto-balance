# TaskMaster System Management Script
param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs", "monitor")]
    [string]$Action = "status"
)

Write-Host "🚀 TaskMaster System Management" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

switch ($Action) {
    "start" {
        Write-Host "🟢 Starting all services..." -ForegroundColor Green
        pm2 start ecosystem.config.js
        Write-Host ""
        Write-Host "✅ All services started!" -ForegroundColor Green
        Write-Host "   📡 API Server: http://localhost:3001" -ForegroundColor White
        Write-Host "   🤖 Automation Engine: Scanning for opportunities" -ForegroundColor White
        Write-Host "   📱 Telegram Bot: Listening for commands" -ForegroundColor White
    }
    
    "stop" {
        Write-Host "🔴 Stopping all services..." -ForegroundColor Red
        pm2 stop all
        Write-Host "✅ All services stopped" -ForegroundColor Green
    }
    
    "restart" {
        Write-Host "🔄 Restarting all services..." -ForegroundColor Yellow
        pm2 restart all
        Write-Host "✅ All services restarted" -ForegroundColor Green
    }
    
    "status" {
        Write-Host "📊 System Status:" -ForegroundColor Blue
        pm2 list
        Write-Host ""
        Write-Host "🔍 Quick System Check:" -ForegroundColor Blue
        node monitor-system.js
    }
    
    "logs" {
        Write-Host "📋 Recent Logs:" -ForegroundColor Blue
        Write-Host ""
        Write-Host "=== API Server ===" -ForegroundColor Cyan
        pm2 logs api-server --lines 5
        Write-Host ""
        Write-Host "=== Automation Engine ===" -ForegroundColor Cyan  
        pm2 logs automation-engine --lines 5
        Write-Host ""
        Write-Host "=== Telegram Bot ===" -ForegroundColor Cyan
        pm2 logs telegram-bot --lines 5
    }
    
    "monitor" {
        Write-Host "👀 Live monitoring (Ctrl+C to exit)..." -ForegroundColor Green
        node monitor-system.js watch
    }
}

Write-Host ""
Write-Host "💡 Usage: .\manage-system.ps1 [start|stop|restart|status|logs|monitor]" -ForegroundColor Gray
