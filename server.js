// Load environment variables from .env file (optional fallback)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Binance = require('binance-api-node').default;
const { FuturesMarginService } = require('./services/futuresMarginService');
const { mapBinanceError, createMarginError, extractBinanceError } = require('./utils/binanceErrorMap');

const app = express();
const PORT = process.env.PORT || 3001;
const { BINANCE_API_KEY, BINANCE_API_SECRET = process.env.BINANCE_SECRET_KEY } = process.env;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- In-Memory Database & State ---
let activeBots = {};
let rebalancerState = {
    enabled: false,
    status: 'Idle', // 'Idle', 'Active (Monitoring)', 'Rebalancing...', 'Cooldown'
    log: [{ timestamp: Date.now(), message: 'Engine initialized.', type: 'info' }],
    cooldownUntil: null,
};
const MAX_LOG_SIZE = 20;

const addLog = (message, type = 'info') => {
    rebalancerState.log.unshift({ timestamp: Date.now(), message, type });
    if (rebalancerState.log.length > MAX_LOG_SIZE) {
        rebalancerState.log.pop();
    }
}

// --- Helper Functions ---
const getBinanceClients = (apiKey = '', apiSecret = '') => {
    const client = Binance({
        apiKey,
        apiSecret,
        testnet: false,
        // Add timestamp offset to fix sync issues
        getTime: () => Date.now() - 2000 // Subtract 2 seconds
    });
    return { spotClient: client, futuresClient: client };
};

// Helper function to set futures leverage
const setFuturesLeverage = async (futuresClient, symbol, leverage) => {
    try {
        await futuresClient.futuresLeverage({ symbol, leverage });
        console.log(`[SUCCESS] Set leverage to ${leverage}x for ${symbol}`);
        return true;
    } catch (error) {
        console.log(`[WARNING] Failed to set leverage for ${symbol}: ${error.message}`);
        return false;
    }
};

// Helper function to get symbol precision from exchange info
const getSymbolPrecision = async (client, symbol, isSpot = true) => {
    try {
        const exchangeInfo = isSpot 
            ? await client.exchangeInfo() 
            : await client.futuresExchangeInfo();
        
        const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
        if (!symbolInfo) {
            console.log(`[WARNING] Symbol ${symbol} not found in exchange info, using default precision`);
            return 5; // Default fallback
        }
        
        // For spot: look for LOT_SIZE filter
        // For futures: look for LOT_SIZE filter  
        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        if (!lotSizeFilter) {
            console.log(`[WARNING] LOT_SIZE filter not found for ${symbol}, using default precision`);
            return 5;
        }
        
        // Calculate precision from stepSize
        const stepSize = parseFloat(lotSizeFilter.stepSize);
        const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
        
        console.log(`[INFO] Symbol ${symbol} precision: ${precision} (stepSize: ${stepSize})`);
        return precision;
        
    } catch (error) {
        console.log(`[WARNING] Failed to get precision for ${symbol}: ${error.message}`);
        return 5; // Safe fallback
    }
};

// --- FUNDING RATE ARBITRAGE ENGINE ---

// In-memory storage for funding rates and opportunities
let fundingRatesCache = {
    data: [],
    lastUpdated: 0,
    opportunities: []
};

// Configuration for arbitrage detection
const ARBITRAGE_CONFIG = {
    MIN_FUNDING_RATE: 0.0001,      // 0.01% minimum threshold
    HIGH_FUNDING_RATE: 0.001,      // 0.10% high opportunity threshold
    EXTREME_FUNDING_RATE: 0.005,   // 0.50% extreme opportunity threshold
    MIN_LIQUIDITY_USDT: 100000,    // $100k minimum liquidity
    UPDATE_INTERVAL: 30000,        // 30 seconds
    MAX_CACHE_AGE: 60000          // 60 seconds
};

// Enhanced funding rate fetcher with liquidity and price data
const fetchEnhancedFundingRates = async () => {
    try {
        console.log('[FUNDING] Fetching enhanced funding rates...');
        const { spotClient, futuresClient } = getBinanceClients();
        
        // Fetch funding rates (RESEARCH AGENT A SUCCESS!)
        const fundingData = await futuresClient.futuresMarkPrice();
        
        // Get spot market symbols to filter out futures-only contracts
        console.log('[FUNDING] Fetching spot market symbols for filtering...');
        const spotPrices = await spotClient.prices();
        const spotSymbols = new Set(Object.keys(spotPrices));
        
        // Fetch 24hr ticker data for liquidity info
        const tickerData = await futuresClient.futuresDailyStats();
        const tickerMap = {};
        tickerData.forEach(ticker => {
            tickerMap[ticker.symbol] = {
                volume: parseFloat(ticker.volume),
                quoteVolume: parseFloat(ticker.quoteVolume),
                priceChange: parseFloat(ticker.priceChangePercent),
                lastPrice: parseFloat(ticker.lastPrice)
            };
        });
        
        // Enhanced funding rate data with liquidity and volatility
        // Filter to only include symbols that exist in both spot and futures markets
        const enhancedData = fundingData
            .filter(item => {
                // Only USDT pairs
                if (!item.symbol.endsWith('USDT')) return false;
                
                // Must exist in both spot and futures markets for arbitrage
                if (!spotSymbols.has(item.symbol)) {
                    console.log(`[FUNDING] Skipping ${item.symbol} - not available in spot market`);
                    return false;
                }
                
                return true;
            })
            .map(item => {
                const ticker = tickerMap[item.symbol] || {};
                const fundingRate = parseFloat(item.lastFundingRate || 0);
                const markPrice = parseFloat(item.markPrice || 0);
                
                return {
                    symbol: item.symbol,
                    fundingRate: fundingRate,
                    fundingRatePercent: (fundingRate * 100).toFixed(4),
                    annualizedRate: (Math.abs(fundingRate) * 365 * 3 * 100).toFixed(2), // 3 times per day
                    markPrice: markPrice,
                    indexPrice: parseFloat(item.indexPrice || markPrice),
                    premiumRate: fundingRate,
                    nextFundingTime: item.nextFundingTime,
                    // Liquidity metrics
                    volume24h: ticker.volume || 0,
                    quoteVolume24h: ticker.quoteVolume || 0,
                    liquidity: ticker.quoteVolume || 100000, // Default 100k if no data
                    // Volatility metrics  
                    priceChange24h: ticker.priceChangePercent || 0,
                    lastPrice: ticker.lastPrice || markPrice,
                    // Scoring
                    liquidityScore: Math.min((ticker.quoteVolume || 100000) / 1000000, 10), // 0-10 based on $1M increments
                    riskScore: Math.abs(ticker.priceChangePercent || 0) / 10, // Volatility risk
                    // Timestamps
                    timestamp: Date.now(),
                    nextFunding: new Date(item.nextFundingTime || Date.now() + 8*60*60*1000).toISOString()
                };
            })
            .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate)); // Sort by absolute funding rate
            
        return enhancedData;
        
    } catch (error) {
        console.error('[FUNDING] Failed to fetch enhanced funding rates:', error.message);
        addLog('Failed to fetch enhanced funding rates from Binance.', 'error');
        return [];
    }
};

// Legacy function for backward compatibility
const fetchAllFundingRates = async () => {
    try {
        const enhancedData = await fetchEnhancedFundingRates();
        return enhancedData.map(item => ({
            symbol: item.symbol,
            fundingRate: item.fundingRate
        }));
    } catch (error) {
        console.error('[✖] Rebalancer failed to fetch funding rates:', error.message);
        addLog('Failed to fetch live funding rates from Binance.', 'error');
        return [];
    }
};

// Detect arbitrage opportunities
const detectArbitrageOpportunities = (fundingRatesData) => {
    const opportunities = [];
    const config = ARBITRAGE_CONFIG;
    
    for (const item of fundingRatesData) {
        const { symbol, fundingRate, liquidity, liquidityScore, riskScore } = item;
        
        // Skip if funding rate too low
        if (Math.abs(fundingRate) < config.MIN_FUNDING_RATE) continue;
        
        // Skip if liquidity too low
        if (liquidity < config.MIN_LIQUIDITY_USDT) continue;
        
        // Calculate opportunity score
        const fundingScore = Math.abs(fundingRate) * 1000; // Convert to basis points
        const opportunityScore = (fundingScore * liquidityScore) / (1 + riskScore);
        
        let rating = 'LOW';
        let strategy = 'Short Perp';
        
        if (Math.abs(fundingRate) >= config.EXTREME_FUNDING_RATE) {
            rating = 'EXTREME';
        } else if (Math.abs(fundingRate) >= config.HIGH_FUNDING_RATE) {
            rating = 'HIGH';
        } else {
            rating = 'MEDIUM';
        }
        
        // Determine strategy based on funding rate sign
        if (fundingRate > 0) {
            strategy = 'Short Perp + Long Spot'; // Positive funding = shorts pay longs
        } else {
            strategy = 'Long Perp + Short Spot';  // Negative funding = longs pay shorts
        }
        
        opportunities.push({
            symbol,
            fundingRate,
            fundingRatePercent: item.fundingRatePercent,
            annualizedRate: (Math.abs(fundingRate) * 365 * 3 * 100).toFixed(2), // Always positive earnings
            strategy,
            rating,
            score: opportunityScore,
            liquidity,
            liquidityScore,
            riskScore,
            markPrice: item.markPrice,
            nextFunding: item.nextFunding,
            estimatedReturn8h: (Math.abs(fundingRate) * 100).toFixed(4) + '%',
            detectedAt: new Date().toISOString()
        });
    }
    
    // Sort by opportunity score (highest first)
    return opportunities.sort((a, b) => b.score - a.score);
};

// Update funding rates cache
const updateFundingRatesCache = async () => {
    try {
        const data = await fetchEnhancedFundingRates();
        const opportunities = detectArbitrageOpportunities(data);
        
        fundingRatesCache = {
            data,
            opportunities,
            lastUpdated: Date.now(),
            summary: {
                totalSymbols: data.length,
                opportunitiesFound: opportunities.length,
                highOpportunities: opportunities.filter(o => o.rating === 'HIGH' || o.rating === 'EXTREME').length,
                avgFundingRate: (data.reduce((sum, item) => sum + Math.abs(item.fundingRate), 0) / data.length * 100).toFixed(4) + '%'
            }
        };
        
        console.log(`[FUNDING] Updated cache: ${data.length} symbols, ${opportunities.length} opportunities`);
        addLog(`Updated funding rates: ${opportunities.length} opportunities found`, 'info');
        
        return fundingRatesCache;
        
    } catch (error) {
        console.error('[FUNDING] Failed to update cache:', error.message);
        addLog('Failed to update funding rates cache', 'error');
        return fundingRatesCache;
    }
};

// Auto-update funding rates every 30 seconds
let fundingRateInterval;
const startFundingRateMonitor = () => {
    console.log('[FUNDING] Starting funding rate monitor...');
    
    // Initial update
    updateFundingRatesCache();
    
    // Set up interval
    fundingRateInterval = setInterval(() => {
        updateFundingRatesCache();
    }, ARBITRAGE_CONFIG.UPDATE_INTERVAL);
    
    addLog('Funding rate monitor started', 'info');
};

// Stop monitoring
const stopFundingRateMonitor = () => {
    if (fundingRateInterval) {
        clearInterval(fundingRateInterval);
        fundingRateInterval = null;
        console.log('[FUNDING] Funding rate monitor stopped');
        addLog('Funding rate monitor stopped', 'info');
    }
};

// Start monitoring on server startup - RESEARCH AGENT A SUCCESS!
process.nextTick(() => {
    setTimeout(startFundingRateMonitor, 2000); // Start after 2 seconds
});

// --- Asset Conversion Constants ---
const FEE_BUFFER_PCT = 0.001; // 0.1% fee buffer
const MIN_CONVERT_VALUE_USDT = 5; // Minimum value to convert (avoid dust)
const RETAIN_USDT_BUFFER = 10; // USDT to keep when converting

// Cache for exchange info (60 seconds)
let exchangeInfoCache = { data: null, timestamp: 0 };
const EXCHANGE_INFO_CACHE_TTL = 60 * 1000;

// --- Inter-Wallet Transfer Constants & Types ---
const WALLET_TYPES = {
    SPOT: 'MAIN',           // Spot wallet
    FUTURES: 'UMFUTURE',    // USD-M Futures wallet  
    MARGIN: 'MARGIN',       // Cross Margin wallet
    ISOLATED: 'ISOLATED',   // Isolated Margin wallet
    FUNDING: 'FUNDING',     // Funding wallet
    OPTION: 'OPTION',       // Option wallet
    EARN: 'EARN'            // Earn wallet
};

const TRANSFER_TYPES = {
    SPOT_TO_FUTURES: { from: WALLET_TYPES.SPOT, to: WALLET_TYPES.FUTURES, type: 1 },
    FUTURES_TO_SPOT: { from: WALLET_TYPES.FUTURES, to: WALLET_TYPES.SPOT, type: 2 },
    SPOT_TO_MARGIN: { from: WALLET_TYPES.SPOT, to: WALLET_TYPES.MARGIN, type: 1 },
    MARGIN_TO_SPOT: { from: WALLET_TYPES.MARGIN, to: WALLET_TYPES.SPOT, type: 2 },
    SPOT_TO_ISOLATED: { from: WALLET_TYPES.SPOT, to: WALLET_TYPES.ISOLATED, type: 1 },
    ISOLATED_TO_SPOT: { from: WALLET_TYPES.ISOLATED, to: WALLET_TYPES.SPOT, type: 2 },
    FUTURES_TO_MARGIN: { from: WALLET_TYPES.FUTURES, to: WALLET_TYPES.MARGIN, type: 1 },
    MARGIN_TO_FUTURES: { from: WALLET_TYPES.MARGIN, to: WALLET_TYPES.FUTURES, type: 2 }
};

// --- Enhanced Asset Conversion Helper Functions ---

// Extract base asset from symbol (BTCUSDT -> BTC)
const getBaseAssetFromSymbol = (symbol) => {
    const quotes = ['USDT', 'BUSD', 'FDUSD', 'USDC', 'TUSD'];
    for (const quote of quotes) {
        if (symbol.endsWith(quote)) {
            return symbol.replace(quote, '');
        }
    }
    return symbol; // fallback if no quote found
};

// Enhanced conversion path finder with prioritization
const findOptimalConversionPath = (asset, prices, exchangeInfo) => {
    if (asset === 'USDT') return { path: [], estimatedSlippage: 0 };
    
    const pathOptions = [
        { path: [`${asset}USDT`], priority: 1, description: 'Direct to USDT' },
        { path: [`${asset}BUSD`, 'BUSDUSDT'], priority: 2, description: 'Via BUSD' },
        { path: [`${asset}FDUSD`, 'FDUSDUSDT'], priority: 3, description: 'Via FDUSD' },
        { path: [`${asset}BTC`, 'BTCUSDT'], priority: 4, description: 'Via BTC' },
        { path: [`${asset}ETH`, 'ETHUSDT'], priority: 5, description: 'Via ETH' },
    ];
    
    // Find all viable paths
    const viablePaths = [];
    for (const pathOption of pathOptions) {
        const allPairsExist = pathOption.path.every(symbol => {
            const hasPrice = prices[symbol] && parseFloat(prices[symbol]) > 0;
            const hasSymbol = exchangeInfo.symbols.some(s => s.symbol === symbol && s.status === 'TRADING');
            return hasPrice && hasSymbol;
        });
        
        if (allPairsExist) {
            // Calculate estimated slippage (higher for longer paths)
            const estimatedSlippage = pathOption.path.length * 0.001; // 0.1% per hop
            viablePaths.push({
                ...pathOption,
                estimatedSlippage
            });
        }
    }
    
    // Return best path (lowest priority number = highest priority)
    if (viablePaths.length > 0) {
        const bestPath = viablePaths.sort((a, b) => a.priority - b.priority)[0];
        console.log(`[CONVERT-PATH] Selected ${bestPath.description} for ${asset} (slippage: ${(bestPath.estimatedSlippage * 100).toFixed(2)}%)`);
        return bestPath;
    }
    
    return { path: [], estimatedSlippage: 0, error: 'No viable conversion path found' };
};

