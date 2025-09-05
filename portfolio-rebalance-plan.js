// Portfolio Rebalancing Plan - Emergency Actions
// Addresses critical overexposure and liquidity issues

const REBALANCE_PLAN = {
    currentState: {
        totalCapital: 10.79,
        usedCapital: 55.38,
        utilizationRate: 513.3,
        riskLevel: 'CRITICAL'
    },
    
    targetState: {
        totalCapital: 55, // Real available after counting asset values
        maxUtilization: 70, // 70% safe utilization
        targetInvested: 38.5, // 70% of 55
        reserveBuffer: 16.5 // 30% reserve
    },
    
    actions: [
        {
            priority: 1,
            action: 'IMMEDIATE_CAPITAL_INJECTION',
            description: 'Add more USDT to match real portfolio size',
            details: {
                needed: 44.21, // To reach sustainable levels
                method: 'Deposit USDT or sell some assets',
                urgency: 'CRITICAL'
            }
        },
        {
            priority: 2, 
            action: 'REDUCE_POSITION_SIZES',
            description: 'Scale down current bots to safe levels',
            details: {
                currentBio: 30.20,
                targetBio: 20.00,
                reductionBio: 10.20,
                
                currentRed: 25.17,
                targetRed: 18.50,
                reductionRed: 6.67,
                
                totalReduction: 16.87
            }
        },
        {
            priority: 3,
            action: 'INCREASE_USDT_RESERVES',
            description: 'Maintain liquid USDT for opportunities',
            details: {
                currentSpotUsdt: 0.83,
                targetSpotUsdt: 15.00,
                needed: 14.17
            }
        },
        {
            priority: 4,
            action: 'UPDATE_AUTOMATION_LIMITS',
            description: 'Adjust automation to prevent overexposure',
            details: {
                currentMaxPerBot: 25,
                newMaxPerBot: 15,
                currentMaxConcurrent: 3,
                newMaxConcurrent: 2,
                reason: 'Prevent overexposure until capital increases'
            }
        }
    ]
};

function generateRebalancePlan() {
    console.log('🚨 PLAN DE REBALANCE DE EMERGENCIA');
    console.log('═══════════════════════════════════');
    
    console.log('\n📊 ESTADO ACTUAL:');
    console.log(`   Capital Real: $${REBALANCE_PLAN.currentState.totalCapital}`);
    console.log(`   Capital en Uso: $${REBALANCE_PLAN.currentState.usedCapital}`);
    console.log(`   Utilización: ${REBALANCE_PLAN.currentState.utilizationRate}%`);
    console.log(`   Nivel de Riesgo: ${REBALANCE_PLAN.currentState.riskLevel}`);
    
    console.log('\n🎯 ESTADO OBJETIVO:');
    console.log(`   Capital Objetivo: $${REBALANCE_PLAN.targetState.totalCapital}`);
    console.log(`   Utilización Segura: ${REBALANCE_PLAN.targetState.maxUtilization}%`);
    console.log(`   Capital Invertido: $${REBALANCE_PLAN.targetState.targetInvested}`);
    console.log(`   Reserva de Seguridad: $${REBALANCE_PLAN.targetState.reserveBuffer}`);
    
    console.log('\n🔧 ACCIONES REQUERIDAS:');
    REBALANCE_PLAN.actions.forEach((action, index) => {
        console.log(`\n   ${index + 1}. ${action.action} (Prioridad: ${action.priority})`);
        console.log(`      ${action.description}`);
        
        Object.keys(action.details).forEach(key => {
            const value = action.details[key];
            if (typeof value === 'number') {
                console.log(`      ${key}: $${value.toFixed(2)}`);
            } else {
                console.log(`      ${key}: ${value}`);
            }
        });
    });
    
    console.log('\n⚡ OPCIONES INMEDIATAS:');
    console.log('   A. OPCIÓN CONSERVADORA:');
    console.log('      • Cerrar 1 bot completamente');
    console.log('      • Reducir el otro bot a $15');
    console.log('      • Resultado: $15 invertido, 139% utilización');
    console.log('   ');
    console.log('   B. OPCIÓN MODERADA:');
    console.log('      • Agregar $20 USDT al sistema');
    console.log('      • Reducir ambos bots 30%');
    console.log('      • Resultado: $38 invertido, 123% utilización');
    console.log('   ');
    console.log('   C. OPCIÓN IDEAL:');
    console.log('      • Agregar $45 USDT al sistema');
    console.log('      • Mantener bots actuales');
    console.log('      • Resultado: 100% utilización segura');
    
    console.log('\n💡 RECOMENDACIÓN INMEDIATA:');
    console.log('   1. OPCIÓN B: Agregar $20 USDT + reducir posiciones 30%');
    console.log('   2. Esto te da sostenibilidad sin perder todas las posiciones');
    console.log('   3. Puedes escalar gradualmente cuando tengas más capital');
}

// Export specific rebalance actions
const REBALANCE_ACTIONS = {
    // Option A: Conservative (close one bot)
    conservative: async () => {
        console.log('🔄 EJECUTANDO OPCIÓN CONSERVADORA...');
        console.log('   1. Cerrando bot RED completamente');
        console.log('   2. Reduciendo bot BIO a $15');
        console.log('   ⚠️  ADVERTENCIA: Perderás oportunidad en RED');
    },
    
    // Option B: Moderate (add capital + reduce)
    moderate: async () => {
        console.log('🔄 EJECUTANDO OPCIÓN MODERADA...');
        console.log('   1. Agrega $20 USDT al sistema');
        console.log('   2. Reduce BIO bot 30%: $30.20 → $21.14');
        console.log('   3. Reduce RED bot 30%: $25.17 → $17.62');
        console.log('   ✅ RESULTADO: Posiciones sostenibles');
    },
    
    // Option C: Ideal (add full capital)
    ideal: async () => {
        console.log('🔄 EJECUTANDO OPCIÓN IDEAL...');
        console.log('   1. Agrega $45 USDT al sistema');
        console.log('   2. Mantén posiciones actuales');
        console.log('   3. Configura límites más altos');
        console.log('   ✅ RESULTADO: Sistema completamente escalable');
    }
};

if (require.main === module) {
    generateRebalancePlan();
}

module.exports = { REBALANCE_PLAN, REBALANCE_ACTIONS, generateRebalancePlan };
