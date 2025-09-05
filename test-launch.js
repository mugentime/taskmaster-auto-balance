// Test bot launch to debug the error
require('dotenv').config();
const axios = require('axios');

async function testBotLaunch() {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
        console.log('❌ ERROR: API credentials not found');
        return;
    }
    
    console.log('🧪 Testing REDUSDT bot launch...');
    console.log('');
    
    const botData = {
        id: `test-red-${Date.now()}`,
        name: 'Test RED Bot',
        symbol: 'REDUSDT',
        strategyType: 'Short Perp', // Since RED has negative funding rate (-0.3148%), we want Short Perp to earn from it
        investment: 10, // Small test amount
        leverage: 3,
        autoManaged: false,
        autoConvert: false,
        dryRun: false, // Set to false to see real errors, but be careful!
        apiKey: apiKey,
        apiSecret: apiSecret
    };
    
    try {
        console.log('📤 Sending launch request to backend...');
        const response = await axios.post('http://localhost:3001/api/v1/launch-bot', botData, {
            timeout: 60000 // 60 second timeout
        });
        
        if (response.data.success) {
            console.log('✅ SUCCESS: Bot launched successfully!');
            console.log('Bot ID:', response.data.botId);
        } else {
            console.log('❌ FAILED: Bot launch failed');
            console.log('Error:', response.data.message);
        }
        
    } catch (error) {
        console.log('❌ ERROR: Request failed');
        
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Error details:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.data?.message) {
                console.log('');
                console.log('📝 Backend Error Message:');
                console.log(error.response.data.message);
            }
            
            if (error.response.data?.marginDiagnostics) {
                console.log('');
                console.log('📊 Margin Diagnostics:');
                console.log(JSON.stringify(error.response.data.marginDiagnostics, null, 2));
            }
            
        } else if (error.code === 'ECONNREFUSED') {
            console.log('Backend server is not running on port 3001');
        } else {
            console.log('Unexpected error:', error.message);
        }
    }
}

// Run test with dry run first
async function testWithDryRun() {
    console.log('🔍 First testing with DRY RUN mode...');
    
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    const dryRunData = {
        id: `test-red-${Date.now()}`,
        name: 'Test RED Bot (Dry Run)',
        symbol: 'REDUSDT',
        strategyType: 'Long Perp',
        investment: 10,
        leverage: 3,
        autoManaged: false,
        autoConvert: false,
        dryRun: true, // Safe dry run first
        apiKey: apiKey,
        apiSecret: apiSecret
    };
    
    try {
        const response = await axios.post('http://localhost:3001/api/v1/launch-bot', dryRunData, {
            timeout: 60000
        });
        
        console.log('✅ DRY RUN Result:');
        console.log(JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ DRY RUN Error:');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Error:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

console.log('🚀 Starting bot launch test...');
console.log('');

testWithDryRun().catch(console.error);