// Batch conversion executor for parallel processing
const executeBatchConversions = async (spotClient, conversions, prices, exchangeInfo) => {
    console.log(`[BATCH-CONVERT] Starting batch conversion of ${conversions.length} assets`);
    const results = [];
    
    // Process conversions in parallel (max 3 at a time to avoid rate limits)
    const batchSize = 3;
    for (let i = 0; i < conversions.length; i += batchSize) {
        const batch = conversions.slice(i, i + batchSize);
        const batchPromises = batch.map(async (conversion) => {
            try {
                const result = await marketSellAllToUSDT(
                    spotClient,
                    conversion.asset,
                    { [conversion.asset]: { free: conversion.amount } },
                    prices,
                    exchangeInfo
                );
                return { asset: conversion.asset, ...result };
            } catch (error) {
                console.error(`[BATCH-CONVERT] Failed to convert ${conversion.asset}:`, error.message);
                return {
                    asset: conversion.asset,
                    success: false,
                    error: error.message,
                    totalUSDTReceived: 0
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches to be gentle on API
        if (i + batchSize < conversions.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    const totalConverted = results.reduce((sum, r) => sum + (r.totalUSDTReceived || 0), 0);
    const successCount = results.filter(r => r.success).length;
    
    console.log(`[BATCH-CONVERT] Completed: ${successCount}/${results.length} successful, ${totalConverted.toFixed(2)} USDT total`);
    return { results, totalConverted, successCount };
};

// --- Inter-Wallet Transfer Functions ---

// Fetch balances across all wallet types
const fetchAllWalletBalances = async (spotClient, futuresClient) => {
    console.log('[WALLET-FETCH] Getting balances across all wallet types...');
    
    const wallets = {
        spot: { balances: {}, totalUSDT: 0 },
        futures: { balances: {}, totalUSDT: 0 },
        margin: { balances: {}, totalUSDT: 0 },
        isolated: { balances: {}, totalUSDT: 0 },
        total: { balances: {}, totalUSDT: 0 }
    };
    
    const errors = [];
    
    try {
        // 1. Spot Wallet (already have this function)
        console.log('[WALLET-FETCH] Fetching spot balances...');
        const spotBalances = await fetchSpotBalances(spotClient);
        wallets.spot.balances = spotBalances;
        wallets.spot.totalUSDT = (spotBalances['USDT']?.total || 0);
        console.log(`[WALLET-FETCH] Spot: ${Object.keys(spotBalances).length} assets, ${wallets.spot.totalUSDT} USDT`);
        
    } catch (error) {
        errors.push({ wallet: 'spot', error: error.message });
        console.log(`[WALLET-FETCH] Spot wallet error: ${error.message}`);
    }
    
    try {
        // 2. Futures Wallet
        console.log('[WALLET-FETCH] Fetching futures balances...');
        const futuresAccount = await futuresClient.futuresAccountBalance();
        const futuresBalances = {};
        let futuresUSDT = 0;
        
        for (const balance of futuresAccount) {
            const total = parseFloat(balance.balance);
            if (total > 0) {
                futuresBalances[balance.asset] = {
                    free: total, // Futures shows available balance
                    locked: 0,
                    total
                };
                if (balance.asset === 'USDT') {
                    futuresUSDT = total;
                }
            }
        }
        
        wallets.futures.balances = futuresBalances;
        wallets.futures.totalUSDT = futuresUSDT;
        console.log(`[WALLET-FETCH] Futures: ${Object.keys(futuresBalances).length} assets, ${futuresUSDT} USDT`);
        
    } catch (error) {
        errors.push({ wallet: 'futures', error: error.message });
        console.log(`[WALLET-FETCH] Futures wallet error: ${error.message}`);
    }
    
    try {
        // 3. Cross Margin Wallet
        console.log('[WALLET-FETCH] Fetching cross margin balances...');
        const marginAccount = await spotClient.marginAccountInfo();
        const marginBalances = {};
        let marginUSDT = 0;
        
        for (const balance of marginAccount.userAssets) {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            if (total > 0) {
                marginBalances[balance.asset] = { free, locked, total };
                if (balance.asset === 'USDT') {
                    marginUSDT = total;
                }
            }
        }
        
        wallets.margin.balances = marginBalances;
        wallets.margin.totalUSDT = marginUSDT;
        console.log(`[WALLET-FETCH] Cross Margin: ${Object.keys(marginBalances).length} assets, ${marginUSDT} USDT`);
        
    } catch (error) {
        errors.push({ wallet: 'margin', error: error.message });
        console.log(`[WALLET-FETCH] Cross margin wallet error: ${error.message}`);
    }
    
    try {
        // 4. Isolated Margin (get all isolated margin accounts)
        console.log('[WALLET-FETCH] Fetching isolated margin balances...');
        const isolatedAccounts = await spotClient.isolatedMarginAccountInfo();
        const isolatedBalances = {};
        let isolatedUSDT = 0;
        
        if (isolatedAccounts.assets) {
            for (const account of isolatedAccounts.assets) {
                for (const balance of [account.baseAsset, account.quoteAsset]) {
                    if (balance && balance.asset) {
                        const free = parseFloat(balance.free);
                        const locked = parseFloat(balance.locked);
                        const total = free + locked;
                        
                        if (total > 0) {
                            const asset = balance.asset;
                            if (!isolatedBalances[asset]) {
                                isolatedBalances[asset] = { free: 0, locked: 0, total: 0 };
                            }
                            isolatedBalances[asset].free += free;
                            isolatedBalances[asset].locked += locked;
                            isolatedBalances[asset].total += total;
                            
                            if (asset === 'USDT') {
                                isolatedUSDT += total;
                            }
                        }
                    }
                }
            }
        }
        
        wallets.isolated.balances = isolatedBalances;
        wallets.isolated.totalUSDT = isolatedUSDT;
        console.log(`[WALLET-FETCH] Isolated Margin: ${Object.keys(isolatedBalances).length} assets, ${isolatedUSDT} USDT`);
        
    } catch (error) {
        errors.push({ wallet: 'isolated', error: error.message });
        console.log(`[WALLET-FETCH] Isolated margin wallet error: ${error.message}`);
    }
    
    // Calculate totals across all wallets
    const allAssets = new Set();
    let totalUSDTAcrossWallets = 0;
    
    for (const walletType of ['spot', 'futures', 'margin', 'isolated']) {
        const wallet = wallets[walletType];
        totalUSDTAcrossWallets += wallet.totalUSDT;
        
        for (const asset of Object.keys(wallet.balances)) {
            allAssets.add(asset);
            
            if (!wallets.total.balances[asset]) {
                wallets.total.balances[asset] = {
                    spot: 0, futures: 0, margin: 0, isolated: 0, total: 0
                };
            }
            
            const balance = wallet.balances[asset];
            wallets.total.balances[asset][walletType] = balance.total;
            wallets.total.balances[asset].total += balance.total;
        }
    }
    
    wallets.total.totalUSDT = totalUSDTAcrossWallets;
    wallets.total.uniqueAssets = allAssets.size;
    wallets.errors = errors;
    
    console.log(`[WALLET-FETCH] Summary: ${allAssets.size} unique assets, ${totalUSDTAcrossWallets.toFixed(2)} total USDT`);
    return wallets;
};

// Execute inter-wallet transfer
const executeWalletTransfer = async (spotClient, transferConfig) => {
    const { asset, amount, fromWallet, toWallet, symbol } = transferConfig;
    
    console.log(`[WALLET-TRANSFER] Transferring ${amount} ${asset} from ${fromWallet} to ${toWallet}`);
    
    try {
        let transferResult;
        
        // Use appropriate transfer endpoint based on wallet types
        if ((fromWallet === WALLET_TYPES.SPOT && toWallet === WALLET_TYPES.FUTURES) ||
            (fromWallet === WALLET_TYPES.FUTURES && toWallet === WALLET_TYPES.SPOT)) {
            
            // Spot <-> Futures transfer
            // Type 1: main account to futures, Type 2: futures to main account  
            const transferType = fromWallet === WALLET_TYPES.SPOT ? 1 : 2;
            
            // Try different API method names for futures transfer
            if (typeof spotClient.futuresTransfer === 'function') {
                transferResult = await spotClient.futuresTransfer({
                    asset,
                    amount: amount.toString(),
                    type: transferType
                });
            } else if (typeof spotClient.universalTransfer === 'function') {
                // Universal transfer API (newer)
                const fromType = fromWallet === WALLET_TYPES.SPOT ? 'MAIN_UMFUTURE' : 'UMFUTURE_MAIN';
                transferResult = await spotClient.universalTransfer({
                    type: fromType,
                    asset,
                    amount: amount.toString()
                });
            } else {
                throw new Error('Futures transfer API not available in current Binance client version');
            }
            
        } else if ((fromWallet === WALLET_TYPES.SPOT && toWallet === WALLET_TYPES.MARGIN) ||
                   (fromWallet === WALLET_TYPES.MARGIN && toWallet === WALLET_TYPES.SPOT)) {
            
            // Spot <-> Cross Margin transfer
            const transferType = fromWallet === WALLET_TYPES.SPOT ? 1 : 2;
            transferResult = await spotClient.marginTransfer({
                asset,
                amount: amount.toString(),
                type: transferType
            });
            
        } else if ((fromWallet === WALLET_TYPES.SPOT && toWallet === WALLET_TYPES.ISOLATED) ||
                   (fromWallet === WALLET_TYPES.ISOLATED && toWallet === WALLET_TYPES.SPOT)) {
            
            // Spot <-> Isolated Margin transfer
            if (!symbol) {
                throw new Error('Symbol required for isolated margin transfers');
            }
            
            const transferType = fromWallet === WALLET_TYPES.SPOT ? 'SPOT' : 'ISOLATED_MARGIN';
            const transTo = toWallet === WALLET_TYPES.SPOT ? 'SPOT' : 'ISOLATED_MARGIN';
            
            transferResult = await spotClient.isolatedMarginTransfer({
                asset,
                symbol,
                transFrom: transferType,
                transTo,
                amount: amount.toString()
            });
            
        } else {
            throw new Error(`Transfer from ${fromWallet} to ${toWallet} not supported`);
        }
        
        console.log(`[WALLET-TRANSFER] Success: ${asset} transfer completed`);
        return {
            success: true,
            transferId: transferResult.tranId,
            asset,
            amount,
            fromWallet,
            toWallet,
            timestamp: Date.now()
        };
        
    } catch (error) {
        console.error(`[WALLET-TRANSFER] Failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            asset,
            amount,
            fromWallet,
            toWallet,
            timestamp: Date.now()
        };
    }
};

// Plan and execute required transfers for bot strategy
const planAndExecuteTransfers = async (spotClient, futuresClient, requirements) => {
    const { strategy, symbol, investment, requiredWallets } = requirements;
    
    console.log(`[TRANSFER-PLAN] Planning transfers for ${strategy} ${symbol}, investment: ${investment}`);
    
    // Get current wallet balances
    const allWallets = await fetchAllWalletBalances(spotClient, futuresClient);
    
    const transferPlan = [];
    const baseAsset = getBaseAssetFromSymbol(symbol);
    
    // Analyze requirements based on strategy
    if (strategy === 'Short Perp') {
        // Short Perp needs:
        // 1. USDT in Spot wallet to buy base asset
        // 2. USDT in Futures wallet for margin
        
        const spotAmountNeeded = investment / 2;
        const futuresAmountNeeded = investment / 2;
        
        const spotUSDT = allWallets.spot.balances['USDT']?.total || 0;
        const futuresUSDT = allWallets.futures.balances['USDT']?.total || 0;
        
        console.log(`[TRANSFER-PLAN] Short Perp requirements:`);
        console.log(`  Spot USDT: need ${spotAmountNeeded}, have ${spotUSDT}`);
        console.log(`  Futures USDT: need ${futuresAmountNeeded}, have ${futuresUSDT}`);
        
        // Plan transfers if needed
        if (spotUSDT < spotAmountNeeded) {
            const deficit = spotAmountNeeded - spotUSDT;
            
            // Look for USDT in other wallets
            if (futuresUSDT > futuresAmountNeeded + deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.FUTURES,
                    toWallet: WALLET_TYPES.SPOT,
                    reason: 'Spot USDT deficit for base asset purchase'
                });
            } else if (allWallets.margin.balances['USDT']?.total > deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.MARGIN,
                    toWallet: WALLET_TYPES.SPOT,
                    reason: 'Spot USDT deficit from margin wallet'
                });
            }
        }
        
        if (futuresUSDT < futuresAmountNeeded) {
            const deficit = futuresAmountNeeded - futuresUSDT;
            
            // Look for USDT in other wallets
            if (spotUSDT > spotAmountNeeded + deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.SPOT,
                    toWallet: WALLET_TYPES.FUTURES,
                    reason: 'Futures USDT deficit for margin'
                });
            } else if (allWallets.margin.balances['USDT']?.total > deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.MARGIN,
                    toWallet: WALLET_TYPES.FUTURES,
                    reason: 'Futures USDT deficit from margin wallet'
                });
            }
        }
        
    } else if (strategy === 'Long Perp') {
        // Long Perp needs:
        // 1. Base asset in Spot wallet to sell
        // 2. USDT in Futures wallet for margin
        
        const baseAmountNeeded = investment / 2; // Approximate, will need price calculation
        const futuresAmountNeeded = investment / 2;
        
        const spotBase = allWallets.spot.balances[baseAsset]?.total || 0;
        const futuresUSDT = allWallets.futures.balances['USDT']?.total || 0;
        
        console.log(`[TRANSFER-PLAN] Long Perp requirements:`);
        console.log(`  Spot ${baseAsset}: need ~${baseAmountNeeded}, have ${spotBase}`);
        console.log(`  Futures USDT: need ${futuresAmountNeeded}, have ${futuresUSDT}`);
        
        // Plan base asset transfers if needed
        if (spotBase < baseAmountNeeded) {
            const deficit = baseAmountNeeded - spotBase;
            
            // Look for base asset in other wallets
            const futuresBase = allWallets.futures.balances[baseAsset]?.total || 0;
            const marginBase = allWallets.margin.balances[baseAsset]?.total || 0;
            
            if (futuresBase > deficit) {
                transferPlan.push({
                    asset: baseAsset,
                    amount: deficit,
                    fromWallet: WALLET_TYPES.FUTURES,
                    toWallet: WALLET_TYPES.SPOT,
                    reason: `Spot ${baseAsset} deficit for selling`
                });
            } else if (marginBase > deficit) {
                transferPlan.push({
                    asset: baseAsset,
                    amount: deficit,
                    fromWallet: WALLET_TYPES.MARGIN,
                    toWallet: WALLET_TYPES.SPOT,
                    reason: `Spot ${baseAsset} deficit from margin`
                });
            }
        }
        
        // Plan USDT transfers for futures margin
        if (futuresUSDT < futuresAmountNeeded) {
            const deficit = futuresAmountNeeded - futuresUSDT;
            
            const spotUSDT = allWallets.spot.balances['USDT']?.total || 0;
            const marginUSDT = allWallets.margin.balances['USDT']?.total || 0;
            
            if (spotUSDT > deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.SPOT,
                    toWallet: WALLET_TYPES.FUTURES,
                    reason: 'Futures USDT deficit for margin'
                });
            } else if (marginUSDT > deficit) {
                transferPlan.push({
                    asset: 'USDT',
                    amount: deficit,
                    fromWallet: WALLET_TYPES.MARGIN,
                    toWallet: WALLET_TYPES.FUTURES,
                    reason: 'Futures USDT deficit from margin'
                });
            }
        }
    }
    
    console.log(`[TRANSFER-PLAN] Generated ${transferPlan.length} transfer operations`);
    
    // Execute transfers if any are planned
    const transferResults = [];
    if (transferPlan.length > 0) {
        console.log(`[TRANSFER-EXECUTE] Executing ${transferPlan.length} transfers...`);
        
        for (const transfer of transferPlan) {
            const result = await executeWalletTransfer(spotClient, {
                ...transfer,
                symbol // Add symbol for isolated margin transfers
            });
            
            transferResults.push(result);
            
            // Small delay between transfers
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const successful = transferResults.filter(r => r.success).length;
        console.log(`[TRANSFER-EXECUTE] Completed: ${successful}/${transferResults.length} successful`);
    }
    
    return {
        currentBalances: allWallets,
        transferPlan,
        transferResults,
        summary: {
            totalTransfers: transferPlan.length,
            successfulTransfers: transferResults.filter(r => r.success).length,
            failedTransfers: transferResults.filter(r => !r.success).length
        }
    };
};

// Fetch spot balances as a map
const fetchSpotBalances = async (spotClient) => {
    const accountInfo = await spotClient.accountInfo();
    const balanceMap = {};
    
    for (const balance of accountInfo.balances) {
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        
        if (total > 0) {
            balanceMap[balance.asset] = { free, locked, total };
        }
    }
    
    return balanceMap;
};

// Fetch and cache exchange info for symbol filters
const fetchExchangeInfo = async (spotClient) => {
    const now = Date.now();
    if (exchangeInfoCache.data && (now - exchangeInfoCache.timestamp) < EXCHANGE_INFO_CACHE_TTL) {
        return exchangeInfoCache.data;
    }
    
    const exchangeInfo = await spotClient.exchangeInfo();
    exchangeInfoCache = { data: exchangeInfo, timestamp: now };
    return exchangeInfo;
};

// Get symbol-specific filters (minNotional, stepSize, tickSize)
const getSymbolFilters = (exchangeInfo, symbol) => {
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
    if (!symbolInfo) return null;
    
    const filters = {};
    
    for (const filter of symbolInfo.filters) {
        if (filter.filterType === 'MIN_NOTIONAL') {
            filters.minNotional = parseFloat(filter.minNotional);
        } else if (filter.filterType === 'LOT_SIZE') {
            filters.stepSize = parseFloat(filter.stepSize);
        } else if (filter.filterType === 'PRICE_FILTER') {
            filters.tickSize = parseFloat(filter.tickSize);
        }
    }
    
    return filters;
};

// Round quantity down to nearest step
const roundToStep = (value, step) => {
    if (!step || step === 0) return value;
    return Math.floor(value / step) * step;
};

// Check if order meets minimum notional requirement
const meetsMinNotional = (price, quantity, minNotional) => {
    if (!minNotional) return true;
    const notional = price * quantity;
    return notional >= minNotional;
};

// Pick best conversion path for asset to USDT (wrapper for enhanced function)
const pickConversionPath = (asset, prices, exchangeInfo) => {
    const pathResult = findOptimalConversionPath(asset, prices, exchangeInfo);
    return pathResult.path; // Return just the path for backward compatibility
};

// --- Spot Conversion Primitives ---

// Convert all of an asset to USDT using market orders
const marketSellAllToUSDT = async (spotClient, asset, balances, prices, exchangeInfo) => {
    console.log(`[CONVERT] Starting conversion of ${asset} to USDT`);
    
    if (asset === 'USDT') {
        console.log(`[CONVERT] Asset is already USDT, no conversion needed`);
        return { success: true, executed: [], totalUSDTReceived: 0, skippedReason: 'already_usdt' };
    }
    
    const assetBalance = balances[asset];
    if (!assetBalance || assetBalance.free <= 0) {
        console.log(`[CONVERT] No free ${asset} balance to convert`);
        return { success: false, executed: [], totalUSDTReceived: 0, skippedReason: 'no_balance' };
    }
    
    const conversionPath = pickConversionPath(asset, prices, exchangeInfo);
    if (conversionPath.length === 0) {
        console.log(`[CONVERT] No viable conversion path for ${asset}`);
        return { success: false, executed: [], totalUSDTReceived: 0, skippedReason: 'no_path' };
    }
    
    console.log(`[CONVERT] Using path: ${conversionPath.join(' -> ')}`);
    
    let currentAsset = asset;
    let currentQuantity = assetBalance.free;
    const executed = [];
    let totalUSDTReceived = 0;
    
    try {
        for (let i = 0; i < conversionPath.length; i++) {
            const symbol = conversionPath[i];
            const filters = getSymbolFilters(exchangeInfo, symbol);
            
            if (!filters) {
                throw new Error(`No filters found for ${symbol}`);
            }
            
            // Round quantity to step size
            const quantity = roundToStep(currentQuantity, filters.stepSize);
            const currentPrice = parseFloat(prices[symbol]);
            
            // Check minimum notional
            if (!meetsMinNotional(currentPrice, quantity, filters.minNotional)) {
                console.log(`[CONVERT] ${symbol}: quantity ${quantity} below minNotional ${filters.minNotional}`);
                return { success: false, executed, totalUSDTReceived, skippedReason: 'min_notional' };
            }
            
            console.log(`[CONVERT] Placing SELL order: ${quantity} ${currentAsset} on ${symbol}`);
            
            // Place market sell order
            const order = await spotClient.order({
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: quantity.toString()
            });
            
            const filledQuantity = parseFloat(order.executedQty);
            const avgPrice = parseFloat(order.fills?.reduce((sum, fill) => sum + parseFloat(fill.price) * parseFloat(fill.qty), 0) / filledQuantity) || currentPrice;
            const receivedQuantity = parseFloat(order.cummulativeQuoteQty || (filledQuantity * avgPrice));
            
            executed.push({
                symbol,
                side: 'SELL',
                quantity: filledQuantity,
                avgPrice,
                receivedQuantity,
                orderId: order.orderId
            });
            
            console.log(`[CONVERT] ${symbol}: Sold ${filledQuantity} ${currentAsset} at avg ${avgPrice}, received ${receivedQuantity}`);
            
            // Update for next hop
            currentAsset = symbol.endsWith('USDT') ? 'USDT' : symbol.replace(currentAsset, '');
            currentQuantity = receivedQuantity;
            
            if (currentAsset === 'USDT') {
                totalUSDTReceived = currentQuantity;
            }
        }
        
        console.log(`[CONVERT] Conversion complete: ${asset} -> USDT, received ${totalUSDTReceived}`);
        return { success: true, executed, totalUSDTReceived, skippedReason: null };
        
    } catch (error) {
        console.error(`[CONVERT] Conversion failed for ${asset}:`, error.message);
        return { success: false, executed, totalUSDTReceived, error: error.message };
    }
};

// Buy base asset with USDT using market orders
const marketBuyBaseWithUSDT = async (spotClient, symbol, usdtAmount, exchangeInfo) => {
    console.log(`[CONVERT] Buying base asset for ${symbol} with ${usdtAmount} USDT`);
    
    const filters = getSymbolFilters(exchangeInfo, symbol);
    if (!filters) {
        throw new Error(`No filters found for ${symbol}`);
    }
    
    // Apply fee buffer and round down to minNotional
    const adjustedAmount = usdtAmount * (1 - FEE_BUFFER_PCT);
    const quoteOrderQty = Math.max(adjustedAmount, filters.minNotional || 0);
    
    if (quoteOrderQty > usdtAmount) {
        throw new Error(`Insufficient USDT: need ${quoteOrderQty}, have ${usdtAmount}`);
    }
    
    try {
        console.log(`[CONVERT] Placing BUY order: ${quoteOrderQty} USDT worth of ${symbol}`);
        
        const order = await spotClient.order({
            symbol,
            side: 'BUY',
            type: 'MARKET',
            quoteOrderQty: quoteOrderQty.toString()
        });
        
        const filledQuantity = parseFloat(order.executedQty);
        const avgPrice = parseFloat(order.fills?.reduce((sum, fill) => sum + parseFloat(fill.price) * parseFloat(fill.qty), 0) / filledQuantity) || 0;
        const usedUSDT = parseFloat(order.cummulativeQuoteQty || (filledQuantity * avgPrice));
        
        console.log(`[CONVERT] ${symbol}: Bought ${filledQuantity} at avg ${avgPrice}, used ${usedUSDT} USDT`);
        
        return {
            success: true,
            executedQuantity: filledQuantity,
            avgPrice,
            usedUSDT,
            orderId: order.orderId
        };
        
    } catch (error) {
        console.error(`[CONVERT] Buy failed for ${symbol}:`, error.message);
        throw error;
    }
};

// --- Preflight Strategy Analyzer ---

// Ensure sufficient spot funds for a trading strategy with optional auto-conversion
const ensureSpotFundsForStrategy = async (spotClient, params) => {
    const {
        symbol,
        strategyType,
        investment,
        autoConvert = false,
        retainUsdtBuffer = RETAIN_USDT_BUFFER,
        minConvertValueUsdt = MIN_CONVERT_VALUE_USDT,
        allowAssets = null, // null = all assets allowed
        dryRun = false
    } = params;
    
    console.log(`[PREFLIGHT] Starting analysis for ${strategyType} ${symbol}, investment: ${investment}`);
    console.log(`[PREFLIGHT] Options: autoConvert=${autoConvert}, dryRun=${dryRun}, buffer=${retainUsdtBuffer}`);
    
    try {
        // Fetch current data
        const [balances, prices, exchangeInfo] = await Promise.all([
            fetchSpotBalances(spotClient),
            spotClient.prices(),
            fetchExchangeInfo(spotClient)
        ]);
        
        const baseAsset = getBaseAssetFromSymbol(symbol);
        const currentPrice = parseFloat(prices[symbol]);
        
        if (!currentPrice || currentPrice <= 0) {
            throw new Error(`Invalid price for ${symbol}: ${currentPrice}`);
        }
        
        console.log(`[PREFLIGHT] Current price: ${symbol} = ${currentPrice}`);
        
        const result = {
            ok: false,
            requiresConversion: false,
            missing: {},
            plan: [],
            executed: [],
            balancesBefore: { ...balances },
            balancesAfter: {},
            strategy: strategyType,
            symbol,
            baseAsset,
            currentPrice,
            investment
        };
        
        if (strategyType === 'Short Perp') {
            // Short Perp: Need USDT to buy base asset on spot
            const spotAmountUsdt = (investment / 2) * (1 + FEE_BUFFER_PCT);
            const availableUsdt = (balances['USDT']?.free || 0) - retainUsdtBuffer;
            const deficitUsdt = spotAmountUsdt - availableUsdt;
            
            console.log(`[PREFLIGHT] Short Perp: need ${spotAmountUsdt} USDT, have ${availableUsdt}, deficit: ${deficitUsdt}`);
            
            if (deficitUsdt <= 0) {
                console.log(`[PREFLIGHT] Sufficient USDT available, no conversion needed`);
                result.ok = true;
                result.balancesAfter = { ...balances };
                return result;
            }
            
            // Need to convert assets to USDT
            result.requiresConversion = true;
            result.missing.usdt = deficitUsdt;
            
            // Find candidate assets to convert
            const candidates = [];
            for (const [asset, balance] of Object.entries(balances)) {
                if (asset === 'USDT') continue;
                if (allowAssets && !allowAssets.includes(asset)) continue;
                if (balance.free <= 0) continue;
                
                // Calculate USDT value
                let usdtValue = 0;
                const conversionPath = pickConversionPath(asset, prices, exchangeInfo);
                if (conversionPath.length === 0) continue;
                
                // Estimate value through conversion path
                let currentValue = balance.free;
                for (const pathSymbol of conversionPath) {
                    const price = parseFloat(prices[pathSymbol]);
                    if (!price) {
                        currentValue = 0;
                        break;
                    }
                    currentValue = currentValue * price;
                }
                usdtValue = currentValue;
                
                if (usdtValue >= minConvertValueUsdt) {
                    candidates.push({
                        asset,
                        balance: balance.free,
                        usdtValue,
                        conversionPath
                    });
                }
            }
            
            // Sort by USDT value descending
            candidates.sort((a, b) => b.usdtValue - a.usdtValue);
            
            console.log(`[PREFLIGHT] Found ${candidates.length} conversion candidates`);
            
            // Build conversion plan
            let remainingDeficit = deficitUsdt;
            const conversionPlan = [];
            
            for (const candidate of candidates) {
                if (remainingDeficit <= 0) break;
                
                const convertAmount = Math.min(candidate.usdtValue, remainingDeficit);
                conversionPlan.push({
                    asset: candidate.asset,
                    balance: candidate.balance,
                    estimatedUsdtValue: candidate.usdtValue,
                    conversionPath: candidate.conversionPath,
                    willConvert: convertAmount
                });
                
                remainingDeficit -= convertAmount;
            }
            
            result.plan = conversionPlan;
            
            if (remainingDeficit > 0) {
                throw new Error(`Insufficient assets to convert. Need ${deficitUsdt} USDT, can only convert ${deficitUsdt - remainingDeficit} USDT`);
            }
            
            // Execute conversions if autoConvert and not dryRun
            if (autoConvert && !dryRun) {
                console.log(`[PREFLIGHT] Executing optimized conversion plan...`);
                
                // Prepare batch conversions
                const conversions = conversionPlan.map(step => ({
                    asset: step.asset,
                    amount: step.balance
                }));
                
                // Execute batch conversions for better efficiency
                const batchResult = await executeBatchConversions(
                    spotClient, conversions, prices, exchangeInfo
                );
                
                // Check if any critical conversions failed
                const failedConversions = batchResult.results.filter(r => !r.success);
                if (failedConversions.length > 0) {
                    const failedAssets = failedConversions.map(f => f.asset).join(', ');
                    throw new Error(`Batch conversion failed for assets: ${failedAssets}`);
                }
                
                // Format results for backward compatibility
                const executed = batchResult.results.map(r => ({
                    asset: r.asset,
                    result: {
                        success: r.success,
                        totalUSDTReceived: r.totalUSDTReceived,
                        executed: r.executed || []
                    }
                }));
                
                result.executed = executed;
                result.batchStats = {
                    totalConverted: batchResult.totalConverted,
                    successCount: batchResult.successCount,
                    totalAssets: conversions.length
                };
                
                console.log(`[PREFLIGHT] Batch conversion completed: ${batchResult.totalConverted.toFixed(2)} USDT from ${batchResult.successCount} assets`);
                
                // Re-fetch balances to verify
                result.balancesAfter = await fetchSpotBalances(spotClient);
                const finalUsdt = (result.balancesAfter['USDT']?.free || 0) - retainUsdtBuffer;
                
                if (finalUsdt >= spotAmountUsdt) {
                    console.log(`[PREFLIGHT] Conversion successful: have ${finalUsdt} USDT, need ${spotAmountUsdt}`);
                    result.ok = true;
                } else {
                    throw new Error(`Conversion completed but still insufficient USDT: have ${finalUsdt}, need ${spotAmountUsdt}`);
                }
            } else {
                console.log(`[PREFLIGHT] Conversion plan ready (${dryRun ? 'dry run' : 'autoConvert disabled'})`);
                result.balancesAfter = { ...balances };
            }
            
        } else if (strategyType === 'Long Perp') {
            // Long Perp: Need base asset to sell on spot
            const baseFilters = getSymbolFilters(exchangeInfo, symbol);
            if (!baseFilters) {
                throw new Error(`No trading filters found for ${symbol}`);
            }
            
            const requiredBaseQty = Math.floor(((investment / 2) / currentPrice) / baseFilters.stepSize) * baseFilters.stepSize;
            const availableBase = balances[baseAsset]?.free || 0;
            const deficitBase = requiredBaseQty - availableBase;
            
            console.log(`[PREFLIGHT] Long Perp: need ${requiredBaseQty} ${baseAsset}, have ${availableBase}, deficit: ${deficitBase}`);
            
            if (deficitBase <= 0) {
                console.log(`[PREFLIGHT] Sufficient ${baseAsset} available`);
                result.ok = true;
                result.balancesAfter = { ...balances };
                return result;
            }
            
            // Long Perp with insufficient base asset - try to convert other assets to base asset
            result.requiresConversion = true;
            result.missing.base = {
                asset: baseAsset,
                required: requiredBaseQty,
                available: availableBase,
                deficit: deficitBase
            };
            
            // Calculate required USDT value to purchase the deficit base asset
            const requiredUsdtValue = deficitBase * currentPrice * (1 + FEE_BUFFER_PCT);
            
            console.log(`[PREFLIGHT] Need to convert ${requiredUsdtValue} USDT worth of assets to ${baseAsset}`);
            
            // Find candidate assets to convert to USDT first, then to base asset
            const candidates = [];
            for (const [asset, balance] of Object.entries(balances)) {
                if (asset === baseAsset) continue; // Already counted
                if (allowAssets && !allowAssets.includes(asset)) continue;
                if (balance.free <= 0) continue;
                
                // Calculate USDT value
                let usdtValue = 0;
                if (asset === 'USDT') {
                    usdtValue = balance.free;
                } else {
                    const conversionPath = pickConversionPath(asset, prices, exchangeInfo);
                    if (conversionPath.length === 0) continue;
                    
                    // Estimate value through conversion path
                    let currentValue = balance.free;
                    for (const pathSymbol of conversionPath) {
                        const price = parseFloat(prices[pathSymbol]);
                        if (!price) {
                            currentValue = 0;
                            break;
                        }
                        currentValue = currentValue * price;
                    }
                    usdtValue = currentValue;
                }
                
                if (usdtValue >= minConvertValueUsdt) {
                    candidates.push({
                        asset,
                        balance: balance.free,
                        usdtValue,
                        conversionPath: asset === 'USDT' ? [] : pickConversionPath(asset, prices, exchangeInfo)
                    });
                }
            }
            
            // Sort by USDT value descending
            candidates.sort((a, b) => b.usdtValue - a.usdtValue);
            
            console.log(`[PREFLIGHT] Found ${candidates.length} conversion candidates for Long Perp`);
            
            // Build conversion plan
            let remainingUsdtNeeded = requiredUsdtValue;
            const conversionPlan = [];
            
            for (const candidate of candidates) {
                if (remainingUsdtNeeded <= 0) break;
                
                const convertUsdtValue = Math.min(candidate.usdtValue, remainingUsdtNeeded);
                const convertRatio = convertUsdtValue / candidate.usdtValue;
                const convertAmount = candidate.balance * convertRatio;
                
                conversionPlan.push({
                    asset: candidate.asset,
                    balance: candidate.balance,
                    estimatedUsdtValue: candidate.usdtValue,
                    conversionPath: candidate.conversionPath,
                    willConvert: convertAmount,
                    willConvertUsdtValue: convertUsdtValue,
                    targetAsset: baseAsset
                });
                
                remainingUsdtNeeded -= convertUsdtValue;
            }
            
            result.plan = conversionPlan;
            
            if (remainingUsdtNeeded > 0) {
                throw new Error(`Insufficient assets to convert. Need ${requiredUsdtValue} USDT worth of assets to buy ${deficitBase} ${baseAsset}, can only convert ${requiredUsdtValue - remainingUsdtNeeded} USDT worth.`);
            }
            
            // Execute conversions if autoConvert and not dryRun
            if (autoConvert && !dryRun) {
                console.log(`[PREFLIGHT] Executing Long Perp conversion plan...`);
                
                // First convert all assets to USDT
                const usdtConversions = conversionPlan
                    .filter(step => step.asset !== 'USDT')
                    .map(step => ({
                        asset: step.asset,
                        amount: step.willConvert
                    }));
                
                if (usdtConversions.length > 0) {
                    const usdtBatchResult = await executeBatchConversions(
                        spotClient, usdtConversions, prices, exchangeInfo
                    );
                    
                    console.log(`[PREFLIGHT] Converted to USDT: ${usdtBatchResult.totalConverted.toFixed(2)} USDT`);
                    
                    // Check if conversions failed
                    const failedConversions = usdtBatchResult.results.filter(r => !r.success);
                    if (failedConversions.length > 0) {
                        const failedAssets = failedConversions.map(f => f.asset).join(', ');
                        throw new Error(`USDT conversion failed for assets: ${failedAssets}`);
                    }
                }
                
                // Refresh balances to get actual USDT amount
                const updatedBalances = await fetchSpotBalances(spotClient);
                const availableUsdt = updatedBalances['USDT']?.free || 0;
                
                // Now convert USDT to base asset
                if (availableUsdt >= requiredUsdtValue) {
                    console.log(`[PREFLIGHT] Converting ${requiredUsdtValue} USDT to ${baseAsset}...`);
                    
                    try {
                        // Round to 2 decimal places for USDT precision
                        const roundedUsdtValue = Math.round(requiredUsdtValue * 100) / 100;
                        
                        const buyOrder = await spotClient.order({
                            symbol: symbol,
                            side: 'BUY',
                            type: 'MARKET',
                            quoteOrderQty: roundedUsdtValue.toString()
                        });
                        
                        console.log(`[PREFLIGHT] Successfully bought ${baseAsset}:`, buyOrder);
                        
                        // Record the conversion
                        result.executed.push({
                            asset: 'USDT',
                            result: {
                                success: true,
                                baseAssetReceived: parseFloat(buyOrder.executedQty || '0'),
                                usdtSpent: requiredUsdtValue,
                                order: buyOrder
                            }
                        });
                        
                    } catch (buyError) {
                        throw new Error(`Failed to buy ${baseAsset} with USDT: ${buyError.message}`);
                    }
                } else {
                    throw new Error(`After conversion, insufficient USDT: have ${availableUsdt}, need ${requiredUsdtValue}`);
                }
                
                // Re-fetch balances to verify final state
                result.balancesAfter = await fetchSpotBalances(spotClient);
                const finalBase = result.balancesAfter[baseAsset]?.free || 0;
                
                // Add 1% tolerance for trading fees and minimum order sizes
                const tolerance = requiredBaseQty * 0.01;
                const effectiveRequired = requiredBaseQty - tolerance;
                
                if (finalBase >= effectiveRequired) {
                    console.log(`[PREFLIGHT] Long Perp conversion successful: have ${finalBase} ${baseAsset}, need ${requiredBaseQty} (with tolerance)`);
                    result.ok = true;
                } else {
                    throw new Error(`Conversion completed but still insufficient ${baseAsset}: have ${finalBase}, need ${requiredBaseQty} (effective: ${effectiveRequired})`);
                }
                
            } else {
                console.log(`[PREFLIGHT] Long Perp conversion plan ready (${dryRun ? 'dry run' : 'autoConvert disabled'})`);
                result.balancesAfter = { ...balances };
            }
            
        } else {
            throw new Error(`Unknown strategy type: ${strategyType}`);
        }
        
        console.log(`[PREFLIGHT] Analysis complete: ok=${result.ok}, requiresConversion=${result.requiresConversion}`);
        return result;
        
    } catch (error) {
        console.error(`[PREFLIGHT] Analysis failed:`, error.message);
        throw error;
    }
};

// --- API Endpoints ---

app.get('/api/v1/bots', (req, res) => {
    res.json(Object.values(activeBots));
});

app.post('/api/v1/import-detected-bots', async (req, res) => {
    const { detectedBots } = req.body;
    
    if (!detectedBots || !Array.isArray(detectedBots)) {
        return res.status(400).json({ 
            success: false, 
            message: 'detectedBots array is required' 
        });
    }
    
    try {
        let importedCount = 0;
        const importedBots = [];
        
        for (const bot of detectedBots) {
            if (!activeBots[bot.id]) {
                // Convert detected bot to active bot format
                const activeBot = {
                    id: bot.id,
                    name: bot.name,
                    symbol: bot.symbol,
                    asset: bot.asset,
                    strategyType: 'Unknown', // We don't know the strategy
                    investment: bot.spotBalance * 2, // Estimate based on spot balance
                    leverage: 1, // Unknown, assume 1x
                    autoManaged: false, // Don't auto-manage imported bots
                    startTime: bot.lastActivity || bot.detectedAt,
                    status: 'imported',
                    fundingRevenue: 0,
                    imported: true,
                    originalDetection: bot
                };
                
                activeBots[bot.id] = activeBot;
                importedBots.push(activeBot);
                importedCount++;
                
                console.log(`[INFO] Imported bot: ${bot.name} (${bot.symbol})`);
            }
        }
        
        res.json({
            success: true,
            message: `Successfully imported ${importedCount} bots`,
            imported: importedBots,
            totalActive: Object.keys(activeBots).length
        });
        
    } catch (error) {
        console.error('[ERROR] Failed to import bots:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to import detected bots',
            error: error.message
        });
    }
});

app.post('/api/v1/get-binance-arbitrage-bots', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required' });
    }
    
    try {
        console.log('[INFO] Fetching Binance Arbitrage Bots...');
        const axios = require('axios');
        const crypto = require('crypto');
        
        // Binance API configuration
        const baseURL = 'https://api.binance.com';
        const timestamp = Date.now();
        
        // Try multiple possible endpoints for arbitrage bots
        const possibleEndpoints = [
            '/sapi/v1/algo/futures/openOrders',  // Algo trading orders
            '/sapi/v1/algo/futures/historicalOrders', // Historical algo orders
            '/fapi/v2/positionRisk', // Futures position risk
            '/fapi/v1/openOrders', // Open futures orders
            '/sapi/v1/margin/isolated/account', // Isolated margin
            '/sapi/v1/sub-account/list', // Sub-accounts (maybe bots are here)
            '/sapi/v1/lending/auto-invest/plan/list', // Auto-invest plans
            '/sapi/v1/convert/exchangeInfo' // Convert/arbitrage info
        ];
        
        const results = {};
        const activeBots = [];
        
        for (const endpoint of possibleEndpoints) {
            try {
                console.log(`[INFO] Trying endpoint: ${endpoint}`);
                
                // Create signature
                const queryString = `timestamp=${timestamp}`;
                const signature = crypto
                    .createHmac('sha256', apiSecret)
                    .update(queryString)
                    .digest('hex');
                
                const config = {
                    method: 'GET',
                    url: `${baseURL}${endpoint}?${queryString}&signature=${signature}`,
                    headers: {
                        'X-MBX-APIKEY': apiKey
                    }
                };
                
                const response = await axios(config);
                results[endpoint] = {
                    success: true,
                    data: response.data,
                    count: Array.isArray(response.data) ? response.data.length : 'object'
                };
                
                // If we get data, try to parse it as arbitrage bots
                if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                    response.data.forEach((item, index) => {
                        activeBots.push({
                            id: `binance_${endpoint.replace(/\W/g, '_')}_${index}`,
                            name: `Binance Bot ${item.symbol || item.asset || 'Unknown'}`,
                            source: endpoint,
                            symbol: item.symbol || 'Unknown',
                            status: item.status || 'active',
                            data: item,
                            type: 'binance_official'
                        });
                    });
                }
                
                console.log(`[SUCCESS] ${endpoint}: ${results[endpoint].count} items`);
                
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.response?.data?.msg || error.message,
                    code: error.response?.status || 'unknown'
                };
                console.log(`[INFO] ${endpoint}: ${results[endpoint].error}`);
            }
        }
        
        // Try specific arbitrage endpoints if they exist
        const arbitrageEndpoints = [
            '/sapi/v1/algo/spot/openOrders',
            '/sapi/v1/algo/spot/historicalOrders',
            '/sapi/v1/convert/orderStatus',
            '/sapi/v1/convert/getResult',
            '/sapi/v1/margin/openOrders',
            '/sapi/v1/margin/allOrders',
            '/sapi/v3/asset/getUserAsset',
            '/sapi/v1/capital/config/getall', // Get all assets config
            '/sapi/v1/account/status' // Account status might show bots
        ];
        
        for (const endpoint of arbitrageEndpoints) {
            try {
                console.log(`[INFO] Trying arbitrage endpoint: ${endpoint}`);
                
                const queryString = `timestamp=${timestamp}`;
                const signature = crypto
                    .createHmac('sha256', apiSecret)
                    .update(queryString)
                    .digest('hex');
                
                const response = await axios.get(`${baseURL}${endpoint}?${queryString}&signature=${signature}`, {
                    headers: { 'X-MBX-APIKEY': apiKey }
                });
                
                results[endpoint] = { success: true, data: response.data };
                console.log(`[SUCCESS] ${endpoint}: Found data`);
                
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.response?.data?.msg || error.message
                };
            }
        }
        
        res.json({
            success: true,
            message: `Found ${activeBots.length} potential bots across ${Object.keys(results).length} endpoints`,
            binanceBots: activeBots,
            endpointResults: results,
            summary: {
                totalBotsFound: activeBots.length,
                endpointsTested: Object.keys(results).length,
                successfulEndpoints: Object.values(results).filter(r => r.success).length
            },
            instructions: {
                message: 'Check the endpointResults to see which API endpoints returned data',
                nextSteps: 'Look for endpoints with success:true and data containing your arbitrage bots'
            }
        });
        
    } catch (error) {
        console.error('[ERROR] Failed to fetch Binance arbitrage bots:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch Binance arbitrage bots',
            error: error.message,
            details: error.response?.data || null
        });
    }
});

app.post('/api/v1/test-specific-arbitrage', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required' });
    }
    
    try {
        const axios = require('axios');
        const crypto = require('crypto');
        const baseURL = 'https://api.binance.com';
        const timestamp = Date.now();
        
        // These are specific endpoints for trading bots (futures arbitrage)
        const specificEndpoints = [
            '/sapi/v1/algo/futures/openOrders',
            '/sapi/v1/algo/futures/historicalOrders',
            '/sapi/v1/algo/spot/openOrders',
            '/sapi/v1/algo/spot/historicalOrders',
            '/sapi/v1/strategy/list', // Trading strategies
            '/sapi/v1/strategy/status', // Strategy status
            '/sapi/v1/futures/algo/openOrders', // Alternative futures algo endpoint
            '/sapi/v1/futures/algo/historicalOrders', // Alternative futures algo historical
            '/sapi/v1/bswap/pools', // Swap pools (might be related to arbitrage)
            '/sapi/v1/sub-account/margin/account' // Sub-account margin
        ];
        
        const results = {};
        
        for (const endpoint of specificEndpoints) {
            try {
                console.log(`[TEST] Testing: ${endpoint}`);
                
                let queryString = `timestamp=${timestamp}`;
                
                // Some endpoints might need additional parameters
                if (endpoint.includes('historicalOrders')) {
                    queryString += '&startTime=' + (timestamp - 24*60*60*1000); // Last 24 hours
                }
                
                const signature = crypto
                    .createHmac('sha256', apiSecret)
                    .update(queryString)
                    .digest('hex');
                
                const response = await axios.get(`${baseURL}${endpoint}?${queryString}&signature=${signature}`, {
                    headers: { 'X-MBX-APIKEY': apiKey },
                    timeout: 10000
                });
                
                results[endpoint] = {
                    success: true,
                    data: response.data,
                    hasData: response.data && (Array.isArray(response.data) ? response.data.length > 0 : Object.keys(response.data).length > 0)
                };
                
                console.log(`[SUCCESS] ${endpoint}: ${results[endpoint].hasData ? 'HAS DATA!' : 'Empty'}`);
                
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.response?.data?.msg || error.message,
                    code: error.response?.status
                };
                console.log(`[INFO] ${endpoint}: ${results[endpoint].error}`);
            }
        }
        
        res.json({
            success: true,
            results,
            summary: {
                tested: Object.keys(results).length,
                successful: Object.values(results).filter(r => r.success).length,
                withData: Object.values(results).filter(r => r.success && r.hasData).length
            },
            message: 'Check results for endpoints with hasData: true - those might contain your arbitrage bots'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/v1/find-trading-bots', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required' });
    }
    
    try {
        const axios = require('axios');
        const crypto = require('crypto');
        const baseURL = 'https://api.binance.com';
        const timestamp = Date.now();
        
        console.log('[INFO] Searching for Trading Bots (Futures Arbitrage)...');
        
        // Trading bots specific endpoints based on the URL structure
        const tradingBotEndpoints = [
            '/sapi/v1/algo/futures/openOrders', // Main algo futures
            '/sapi/v1/algo/futures/historicalOrders',
            '/sapi/v1/algo/futures/subOrders', // Sub-orders for algo trading
            '/sapi/v2/algo/futures/openOrders', // Version 2
            '/sapi/v2/algo/futures/historicalOrders',
            '/sapi/v1/portfolio/algo-order', // Portfolio algo orders
            '/sapi/v1/margin/algo/order', // Margin algo orders
            '/fapi/v1/algo/openOrders', // Direct futures API algo
            '/fapi/v1/algo/historicalOrders',
            '/sapi/v1/convert/tradeFlow' // Convert trade flow (might show arbitrage)
        ];
        
        const results = {};
        let foundBots = [];
        
        for (const endpoint of tradingBotEndpoints) {
            try {
                console.log(`[SEARCH] Checking: ${endpoint}`);
                
                let queryString = `timestamp=${timestamp}`;
                
                // Add time range for historical data
                if (endpoint.includes('historical')) {
                    const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
                    queryString += `&startTime=${oneDayAgo}`;
                }
                
                const signature = crypto
                    .createHmac('sha256', apiSecret)
                    .update(queryString)
                    .digest('hex');
                
                const config = {
                    method: 'GET',
                    url: `${baseURL}${endpoint}?${queryString}&signature=${signature}`,
                    headers: {
                        'X-MBX-APIKEY': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                };
                
                const response = await axios(config);
                
                results[endpoint] = {
                    success: true,
                    data: response.data,
                    hasData: response.data && (
                        Array.isArray(response.data) ? response.data.length > 0 :
                        (response.data.orders && response.data.orders.length > 0) ||
                        (response.data.total && response.data.total > 0) ||
                        Object.keys(response.data).length > 2
                    )
                };
                
                // Look for any data that might contain strategy IDs or active bots
                if (results[endpoint].hasData) {
                    console.log(`[FOUND] ${endpoint}: Contains data!`);
                    
                    // Try to extract bot information
                    const data = response.data;
                    if (data.orders && Array.isArray(data.orders)) {
                        data.orders.forEach((order, index) => {
                            foundBots.push({
                                id: order.algoId || order.strategyId || order.orderId || `${endpoint}_${index}`,
                                source: endpoint,
                                name: `Arbitrage Bot ${order.symbol || 'Unknown'}`,
                                symbol: order.symbol || 'Unknown',
                                status: order.algoStatus || order.status || 'active',
                                type: 'futures_arbitrage',
                                data: order
                            });
                        });
                    } else if (Array.isArray(data)) {
                        data.forEach((item, index) => {
                            foundBots.push({
                                id: item.algoId || item.strategyId || item.id || `${endpoint}_${index}`,
                                source: endpoint,
                                name: `Trading Bot ${item.symbol || item.asset || 'Unknown'}`,
                                symbol: item.symbol || item.asset || 'Unknown',
                                status: item.algoStatus || item.status || 'active',
                                type: 'trading_bot',
                                data: item
                            });
                        });
                    }
                } else {
                    console.log(`[INFO] ${endpoint}: Empty or no relevant data`);
                }
                
            } catch (error) {
                results[endpoint] = {
                    success: false,
                    error: error.response?.data?.msg || error.message,
                    code: error.response?.status || 'timeout'
                };
                console.log(`[ERROR] ${endpoint}: ${results[endpoint].error}`);
            }
        }
        
        console.log(`[RESULT] Found ${foundBots.length} potential trading bots`);
        
        res.json({
            success: true,
            message: `Searched ${tradingBotEndpoints.length} endpoints, found ${foundBots.length} potential bots`,
            foundBots,
            detailedResults: results,
            summary: {
                endpointsTested: tradingBotEndpoints.length,
                successfulEndpoints: Object.values(results).filter(r => r.success).length,
                endpointsWithData: Object.values(results).filter(r => r.success && r.hasData).length,
                botsFound: foundBots.length
            },
            instructions: {
                message: 'Check foundBots array for your arbitrage bots',
                note: 'If no bots found, they might be in a different API category or require special permissions'
            }
        });
        
    } catch (error) {
        console.error('[ERROR] Failed to search for trading bots:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to search for trading bots',
            error: error.message
        });
    }
});

app.post('/api/v1/detect-arbitrage-activity', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required' });
    }
    
    try {
        const axios = require('axios');
        const crypto = require('crypto');
        const baseURL = 'https://api.binance.com';
        const timestamp = Date.now();
        
        console.log('[INFO] Detecting arbitrage activity using available endpoints...');
        
        const results = {};
        const detectedArbitrageActivity = [];
        
        // Helper function to make signed requests
        const makeSignedRequest = async (endpoint, params = {}) => {
            const queryParams = new URLSearchParams({ ...params, timestamp }).toString();
            const signature = crypto.createHmac('sha256', apiSecret).update(queryParams).digest('hex');
            
            return axios.get(`${baseURL}${endpoint}?${queryParams}&signature=${signature}`, {
                headers: { 'X-MBX-APIKEY': apiKey },
                timeout: 10000
            });
        };
        
        // 1. Get Futures Account Information
        try {
            console.log('[INFO] Getting futures account info...');
            const futuresAccount = await makeSignedRequest('/fapi/v2/account');
            results.futuresAccount = {
                success: true,
                totalWalletBalance: futuresAccount.data.totalWalletBalance,
                totalUnrealizedProfit: futuresAccount.data.totalUnrealizedProfit,
                totalMarginBalance: futuresAccount.data.totalMarginBalance,
                assets: futuresAccount.data.assets.filter(a => parseFloat(a.walletBalance) > 0)
            };
            console.log(`[SUCCESS] Futures account: ${results.futuresAccount.totalWalletBalance} USDT total`);
        } catch (error) {
            results.futuresAccount = { success: false, error: error.message };
        }
        
        // 2. Get Futures Positions
        try {
            console.log('[INFO] Getting futures positions...');
            const positions = await makeSignedRequest('/fapi/v2/positionRisk');
            const openPositions = positions.data.filter(p => parseFloat(p.positionAmt) !== 0);
            results.futuresPositions = {
                success: true,
                totalPositions: positions.data.length,
                openPositions: openPositions.length,
                positions: openPositions.map(p => ({
                    symbol: p.symbol,
                    positionAmt: parseFloat(p.positionAmt),
                    entryPrice: parseFloat(p.entryPrice),
                    unrealizedProfit: parseFloat(p.unrealizedProfit),
                    percentage: parseFloat(p.percentage)
                }))
            };
            console.log(`[SUCCESS] Found ${openPositions.length} open futures positions`);
        } catch (error) {
            results.futuresPositions = { success: false, error: error.message };
        }
        
        // 3. Get Spot Account Information
        try {
            console.log('[INFO] Getting spot account info...');
            const spotAccount = await makeSignedRequest('/api/v3/account');
            const nonZeroBalances = spotAccount.data.balances.filter(b => 
                parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
            );
            results.spotAccount = {
                success: true,
                totalBalances: spotAccount.data.balances.length,
                nonZeroBalances: nonZeroBalances.length,
                balances: nonZeroBalances.map(b => ({
                    asset: b.asset,
                    free: parseFloat(b.free),
                    locked: parseFloat(b.locked),
                    total: parseFloat(b.free) + parseFloat(b.locked)
                }))
            };
            console.log(`[SUCCESS] Found ${nonZeroBalances.length} non-zero spot balances`);
        } catch (error) {
            results.spotAccount = { success: false, error: error.message };
        }
        
        // 4. Analyze for Arbitrage Patterns
        if (results.futuresPositions?.success && results.spotAccount?.success) {
            console.log('[INFO] Analyzing for arbitrage patterns...');
            
            const futuresPositions = results.futuresPositions.positions || [];
            const spotBalances = results.spotAccount.balances || [];
            
            // Look for matching assets between futures positions and spot balances
            futuresPositions.forEach(futuresPos => {
                const baseAsset = futuresPos.symbol.replace('USDT', '').replace('BUSD', '');
                const matchingSpotBalance = spotBalances.find(balance => balance.asset === baseAsset);
                
                if (matchingSpotBalance && matchingSpotBalance.total > 0.001) {
                    // Potential arbitrage detected!
                    const isLongFutures = futuresPos.positionAmt > 0;
                    const hasSpotHolding = matchingSpotBalance.total > 0;
                    
                    if ((isLongFutures && hasSpotHolding) || (!isLongFutures && hasSpotHolding)) {
                        detectedArbitrageActivity.push({
                            id: `arbitrage_${baseAsset}_${Date.now()}`,
                            name: `Detected Arbitrage: ${baseAsset}`,
                            symbol: futuresPos.symbol,
                            asset: baseAsset,
                            type: isLongFutures ? 'Long Futures + Hold Spot' : 'Short Futures + Hold Spot',
                            futuresPosition: {
                                amount: futuresPos.positionAmt,
                                entryPrice: futuresPos.entryPrice,
                                unrealizedProfit: futuresPos.unrealizedProfit
                            },
                            spotBalance: {
                                total: matchingSpotBalance.total,
                                free: matchingSpotBalance.free,
                                locked: matchingSpotBalance.locked
                            },
                            status: 'detected',
                            detectedAt: Date.now(),
                            confidence: 'high' // Both futures position and spot balance exist
                        });
                    }
                }
            });
            
            console.log(`[ANALYSIS] Detected ${detectedArbitrageActivity.length} potential arbitrage activities`);
        }
        
        // 5. Get Recent Futures Trades (last 24 hours) for additional context
        try {
            if (detectedArbitrageActivity.length > 0) {
                console.log('[INFO] Getting recent futures trades for context...');
                const oneDayAgo = timestamp - (24 * 60 * 60 * 1000);
                
                for (const activity of detectedArbitrageActivity.slice(0, 3)) { // Only check first 3
                    try {
                        const trades = await makeSignedRequest('/fapi/v1/userTrades', {
                            symbol: activity.symbol,
                            startTime: oneDayAgo,
                            limit: 10
                        });
                        
                        activity.recentTrades = trades.data.length;
                        activity.lastTradeTime = trades.data.length > 0 ? trades.data[0].time : null;
                    } catch (error) {
                        activity.recentTrades = 'error';
                    }
                }
            }
        } catch (error) {
            console.log('[INFO] Could not fetch recent trades:', error.message);
        }
        
        res.json({
            success: true,
            message: `Analysis complete. Found ${detectedArbitrageActivity.length} potential arbitrage activities.`,
            detectedArbitrageActivity,
            accountSummary: {
                futuresBalance: results.futuresAccount?.totalWalletBalance || 'N/A',
                futuresPositions: results.futuresPositions?.openPositions || 0,
                spotAssets: results.spotAccount?.nonZeroBalances || 0,
                potentialArbitrage: detectedArbitrageActivity.length
            },
            rawResults: results,
            recommendations: detectedArbitrageActivity.length > 0 ? [
                'Potential arbitrage activities detected based on matching positions',
                'Import these detected activities to track them as bots',
                'Monitor funding rates and position performance',
                'Consider adding manual bot entries for better tracking'
            ] : [
                'No obvious arbitrage patterns detected in current positions',
                'Your Binance bots might be using different asset pairs',
                'Try adding manual bot entries if you know the specific symbols',
                'Check if your API key has all necessary permissions'
            ]
        });
        
    } catch (error) {
        console.error('[ERROR] Arbitrage detection failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to detect arbitrage activity',
            error: error.message
        });
    }
});

app.post('/api/v1/add-manual-bot', async (req, res) => {
    const { name, symbol, strategyId, investment, strategyType, notes } = req.body;
    
    if (!name || !symbol) {
        return res.status(400).json({
            success: false,
            message: 'Name and symbol are required fields'
        });
    }
    
    try {
        const botId = strategyId || `manual_${symbol.toLowerCase()}_${Date.now()}`;
        
        if (activeBots[botId]) {
            return res.status(400).json({
                success: false,
                message: `Bot with ID '${botId}' already exists`
            });
        }
        
        const newBot = {
            id: botId,
            name,
            symbol: symbol.toUpperCase(),
            strategyId: strategyId || null,
            strategyType: strategyType || 'Binance Official Arbitrage',
            investment: investment || 0,
            leverage: 1,
            autoManaged: false, // Manual bots are not auto-managed
            startTime: Date.now(),
            status: 'tracking', // We're tracking it, not controlling it
            fundingRevenue: 0,
            source: 'manual_entry',
            notes: notes || '',
            addedAt: Date.now(),
            binanceOfficial: true // This is a Binance official bot
        };
        
        activeBots[botId] = newBot;
        
        console.log(`[INFO] Manually added bot: ${name} (${symbol}) with ID: ${botId}`);
        
        res.json({
            success: true,
            message: `Successfully added bot: ${name}`,
            bot: newBot,
            totalActiveBots: Object.keys(activeBots).length
        });
        
    } catch (error) {
        console.error('[ERROR] Failed to add manual bot:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to add manual bot',
            error: error.message
        });
    }
});

app.get('/api/v1/manual-bot-template', (req, res) => {
    // Provide a template for easy bot addition
    res.json({
        template: {
            name: 'Arbitrage Bot BTCUSDT',
            symbol: 'BTCUSDT',
            strategyId: '112191', // Example from your URL
            investment: 100, // Optional: estimated investment
            strategyType: 'Futures Arbitrage',
            notes: 'Official Binance arbitrage bot - tracking only'
        },
        examples: [
            {
                name: 'BTC Arbitrage Bot',
                symbol: 'BTCUSDT',
                strategyId: '112191',
                strategyType: 'Futures Arbitrage'
            },
            {
                name: 'ETH Arbitrage Bot',
                symbol: 'ETHUSDT',
                strategyId: '112192',
                strategyType: 'Futures Arbitrage'
            },
            {
                name: 'SOL Arbitrage Bot',
                symbol: 'SOLUSDT',
                strategyId: '112193',
                strategyType: 'Futures Arbitrage'
            },
            {
                name: 'ADA Arbitrage Bot',
                symbol: 'ADAUSDT',
                strategyId: '112194',
                strategyType: 'Futures Arbitrage'
            }
        ],
        instructions: {
            steps: [
                '1. Get the strategyId from your Binance bot URL',
                '2. Identify the trading symbol (BTCUSDT, ETHUSDT, etc.)',
                '3. Give it a descriptive name',
                '4. Add any notes for reference'
            ],
            note: 'These bots will be tracked but not controlled by this application'
        }
    });
});

app.get('/api/v1/test', async (req, res) => {
    try {
        const { futuresClient } = getBinanceClients();
        const test = await futuresClient.ping();
        res.json({ success: true, message: 'Binance API connection successful', data: test });
    } catch (error) {
        res.json({ success: false, message: 'Binance API connection failed', error: error.message });
    }
});

app.get('/api/v1/test-funding', async (req, res) => {
    try {
        const { futuresClient } = getBinanceClients();
        const btcRate = await futuresClient.futuresFundingRate({ symbol: 'BTCUSDT' });
        const ethRate = await futuresClient.futuresFundingRate({ symbol: 'ETHUSDT' });
        const sample = [btcRate[0], ethRate[0]];
        res.json({ success: true, count: 2, sample });
    } catch (error) {
        res.json({ success: false, message: 'Failed to fetch funding rates', error: error.message });
    }
});

app.post('/api/v1/test-launch', async (req, res) => {
    // Test endpoint for debugging bot launch without actual trading
    const { apiKey, apiSecret, symbol = 'BTCUSDT', investment = 10 } = req.body;
    
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys required for testing' });
    }
    
    try {
        console.log(`[TEST] Testing bot launch parameters...`);
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        // Test 1: Price fetching
        console.log(`[TEST] Step 1: Testing price fetch for ${symbol}`);
        const priceResponse = await spotClient.prices({ symbol });
        const currentPrice = parseFloat(priceResponse[symbol]);
        console.log(`[TEST] Price fetch successful: ${symbol} = $${currentPrice}`);
        
        // Test 2: Account info
        console.log(`[TEST] Step 2: Testing account access`);
        const accountInfo = await spotClient.accountInfo();
        const usdtBalance = accountInfo.balances.find(b => b.asset === 'USDT');
        console.log(`[TEST] Account access successful. USDT balance: ${usdtBalance?.free || '0'}`);
        
        // Test 3: Calculate quantities
        const spotAmount = investment / 2;
        const quantity = (spotAmount / currentPrice).toFixed(5);
        
        res.json({
            success: true,
            message: 'Bot launch test completed successfully',
            testResults: {
                symbol,
                currentPrice,
                investment,
                spotAmount,
                quantity,
                usdtBalance: usdtBalance?.free || '0',
                readyToTrade: parseFloat(usdtBalance?.free || '0') >= spotAmount
            }
        });
        
    } catch (error) {
        console.error(`[TEST] Bot launch test failed:`, error.message);
        res.status(500).json({
            success: false,
            message: 'Bot launch test failed',
            error: error.message,
            details: error.response?.data || null
        });
    }
});

// New endpoint for bot creation preflight (conversion preview)
// Enhanced conversion testing endpoint
// Inter-wallet transfer endpoints
app.post('/api/v1/get-all-wallet-balances', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required' });
    }
    
    try {
        console.log('[API] Getting all wallet balances...');
        const { spotClient, futuresClient } = getBinanceClients(apiKey, apiSecret);
        
        const allWallets = await fetchAllWalletBalances(spotClient, futuresClient);
        
        res.json({
            success: true,
            wallets: allWallets,
            summary: {
                totalUSDT: allWallets.total.totalUSDT.toFixed(2),
                uniqueAssets: allWallets.total.uniqueAssets,
                walletsAnalyzed: Object.keys(allWallets).filter(k => k !== 'total').length,
                errors: allWallets.errors
            },
            distribution: {
                spot: { assets: Object.keys(allWallets.spot.balances).length, usdt: allWallets.spot.totalUSDT.toFixed(2) },
                futures: { assets: Object.keys(allWallets.futures.balances).length, usdt: allWallets.futures.totalUSDT.toFixed(2) },
                margin: { assets: Object.keys(allWallets.margin.balances).length, usdt: allWallets.margin.totalUSDT.toFixed(2) },
                isolated: { assets: Object.keys(allWallets.isolated.balances).length, usdt: allWallets.isolated.totalUSDT.toFixed(2) }
            }
        });
        
    } catch (error) {
        console.error('[API] All wallet balances failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get all wallet balances',
            error: error.message
        });
    }
});

app.post('/api/v1/plan-wallet-transfers', async (req, res) => {
    const { apiKey, apiSecret, symbol, strategyType, investment, autoExecute = false } = req.body;
    
    if (!apiKey || !apiSecret || !symbol || !strategyType || !investment) {
        return res.status(400).json({
            success: false,
            message: 'Missing required parameters: apiKey, apiSecret, symbol, strategyType, investment'
        });
    }
    
    try {
        console.log(`[API] Planning wallet transfers for ${strategyType} ${symbol}`);
        const { spotClient, futuresClient } = getBinanceClients(apiKey, apiSecret);
        
        const transferPlan = await planAndExecuteTransfers(spotClient, futuresClient, {
            strategy: strategyType,
            symbol,
            investment,
            requiredWallets: ['spot', 'futures'] // Default requirements
        });
        
        res.json({
            success: true,
            transferPlan: transferPlan.transferPlan,
            currentBalances: transferPlan.currentBalances,
            executed: autoExecute,
            transferResults: autoExecute ? transferPlan.transferResults : null,
            summary: transferPlan.summary,
            recommendations: [
                `Strategy: ${strategyType} requires specific wallet distributions`,
                `Total transfers planned: ${transferPlan.transferPlan.length}`,
                autoExecute ? 'Transfers executed automatically' : 'Set autoExecute: true to execute transfers',
                'Review transfer plan before executing in production'
            ]
        });
        
    } catch (error) {
        console.error('[API] Transfer planning failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to plan wallet transfers',
            error: error.message
        });
    }
});

app.post('/api/v1/execute-wallet-transfer', async (req, res) => {
    const { apiKey, apiSecret, asset, amount, fromWallet, toWallet, symbol } = req.body;
    
    if (!apiKey || !apiSecret || !asset || !amount || !fromWallet || !toWallet) {
        return res.status(400).json({
            success: false,
            message: 'Missing required parameters: apiKey, apiSecret, asset, amount, fromWallet, toWallet'
        });
    }
    
    try {
        console.log(`[API] Executing wallet transfer: ${amount} ${asset} from ${fromWallet} to ${toWallet}`);
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        const transferResult = await executeWalletTransfer(spotClient, {
            asset,
            amount: parseFloat(amount),
            fromWallet,
            toWallet,
            symbol
        });
        
        if (transferResult.success) {
            res.json({
                success: true,
                transfer: transferResult,
                message: `Successfully transferred ${amount} ${asset} from ${fromWallet} to ${toWallet}`,
                transferId: transferResult.transferId
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Transfer failed',
                error: transferResult.error,
                details: transferResult
            });
        }
        
    } catch (error) {
        console.error('[API] Wallet transfer execution failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to execute wallet transfer',
            error: error.message
        });
    }
});

app.post('/api/v1/test-enhanced-conversion', async (req, res) => {
    const { apiKey, apiSecret, testAssets, dryRun = true } = req.body;
    
    if (!apiKey || !apiSecret) {
        return res.status(400).json({
            success: false,
            message: 'API keys required for conversion testing'
        });
    }
    
    try {
        console.log(`[TEST-CONVERT] Testing enhanced conversion system (dryRun: ${dryRun})`);
        
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        // Get current data
        const [balances, prices, exchangeInfo] = await Promise.all([
            fetchSpotBalances(spotClient),
            spotClient.prices(),
            fetchExchangeInfo(spotClient)
        ]);
        
        // Test conversion paths for available assets or specified test assets
        const assetsToTest = testAssets || Object.keys(balances).filter(asset => 
            asset !== 'USDT' && balances[asset].free > 0
        ).slice(0, 5); // Test max 5 assets
        
        const conversionAnalysis = [];
        
        for (const asset of assetsToTest) {
            const pathResult = findOptimalConversionPath(asset, prices, exchangeInfo);
            const balance = balances[asset];
            
            let estimatedUSDTValue = 0;
            if (pathResult.path.length > 0 && balance) {
                // Calculate estimated value through conversion path
                let currentValue = balance.free;
                for (const pathSymbol of pathResult.path) {
                    const price = parseFloat(prices[pathSymbol]);
                    if (price) {
                        currentValue = currentValue * price;
                    }
                }
                estimatedUSDTValue = currentValue;
            }
            
            conversionAnalysis.push({
                asset,
                balance: balance ? balance.free : 0,
                conversionPath: pathResult.path,
                pathDescription: pathResult.description || 'Unknown',
                estimatedSlippage: pathResult.estimatedSlippage,
                estimatedUSDTValue,
                viable: pathResult.path.length > 0,
                error: pathResult.error
            });
        }
        
        // If not dry run and assets have value, test actual conversion
        let conversionResults = null;
        if (!dryRun && conversionAnalysis.some(a => a.viable && a.estimatedUSDTValue > 1)) {
            const conversions = conversionAnalysis
                .filter(a => a.viable && a.estimatedUSDTValue > 1)
                .map(a => ({ asset: a.asset, amount: a.balance }));
                
            if (conversions.length > 0) {
                conversionResults = await executeBatchConversions(
                    spotClient, conversions, prices, exchangeInfo
                );
            }
        }
        
        res.json({
            success: true,
            testMode: dryRun,
            analysis: {
                totalAssetsAnalyzed: conversionAnalysis.length,
                viableConversions: conversionAnalysis.filter(a => a.viable).length,
                totalEstimatedValue: conversionAnalysis.reduce((sum, a) => sum + a.estimatedUSDTValue, 0).toFixed(2),
                conversionDetails: conversionAnalysis
            },
            conversionResults,
            recommendations: [
                'Check viable conversions for available trading paths',
                'Monitor estimated slippage for each conversion path',
                'Use dryRun: false to execute actual conversions',
                'Consider minimum conversion values to avoid dust'
            ]
        });
        
    } catch (error) {
        console.error('[TEST-CONVERT] Enhanced conversion test failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Enhanced conversion test failed',
            error: error.message
        });
    }
});

app.post('/api/v1/preflight-bot', async (req, res) => {
    const { apiKey, apiSecret, symbol, strategyType, investment, autoConvert = false, dryRun = true } = req.body;
    
    if (!apiKey || !apiSecret || !symbol || !strategyType || !investment) {
        return res.status(400).json({
            success: false,
            message: 'Missing required parameters: apiKey, apiSecret, symbol, strategyType, investment'
        });
    }
    
    try {
        console.log(`[PREFLIGHT-API] Analyzing ${strategyType} ${symbol} with ${investment} investment`);
        
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        const preflightResult = await ensureSpotFundsForStrategy(spotClient, {
            symbol,
            strategyType,
            investment,
            autoConvert,
            dryRun: true // Force dry run for preflight endpoint
        });
        
        res.json({
            success: true,
            preflight: preflightResult,
            message: preflightResult.requiresConversion 
                ? `Conversion required: ${preflightResult.plan.length} assets to convert`
                : 'No conversion needed, sufficient funds available',
            recommendations: preflightResult.requiresConversion 
                ? [
                    'Review the conversion plan below',
                    'Assets will be converted to USDT via market orders',
                    'Consider market volatility and slippage',
                    'Enable auto-convert to execute conversions automatically'
                ]
                : [
                    'Your account has sufficient funds for this strategy',
                    'You can proceed directly with bot creation'
                ]
        });
        
    } catch (error) {
        console.error('[PREFLIGHT-API] Analysis failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Preflight analysis failed',
            error: error.message,
            troubleshooting: {
                commonCauses: [
                    'Invalid trading symbol or strategy type',
                    'Insufficient total portfolio value for conversion',
                    'API key permissions insufficient',
                    'Network connectivity issues'
                ]
            }
        });
    }
});

app.post('/api/v1/test-connection', async (req, res) => {
    const { verificationCode } = req.body;
    if (verificationCode !== '1234') {
        return res.status(400).json({ success: false, message: 'Invalid verification code.' });
    }
    
    try {
        console.log('[INFO] Testing connection with stored API keys...');
        
        // Use stored API keys from environment
        if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
            return res.status(500).json({ 
                success: false, 
                message: 'API keys not configured on server.' 
            });
        }
        
        const { spotClient } = getBinanceClients(BINANCE_API_KEY, BINANCE_API_SECRET);
        
        // Get account info
        const accountInfo = await spotClient.accountInfo();
        
        // Get current prices for conversion
        console.log('[INFO] Getting current prices for conversion...');
        const prices = await spotClient.prices();
        
        // Filter non-zero balances
        const nonZeroBalances = accountInfo.balances.filter(b => 
            parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
        
        console.log(`[INFO] Found ${nonZeroBalances.length} assets with non-zero balances`);
        
        let totalValueUSDT = 0;
        const detailedBalances = [];
        
        for (const balance of nonZeroBalances) {
            const asset = balance.asset;
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            let usdtValue = 0;
            let priceInUSDT = 0;
            
            if (asset === 'USDT') {
                usdtValue = total;
                priceInUSDT = 1;
            } else {
                const symbolUSDT = asset + 'USDT';
                const symbolBUSD = asset + 'BUSD';
                const symbolBTC = asset + 'BTC';
                
                if (prices[symbolUSDT]) {
                    priceInUSDT = parseFloat(prices[symbolUSDT]);
                    usdtValue = total * priceInUSDT;
                } else if (prices[symbolBUSD]) {
                    priceInUSDT = parseFloat(prices[symbolBUSD]);
                    usdtValue = total * priceInUSDT;
                } else if (prices[symbolBTC] && prices['BTCUSDT']) {
                    const btcPrice = parseFloat(prices[symbolBTC]);
                    const btcUsdtPrice = parseFloat(prices['BTCUSDT']);
                    priceInUSDT = btcPrice * btcUsdtPrice;
                    usdtValue = total * priceInUSDT;
                } else if (asset === 'BTC' && prices['BTCUSDT']) {
                    priceInUSDT = parseFloat(prices['BTCUSDT']);
                    usdtValue = total * priceInUSDT;
                }
            }
            
            totalValueUSDT += usdtValue;
            
            detailedBalances.push({
                asset,
                free: free.toFixed(8),
                locked: locked.toFixed(8),
                total: total.toFixed(8),
                priceUSDT: priceInUSDT.toFixed(8),
                valueUSDT: usdtValue.toFixed(2),
                canConvert: usdtValue > 0
            });
        }
        
        // Sort by USDT value descending
        detailedBalances.sort((a, b) => parseFloat(b.valueUSDT) - parseFloat(a.valueUSDT));
        
        // Get USDT specifically
        const usdtAsset = accountInfo.balances.find(a => a.asset === 'USDT');
        
        const response = {
            success: true,
            balance: {
                totalWalletBalance: totalValueUSDT.toFixed(2),
                usdtAvailableBalance: usdtAsset ? parseFloat(usdtAsset.free).toFixed(2) : '0.00',
                totalValueUSDT: totalValueUSDT.toFixed(2),
                totalAssets: detailedBalances.length,
                detailedBalances,
                summary: {
                    stablecoins: detailedBalances.filter(b => ['USDT', 'BUSD', 'USDC', 'DAI'].includes(b.asset))
                        .reduce((sum, b) => sum + parseFloat(b.valueUSDT), 0).toFixed(2),
                    crypto: detailedBalances.filter(b => !['USDT', 'BUSD', 'USDC', 'DAI'].includes(b.asset))
                        .reduce((sum, b) => sum + parseFloat(b.valueUSDT), 0).toFixed(2),
                    unconvertible: detailedBalances.filter(b => !b.canConvert).length
                }
            }
        };
        
        console.log(`[SUCCESS] Test connection: ${totalValueUSDT.toFixed(2)} USDT total across ${detailedBalances.length} assets`);
        res.json(response);
        
    } catch (error) {
        console.error('[ERROR] Test connection failed:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Connection test failed. Check stored API keys.', 
            details: error.message 
        });
    }
});

app.post('/api/v1/account-status', async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    if (!apiKey || !apiSecret) return res.status(400).json({ success: false, message: 'API keys are required.' });
    
    try {
        console.log('[INFO] Getting comprehensive account status...');
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        // Get account info
        const accountInfo = await spotClient.accountInfo();
        
        // Get current prices for all assets to convert to USDT
        console.log('[INFO] Getting current prices for conversion...');
        const prices = await spotClient.prices();
        
        // Filter non-zero balances
        const nonZeroBalances = accountInfo.balances.filter(b => 
            parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
        
        console.log(`[INFO] Found ${nonZeroBalances.length} assets with non-zero balances`);
        
        let totalValueUSDT = 0;
        const detailedBalances = [];
        
        for (const balance of nonZeroBalances) {
            const asset = balance.asset;
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            let usdtValue = 0;
            let priceInUSDT = 0;
            
            if (asset === 'USDT') {
                // USDT is 1:1
                usdtValue = total;
                priceInUSDT = 1;
            } else {
                // Try to get price in USDT
                const symbolUSDT = asset + 'USDT';
                const symbolBUSD = asset + 'BUSD';
                const symbolBTC = asset + 'BTC';
                
                if (prices[symbolUSDT]) {
                    priceInUSDT = parseFloat(prices[symbolUSDT]);
                    usdtValue = total * priceInUSDT;
                } else if (prices[symbolBUSD]) {
                    // If no USDT pair, try BUSD (usually ~1:1 with USDT)
                    priceInUSDT = parseFloat(prices[symbolBUSD]);
                    usdtValue = total * priceInUSDT;
                } else if (prices[symbolBTC] && prices['BTCUSDT']) {
                    // Convert via BTC
                    const btcPrice = parseFloat(prices[symbolBTC]);
                    const btcUsdtPrice = parseFloat(prices['BTCUSDT']);
                    priceInUSDT = btcPrice * btcUsdtPrice;
                    usdtValue = total * priceInUSDT;
                } else if (asset === 'BTC' && prices['BTCUSDT']) {
                    // Special case for BTC
                    priceInUSDT = parseFloat(prices['BTCUSDT']);
                    usdtValue = total * priceInUSDT;
                } else {
                    // Cannot convert, mark as unknown
                    priceInUSDT = 0;
                    usdtValue = 0;
                }
            }
            
            totalValueUSDT += usdtValue;
            
            detailedBalances.push({
                asset,
                free: free.toFixed(8),
                locked: locked.toFixed(8),
                total: total.toFixed(8),
                priceUSDT: priceInUSDT.toFixed(8),
                valueUSDT: usdtValue.toFixed(2),
                canConvert: usdtValue > 0
            });
        }
        
        // Sort by USDT value descending
        detailedBalances.sort((a, b) => parseFloat(b.valueUSDT) - parseFloat(a.valueUSDT));
        
        // Get USDT specifically for backward compatibility
        const usdtAsset = accountInfo.balances.find(a => a.asset === 'USDT');
        
        const response = {
            success: true,
            balance: {
                // Legacy format for backward compatibility
                totalWalletBalance: totalValueUSDT.toFixed(2),
                usdtAvailableBalance: usdtAsset ? parseFloat(usdtAsset.free).toFixed(2) : '0.00',
                
                // New comprehensive format
                totalValueUSDT: totalValueUSDT.toFixed(2),
                totalAssets: detailedBalances.length,
                detailedBalances,
                
                // Summary by asset type
                summary: {
                    stablecoins: detailedBalances.filter(b => ['USDT', 'BUSD', 'USDC', 'DAI'].includes(b.asset))
                        .reduce((sum, b) => sum + parseFloat(b.valueUSDT), 0).toFixed(2),
                    crypto: detailedBalances.filter(b => !['USDT', 'BUSD', 'USDC', 'DAI'].includes(b.asset))
                        .reduce((sum, b) => sum + parseFloat(b.valueUSDT), 0).toFixed(2),
                    unconvertible: detailedBalances.filter(b => !b.canConvert).length
                }
            }
        };
        
        console.log(`[SUCCESS] Account status: ${totalValueUSDT.toFixed(2)} USDT total across ${detailedBalances.length} assets`);
        res.json(response);
        
    } catch (error) {
        console.error('[ERROR] Account status failed:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get account status. Check API keys.', 
            details: error.message 
        });
    }
});

app.post('/api/v1/wallet-balances', async (req, res) => {
    const { apiKey, apiSecret, minValueUSDT = 0.01 } = req.body;
    if (!apiKey || !apiSecret) {
        return res.status(400).json({ success: false, message: 'API keys are required.' });
    }
    
    try {
        console.log('[INFO] Getting detailed wallet balances...');
        const { spotClient } = getBinanceClients(apiKey, apiSecret);
        
        // Get account info and prices in parallel for better performance
        const [accountInfo, prices] = await Promise.all([
            spotClient.accountInfo(),
            spotClient.prices()
        ]);
        
        console.log('[INFO] Processing balances and converting to USDT...');
        
        // Filter non-zero balances
        const nonZeroBalances = accountInfo.balances.filter(b => 
            parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
        
        let totalValueUSDT = 0;
        const detailedBalances = [];
        const conversionErrors = [];
        
        for (const balance of nonZeroBalances) {
            const asset = balance.asset;
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            const total = free + locked;
            
            let usdtValue = 0;
            let priceInUSDT = 0;
            let conversionMethod = 'none';
            
            try {
                if (asset === 'USDT') {
                    usdtValue = total;
                    priceInUSDT = 1;
                    conversionMethod = 'direct';
                } else if (asset === 'BUSD' || asset === 'USDC') {
                    // Stablecoins assumed ~1:1 with USDT
                    usdtValue = total;
                    priceInUSDT = 1;
                    conversionMethod = 'stablecoin';
                } else {
                    // Try different conversion methods
                    const symbolUSDT = asset + 'USDT';
                    const symbolBUSD = asset + 'BUSD';
                    const symbolBTC = asset + 'BTC';
                    
                    if (prices[symbolUSDT]) {
                        priceInUSDT = parseFloat(prices[symbolUSDT]);
                        usdtValue = total * priceInUSDT;
                        conversionMethod = 'direct_usdt';
                    } else if (prices[symbolBUSD]) {
                        priceInUSDT = parseFloat(prices[symbolBUSD]);
                        usdtValue = total * priceInUSDT;
                        conversionMethod = 'via_busd';
                    } else if (asset === 'BTC' && prices['BTCUSDT']) {
                        priceInUSDT = parseFloat(prices['BTCUSDT']);
                        usdtValue = total * priceInUSDT;
                        conversionMethod = 'btc_direct';
                    } else if (prices[symbolBTC] && prices['BTCUSDT']) {
                        const btcPrice = parseFloat(prices[symbolBTC]);
                        const btcUsdtPrice = parseFloat(prices['BTCUSDT']);
                        priceInUSDT = btcPrice * btcUsdtPrice;
                        usdtValue = total * priceInUSDT;
                        conversionMethod = 'via_btc';
                    } else {
                        // Try ETH route if BTC doesn't work
                        const symbolETH = asset + 'ETH';
                        if (prices[symbolETH] && prices['ETHUSDT']) {
                            const ethPrice = parseFloat(prices[symbolETH]);
                            const ethUsdtPrice = parseFloat(prices['ETHUSDT']);
                            priceInUSDT = ethPrice * ethUsdtPrice;
                            usdtValue = total * priceInUSDT;
                            conversionMethod = 'via_eth';
                        }
                    }
                }
            } catch (error) {
                conversionErrors.push({ asset, error: error.message });
            }
            
            // Only include if value is above minimum threshold
            if (usdtValue >= minValueUSDT || asset === 'USDT') {
                totalValueUSDT += usdtValue;
                
                detailedBalances.push({
                    asset,
                    free: parseFloat(free.toFixed(8)),
                    locked: parseFloat(locked.toFixed(8)),
                    total: parseFloat(total.toFixed(8)),
                    priceUSDT: parseFloat(priceInUSDT.toFixed(8)),
                    valueUSDT: parseFloat(usdtValue.toFixed(2)),
                    conversionMethod,
                    canConvert: usdtValue > 0,
                    percentage: 0 // Will calculate after we have total
                });
            }
        }
        
        // Calculate percentages
        detailedBalances.forEach(balance => {
            balance.percentage = totalValueUSDT > 0 ? 
                parseFloat(((balance.valueUSDT / totalValueUSDT) * 100).toFixed(2)) : 0;
        });
        
        // Sort by USDT value descending
        detailedBalances.sort((a, b) => b.valueUSDT - a.valueUSDT);
        
        const response = {
            success: true,
            data: {
                totalValueUSDT: parseFloat(totalValueUSDT.toFixed(2)),
                totalAssets: detailedBalances.length,
                timestamp: Date.now(),
                balances: detailedBalances,
                
                summary: {
                    stablecoins: {
                        assets: detailedBalances.filter(b => ['USDT', 'BUSD', 'USDC', 'DAI', 'FDUSD'].includes(b.asset)),
                        totalValue: detailedBalances
                            .filter(b => ['USDT', 'BUSD', 'USDC', 'DAI', 'FDUSD'].includes(b.asset))
                            .reduce((sum, b) => sum + b.valueUSDT, 0)
                    },
                    
                    crypto: {
                        assets: detailedBalances.filter(b => !['USDT', 'BUSD', 'USDC', 'DAI', 'FDUSD'].includes(b.asset)),
                        totalValue: detailedBalances
                            .filter(b => !['USDT', 'BUSD', 'USDC', 'DAI', 'FDUSD'].includes(b.asset))
                            .reduce((sum, b) => sum + b.valueUSDT, 0)
                    },
                    
                    top5Assets: detailedBalances.slice(0, 5),
                    unconvertibleAssets: conversionErrors.length
                },
                
                filters: {
                    minValueUSDT,
                    totalFilteredOut: nonZeroBalances.length - detailedBalances.length
                }
            },
            
            errors: conversionErrors.length > 0 ? conversionErrors : undefined
        };
        
        console.log(`[SUCCESS] Wallet balances: ${totalValueUSDT.toFixed(2)} USDT across ${detailedBalances.length} assets`);
        res.json(response);
        
    } catch (error) {
        console.error('[ERROR] Wallet balances failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get wallet balances',
            error: error.message
        });
    }
});

// --- MARGIN DIAGNOSTICS ENDPOINTS ---

// Get futures account balances
app.get('/api/v1/diagnostics/futures/balances', async (req, res) => {
    const { apiKey, apiSecret } = req.query;
    
    if (!apiKey || !apiSecret) {
        return res.status(400).json({
            success: false,
            message: 'API key and secret required as query parameters'
        });
    }
    
    try {
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        const account = await marginService.getAccountInfo();
        
        const usdtAsset = account.assets.find(a => a.asset === 'USDT') || {
            asset: 'USDT',
            walletBalance: '0',
            availableBalance: '0',
            marginBalance: '0',
            crossUnPnl: '0'
        };
        
        const openPositions = account.positions?.filter(p => parseFloat(p.positionAmt) !== 0) || [];
        
        res.json({
            success: true,
            data: {
                walletBalance: parseFloat(usdtAsset.walletBalance),
                availableBalance: parseFloat(usdtAsset.availableBalance),
                marginBalance: parseFloat(usdtAsset.marginBalance),
                crossUnPnl: parseFloat(usdtAsset.crossUnPnl),
                openPositions: openPositions.length,
                positions: openPositions.map(p => ({
                    symbol: p.symbol,
                    positionAmt: parseFloat(p.positionAmt),
                    entryPrice: parseFloat(p.entryPrice),
                    unrealizedProfit: parseFloat(p.unrealizedProfit),
                    percentage: parseFloat(p.percentage)
                })),
                totalAssets: account.assets.length,
                canTrade: account.canTrade,
                canWithdraw: account.canWithdraw
            }
        });
        
    } catch (error) {
        console.error('[DIAGNOSTICS] Futures balances error:', error.message);
        const mappedError = mapBinanceError(extractBinanceError(error));
        
        res.status(500).json({
            success: false,
            message: 'Failed to get futures balances',
            error: mappedError
        });
    }
});

// Get symbol information for diagnostics
app.get('/api/v1/diagnostics/futures/symbol/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { apiKey, apiSecret } = req.query;
    
    if (!apiKey || !apiSecret) {
        return res.status(400).json({
            success: false,
            message: 'API key and secret required as query parameters'
        });
    }
    
    try {
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        
        const [filters, markPrice, leverageBracket] = await Promise.all([
            marginService.getSymbolFilters(symbol),
            marginService.getMarkPrice(symbol),
            marginService.getLeverageBracket(symbol)
        ]);
        
        res.json({
            success: true,
            symbol,
            data: {
                markPrice,
                filters: {
                    stepSize: filters.stepSize,
                    tickSize: filters.tickSize,
                    minNotional: filters.minNotional,
                    minQty: filters.minQty,
                    maxQty: filters.maxQty
                },
                leverageBracket: leverageBracket ? {
                    maxLeverage: leverageBracket.initialLeverage,
                    maintMarginRatio: parseFloat(leverageBracket.maintMarginRatio || 0),
                    cum: parseFloat(leverageBracket.cum || 0)
                } : null,
                takerFeeRate: 0.0004, // Default futures taker fee
                timestamp: Date.now()
            }
        });
        
    } catch (error) {
        console.error(`[DIAGNOSTICS] Symbol ${symbol} error:`, error.message);
        const mappedError = mapBinanceError(extractBinanceError(error));
        
        res.status(500).json({
            success: false,
            message: `Failed to get symbol information for ${symbol}`,
            error: mappedError
        });
    }
});

// Simulate futures order for diagnostics
app.post('/api/v1/diagnostics/futures/simulate-order', async (req, res) => {
    const {
        apiKey,
        apiSecret,
        symbol,
        side = 'SELL',
        type = 'MARKET',
        investment,
        quantity,
        leverage = 3,
        price,
        slippageBps = 10
    } = req.body;
    
    if (!apiKey || !apiSecret || !symbol) {
        return res.status(400).json({
            success: false,
            message: 'API key, secret, and symbol are required'
        });
    }
    
    if (!investment && !quantity) {
        return res.status(400).json({
            success: false,
            message: 'Either investment amount or quantity is required'
        });
    }
    
    try {
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        
        let finalInvestment = investment;
        if (quantity && !investment) {
            // Convert quantity to investment amount
            const markPrice = await marginService.getMarkPrice(symbol);
            finalInvestment = quantity * markPrice;
        }
        
        const diagnostics = await marginService.preflightValidateFuturesOrder({
            symbol,
            side,
            type,
            investment: finalInvestment,
            leverage,
            slippageBps
        });
        
        const response = {
            success: true,
            simulation: {
                valid: diagnostics.valid,
                symbol,
                side,
                leverage,
                investment: finalInvestment,
                diagnostics
            }
        };
        
        if (!diagnostics.valid) {
            response.suggestions = {
                adjustedQuantity: diagnostics.suggestedQuantity,
                adjustedInvestment: diagnostics.suggestedInvestment,
                requiredTopUp: diagnostics.requiredTopUp,
                recommendedLeverage: Math.max(1, Math.floor(leverage * 0.7))
            };
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('[DIAGNOSTICS] Simulate order error:', error.message);
        const mappedError = mapBinanceError(extractBinanceError(error));
        
        res.status(500).json({
            success: false,
            message: 'Order simulation failed',
            error: mappedError
        });
    }
});

// --- END MARGIN DIAGNOSTICS ENDPOINTS ---

app.post('/api/v1/launch-bot', async (req, res) => {
    const { 
        id, name, symbol, strategyType, investment, leverage, autoManaged, apiKey, apiSecret,
        autoConvert = false,
        dryRun = false,
        retainUsdtBuffer,
        minConvertValueUsdt,
        allowAssets
    } = req.body;
    
    // Input validation
    if (!id || !name || !symbol || !strategyType || !investment || !leverage || !apiKey || !apiSecret) {
        return res.status(400).json({ 
            success: false,
            message: 'Missing required parameters', 
            details: 'All fields (id, name, symbol, strategyType, investment, leverage, apiKey, apiSecret) are required'
        });
    }
    
    console.log(`[+] Received request to launch bot: ${name} (${id})`);
    console.log(`[+] Parameters: symbol=${symbol}, strategy=${strategyType}, investment=${investment}, leverage=${leverage}`);
    console.log(`[+] Preflight: autoConvert=${autoConvert}, dryRun=${dryRun}`);
    
    try {
        // Run preflight analysis with integrated transfer planning
        const { spotClient, futuresClient } = getBinanceClients(apiKey?.trim(), apiSecret?.trim());
        
        // Step 1: Plan and execute any required inter-wallet transfers
        console.log(`[BOT-LAUNCH] Step 1: Planning inter-wallet transfers...`);
        const transferPlan = await planAndExecuteTransfers(spotClient, futuresClient, {
            strategy: strategyType,
            symbol,
            investment,
            requiredWallets: ['spot', 'futures']
        });
        
        console.log(`[BOT-LAUNCH] Transfer planning complete: ${transferPlan.summary.totalTransfers} transfers planned`);
        
        // Step 2: Run preflight analysis for asset conversion
        console.log(`[BOT-LAUNCH] Step 2: Running asset conversion analysis...`);
        const preflightResult = await ensureSpotFundsForStrategy(spotClient, {
            symbol,
            strategyType,
            investment,
            autoConvert,
            dryRun,
            retainUsdtBuffer,
            minConvertValueUsdt,
            allowAssets
        });
        
        // Attach transfer information to preflight result
        preflightResult.transfers = {
            plan: transferPlan.transferPlan,
            results: transferPlan.transferResults,
            summary: transferPlan.summary,
            walletBalances: transferPlan.currentBalances
        };
        
        console.log(`[PREFLIGHT] Result: ok=${preflightResult.ok}, requiresConversion=${preflightResult.requiresConversion}`);
        
        // Handle dry run - return preflight results without executing
        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                message: 'Dry run complete - no orders placed',
                preflight: preflightResult
            });
        }
        
        // Handle conversion requirement without autoConvert
        if (!preflightResult.ok && preflightResult.requiresConversion && !autoConvert) {
            return res.status(409).json({
                success: false,
                requiresConversion: true,
                message: 'Asset conversion required but autoConvert is disabled',
                preflight: preflightResult,
                instructions: {
                    message: 'Enable autoConvert to proceed with automatic asset conversion',
                    action: 'Resubmit request with autoConvert: true',
                    conversionPlan: preflightResult.plan
                }
            });
        }
        
        // Handle insufficient assets (even with conversions)
        if (!preflightResult.ok) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient assets for bot creation',
                preflight: preflightResult,
                error: preflightResult.missing
            });
        }
        
        // Preflight successful - proceed with bot launch
        await executeLaunch(id, name, symbol, strategyType, investment, leverage, autoManaged, apiKey, apiSecret, preflightResult);
        
        // Include preflight details in successful response
        const launchedBot = activeBots[id];
        if (launchedBot) {
            launchedBot.preflight = preflightResult;
        }
        
        res.status(201).json({ 
            success: true, 
            bot: launchedBot,
            preflight: preflightResult,
            message: preflightResult.executed.length > 0 
                ? `Bot launched successfully after converting ${preflightResult.executed.length} assets`
                : 'Bot launched successfully'
        });
        
    } catch (error) {
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            binanceError: error.response?.data || null,
            httpStatus: error.response?.status || null
        };
        
        console.error(`[✖] Bot launch failed for ${name} (${id}):`, errorDetails);
        
        res.status(500).json({ 
            success: false,
            message: 'Failed to execute trade on Binance', 
            error: error.message,
            details: errorDetails,
            troubleshooting: {
                commonCauses: [
                    'Insufficient balance for the trade',
                    'Symbol not found or not supported',
                    'Leverage not supported for this symbol',
                    'API permissions insufficient (need Spot & Futures enabled)',
                    'Futures account not activated',
                    'Market closed or symbol suspended'
                ]
            }
        });
    }
});

app.post('/api/v1/stop-bot', async (req, res) => {
    const { botId, apiKey, apiSecret } = req.body;
    const botToStop = activeBots[botId];
    if (!botToStop) return res.status(404).json({ message: 'Bot not found.' });
    console.log(`[-] Received request to stop bot: ${botToStop.name} (${botId})`);
    try {
        await executeStop(botId, apiKey, apiSecret);
        res.json({ success: true, message: `Bot ${botId} stopped successfully.` });
    } catch (error) {
        res.status(500).json({ message: 'Failed to close positions on Binance.', details: error.message });
    }
});

// --- Rebalancer Endpoints ---
app.get('/api/v1/rebalancer/status', (req, res) => {
    res.json(rebalancerState);
});

app.post('/api/v1/rebalancer/toggle', (req, res) => {
    const { enabled } = req.body;
    rebalancerState.enabled = !!enabled;
    if (rebalancerState.enabled) {
        rebalancerState.status = 'Active (Monitoring)';
        addLog('Rebalancing engine has been enabled.');
    } else {
        rebalancerState.status = 'Idle';
        addLog('Rebalancing engine has been disabled.');
    }
    res.json(rebalancerState);
});

// --- Core Trading Logic Functions ---
const executeLaunch = async (id, name, symbol, strategyType, investment, leverage, autoManaged, apiKey, apiSecret) => {
    console.log(`[INFO] Starting bot launch process for ${name} (${id})`);
    console.log(`[DEBUG] API Key present: ${apiKey ? 'YES' : 'NO'} (length: ${apiKey?.length || 0})`);
    console.log(`[DEBUG] API Secret present: ${apiSecret ? 'YES' : 'NO'} (length: ${apiSecret?.length || 0})`);
    
    // Validate API key format
    if (apiKey) {
        const keyTrimmed = apiKey.trim();
        const hasInvalidChars = !/^[A-Za-z0-9]+$/.test(keyTrimmed);
        console.log(`[DEBUG] API Key trimmed length: ${keyTrimmed.length}, has invalid chars: ${hasInvalidChars}`);
        if (keyTrimmed !== apiKey) {
            console.log(`[WARNING] API Key has whitespace - trimming`);
        }
    }
    
    if (apiSecret) {
        const secretTrimmed = apiSecret.trim();
        const hasInvalidChars = !/^[A-Za-z0-9]+$/.test(secretTrimmed);
        console.log(`[DEBUG] API Secret trimmed length: ${secretTrimmed.length}, has invalid chars: ${hasInvalidChars}`);
        if (secretTrimmed !== apiSecret) {
            console.log(`[WARNING] API Secret has whitespace - trimming`);
        }
    }
    
    if (activeBots[id]) {
        throw new Error(`A bot with ID '${id}' is already running. Please use a different ID.`);
    }
    
    try {
        // Trim whitespace from API keys to prevent format errors
        const cleanApiKey = apiKey?.trim() || '';
        const cleanApiSecret = apiSecret?.trim() || '';
        
        const { spotClient, futuresClient } = getBinanceClients(cleanApiKey, cleanApiSecret);
        const spotAmount = investment / 2;
        
        console.log(`[INFO] Step 1: Validating symbol availability for arbitrage...`);
        let priceResponse, currentPrice;
        try {
            // Check if symbol exists in both spot and futures markets
            console.log(`[INFO] Checking spot market for ${symbol}...`);
            priceResponse = await spotClient.prices({ symbol });
            currentPrice = parseFloat(priceResponse[symbol]);
            
            if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) {
                throw new Error(`${symbol} is not available for spot trading. Arbitrage requires both spot and futures markets. Current price: ${currentPrice}`);
            }
            
            console.log(`[INFO] ✅ Current spot price for ${symbol}: $${currentPrice}`);
            
            // Validate futures market exists
            console.log(`[INFO] Validating futures market for ${symbol}...`);
            const futuresInfo = await futuresClient.futuresExchangeInfo();
            const futuresSymbol = futuresInfo.symbols.find(s => s.symbol === symbol && s.status === 'TRADING');
            if (!futuresSymbol) {
                throw new Error(`${symbol} is not available for futures trading`);
            }
            
            console.log(`[INFO] ✅ ${symbol} validated for both spot and futures trading`);
            
        } catch (error) {
            if (error.message.includes('not available')) {
                throw error;
            }
            throw new Error(`${symbol} is not available for arbitrage trading. This symbol may only exist as a futures perpetual contract without a corresponding spot market. Please choose a different symbol that supports both spot and futures trading. Technical error: ${error.message}`);
        }
        
        console.log(`[INFO] Step 1.5: Getting symbol precision for ${symbol}`);
        const [spotPrecision, futuresPrecision] = await Promise.all([
            getSymbolPrecision(spotClient, symbol, true),
            getSymbolPrecision(futuresClient, symbol, false)
        ]);
        
        const rawQuantity = spotAmount / currentPrice;
        const spotQuantity = rawQuantity.toFixed(spotPrecision);
        const futuresQuantity = rawQuantity.toFixed(futuresPrecision);
        
        console.log(`[INFO] Calculated quantities: Spot=${spotQuantity} (${spotPrecision} decimals), Futures=${futuresQuantity} (${futuresPrecision} decimals)`);
        console.log(`[INFO] Investment: $${investment}, Spot amount: $${spotAmount}, Price: $${currentPrice}`);
        
        console.log(`[INFO] Step 2: Setting leverage to ${leverage}x for ${symbol}`);
        await setFuturesLeverage(futuresClient, symbol, leverage);
    
        console.log(`[INFO] Step 3: MARGIN PREFLIGHT VALIDATION`);
        
        // Create correlation ID for detailed diagnostics
        const correlationId = `exec_${id}_${Date.now()}`;
        console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Starting margin preflight validation`);
        
        // Initialize margin service for preflight validation
        const marginService = new FuturesMarginService(apiKey, apiSecret);
        
        // Determine investment amount for futures side
        const futuresInvestment = investment / 2; // Half of total investment goes to futures
        
        const preflightDiag = await marginService.preflightValidateFuturesOrder({
            symbol,
            side: strategyType === 'Short Perp' ? 'SELL' : 'BUY',
            type: 'MARKET',
            investment: futuresInvestment,
            leverage,
            correlationId
        });
        
        console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Preflight result: ${preflightDiag.valid ? 'PASS' : 'FAIL'}`);
        
        if (!preflightDiag.valid) {
            const marginError = createMarginError(
                preflightDiag.deficit || 0,
                preflightDiag.checks?.account?.availableBalance || 0,
                preflightDiag.checks?.costs?.totalRequired || 0,
                symbol,
                leverage
            );
            
            console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: ${marginError.message}`);
            console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: Full diagnostics:`, JSON.stringify(preflightDiag, null, 2));
            
            // Attach diagnostics to error for debugging
            const detailedError = new Error(marginError.message);
            detailedError.marginDiagnostics = preflightDiag;
            detailedError.marginError = marginError;
            detailedError.correlationId = correlationId;
            throw detailedError;
        }
        
        // Use the recommended quantity from preflight validation
        const validatedFuturesQuantity = preflightDiag.recommendedQuantity.toFixed(futuresPrecision);
        
        console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Using validated quantity: ${validatedFuturesQuantity} (original: ${futuresQuantity})`);
        
        console.log(`[INFO] Step 4: Executing ${strategyType} strategy with validated quantities`);
        
        if (strategyType === 'Short Perp') {
            console.log(`[INFO] SHORT PERP Strategy: Buying ${spotQuantity} ${symbol} on SPOT, Selling ${validatedFuturesQuantity} on FUTURES`);
            
            try {
                console.log(`[INFO] Placing SPOT BUY order...`);
                const spotOrder = await spotClient.order({
                    symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    quoteOrderQty: spotAmount.toString()
                });
                console.log(`[SUCCESS] SPOT order executed:`, spotOrder.orderId);
            } catch (error) {
                const binanceError = extractBinanceError(error);
                const mappedError = mapBinanceError(binanceError, { symbol, side: 'BUY', type: 'MARKET', amount: spotAmount });
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: SPOT order failed:`, mappedError);
                throw new Error(`SPOT order failed: ${mappedError.message}. ${mappedError.remediation?.[0] || 'Check SPOT balance and permissions.'}`);
            }
            
            try {
                console.log(`[INFO] Placing FUTURES SELL order with validated quantity ${validatedFuturesQuantity}...`);
                console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Final futures order params: symbol=${symbol}, side=SELL, quantity=${validatedFuturesQuantity}`);
                
                const futuresOrder = await futuresClient.futuresOrder({
                    symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: validatedFuturesQuantity
                });
                console.log(`[SUCCESS] FUTURES SELL order executed:`, futuresOrder.orderId);
                console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Trade execution successful`);
            } catch (error) {
                const binanceError = extractBinanceError(error);
                const mappedError = mapBinanceError(binanceError, { 
                    symbol, 
                    side: 'SELL', 
                    type: 'MARKET', 
                    quantity: validatedFuturesQuantity,
                    leverage,
                    marginDiagnostics: preflightDiag
                });
                
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: FUTURES order failed despite preflight validation:`, mappedError);
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: Preflight data:`, JSON.stringify(preflightDiag, null, 2));
                
                throw new Error(`FUTURES SELL order failed: ${mappedError.message}. This should not happen after preflight validation. ${mappedError.remediation?.[0] || 'Check FUTURES balance, permissions, and account activation.'}`);
            }
        } else {
            console.log(`[INFO] LONG PERP Strategy: Selling ${spotQuantity} ${symbol} on SPOT, Buying ${validatedFuturesQuantity} on FUTURES`);
            
            try {
                console.log(`[INFO] Placing SPOT SELL order with quantity ${spotQuantity}...`);
                const spotOrder = await spotClient.order({
                    symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: spotQuantity
                });
                console.log(`[SUCCESS] SPOT order executed:`, spotOrder.orderId);
            } catch (error) {
                const binanceError = extractBinanceError(error);
                const mappedError = mapBinanceError(binanceError, { symbol, side: 'SELL', type: 'MARKET', quantity: spotQuantity });
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: SPOT order failed:`, mappedError);
                throw new Error(`SPOT order failed: ${mappedError.message}. ${mappedError.remediation?.[0] || `Check if you have ${symbol.replace('USDT', '')} balance for selling.`}`);
            }
            
            try {
                console.log(`[INFO] Placing FUTURES BUY order with validated quantity ${validatedFuturesQuantity}...`);
                console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Final futures order params: symbol=${symbol}, side=BUY, quantity=${validatedFuturesQuantity}`);
                
                const futuresOrder = await futuresClient.futuresOrder({
                    symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: validatedFuturesQuantity
                });
                console.log(`[SUCCESS] FUTURES BUY order executed:`, futuresOrder.orderId);
                console.log(`[MARGIN-DIAGNOSTIC] ${correlationId}: Trade execution successful`);
            } catch (error) {
                const binanceError = extractBinanceError(error);
                const mappedError = mapBinanceError(binanceError, { 
                    symbol, 
                    side: 'BUY', 
                    type: 'MARKET', 
                    quantity: validatedFuturesQuantity,
                    leverage,
                    marginDiagnostics: preflightDiag
                });
                
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: FUTURES order failed despite preflight validation:`, mappedError);
                console.error(`[MARGIN-DIAGNOSTIC] ${correlationId}: Preflight data:`, JSON.stringify(preflightDiag, null, 2));
                
                throw new Error(`FUTURES BUY order failed: ${mappedError.message}. This should not happen after preflight validation. ${mappedError.remediation?.[0] || 'Check FUTURES balance, permissions, and account activation.'}`);
            }
        }
        
        const newBot = { 
            id, name, symbol, strategyType, investment, leverage, autoManaged, 
            startTime: Date.now(), status: 'running', fundingRevenue: 0 
        };
        activeBots[newBot.id] = newBot;
        console.log(`[✔] Bot ${name} launched successfully!`);
        
    } catch (error) {
        console.error(`[✖] Bot launch failed at execution stage: ${error.message}`);
        throw error; // Re-throw to be caught by the endpoint handler
    }
};

