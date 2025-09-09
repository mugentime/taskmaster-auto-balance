const express = require('express');
const app = express();
const Binance = require('node-binance-api');

app.use(express.json());

// Endpoint para obtener balance total real valorizado
app.post('/get-real-total-balance', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ 
            success: false, 
            message: 'API keys are required' 
        });
    }

    try {
        console.log('[BALANCE] Getting real total balance...');
        
        // Configurar cliente Binance
        const binance = new Binance().options({
            APIKEY: apiKey,
            APISECRET: apiSecret,
            useServerTime: true,
            recvWindow: 60000,
            verbose: false,
            log: false
        });

        const results = {
            spot: null,
            futures: null,
            margin: null,
            total: {
                totalWalletBalance: 0,
                totalMarginBalance: 0,
                totalUnrealizedProfit: 0
            }
        };

        // 1. Obtener balance de Spot
        try {
            console.log('[BALANCE] Fetching spot account...');
            const spotAccount = await binance.balance();
            let spotTotal = 0;
            const spotBalances = {};
            
            for (const [asset, balance] of Object.entries(spotAccount)) {
                const available = parseFloat(balance.available);
                const onOrder = parseFloat(balance.onOrder);
                const total = available + onOrder;
                
                if (total > 0) {
                    spotBalances[asset] = {
                        available,
                        onOrder,
                        total
                    };
                    
                    if (asset === 'USDT') {
                        spotTotal += total;
                    } else {
                        // Para otros activos, necesitamos el precio en USDT
                        try {
                            const price = await binance.prices(`${asset}USDT`);
                            if (price && price[`${asset}USDT`]) {
                                spotTotal += total * parseFloat(price[`${asset}USDT`]);
                            }
                        } catch (priceError) {
                            console.log(`[BALANCE] Could not get price for ${asset}: ${priceError.message}`);
                        }
                    }
                }
            }
            
            results.spot = {
                success: true,
                balances: spotBalances,
                totalUSDTValue: spotTotal
            };
            
            console.log(`[BALANCE] Spot: $${spotTotal.toFixed(2)}`);
            
        } catch (error) {
            results.spot = { 
                success: false, 
                error: error.message 
            };
            console.log(`[BALANCE] Spot error: ${error.message}`);
        }

        // 2. Obtener balance de Futures
        try {
            console.log('[BALANCE] Fetching futures account...');
            const futuresAccount = await binance.futuresAccount();
            
            results.futures = {
                success: true,
                totalWalletBalance: parseFloat(futuresAccount.totalWalletBalance),
                totalMarginBalance: parseFloat(futuresAccount.totalMarginBalance), 
                totalUnrealizedProfit: parseFloat(futuresAccount.totalUnrealizedPnl),
                assets: futuresAccount.assets.filter(a => parseFloat(a.walletBalance) > 0).map(a => ({
                    asset: a.asset,
                    walletBalance: parseFloat(a.walletBalance),
                    unrealizedProfit: parseFloat(a.unrealizedProfit)
                }))
            };
            
            console.log(`[BALANCE] Futures: $${results.futures.totalWalletBalance.toFixed(2)}`);
            
        } catch (error) {
            results.futures = { 
                success: false, 
                error: error.message 
            };
            console.log(`[BALANCE] Futures error: ${error.message}`);
        }

        // 3. Obtener balance de Margin (Cross Margin)
        try {
            console.log('[BALANCE] Fetching margin account...');
            const marginAccount = await binance.marginAccount();
            
            let marginTotal = 0;
            const marginBalances = {};
            
            if (marginAccount.userAssets) {
                for (const asset of marginAccount.userAssets) {
                    const free = parseFloat(asset.free);
                    const locked = parseFloat(asset.locked);
                    const total = free + locked;
                    
                    if (total > 0) {
                        marginBalances[asset.asset] = {
                            free,
                            locked, 
                            total
                        };
                        
                        if (asset.asset === 'USDT') {
                            marginTotal += total;
                        } else {
                            // Para otros activos, necesitamos el precio
                            try {
                                const price = await binance.prices(`${asset.asset}USDT`);
                                if (price && price[`${asset.asset}USDT`]) {
                                    marginTotal += total * parseFloat(price[`${asset.asset}USDT`]);
                                }
                            } catch (priceError) {
                                console.log(`[BALANCE] Could not get margin price for ${asset.asset}`);
                            }
                        }
                    }
                }
            }
            
            results.margin = {
                success: true,
                balances: marginBalances,
                totalUSDTValue: marginTotal,
                totalNetAsset: parseFloat(marginAccount.totalNetAsset || 0)
            };
            
            console.log(`[BALANCE] Margin: $${marginTotal.toFixed(2)}`);
            
        } catch (error) {
            results.margin = { 
                success: false, 
                error: error.message 
            };
            console.log(`[BALANCE] Margin error: ${error.message}`);
        }

        // 4. Calcular totales
        const spotValue = results.spot?.totalUSDTValue || 0;
        const futuresValue = results.futures?.totalWalletBalance || 0;
        const marginValue = results.margin?.totalUSDTValue || 0;
        
        results.total = {
            totalWalletBalance: spotValue + futuresValue + marginValue,
            totalMarginBalance: results.futures?.totalMarginBalance || 0,
            totalUnrealizedProfit: results.futures?.totalUnrealizedProfit || 0,
            breakdown: {
                spot: spotValue,
                futures: futuresValue, 
                margin: marginValue
            }
        };

        console.log(`[BALANCE] TOTAL REAL BALANCE: $${results.total.totalWalletBalance.toFixed(2)}`);

        res.json({
            success: true,
            message: `Total balance calculated: $${results.total.totalWalletBalance.toFixed(2)} USDT`,
            totalBalance: results.total.totalWalletBalance,
            totalMarginBalance: results.total.totalMarginBalance,
            totalUnrealizedProfit: results.total.totalUnrealizedProfit,
            breakdown: results.total.breakdown,
            details: results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[BALANCE] Total balance calculation failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate total balance',
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Real Balance Service running on port ${PORT}`);
});

module.exports = app;
