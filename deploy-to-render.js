// Deploy TaskMaster to Render.com
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class RenderDeployer {
    constructor() {
        this.renderApiKey = 'rnd_dMWpJw8DdKqkT1iubRelI1EApbj0';
        this.baseUrl = 'https://api.render.com/v1';
        this.headers = {
            'Authorization': `Bearer ${this.renderApiKey}`,
            'Content-Type': 'application/json'
        };
    }
    
    async createService(serviceConfig) {
        try {
            console.log(`🚀 Creating service: ${serviceConfig.name}`);
            
            const response = await axios.post(
                `${this.baseUrl}/services`,
                serviceConfig,
                { headers: this.headers }
            );
            
            console.log(`✅ Service created: ${response.data.service.name}`);
            console.log(`🔗 Service URL: ${response.data.service.serviceDetails?.url || 'N/A'}`);
            
            return response.data;
        } catch (error) {
            console.error(`❌ Error creating service ${serviceConfig.name}:`, 
                error.response?.data?.message || error.message);
            return null;
        }
    }
    
    async getServices() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/services`,
                { headers: this.headers }
            );
            
            return response.data;
        } catch (error) {
            console.error('❌ Error fetching services:', error.message);
            return null;
        }
    }
    
    async deployTaskMaster() {
        console.log('🎯 DEPLOYING TASKMASTER TO RENDER.COM');
        console.log('════════════════════════════════════════');
        
        // Service configurations
        const services = [
            {
                type: 'web_service',
                name: 'taskmaster-backend',
                ownerId: 'usr-cm0mw9v6s5ws73cdaag0', // You'll need to get this from your Render account
                repo: 'https://github.com/your-username/taskmaster', // Update with your repo
                branch: 'main',
                rootDir: '.',
                env: 'node',
                buildCommand: 'npm install',
                startCommand: 'npm run server',
                plan: 'free',
                envVars: [
                    { key: 'NODE_ENV', value: 'production' },
                    { key: 'PORT', value: '3001' }
                ]
            },
            {
                type: 'background_worker',
                name: 'taskmaster-auto-balance',
                ownerId: 'usr-cm0mw9v6s5ws73cdaag0', // You'll need to get this from your Render account
                repo: 'https://github.com/your-username/taskmaster', // Update with your repo
                branch: 'main',
                rootDir: '.',
                env: 'node',
                buildCommand: 'npm install',
                startCommand: 'npm start',
                plan: 'free',
                envVars: [
                    { key: 'NODE_ENV', value: 'production' }
                ]
            }
        ];
        
        console.log('📋 Checking existing services...');
        const existingServices = await this.getServices();
        
        if (existingServices) {
            console.log(`📊 Found ${existingServices.length} existing services`);
            
            // List existing services
            existingServices.forEach(service => {
                console.log(`   • ${service.service.name} (${service.service.type})`);
            });
        }
        
        console.log('\n🎯 Deployment Strategy:');
        console.log('Since we need GitHub repo for Render deployment, here\'s what we\'ll do:\n');
        
        console.log('📝 MANUAL DEPLOYMENT STEPS:');
        console.log('═════════════════════════════════');
        console.log('1. Push your code to GitHub repository');
        console.log('2. Go to render.com and create new services');
        console.log('3. Connect your GitHub repo');
        console.log('4. Use the render.yaml configuration');
        console.log('\n⚡ OR use the automated setup below:');
        
        return {
            success: true,
            message: 'Ready for deployment',
            nextSteps: [
                'Push code to GitHub',
                'Create Render services via dashboard',
                'Set environment variables',
                'Deploy!'
            ]
        };
    }
    
    async setupEnvironmentVariables() {
        console.log('🔧 ENVIRONMENT VARIABLES SETUP');
        console.log('════════════════════════════════');
        
        const requiredEnvVars = {
            'BINANCE_API_KEY': process.env.BINANCE_API_KEY,
            'BINANCE_API_SECRET': process.env.BINANCE_API_SECRET,
            'TELEGRAM_BOT_TOKEN': process.env.TELEGRAM_BOT_TOKEN,
            'TELEGRAM_CHAT_ID': process.env.TELEGRAM_CHAT_ID,
            'DISCORD_WEBHOOK_URL': process.env.DISCORD_WEBHOOK_URL || 'not-configured'
        };
        
        console.log('✅ Environment variables to set in Render:');
        Object.entries(requiredEnvVars).forEach(([key, value]) => {
            const status = value ? '✅ SET' : '❌ MISSING';
            const displayValue = value ? (value.length > 20 ? value.substring(0, 20) + '...' : value) : 'NOT SET';
            console.log(`   ${key}: ${status} (${displayValue})`);
        });
        
        return requiredEnvVars;
    }
    
    generateDeploymentInstructions() {
        console.log('\n📋 RENDER DEPLOYMENT INSTRUCTIONS');
        console.log('═══════════════════════════════════════');
        
        console.log('\n1️⃣  PREPARE REPOSITORY:');
        console.log('   • Push all TaskMaster files to GitHub');
        console.log('   • Ensure render.yaml is in root directory');
        console.log('   • Verify package.json has correct scripts');
        
        console.log('\n2️⃣  CREATE SERVICES IN RENDER:');
        console.log('   • Go to render.com dashboard');
        console.log('   • Click "New" → "Blueprint"');
        console.log('   • Connect your GitHub repository');
        console.log('   • Render will read render.yaml automatically');
        
        console.log('\n3️⃣  SET ENVIRONMENT VARIABLES:');
        console.log('   For each service, add these variables:');
        console.log('   • BINANCE_API_KEY');
        console.log('   • BINANCE_API_SECRET'); 
        console.log('   • TELEGRAM_BOT_TOKEN');
        console.log('   • TELEGRAM_CHAT_ID');
        console.log('   • DISCORD_WEBHOOK_URL (optional)');
        
        console.log('\n4️⃣  DEPLOY:');
        console.log('   • Services will deploy automatically');
        console.log('   • Monitor deployment logs');
        console.log('   • Test functionality once deployed');
        
        console.log('\n🎯 SERVICE ARCHITECTURE:');
        console.log('   • taskmaster-backend (Web): API endpoints');
        console.log('   • taskmaster-auto-balance (Background): Auto balance management');
        console.log('   • taskmaster-monitor (Web): Monitoring dashboard');
        
        return true;
    }
}

// CLI execution
if (require.main === module) {
    const deployer = new RenderDeployer();
    
    const args = process.argv.slice(2);
    
    if (args.includes('--env')) {
        deployer.setupEnvironmentVariables();
    } else if (args.includes('--instructions')) {
        deployer.generateDeploymentInstructions();
    } else {
        deployer.deployTaskMaster().then(result => {
            if (result.success) {
                console.log('\n✅ TaskMaster deployment preparation complete');
                deployer.setupEnvironmentVariables();
                deployer.generateDeploymentInstructions();
            }
        });
    }
}

module.exports = RenderDeployer;