const executeStop = async (botId, apiKey, apiSecret) => {
    const botToStop = activeBots[botId];
    if (!botToStop) throw new Error('Bot not found.');
    
    const { spotClient, futuresClient } = getBinanceClients(apiKey, apiSecret);
    const positions = await futuresClient.getPositionRisk({ symbol: botToStop.symbol });
    const openPosition = positions.data.find(p => parseFloat(p.positionAmt) !== 0);

    if (openPosition) {
        const quantity = Math.abs(parseFloat(openPosition.positionAmt));
        const sideToClose = openPosition.positionAmt > 0 ? 'SELL' : 'BUY';
        await futuresClient.newOrder(botToStop.symbol, sideToClose, 'MARKET', { quantity });
    }
    
    const priceResponse = await spotClient.tickerPrice(botToStop.symbol);
    const currentPrice = parseFloat(priceResponse.data.price);
    const spotQuantity = (botToStop.investment / 2 / currentPrice).toFixed(5);
    const spotSideToClose = botToStop.strategyType === 'Short Perp' ? 'SELL' : 'BUY';
    await spotClient.newOrder(botToStop.symbol, spotSideToClose, 'MARKET', { quantity: spotQuantity });
    
    delete activeBots[botId];
    console.log(`[✔] Bot ${botToStop.name} stopped and positions closed.`);
};

