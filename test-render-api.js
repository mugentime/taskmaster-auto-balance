// Test Render API
const axios = require('axios');

async function testRenderAPI() {
    const renderApiKey = 'rnd_dMWpJw8DdKqkT1iubRelI1EApbj0';
    const headers = {
        'Authorization': `Bearer ${renderApiKey}`,
        'Content-Type': 'application/json'
    };
    
    console.log('🔍 Testing Render API...');
    console.log('═══════════════════════');
    
    try {
        // Test owners endpoint
        console.log('📋 Getting owners...');
        const ownersResponse = await axios.get(
            'https://api.render.com/v1/owners',
            { headers }
        );
        
        console.log('✅ Owners response:');
        console.log(JSON.stringify(ownersResponse.data, null, 2));
        
    } catch (error) {
        console.error('❌ Owners error:', error.response?.data || error.message);
    }
    
    try {
        // Test services endpoint
        console.log('\n📋 Getting services...');
        const servicesResponse = await axios.get(
            'https://api.render.com/v1/services',
            { headers }
        );
        
        console.log('✅ Services response:');
        console.log(`Found ${servicesResponse.data.length} existing services`);
        servicesResponse.data.forEach(service => {
            console.log(`  - ${service.service.name} (${service.service.type})`);
        });
        
    } catch (error) {
        console.error('❌ Services error:', error.response?.data || error.message);
    }
}

testRenderAPI();
