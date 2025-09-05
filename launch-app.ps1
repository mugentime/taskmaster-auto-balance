Write-Host "Iniciando aplicacion completa..." -ForegroundColor Green

Get-Process | Where-Object {$_.ProcessName -eq "node"} | ForEach-Object { Stop-Process -Id $_.Id -Force } 2>$null

Write-Host "Iniciando Task Master..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot'; node taskmaster-silent.js" -WindowStyle Hidden

Start-Sleep 3

Write-Host "Registrando bot RED..." -ForegroundColor Blue  
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot'; node register-red-bot-manual.js; Read-Host 'Presiona Enter'" -WindowStyle Normal

Write-Host "Iniciando Frontend..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-Command", "cd '$PSScriptRoot/..'; node serve-frontend.cjs" -WindowStyle Normal

Start-Sleep 5
Write-Host "Abriendo navegador..." -ForegroundColor Green
Start-Process "http://localhost:8080"

Write-Host "Aplicacion iniciada exitosamente!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:8080" -ForegroundColor White
Write-Host "Backend API: http://localhost:3001/api/v1/status" -ForegroundColor White