// --- Rebalancer Main Loop ---
const REBALANCER_INTERVAL = 5 * 60 * 1000; // 5 minutes
const JUMP_THRESHOLD = 1.25; // New opportunity must be 25% better
const COOLDOWN_PERIOD = 12 * 60 * 60 * 1000; // 12 hours

setInterval(async () => {
    if (!rebalancerState.enabled) return;
    if (rebalancerState.cooldownUntil && Date.now() < rebalancerState.cooldownUntil) {
        rebalancerState.status = 'Cooldown';
        return;
    }
    rebalancerState.status = 'Active (Monitoring)';
    addLog('Scanning for better opportunities...');

    const managedBots = Object.values(activeBots).filter(bot => bot.autoManaged);
    if (managedBots.length === 0) return;

    const allRates = await fetchAllFundingRates();
    if (allRates.length === 0) return;

    for (const bot of managedBots) {
        const currentRateData = allRates.find(r => r.symbol === bot.symbol);
        if (!currentRateData) continue;

        const currentAPR = Math.abs(currentRateData.fundingRate * 3 * 365);
        
        let bestOpp = null;
        if (bot.strategyType === 'Short Perp') { // Looking for higher positive rates
            bestOpp = allRates.reduce((best, curr) => (curr.fundingRate > best.fundingRate ? curr : best), { fundingRate: -Infinity });
        } else { // Looking for 'more negative' rates (higher absolute value)
            bestOpp = allRates.reduce((best, curr) => (curr.fundingRate < best.fundingRate ? curr : best), { fundingRate: Infinity });
        }

        const newAPR = Math.abs(bestOpp.fundingRate * 3 * 365);

        if (bestOpp.symbol !== bot.symbol && newAPR > currentAPR * JUMP_THRESHOLD) {
            rebalancerState.status = 'Rebalancing...';
            const jumpMsg = `JUMP! Moving ${bot.symbol} (${(currentAPR*100).toFixed(2)}% APR) to ${bestOpp.symbol} (${(newAPR*100).toFixed(2)}% APR).`;
            console.log(`[!] ${jumpMsg}`);
            addLog(jumpMsg, 'jump');

            try {
                // Use backend keys for autonomous operation
                if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
                    throw new Error('Backend API keys are not configured for rebalancer.');
                }
                
                // 1. Stop the old bot
                await executeStop(bot.id, BINANCE_API_KEY, BINANCE_API_SECRET);

                // 2. Launch the new bot
                const newId = `${bestOpp.symbol}-${Date.now()}`;
                const newName = `${bestOpp.symbol} ${bot.strategyType === 'Short Perp' ? 'Short' : 'Long'} (Auto)`;
                await executeLaunch(newId, newName, bestOpp.symbol, bot.strategyType, bot.investment, bot.leverage, true, BINANCE_API_KEY, BINANCE_API_SECRET);

                addLog(`Successfully rebalanced to ${bestOpp.symbol}.`);
                rebalancerState.cooldownUntil = Date.now() + COOLDOWN_PERIOD;
                rebalancerState.status = 'Cooldown';
                return; // Only one jump per cycle
            } catch (error) {
                const errorMsg = `Rebalance failed: ${error.message}`;
                console.error(`[✖] ${errorMsg}`);
                addLog(errorMsg, 'error');
                rebalancerState.status = 'Active (Monitoring)'; // Reset status on failure
            }
        }
    }

}, REBALANCER_INTERVAL);

