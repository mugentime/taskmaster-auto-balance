# System Monitoring & Control Guide

## Quick Commands

### Real-time Monitoring
```powershell
# System status snapshot
node monitor-system.js

# Continuous monitoring (every 30s)
node monitor-system.js watch

# Quick position check
node emergency-controls.js status
```

### Process Management
```powershell
# Check running processes
Get-Process | Where-Object { $_.ProcessName -eq "node" }

# View engine logs
Get-Content -Path .\logs\automation-engine.out.log -Tail 20
Get-Content -Path .\logs\automation-engine.out.log -Wait  # Live tail

# View API logs
Get-Content -Path .\logs\api.out.log -Tail 10
```

### Emergency Controls
```powershell
# Close all positions (5-second countdown)
node emergency-controls.js close-all

# Stop automation engine
Stop-Process -Id $global:eng.Id

# Stop API server
Stop-Process -Id $global:api.Id
```

## Current System Status

### Running Services
- 🤖 **Automation Engine** (PID: 34796) - Scanning every 30s
- 📡 **API Server** (PID: 36244) - Port 3001
- 📱 **Telegram Bot** - Listening for commands

### Active Positions
- 📈 **ETHUSDT**: LONG 0.005 ETH (~$21.46 notional)

### Available Capital
- 💰 **Total Available**: $37.03 USDT
- 🚀 **Futures Balance**: $36.79 USDT (available for trading)

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/status` | Complete system overview |
| `/portfolio` | Portfolio valuation and utilization |
| `/bots` | Active arbitrage bot status |
| `/earnings` | Earnings projections |
| `/health` | System health check |
| `/help` | Command reference |

## Key Features Enabled

### ✅ Micro-Capital Mode
- Minimum investment: $2 USDT
- Maximum concurrent bots: 1
- Optimized for small accounts ($7-50)

### ✅ Environment Overrides
- `ENGINE_MIN_INVESTMENT=2`
- `ENGINE_MAX_CONCURRENT_BOTS=1`
- `ENGINE_MIN_FUNDING_RATE=0.00005`
- `ENGINE_MIN_LIQUIDITY=500000`

### ✅ Timestamp Fixes
- All Binance API calls use `-2000ms` offset
- Prevents "ahead of server time" errors

### ✅ Fallback Opportunities
- Direct Binance funding rate fetching when API is down
- Ensures continuous operation

## Performance Monitoring

### Current Opportunities
Top funding rates available:
1. **MYXUSDT**: -1.65% (1811% APY) - Short Perp
2. **KAITOUSDT**: -0.35% (382% APY) - Short Perp  
3. **AIOUSDT**: -0.16% (178% APY) - Short Perp

### Auto-Launch Status
The engine is actively scanning but may need manual intervention for:
- Insufficient balance for minimum notionals
- Specific token requirements

## Troubleshooting

### Common Issues
1. **"Insufficient balance"** - Check minimum notionals (usually $20+ for most futures)
2. **"Timestamp ahead"** - Already fixed with getTime offset
3. **"No opportunities"** - Funding rates change every 8 hours

### Manual Launch
```bash
# Launch specific opportunity with custom size
node launch-specific-symbol.js ETHUSDT 22 3
```

### Log Monitoring
```powershell
# Watch for auto-launches
Select-String -Path .\logs\automation-engine.out.log -Pattern "AUTO-LAUNCHING" -Wait

# Check for errors
Select-String -Path .\logs\automation-engine.err.log -Pattern "ERROR|Failed" -Wait
```
