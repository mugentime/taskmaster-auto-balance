/**
 * Debug Endpoints for Trading System
 * Provides tools for testing and validating Binance connectivity
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// If trading config exists, import it (otherwise provide defaults)
let tradingConfig;
try {
    tradingConfig = require('../config/trading.cjs');
} catch (error) {
    console.log('Trading config not found, using defaults for debug endpoints');
    tradingConfig = {
        BINANCE_API_KEY: process.env.BINANCE_API_KEY,
        BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || process.env.BINANCE_SECRET_KEY,
        RECV_WINDOW: parseInt(process.env.RECV_WINDOW, 10) || 10000,
        TIMESTAMP_OFFSET: parseInt(process.env.TIMESTAMP_OFFSET, 10) || -2000,
        FUTURES_BASE_URL: 'https://fapi.binance.com'
    };
}

/**
 * Get exchange info and symbol filters for a specific symbol
 * @param {Object} futuresClient - Binance futures client
 * @param {string} symbol - Trading symbol (e.g. BTCUSDT)
 */
async function getExchangeInfo(futuresClient, symbol) {
    try {
        const requestId = uuidv4();
        console.log(`[DEBUG][${requestId}] Getting exchange info for ${symbol || 'all symbols'}`);
        
        const exchangeInfo = await futuresClient.futuresExchangeInfo();
        
        // If symbol is provided, filter to just that symbol
        if (symbol) {
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
            
            if (!symbolInfo) {
                return {
                    success: false,
                    message: `Symbol ${symbol} not found in exchange info`,
                    availableSymbols: exchangeInfo.symbols
                        .filter(s => s.status === 'TRADING')
                        .map(s => s.symbol)
                        .sort()
                        .slice(0, 20) // Limit to first 20 to avoid too much data
                };
            }
            
            // Process filters for the symbol
            const processedFilters = {};
            symbolInfo.filters.forEach(filter => {
                processedFilters[filter.filterType] = { ...filter };
                delete processedFilters[filter.filterType].filterType;
            });
            
            // Calculate minimum and maximum order sizes in USD
            const priceFilter = processedFilters['PRICE_FILTER'] || {};
            const lotSizeFilter = processedFilters['LOT_SIZE'] || {};
            const minNotionalFilter = processedFilters['MIN_NOTIONAL'] || {};
            
            const tickSize = parseFloat(priceFilter.tickSize || 0);
            const stepSize = parseFloat(lotSizeFilter.stepSize || 0);
            const minQty = parseFloat(lotSizeFilter.minQty || 0);
            const minNotional = parseFloat(minNotionalFilter.notional || 0);
            
            // Get current price to calculate USD values
            let currentPrice = 0;
            try {
                const priceResponse = await futuresClient.prices({ symbol });
                currentPrice = parseFloat(priceResponse[symbol]);
            } catch (error) {
                console.error(`[DEBUG][${requestId}] Error fetching price: ${error.message}`);
            }
            
            const qtyPrecision = symbolInfo.quantityPrecision || 0;
            const pricePrecision = symbolInfo.pricePrecision || 0;
            
            // Calculate min order size in USD
            const minOrderSizeUSD = currentPrice > 0 ? (minQty * currentPrice) : 0;
            
            return {
                success: true,
                symbol: symbolInfo.symbol,
                status: symbolInfo.status,
                baseAsset: symbolInfo.baseAsset,
                quoteAsset: symbolInfo.quoteAsset,
                filters: processedFilters,
                calculations: {
                    quantityPrecision: qtyPrecision,
                    pricePrecision: pricePrecision,
                    minQty,
                    stepSize,
                    tickSize,
                    minNotional,
                    currentPrice,
                    minOrderSizeUSD: minOrderSizeUSD.toFixed(2)
                },
                raw: symbolInfo
            };
        }
        
        // Return limited info for all symbols
        return {
            success: true,
            serverTime: exchangeInfo.serverTime,
            timezone: exchangeInfo.timezone,
            symbolCount: exchangeInfo.symbols.length,
            tradingSymbols: exchangeInfo.symbols
                .filter(s => s.status === 'TRADING')
                .map(s => ({
                    symbol: s.symbol,
                    baseAsset: s.baseAsset,
                    quoteAsset: s.quoteAsset
                }))
        };
    } catch (error) {
        console.error(`[DEBUG] Exchange info error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get open positions for a symbol or all positions
 * @param {Object} futuresClient - Binance futures client
 * @param {string} symbol - Optional trading symbol to filter by
 */
async function getPositions(futuresClient, symbol) {
    try {
        const requestId = uuidv4();
        console.log(`[DEBUG][${requestId}] Getting positions${symbol ? ` for ${symbol}` : ''}`);
        
        const positions = await futuresClient.futuresPositionRisk();
        
        // Filter to only open positions (non-zero amounts)
        const openPositions = positions.filter(p => parseFloat(p.positionAmt) !== 0);
        
        // If symbol provided, filter to just that symbol
        let filteredPositions = openPositions;
        if (symbol) {
            filteredPositions = openPositions.filter(p => p.symbol === symbol);
        }
        
        // Get open orders if there are positions
        let openOrders = [];
        if (filteredPositions.length > 0) {
            try {
                const ordersRequest = symbol 
                    ? futuresClient.futuresOpenOrders({ symbol }) 
                    : futuresClient.futuresOpenOrders();
                
                openOrders = await ordersRequest;
            } catch (error) {
                console.error(`[DEBUG][${requestId}] Error fetching open orders: ${error.message}`);
            }
        }
        
        return {
            success: true,
            positionCount: filteredPositions.length,
            openOrderCount: openOrders.length,
            positions: filteredPositions.map(p => ({
                symbol: p.symbol,
                positionAmt: parseFloat(p.positionAmt),
                entryPrice: parseFloat(p.entryPrice),
                markPrice: parseFloat(p.markPrice),
                unRealizedProfit: parseFloat(p.unRealizedProfit),
                liquidationPrice: parseFloat(p.liquidationPrice),
                leverage: parseInt(p.leverage, 10),
                marginType: p.marginType,
                positionSide: p.positionSide
            })),
            openOrders: openOrders.map(o => ({
                orderId: o.orderId,
                symbol: o.symbol,
                side: o.side,
                type: o.type,
                price: parseFloat(o.price),
                origQty: parseFloat(o.origQty),
                time: new Date(o.time).toISOString()
            }))
        };
    } catch (error) {
        console.error(`[DEBUG] Position check error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Place a test market order (can be real or just preflight)
 * @param {Object} futuresClient - Binance futures client
 * @param {Object} options - Order options
 */
async function placeTestOrder(futuresClient, options) {
    const { symbol, side, quantity, leverage, isDryRun = true } = options;
    const requestId = uuidv4();
    
    if (!symbol || !side || !quantity) {
        return {
            success: false,
            message: 'Missing required parameters: symbol, side, quantity'
        };
    }
    
    console.log(`[DEBUG][${requestId}] Test order: ${side} ${quantity} ${symbol} (dry=${isDryRun})`);
    
    try {
        // Step 1: Set leverage
        if (leverage) {
            try {
                await futuresClient.futuresLeverage({
                    symbol, 
                    leverage: parseInt(leverage, 10)
                });
                console.log(`[DEBUG][${requestId}] Set leverage to ${leverage}x for ${symbol}`);
            } catch (error) {
                console.error(`[DEBUG][${requestId}] Leverage error: ${error.message}`);
                // Continue despite leverage error - may be "no need to change" error
            }
        }
        
        // Step 2: Try setting margin type to ISOLATED (ignore errors)
        try {
            await futuresClient.futuresMarginType({
                symbol,
                marginType: 'ISOLATED'
            });
            console.log(`[DEBUG][${requestId}] Set margin type to ISOLATED for ${symbol}`);
        } catch (error) {
            console.log(`[DEBUG][${requestId}] Margin type error (likely already set): ${error.message}`);
        }
        
        // Step 3: Execute test order (or real if not dry run)
        let orderResult;
        const orderParams = {
            symbol,
            side: side.toUpperCase(),
            type: 'MARKET',
            quantity: quantity.toString()
        };
        
        if (isDryRun) {
            // Test order only
            orderResult = await futuresClient.futuresOrderTest(orderParams);
            console.log(`[DEBUG][${requestId}] Test order successful`);
            
            return {
                success: true,
                message: 'Test order validation passed',
                dryRun: true,
                orderParams,
                validationResult: orderResult || {}
            };
        } else {
            // Real order
            orderResult = await futuresClient.futuresOrder(orderParams);
            console.log(`[DEBUG][${requestId}] LIVE order executed: ${orderResult.orderId}`);
            
            // Get position after order
            const positions = await futuresClient.futuresPositionRisk({ symbol });
            const position = positions.find(p => p.symbol === symbol);
            
            return {
                success: true,
                message: 'LIVE order executed successfully',
                dryRun: false,
                order: {
                    orderId: orderResult.orderId,
                    symbol: orderResult.symbol,
                    side: orderResult.side,
                    type: orderResult.type,
                    status: orderResult.status,
                    price: parseFloat(orderResult.price || 0),
                    avgPrice: parseFloat(orderResult.avgPrice || 0),
                    origQty: parseFloat(orderResult.origQty),
                    executedQty: parseFloat(orderResult.executedQty),
                    time: new Date(orderResult.time).toISOString()
                },
                position: position ? {
                    positionAmt: parseFloat(position.positionAmt),
                    entryPrice: parseFloat(position.entryPrice),
                    unRealizedProfit: parseFloat(position.unRealizedProfit),
                    leverage: parseInt(position.leverage, 10),
                    marginType: position.marginType
                } : null
            };
        }
    } catch (error) {
        console.error(`[DEBUG][${requestId}] Order error: ${error.message}`);
        
        // Extract Binance error code and message if available
        let binanceError = null;
        if (error.response && error.response.data) {
            binanceError = error.response.data;
        }
        
        return {
            success: false,
            message: 'Order failed',
            error: error.message,
            binanceError,
            requestId
        };
    }
}

/**
 * Get time synchronization info
 * @param {Object} futuresClient - Binance futures client
 */
async function getTimeSync(futuresClient) {
    try {
        const localTime = Date.now();
        const serverTime = await futuresClient.time();
        const responseTime = Date.now() - localTime;
        
        const timeDelta = serverTime.serverTime - localTime;
        const offsetWithDelta = tradingConfig.TIMESTAMP_OFFSET - timeDelta;
        
        return {
            success: true,
            localTime: new Date(localTime).toISOString(),
            serverTime: new Date(serverTime.serverTime).toISOString(),
            responseTimeMs: responseTime,
            timeDeltaMs: timeDelta,
            configuredOffsetMs: tradingConfig.TIMESTAMP_OFFSET,
            recommendedOffsetMs: offsetWithDelta,
            recvWindow: tradingConfig.RECV_WINDOW
        };
    } catch (error) {
        console.error(`[DEBUG] Time sync error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    getExchangeInfo,
    getPositions,
    placeTestOrder,
    getTimeSync
};