// --- FUNDING RATE ARBITRAGE API ENDPOINTS ---

// Get all funding rates with enhanced data
app.get('/api/v1/funding-rates', async (req, res) => {
    try {
        // Check cache age
        const cacheAge = Date.now() - fundingRatesCache.lastUpdated;
        
        // Force refresh if cache is too old or empty
        if (cacheAge > ARBITRAGE_CONFIG.MAX_CACHE_AGE || fundingRatesCache.data.length === 0) {
            console.log('[API] Refreshing funding rates cache...');
            await updateFundingRatesCache();
        }
        
        res.json({
            success: true,
            data: fundingRatesCache.data,
            summary: fundingRatesCache.summary,
            lastUpdated: fundingRatesCache.lastUpdated,
            cacheAge: Date.now() - fundingRatesCache.lastUpdated
        });
        
    } catch (error) {
        console.error('[API] Failed to fetch funding rates:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch funding rates',
            error: error.message
        });
    }
});

// Get arbitrage opportunities
app.get('/api/v1/arbitrage-opportunities', async (req, res) => {
    try {
        const { minRating = 'MEDIUM', limit = 50 } = req.query;
        
        // Check cache age
        const cacheAge = Date.now() - fundingRatesCache.lastUpdated;
        
        // Force refresh if cache is too old or empty
        if (cacheAge > ARBITRAGE_CONFIG.MAX_CACHE_AGE || fundingRatesCache.opportunities.length === 0) {
            console.log('[API] Refreshing opportunities cache...');
            await updateFundingRatesCache();
        }
        
        // Filter opportunities by rating
        let opportunities = fundingRatesCache.opportunities;
        
        if (minRating === 'HIGH') {
            opportunities = opportunities.filter(o => o.rating === 'HIGH' || o.rating === 'EXTREME');
        } else if (minRating === 'EXTREME') {
            opportunities = opportunities.filter(o => o.rating === 'EXTREME');
        }
        
        // Limit results
        opportunities = opportunities.slice(0, parseInt(limit));
        
        res.json({
            success: true,
            opportunities,
            filters: { minRating, limit },
            summary: {
                totalOpportunities: fundingRatesCache.opportunities.length,
                filtered: opportunities.length,
                ratings: {
                    extreme: fundingRatesCache.opportunities.filter(o => o.rating === 'EXTREME').length,
                    high: fundingRatesCache.opportunities.filter(o => o.rating === 'HIGH').length,
                    medium: fundingRatesCache.opportunities.filter(o => o.rating === 'MEDIUM').length,
                    low: fundingRatesCache.opportunities.filter(o => o.rating === 'LOW').length
                }
            },
            lastUpdated: fundingRatesCache.lastUpdated,
            cacheAge: Date.now() - fundingRatesCache.lastUpdated
        });
        
    } catch (error) {
        console.error('[API] Failed to fetch arbitrage opportunities:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch arbitrage opportunities',
            error: error.message
        });
    }
});

