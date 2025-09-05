# Script para iniciar la aplicación completa en ventanas separadas
Write-Host "🚀 Iniciando aplicación completa..." -ForegroundColor Green

# Detener procesos existentes
Write-Host "🔄 Deteniendo procesos anteriores..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -eq "node"} | ForEach-Object { Stop-Process -Id $_.Id -Force } 2>$null

# Iniciar Task Master (Backend) en ventana oculta
Write-Host "🤖 Iniciando Task Master..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot'; node taskmaster-silent.js" -WindowStyle Hidden

# Esperar 3 segundos para que el backend se inicie
Start-Sleep 3

# Registrar bot RED
Write-Host "📝 Registrando bot RED..." -ForegroundColor Blue
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot'; node register-red-bot-manual.js; pause" -WindowStyle Normal

# Iniciar Frontend en nueva ventana
Write-Host "🌐 Iniciando Frontend..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot/..'; node serve-frontend.cjs; pause" -WindowStyle Normal

# Esperar 5 segundos y abrir navegador
Start-Sleep 5
Write-Host "🌍 Abriendo navegador..." -ForegroundColor Green
Start-Process "http://localhost:8080"

Write-Host "✅ Aplicación iniciada exitosamente!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Frontend: http://localhost:8080" -ForegroundColor White
Write-Host "🔧 Backend API: http://localhost:3001/api/v1/status" -ForegroundColor White
Write-Host "🤖 Bot Status: http://localhost:3001/api/v1/bots" -ForegroundColor White
Write-Host ""
Write-Host "Presiona cualquier tecla para continuar..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
