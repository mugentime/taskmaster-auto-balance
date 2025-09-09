# TaskMaster Background Launcher
Write-Host "🚀 INICIANDO TASKMASTER EN BACKGROUND" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Check if TaskMaster is already running
$existingProcess = Get-Process | Where-Object { $_.ProcessName -eq "node" -and $_.MainWindowTitle -like "*enhanced-taskmaster*" }

if ($existingProcess) {
    Write-Host "⚠️  TaskMaster parece estar ejecutándose ya" -ForegroundColor Yellow
    Write-Host "PID: $($existingProcess.Id)" -ForegroundColor Yellow
    
    $choice = Read-Host "¿Detener proceso existente y reiniciar? (y/n)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        $existingProcess | Stop-Process -Force
        Write-Host "✅ Proceso anterior detenido" -ForegroundColor Green
    } else {
        Write-Host "❌ Cancelando inicio" -ForegroundColor Red
        exit 1
    }
}

# Start TaskMaster in background
Write-Host "🤖 Iniciando TaskMaster..." -ForegroundColor Green

try {
    # Start in minimized window
    $process = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '🤖 TaskMaster Running...'; node enhanced-taskmaster.js" -WindowStyle Minimized -PassThru
    
    # Wait a moment to check if it started successfully
    Start-Sleep -Seconds 3
    
    if (!$process.HasExited) {
        Write-Host "✅ TaskMaster iniciado exitosamente en background!" -ForegroundColor Green
        Write-Host "📱 Deberías recibir notificación de Telegram" -ForegroundColor Cyan
        Write-Host "🔍 PID: $($process.Id)" -ForegroundColor White
        Write-Host ""
        Write-Host "📋 COMANDOS ÚTILES:" -ForegroundColor Yellow
        Write-Host "   • Ver status: .\check-taskmaster.ps1" -ForegroundColor White
        Write-Host "   • Detener: .\stop-taskmaster.ps1" -ForegroundColor White
        Write-Host "   • Ver logs: Get-Process | Where-Object {`$_.Id -eq $($process.Id)}" -ForegroundColor White
    } else {
        Write-Host "❌ TaskMaster falló al iniciar" -ForegroundColor Red
        Write-Host "Revisa los logs para más detalles" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Error iniciando TaskMaster: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🎉 TaskMaster está corriendo 24/7 en background!" -ForegroundColor Green
Write-Host "💰 Monitoreando tu portfolio cada 30 minutos" -ForegroundColor Cyan
