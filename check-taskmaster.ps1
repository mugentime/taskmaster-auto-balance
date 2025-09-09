# Check TaskMaster Status
Write-Host "🔍 VERIFICANDO ESTADO DE TASKMASTER" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

# Check for running node processes
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }

if ($nodeProcesses) {
    Write-Host "✅ Procesos Node.js encontrados:" -ForegroundColor Green
    foreach ($process in $nodeProcesses) {
        Write-Host "   PID: $($process.Id) | Memoria: $([math]::Round($process.WorkingSet/1MB, 2)) MB | Tiempo: $($process.TotalProcessorTime)" -ForegroundColor White
    }
} else {
    Write-Host "❌ No se encontraron procesos Node.js activos" -ForegroundColor Red
    Write-Host "💡 Para iniciar TaskMaster: .\start-background.ps1" -ForegroundColor Yellow
    exit 1
}

# Check if we can access the current directory files
Write-Host ""
Write-Host "📂 Verificando archivos de TaskMaster:" -ForegroundColor Cyan

$files = @("enhanced-taskmaster.js", "auto-balance-manager.js", "balance-notifications.js")
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file (FALTANTE)" -ForegroundColor Red
    }
}

# Test portfolio valuation
Write-Host ""
Write-Host "💰 Ejecutando test rápido de valoración..." -ForegroundColor Cyan

try {
    $result = node full-portfolio-valuation.js 2>&1 | Select-String -Pattern "Valor Total Cartera"
    if ($result) {
        Write-Host "✅ Sistema funcionando: $result" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Test de valoración completado (revisar detalles)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error en test de valoración: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "📊 COMANDOS ÚTILES:" -ForegroundColor Yellow
Write-Host "   • Detener: .\stop-taskmaster.ps1" -ForegroundColor White
Write-Host "   • Reiniciar: .\start-background.ps1" -ForegroundColor White  
Write-Host "   • Ver portfolio: node full-portfolio-valuation.js" -ForegroundColor White
Write-Host "   • Test notifications: node balance-notifications.js --test" -ForegroundColor White
