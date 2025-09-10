// DYNAMIC Asset-to-USDT Converter - Works with ANY assets automatically
require('dotenv').config();
const Binance = require('binance-api-node').default;

async function convertAssetsToUSDT(options = {}) {
    const {
        targetUSDTAmount = null,      // Convert enough assets to reach this USDT amount
        percentageToConvert = 50,     // Or convert this % of non-USDT assets
        excludeAssets = ['BNB'],      // Assets to never sell (keep for fees, etc.)
        minAssetValue = 5,            // Only convert assets worth more than this
        priorityOrder = 'value_desc'  // 'value_desc', 'value_asc', 'alphabetical'
    } = options;

    console.log('🔄 DYNAMIC ASSET → USDT CONVERTER');
    console.log('═══════════════════════════════════');
    console.log(`Mode: ${targetUSDTAmount ? `Target $${targetUSDTAmount}` : `Convert ${percentageToConvert}%`}`);
    console.log('');
    
    const client = Binance({
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: false,
        getTime: () => Date.now() - 2000
    });
    
    try {
        // Get current portfolio
        const account = await client.accountInfo();
        const prices = await client.prices();
        const exchangeInfo = await client.exchangeInfo();
        
        // Analyze all assets
        let assets = [];
        let currentUSDT = 0;
        
        for (const balance of account.balances) {
            const asset = balance.asset;
            const total = parseFloat(balance.free) + parseFloat(balance.locked);
            const free = parseFloat(balance.free);
            
            if (total > 0) {
                if (asset === 'USDT') {
                    currentUSDT = total;
                    continue;
                }
                
                // Skip excluded assets
                if (excludeAssets.includes(asset)) {
                    console.log(`⏭️  Skipping ${asset} (excluded)`);
                    continue;
                }
                
                // Try to find trading pair
                const symbol = asset + 'USDT';
                const price = prices[symbol];
                
                if (price && free > 0) {
                    const usdValue = total * parseFloat(price);
                    
                    if (usdValue >= minAssetValue) {
                        // Check if tradeable (has minimum notional requirements)
                        const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
                        const minNotional = symbolInfo?.filters?.find(f => f.filterType === 'NOTIONAL')?.minNotional || '5';
                        
                        assets.push({
                            asset,
                            symbol,
                            total,
                            free,
                            price: parseFloat(price),
                            usdValue,
                            minNotional: parseFloat(minNotional),
                            canTrade: usdValue >= parseFloat(minNotional)
                        });
                    }
                }
            }
        }
        
        // Sort assets based on priority
        if (priorityOrder === 'value_desc') {
            assets.sort((a, b) => b.usdValue - a.usdValue);
        } else if (priorityOrder === 'value_asc') {
            assets.sort((a, b) => a.usdValue - b.usdValue);
        } else {
            assets.sort((a, b) => a.asset.localeCompare(b.asset));
        }
        
        console.log('📊 CURRENT PORTFOLIO:');
        console.log(`   USDT: $${currentUSDT.toFixed(4)}`);
        assets.forEach(asset => {
            const status = asset.canTrade ? '✅' : '❌';
            console.log(`   ${asset.asset}: ${asset.total.toFixed(6)} = $${asset.usdValue.toFixed(4)} ${status}`);
        });
        console.log('');
        
        // Calculate what to convert
        let conversionsNeeded = [];
        let targetAmount = currentUSDT;
        
        if (targetUSDTAmount) {
            // Convert enough to reach target USDT amount
            let remainingNeeded = targetUSDTAmount - currentUSDT;
            
            if (remainingNeeded <= 0) {
                console.log(`✅ Already have sufficient USDT ($${currentUSDT.toFixed(2)} >= $${targetUSDTAmount})`);
                return { success: true, conversions: [], finalUSDT: currentUSDT };
            }
            
            for (const asset of assets.filter(a => a.canTrade)) {
                if (remainingNeeded <= 0) break;
                
                const convertAmount = Math.min(asset.usdValue, remainingNeeded);
                const quantity = convertAmount / asset.price;
                
                conversionsNeeded.push({
                    ...asset,
                    convertQuantity: quantity,
                    expectedUSDT: convertAmount
                });
                
                remainingNeeded -= convertAmount;
                targetAmount += convertAmount;
            }
        } else {
            // Convert percentage of each asset
            for (const asset of assets.filter(a => a.canTrade)) {
                const convertQuantity = asset.total * (percentageToConvert / 100);
                const expectedUSDT = convertQuantity * asset.price;
                
                if (convertQuantity * asset.price >= asset.minNotional) {
                    conversionsNeeded.push({
                        ...asset,
                        convertQuantity,
                        expectedUSDT
                    });
                    targetAmount += expectedUSDT;
                }
            }
        }
        
        if (conversionsNeeded.length === 0) {
            console.log('❌ No assets available for conversion (insufficient values or trading restrictions)');
            return { success: false, error: 'No convertible assets' };
        }
        
        console.log('🎯 PLANNED CONVERSIONS:');
        let totalExpectedUSDT = 0;
        conversionsNeeded.forEach(conv => {
            console.log(`   ${conv.asset}: ${conv.convertQuantity.toFixed(6)} → $${conv.expectedUSDT.toFixed(4)}`);
            totalExpectedUSDT += conv.expectedUSDT;
        });
        console.log(`   Expected Total USDT: $${(currentUSDT + totalExpectedUSDT).toFixed(4)}`);
        console.log('');
        
        // Execute conversions
        const results = [];
        
        for (const conversion of conversionsNeeded) {
            console.log(`📤 Converting ${conversion.asset}...`);
            
            try {
                // Use appropriate quantity precision
                const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === conversion.symbol);
                const lotSizeFilter = symbolInfo?.filters?.find(f => f.filterType === 'LOT_SIZE');
                const stepSize = parseFloat(lotSizeFilter?.stepSize || '1');
                
                // Round quantity to step size
                const precision = Math.abs(Math.log10(stepSize));
                const roundedQuantity = Math.floor(conversion.convertQuantity / stepSize) * stepSize;
                const finalQuantity = parseFloat(roundedQuantity.toFixed(precision));
                
                if (finalQuantity <= 0) {
                    console.log(`   ⏭️  Skipping ${conversion.asset} (quantity too small after rounding)`);
                    continue;
                }
                
                const sellOrder = await client.order({
                    symbol: conversion.symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: finalQuantity.toString()
                });
                
                const actualUSDT = parseFloat(sellOrder.cummulativeQuoteQty);
                console.log(`   ✅ Sold ${sellOrder.executedQty} ${conversion.asset} for $${actualUSDT.toFixed(4)}`);
                
                results.push({
                    asset: conversion.asset,
                    soldQuantity: sellOrder.executedQty,
                    receivedUSDT: actualUSDT,
                    success: true
                });
                
            } catch (error) {
                console.log(`   ❌ Failed to convert ${conversion.asset}: ${error.message}`);
                results.push({
                    asset: conversion.asset,
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Check final balance
        await new Promise(resolve => setTimeout(resolve, 2000));
        const finalAccount = await client.accountInfo();
        const finalUSDT = parseFloat(finalAccount.balances.find(b => b.asset === 'USDT')?.free || 0);
        
        console.log('');
        console.log('🎉 CONVERSION COMPLETED:');
        console.log(`   Initial USDT: $${currentUSDT.toFixed(4)}`);
        console.log(`   Final USDT: $${finalUSDT.toFixed(4)}`);
        console.log(`   Net Gain: $${(finalUSDT - currentUSDT).toFixed(4)}`);
        
        return {
            success: true,
            initialUSDT: currentUSDT,
            finalUSDT: finalUSDT,
            netGain: finalUSDT - currentUSDT,
            conversions: results
        };
        
    } catch (error) {
        console.error('❌ Conversion failed:', error.message);
        return { success: false, error: error.message };
    }
}

// CLI usage
if (require.main === module) {
    const targetAmount = parseFloat(process.argv[2]);
    const percentage = parseFloat(process.argv[3]);
    
    console.log('🔄 DYNAMIC ASSET CONVERTER');
    console.log('Usage: node convert-assets-to-usdt.js [target_usdt] [percentage]');
    console.log('Examples:');
    console.log('  node convert-assets-to-usdt.js 15      # Convert assets to reach $15 USDT');
    console.log('  node convert-assets-to-usdt.js 0 75    # Convert 75% of all assets');
    console.log('');
    
    const options = {};
    if (targetAmount > 0) options.targetUSDTAmount = targetAmount;
    if (percentage > 0) options.percentageToConvert = percentage;
    
    convertAssetsToUSDT(options)
        .then(result => {
            if (result.success) {
                console.log('✅ Asset conversion completed successfully');
                process.exit(0);
            } else {
                console.log('❌ Asset conversion failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Script error:', error.message);
            process.exit(1);
        });
}

module.exports = { convertAssetsToUSDT };
