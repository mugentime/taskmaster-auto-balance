/**
 * Futures Margin Service
 * 
 * Provides margin calculation, position sizing, and preflight validation
 * for Binance USDⓈ-M Futures trading to prevent "Margin is insufficient" errors
 */

const { createHash } = require('crypto');
const axios = require('axios');

class FuturesMarginService {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://fapi.binance.com';
        this.cache = new Map();
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Round value to step size using floor to prevent oversizing
     */
    roundToStep(value, step) {
        if (!step || step === 0) return value;
        return Math.floor(value / step) * step;
    }

    /**
     * Round price to tick size respecting order side
     */
    roundPriceToTick(price, tick, side = 'SELL') {
        if (!tick || tick === 0) return price;
        // SELL: floor to be more conservative
        // BUY: ceil to ensure we get the asset
        return side === 'SELL' 
            ? Math.floor(price / tick) * tick
            : Math.ceil(price / tick) * tick;
    }

    /**
     * Create signed request parameters
     */
    createSignature(queryString) {
        const crypto = require('crypto');
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    /**
     * Make authenticated request to Binance Futures API
     */
    async makeRequest(endpoint, params = {}) {
        const timestamp = Date.now() - 1000; // 1 second offset for clock sync
        const queryParams = { ...params, timestamp };
        const queryString = new URLSearchParams(queryParams).toString();
        const signature = this.createSignature(queryString);
        
        const url = `${this.baseURL}${endpoint}?${queryString}&signature=${signature}`;
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            console.error(`[FUTURES-API] Error calling ${endpoint}:`, error.response?.data || error.message);
            throw new Error(`Futures API error: ${error.response?.data?.msg || error.message}`);
        }
    }

    /**
     * Get cached or fresh exchange info
     */
    async getExchangeInfo() {
        const cacheKey = 'exchangeInfo';
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiryMs) {
            return cached.data;
        }

