// Auto-Launch Integration Script
// Integrates automation engine with existing launch-best-opportunity.js

require('dotenv').config();
const { execSync } = require('child_process');

async function autoLaunchOpportunity(symbol, investment = 10, leverage = 3) {
    try {
        console.log(`🚀 INTEGRATED AUTO-LAUNCH: ${symbol}`);
        console.log(`   Investment: $${investment}, Leverage: ${leverage}x`);
        
        // Use the launch-specific-symbol script with the provided symbol
        const command = `node launch-specific-symbol.js ${symbol} ${investment} ${leverage}`;
        
        console.log(`   Executing: ${command}`);
        const result = execSync(command, { 
            encoding: 'utf8',
            timeout: 30000 // 30 second timeout
        });
        
        console.log(`   ✅ Launch result: ${result.slice(0, 200)}...`);
        
        return {
            success: true,
            output: result,
            symbol,
            investment,
            leverage
        };
        
    } catch (error) {
        console.error(`❌ Auto-launch failed for ${symbol}:`, error.message);
        return {
            success: false,
            error: error.message,
            symbol,
            investment,
            leverage
        };
    }
}

// Export for use in automation engine
module.exports = { autoLaunchOpportunity };

// CLI usage
if (require.main === module) {
    const symbol = process.argv[2];
    const investment = parseFloat(process.argv[3]) || 10;
    const leverage = parseFloat(process.argv[4]) || 3;
    
    if (!symbol) {
        console.log('Usage: node auto-launch-integration.js <SYMBOL> [INVESTMENT] [LEVERAGE]');
        console.log('Example: node auto-launch-integration.js REDUSDT 10 3');
        process.exit(1);
    }
    
    autoLaunchOpportunity(symbol, investment, leverage)
        .then(result => {
            console.log('Final result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Script error:', error);
            process.exit(1);
        });
}