// Get funding rate for specific symbol
app.get('/api/v1/funding-rates/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        
        // Check cache age
        const cacheAge = Date.now() - fundingRatesCache.lastUpdated;
        
        if (cacheAge > ARBITRAGE_CONFIG.MAX_CACHE_AGE || fundingRatesCache.data.length === 0) {
            await updateFundingRatesCache();
        }
        
        const symbolData = fundingRatesCache.data.find(item => 
            item.symbol.toUpperCase() === symbol.toUpperCase()
        );
        
        if (!symbolData) {
            return res.status(404).json({
                success: false,
                message: `Symbol ${symbol} not found`,
                availableSymbols: fundingRatesCache.data.slice(0, 10).map(s => s.symbol)
            });
        }
        
        // Check if this symbol has opportunities
        const opportunity = fundingRatesCache.opportunities.find(opp => 
            opp.symbol.toUpperCase() === symbol.toUpperCase()
        );
        
        res.json({
            success: true,
            symbol: symbolData.symbol,
            data: symbolData,
            opportunity: opportunity || null,
            isOpportunity: !!opportunity,
            lastUpdated: fundingRatesCache.lastUpdated
        });
        
    } catch (error) {
        console.error('[API] Failed to fetch symbol funding rate:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch symbol funding rate',
            error: error.message
        });
    }
});