        const data = await this.makeRequest('/fapi/v1/exchangeInfo');
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    }

    /**
     * Get symbol filters from exchange info
     */
    async getSymbolFilters(symbol) {
        const exchangeInfo = await this.getExchangeInfo();
        const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
        
        if (!symbolInfo) {
            throw new Error(`Symbol ${symbol} not found in futures exchange info`);
        }

        const filters = {};
        for (const filter of symbolInfo.filters) {
            switch (filter.filterType) {
                case 'LOT_SIZE':
                    filters.stepSize = parseFloat(filter.stepSize);
                    filters.minQty = parseFloat(filter.minQty);
                    filters.maxQty = parseFloat(filter.maxQty);
                    break;
                case 'PRICE_FILTER':
                    filters.tickSize = parseFloat(filter.tickSize);
                    filters.minPrice = parseFloat(filter.minPrice);
                    filters.maxPrice = parseFloat(filter.maxPrice);
                    break;
                case 'MIN_NOTIONAL':
                    filters.minNotional = parseFloat(filter.notional);
                    break;
                case 'MARKET_LOT_SIZE':
                    filters.marketStepSize = parseFloat(filter.stepSize);
                    filters.marketMinQty = parseFloat(filter.minQty);
                    filters.marketMaxQty = parseFloat(filter.maxQty);
                    break;
            }
        }

        return filters;
    }

    /**
     * Get leverage bracket for symbol
     */
    async getLeverageBracket(symbol) {
        const cacheKey = `leverage_${symbol}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiryMs) {
            return cached.data;
        }

        const data = await this.makeRequest('/fapi/v1/leverageBracket', { symbol });
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        
        // Return the first bracket (lowest notional) for initial margin calculations
        return data[0]?.brackets[0] || null;
    }

    /**
     * Get futures account balance
     */
    async getAccountInfo() {
        return await this.makeRequest('/fapi/v2/account');
    }

    /**
     * Get mark price for symbol
     */
    async getMarkPrice(symbol) {
        const data = await this.makeRequest('/fapi/v1/premiumIndex', { symbol });
        return parseFloat(data.markPrice);
    }

    /**
     * Estimate order costs with detailed breakdown
     */
    estimateOrderCosts({
        symbol,
        side,
        type = 'MARKET',
        quantity,
        price,
        leverage,
        takerFeeRate = 0.0004, // 0.04% default futures taker fee
        slippageBps = 10 // 10 basis points = 0.1% slippage buffer
    }) {
        const notional = price * quantity;
        const initialMargin = notional / leverage;
        const fee = notional * takerFeeRate;
        const slippageReserve = notional * (slippageBps / 10000);
        const totalRequired = initialMargin + fee + slippageReserve;

        return {
            notional,
            initialMargin,
            fee,
            slippageReserve,
            totalRequired,
            breakdown: {
                'Initial Margin': initialMargin,
                'Trading Fee': fee,
                'Slippage Buffer': slippageReserve,
                'Total Required': totalRequired
            }
        };
    }

    /**
     * Validate symbol filters for quantity and price
     */
    validateSymbolFilters({ symbol, quantity, price, filters }) {
        const errors = [];

        // Check step size
        if (filters.stepSize) {
            const remainder = quantity % filters.stepSize;
            if (remainder !== 0) {
                errors.push(`Quantity ${quantity} violates step size ${filters.stepSize}`);
            }
        }

        // Check min/max quantity
        if (filters.minQty && quantity < filters.minQty) {
            errors.push(`Quantity ${quantity} below minimum ${filters.minQty}`);
        }
        if (filters.maxQty && quantity > filters.maxQty) {
            errors.push(`Quantity ${quantity} above maximum ${filters.maxQty}`);
        }

        // Check tick size (with floating-point precision fix)
        if (filters.tickSize && price) {
            // Calculate how many decimal places the tick size represents
            const tickDecimals = Math.max(0, -Math.floor(Math.log10(filters.tickSize)));
            const normalizedPrice = Math.round(price / filters.tickSize) * filters.tickSize;
            const roundedNormalizedPrice = parseFloat(normalizedPrice.toFixed(tickDecimals));
            const roundedPrice = parseFloat(price.toFixed(tickDecimals));
            
            if (Math.abs(roundedPrice - roundedNormalizedPrice) > Number.EPSILON) {
                errors.push(`Price ${price} violates tick size ${filters.tickSize} (should be ${roundedNormalizedPrice})`);
            }
        }

        // Check min notional (skip for market orders without price)
        if (filters.minNotional && price) {
            const notional = price * quantity;
            if (notional < filters.minNotional) {
                errors.push(`Notional ${notional} below minimum ${filters.minNotional}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Compute maximum affordable quantity within budget
     */
    computeMaxAffordableQty({
        availableBalance,
        price,
        leverage,
        feeRate = 0.0004,
        slippageBps = 10,
        stepSize
    }) {
        // Solve: availableBalance >= (price * qty / leverage) + (price * qty * feeRate) + (price * qty * slippageBps/10000)
        // Simplify: availableBalance >= price * qty * (1/leverage + feeRate + slippageBps/10000)
        const multiplier = (1 / leverage) + feeRate + (slippageBps / 10000);
        const maxNotional = availableBalance / multiplier;
        const rawQty = maxNotional / price;
        
        // Floor to step size to ensure we don't exceed budget
        const flooredQty = this.roundToStep(rawQty, stepSize);
        
        return {
            rawQty,
            flooredQty,
            maxNotional,
            actualNotional: flooredQty * price,
            actualMarginRequired: this.estimateOrderCosts({
                quantity: flooredQty,
                price,
                leverage,
                takerFeeRate: feeRate,
                slippageBps
            }).totalRequired
        };
    }

    /**
     * Preflight validation for futures order
     */
    async preflightValidateFuturesOrder({
        symbol,
        side,
        type = 'MARKET',
        investment, // Total investment budget in USDT
        leverage,
        autoManaged = false,
        slippageBps = 10,
        correlationId = null
    }) {
        const diagnostics = {
            valid: false,
            correlationId: correlationId || `preflight_${Date.now()}`,
            timestamp: new Date().toISOString(),
            symbol,
            side,
            type,
            investment,
            leverage,
            checks: {}
        };

        try {
            console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Starting preflight for ${symbol} ${side}`);

            // 1. Get account info
            const account = await this.getAccountInfo();
            const usdtBalance = account.assets.find(a => a.asset === 'USDT');
            const availableBalance = parseFloat(usdtBalance?.availableBalance || 0);
            
            diagnostics.checks.account = {
                walletBalance: parseFloat(usdtBalance?.walletBalance || 0),
                availableBalance,
                marginBalance: parseFloat(usdtBalance?.marginBalance || 0),
                crossUnPnl: parseFloat(usdtBalance?.crossUnPnl || 0)
            };

            console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Available balance: ${availableBalance} USDT`);

            // 2. Get symbol info and current price
            const [filters, markPrice, leverageBracket] = await Promise.all([
                this.getSymbolFilters(symbol),
                this.getMarkPrice(symbol),
                this.getLeverageBracket(symbol)
            ]);

            diagnostics.checks.symbol = {
                markPrice,
                filters,
                leverageBracket: leverageBracket ? {
                    maxLeverage: leverageBracket.initialLeverage,
                    maintMarginRatio: parseFloat(leverageBracket.maintMarginRatio)
                } : null
            };

            console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Mark price: ${markPrice}, Max leverage: ${leverageBracket?.initialLeverage}`);

            // 3. Validate leverage
            if (leverageBracket && leverage > leverageBracket.initialLeverage) {
                diagnostics.checks.leverage = {
                    requested: leverage,
                    maximum: leverageBracket.initialLeverage,
                    valid: false,
                    error: `Leverage ${leverage}x exceeds maximum ${leverageBracket.initialLeverage}x for ${symbol}`
                };
                diagnostics.error = diagnostics.checks.leverage.error;
                return diagnostics;
            }

            diagnostics.checks.leverage = { requested: leverage, valid: true };

            // 4. Calculate position sizing
            const rawQty = investment / markPrice;
            const flooredQty = this.roundToStep(rawQty, filters.stepSize);
            
            // Ensure we meet minimum notional after flooring
            let finalQty = flooredQty;
            const minNotionalQty = filters.minNotional ? filters.minNotional / markPrice : 0;
            if (finalQty < minNotionalQty) {
                // Round UP to the next valid step that meets minimum notional
                finalQty = Math.ceil(minNotionalQty / filters.stepSize) * filters.stepSize;
            }

            diagnostics.checks.sizing = {
                rawQty,
                flooredQty,
                finalQty,
                stepSize: filters.stepSize,
                minNotionalQty
            };

            console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Raw qty: ${rawQty}, Final qty: ${finalQty}`);

            // 5. Estimate costs
            const costs = this.estimateOrderCosts({
                symbol,
                side,
                type,
                quantity: finalQty,
                price: markPrice,
                leverage,
                slippageBps
            });

            diagnostics.checks.costs = costs;

            console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Required margin: ${costs.totalRequired}, Available: ${availableBalance}`);

            // 6. Check if we have sufficient margin
            const hasSufficient = availableBalance >= costs.totalRequired;
            
            if (hasSufficient) {
                diagnostics.valid = true;
                diagnostics.recommendedQuantity = finalQty;
                diagnostics.message = 'Preflight validation passed';
            } else {
                const deficit = costs.totalRequired - availableBalance;
                
                // Try to suggest a smaller quantity that fits the budget
                const affordableResult = this.computeMaxAffordableQty({
                    availableBalance,
                    price: markPrice,
                    leverage,
                    stepSize: filters.stepSize,
                    slippageBps
                });

                diagnostics.checks.affordability = affordableResult;
                diagnostics.deficit = deficit;
                diagnostics.suggestedQuantity = affordableResult.flooredQty;
                diagnostics.suggestedInvestment = affordableResult.actualNotional;
                diagnostics.requiredTopUp = deficit;
                
                diagnostics.error = `Insufficient margin: need ${costs.totalRequired.toFixed(2)} USDT, have ${availableBalance.toFixed(2)} USDT (deficit: ${deficit.toFixed(2)} USDT)`;
                
                console.log(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: ${diagnostics.error}`);
            }

            // 7. Validate final quantity against filters (skip price for MARKET orders)
            const filterValidation = this.validateSymbolFilters({
                symbol,
                quantity: diagnostics.recommendedQuantity || finalQty,
                price: type === 'MARKET' ? null : markPrice, // Don't validate price for market orders
                filters
            });

            diagnostics.checks.filters = filterValidation;

            if (!filterValidation.valid) {
                diagnostics.valid = false;
                diagnostics.error = `Filter validation failed: ${filterValidation.errors.join(', ')}`;
            }

            return diagnostics;

        } catch (error) {
            console.error(`[MARGIN-DIAGNOSTIC] ${diagnostics.correlationId}: Preflight failed:`, error.message);
            diagnostics.valid = false;
            diagnostics.error = `Preflight validation failed: ${error.message}`;
            diagnostics.exception = error.message;
            return diagnostics;
        }
    }

    /**
     * Set leverage for symbol if autoManaged
     */
    async setLeverage(symbol, leverage) {
        const params = { symbol, leverage };
        const queryString = new URLSearchParams({ ...params, timestamp: Date.now() - 1000 }).toString();
        const signature = this.createSignature(queryString);
        
        const url = `${this.baseURL}/fapi/v1/leverage?${queryString}&signature=${signature}`;
        
        try {
            const response = await axios.post(url, {}, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            return response.data;
        } catch (error) {
            console.error(`[FUTURES-MARGIN] Failed to set leverage for ${symbol}:`, error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = { FuturesMarginService };
