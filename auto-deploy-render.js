// Auto Deploy to Render using API
require('dotenv').config();
const axios = require('axios');

class RenderAutoDeployer {
    constructor() {
        this.renderApiKey = 'rnd_dMWpJw8DdKqkT1iubRelI1EApbj0';
        this.baseUrl = 'https://api.render.com/v1';
        this.headers = {
            'Authorization': `Bearer ${this.renderApiKey}`,
            'Content-Type': 'application/json'
        };
        
        this.repoUrl = 'https://github.com/mugentime/taskmaster-auto-balance';
        this.branch = 'main';
    }
    
    async getOwnerInfo() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/owners`,
                { headers: this.headers }
            );
            
            if (response.data && response.data.length > 0) {
                return response.data[0].owner; // Extract the owner object
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting owner info:', error.response?.data || error.message);
            return null;
        }
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
            console.log(`🔗 Service ID: ${response.data.service.id}`);
            if (response.data.service.serviceDetails?.url) {
                console.log(`🌐 URL: ${response.data.service.serviceDetails.url}`);
            }
            
            return response.data;
        } catch (error) {
            console.error(`❌ Error creating service ${serviceConfig.name}:`, 
                error.response?.data || error.message);
            return null;
        }
    }
    
    async deployTaskMaster() {
        console.log('🎯 INICIANDO DEPLOYMENT AUTOMÁTICO A RENDER');
        console.log('═══════════════════════════════════════════');
        
        // Get owner info
        const owner = await this.getOwnerInfo();
        if (!owner) {
            console.log('❌ Could not get owner information');
            return false;
        }
        
        console.log(`✅ Owner found: ${owner.name} (${owner.id})`);
        
        // Environment variables
        const envVars = [
            { key: 'NODE_ENV', value: 'production' },
            { key: 'BINANCE_API_KEY', value: process.env.BINANCE_API_KEY },
            { key: 'BINANCE_API_SECRET', value: process.env.BINANCE_API_SECRET },
            { key: 'TELEGRAM_BOT_TOKEN', value: process.env.TELEGRAM_BOT_TOKEN },
            { key: 'TELEGRAM_CHAT_ID', value: process.env.TELEGRAM_CHAT_ID },
            { key: 'DISCORD_WEBHOOK_URL', value: process.env.DISCORD_WEBHOOK_URL || '' }
        ];
        
        // Service configurations
        const services = [
            {
                type: 'web_service',
                name: 'taskmaster-backend',
                ownerId: owner.id,
                serviceDetails: {
                    repo: this.repoUrl,
                    branch: this.branch,
                    buildCommand: 'npm install',
                    startCommand: 'npm run server',
                    plan: 'starter',
                    env: 'node',
                    envVars: [
                        ...envVars,
                        { key: 'PORT', value: '3001' }
                    ]
                }
            },
            {
                type: 'background_worker',
                name: 'taskmaster-auto-balance',
                ownerId: owner.id,
                serviceDetails: {
                    repo: this.repoUrl,
                    branch: this.branch,
                    buildCommand: 'npm install',
                    startCommand: 'npm start',
                    plan: 'starter',
                    env: 'node',
                    envVars: envVars
                }
            },
            {
                type: 'web_service',
                name: 'taskmaster-monitor',
                ownerId: owner.id,
                serviceDetails: {
                    repo: this.repoUrl,
                    branch: this.branch,
                    buildCommand: 'npm install',
                    startCommand: 'node remote-monitor.js start',
                    plan: 'starter',
                    env: 'node',
                    envVars: [
                        ...envVars,
                        { key: 'PORT', value: '3002' }
                    ]
                }
            }
        ];
        
        console.log('\\n📋 CREANDO SERVICIOS...');
        console.log('═══════════════════════════');
        
        const results = [];
        
        for (const service of services) {
            const result = await this.createService(service);
            results.push({
                name: service.name,
                success: !!result,
                data: result
            });
            
            // Wait between service creations
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('\\n📊 RESUMEN DE DEPLOYMENT:');
        console.log('═══════════════════════════');
        
        results.forEach(result => {
            const status = result.success ? '✅ ÉXITO' : '❌ ERROR';
            console.log(`${result.name}: ${status}`);
            
            if (result.success && result.data.service.serviceDetails?.url) {
                console.log(`   URL: ${result.data.service.serviceDetails.url}`);
            }
        });
        
        const successCount = results.filter(r => r.success).length;
        console.log(`\\n🎯 RESULTADO: ${successCount}/3 servicios creados exitosamente`);
        
        if (successCount === 3) {
            console.log('\\n🎉 ¡DEPLOYMENT COMPLETADO EXITOSAMENTE!');
            console.log('═══════════════════════════════════════════');
            console.log('✅ TaskMaster está siendo desplegado en la nube');
            console.log('⏱️  Los servicios tardarán ~5-10 minutos en estar listos');
            console.log('📱 Recibirás notificación de Telegram cuando esté activo');
            console.log('\\n🔗 Servicios:');
            results.forEach(result => {
                if (result.success && result.data.service.serviceDetails?.url) {
                    console.log(`   • ${result.name}: ${result.data.service.serviceDetails.url}`);
                }
            });
            return true;
        } else {
            console.log('\\n⚠️  Deployment parcial completado');
            console.log('Algunos servicios pueden necesitar configuración manual');
            return false;
        }
    }
}

// CLI execution
if (require.main === module) {
    const deployer = new RenderAutoDeployer();
    
    deployer.deployTaskMaster().then(success => {
        if (success) {
            console.log('\\n🚀 TaskMaster deployment initiated successfully!');
            console.log('Monitor progress at: https://dashboard.render.com');
        } else {
            console.log('\\n❌ Deployment completed with errors');
            console.log('Check Render dashboard for details');
        }
    }).catch(error => {
        console.error('❌ Deployment failed:', error.message);
    });
}

module.exports = RenderAutoDeployer;
