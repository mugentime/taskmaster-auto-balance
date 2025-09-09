# TaskMaster Setup and Deployment Script
Write-Host "🚀 TASKMASTER DEPLOYMENT SETUP" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check if GitHub CLI is installed
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ GitHub CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   winget install GitHub.cli" -ForegroundColor Yellow
    Write-Host "   Then run: gh auth login" -ForegroundColor Yellow
    exit 1
}

# Check if logged into GitHub
try {
    $ghStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Not logged into GitHub CLI. Please run:" -ForegroundColor Red
        Write-Host "   gh auth login" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ GitHub CLI authenticated" -ForegroundColor Green
} catch {
    Write-Host "❌ Error checking GitHub authentication" -ForegroundColor Red
    exit 1
}

# Create GitHub repository
Write-Host "📂 Creating GitHub repository..." -ForegroundColor Cyan
$repoName = "taskmaster-auto-balance"
$repoDescription = "TaskMaster - Automated Balance Management System for Trading Bots"

try {
    gh repo create $repoName --description $repoDescription --public
    Write-Host "✅ GitHub repository created: $repoName" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Repository might already exist, continuing..." -ForegroundColor Yellow
}

# Add remote origin
Write-Host "🔗 Adding remote origin..." -ForegroundColor Cyan
try {
    git remote add origin "https://github.com/$((gh api user).login)/$repoName.git"
    Write-Host "✅ Remote origin added" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Remote origin might already exist, continuing..." -ForegroundColor Yellow
}

# Push to GitHub
Write-Host "📤 Pushing to GitHub..." -ForegroundColor Cyan
try {
    git branch -M main
    git push -u origin main
    Write-Host "✅ Code pushed to GitHub successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error pushing to GitHub" -ForegroundColor Red
    Write-Host $Error[0] -ForegroundColor Red
    exit 1
}

# Display next steps
Write-Host ""
Write-Host "🎯 NEXT STEPS FOR RENDER DEPLOYMENT:" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Go to https://render.com and sign in" -ForegroundColor Yellow
Write-Host "2. Click 'New' → 'Blueprint'" -ForegroundColor Yellow
Write-Host "3. Connect your GitHub repository: $repoName" -ForegroundColor Yellow
Write-Host "4. Render will automatically detect render.yaml" -ForegroundColor Yellow
Write-Host "5. Set these environment variables for each service:" -ForegroundColor Yellow
Write-Host ""

# Show environment variables needed
Write-Host "📋 ENVIRONMENT VARIABLES TO SET:" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "BINANCE_API_KEY=KP5NFDffn3reE3md2SKk..." -ForegroundColor White
Write-Host "BINANCE_API_SECRET=2bUXyAuNY0zjrlXWi5xC..." -ForegroundColor White  
Write-Host "TELEGRAM_BOT_TOKEN=8220024038:AAF9pY8vb..." -ForegroundColor White
Write-Host "TELEGRAM_CHAT_ID=1828005335" -ForegroundColor White
Write-Host "DISCORD_WEBHOOK_URL=(optional)" -ForegroundColor Gray
Write-Host ""

# Show repository URL
$username = (gh api user).login
$repoUrl = "https://github.com/$username/$repoName"
Write-Host "🔗 Repository URL: $repoUrl" -ForegroundColor Green
Write-Host ""

Write-Host "✅ Setup complete! Ready for Render deployment!" -ForegroundColor Green
Write-Host "🚀 Your TaskMaster will be running 24/7 in the cloud!" -ForegroundColor Cyan
