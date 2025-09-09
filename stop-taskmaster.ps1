# Stop TaskMaster
Write-Host "🛑 DETENIENDO TASKMASTER" -ForegroundColor Red
Write-Host "=======================" -ForegroundColor Red

# Find TaskMaster processes
$nodeProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }

if ($nodeProcesses) {
    Write-Host "🔍 Procesos Node.js encontrados:" -ForegroundColor Yellow
    foreach ($process in $nodeProcesses) {
        Write-Host "   PID: $($process.Id) | Memoria: $([math]::Round($process.WorkingSet/1MB, 2)) MB" -ForegroundColor White
    }
    
    Write-Host ""
    $choice = Read-Host "¿Detener TODOS los procesos Node.js? (y/n)"
    
    if ($choice -eq "y" -or $choice -eq "Y") {
        try {
            foreach ($process in $nodeProcesses) {
                Write-Host "🛑 Deteniendo PID: $($process.Id)..." -ForegroundColor Yellow
                $process | Stop-Process -Force
            }
            
            # Wait a moment and verify
            Start-Sleep -Seconds 2
            $remainingProcesses = Get-Process | Where-Object { $_.ProcessName -eq "node" }
            
            if (!$remainingProcesses) {
                Write-Host "✅ TaskMaster detenido exitosamente" -ForegroundColor Green
                Write-Host "💡 Para reiniciar: .\start-background.ps1" -ForegroundColor Cyan
            } else {
                Write-Host "⚠️  Algunos procesos pueden seguir ejecutándose" -ForegroundColor Yellow
            }
            
        } catch {
            Write-Host "❌ Error deteniendo procesos: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Operación cancelada" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  No se encontraron procesos Node.js ejecutándose" -ForegroundColor Cyan
    Write-Host "💡 TaskMaster no parece estar corriendo" -ForegroundColor Yellow
}