// Update funding rates manually (force refresh)
app.post('/api/v1/funding-rates/refresh', async (req, res) => {
    try {
        console.log('[API] Manual funding rates refresh requested');
        const result = await updateFundingRatesCache();
        
        res.json({
            success: true,
            message: 'Funding rates refreshed successfully',
            data: result.summary,
            lastUpdated: result.lastUpdated
        });
        
    } catch (error) {
        console.error('[API] Manual refresh failed:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh funding rates',
            error: error.message
        });
    }
});

// Get funding rate monitor status
app.get('/api/v1/funding-rates/monitor-status', (req, res) => {
    res.json({
        success: true,
        status: {
            isRunning: !!fundingRateInterval,
            config: ARBITRAGE_CONFIG,
            cache: {
                dataLength: fundingRatesCache.data.length,
                opportunitiesLength: fundingRatesCache.opportunities.length,
                lastUpdated: fundingRatesCache.lastUpdated,
                cacheAge: Date.now() - fundingRatesCache.lastUpdated
            },
            nextUpdate: fundingRateInterval ? 
                Math.max(0, ARBITRAGE_CONFIG.UPDATE_INTERVAL - (Date.now() - fundingRatesCache.lastUpdated)) 
                : null
        }
    });
});

app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    console.log('🎯 Funding Rate Arbitrage Engine: ACTIVE');
    console.log('📊 API Endpoints:');
    console.log('   GET /api/v1/funding-rates - All funding rates');
    console.log('   GET /api/v1/arbitrage-opportunities - Trading opportunities');
    console.log('   GET /api/v1/funding-rates/:symbol - Symbol-specific data');
    console.log('   POST /api/v1/funding-rates/refresh - Force refresh');
    console.log('   GET /api/v1/funding-rates/monitor-status - Monitor status');
});
