const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

/**
 * MarketDataService - Real-time funding rate data collection from Binance
 * 
 * Features:
 * - WebSocket connection to Binance funding rate stream
 * - Real-time processing of USDT perpetual contracts
 * - Data validation and error handling
 * - JSON storage with timestamps
 * - Auto-reconnection on failures
 */
class MarketDataService {
    constructor() {
        this.wsConnection = null;
        this.fundingRates = new Map(); // symbol -> funding rate data
        this.lastUpdate = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds
        
        // Binance WebSocket URLs
        this.wsUrl = 'wss://fstream.binance.com/ws/!markPrice@arr@1s';
        
        // Data storage path
        this.dataDir = path.join(__dirname, '..', 'data');
        this.fundingDataFile = path.join(this.dataDir, 'funding-rates.json');
        
        // Symbols to monitor (USDT perpetuals)
        this.monitoredSymbols = new Set();
        
        // Initialize data directory
        this.initializeDataDirectory();
    }

    /**
     * Initialize the data directory for storing funding rate data
     */
    async initializeDataDirectory() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            console.log('[MarketDataService] Data directory initialized');
        } catch (error) {
            console.error('[MarketDataService] Failed to create data directory:', error);
        }
    }

    /**
     * Start the WebSocket connection to Binance funding rate stream
     */
    async startFundingRateStream() {
        console.log('[MarketDataService] Starting funding rate stream...');
        
        try {
            // Create WebSocket connection
            this.wsConnection = new WebSocket(this.wsUrl);
            
            // Connection opened
            this.wsConnection.on('open', () => {
                console.log('[MarketDataService] WebSocket connected to Binance funding rate stream');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            });

            // Receive messages
            this.wsConnection.on('message', (data) => {
                this.handleFundingRateData(data);
            });

            // Connection closed
            this.wsConnection.on('close', (code, reason) => {
                console.log(`[MarketDataService] WebSocket closed: ${code} - ${reason}`);
                this.isConnected = false;
                this.handleReconnection();
            });

            // Connection error
            this.wsConnection.on('error', (error) => {
                console.error('[MarketDataService] WebSocket error:', error);
                this.isConnected = false;
            });

        } catch (error) {
            console.error('[MarketDataService] Failed to start WebSocket connection:', error);
            this.handleReconnection();
        }
    }

    /**
     * Handle incoming funding rate data from WebSocket
     * @param {Buffer} data - Raw WebSocket message data
     */
    handleFundingRateData(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Binance sends array of mark price data including funding rates
            if (Array.isArray(message)) {
                message.forEach(item => {
                    this.processFundingRateItem(item);
                });
            }
            
            this.lastUpdate = new Date();
            
        } catch (error) {
            console.error('[MarketDataService] Error processing funding rate data:', error);
        }
    }

    /**
     * Process individual funding rate item
     * @param {Object} item - Individual funding rate data from Binance
     */
    processFundingRateItem(item) {
        try {
            // Only process USDT perpetual contracts
            if (!item.s || !item.s.endsWith('USDT')) {
                return;
            }

            // Validate funding data
            if (!this.validateFundingData(item)) {
                return;
            }

            const symbol = item.s;
            const fundingRate = parseFloat(item.r || 0); // Current funding rate
            const markPrice = parseFloat(item.p || 0); // Mark price
            const nextFundingTime = parseInt(item.T || 0); // Next funding time
            
            // Store funding rate data
            const fundingData = {
                symbol,
                fundingRate,
                markPrice,
                nextFundingTime,
                timestamp: Date.now(),
                lastUpdate: new Date().toISOString()
            };

            this.fundingRates.set(symbol, fundingData);
            this.monitoredSymbols.add(symbol);

            // Log high funding rates for debugging
            if (Math.abs(fundingRate) > 0.001) { // 0.1%
                console.log(`[MarketDataService] High funding rate detected: ${symbol} = ${(fundingRate * 100).toFixed(4)}%`);
            }

        } catch (error) {
            console.error('[MarketDataService] Error processing funding rate item:', error);
        }
    }

    /**
     * Validate funding rate data for anomalies and inconsistencies
     * @param {Object} data - Funding rate data to validate
     * @returns {boolean} - True if data is valid
     */
    validateFundingData(data) {
        try {
            // Check required fields
            if (!data.s || !data.p || data.r === undefined) {
                return false;
            }

            // Validate symbol format (should end with USDT)
            if (!data.s.endsWith('USDT')) {
                return false;
            }

            // Validate mark price (should be positive)
            const markPrice = parseFloat(data.p);
            if (isNaN(markPrice) || markPrice <= 0) {
                return false;
            }

            // Validate funding rate (should be reasonable range)
            const fundingRate = parseFloat(data.r);
            if (isNaN(fundingRate) || Math.abs(fundingRate) > 0.1) { // Max 10% funding rate
                console.warn(`[MarketDataService] Extreme funding rate detected: ${data.s} = ${fundingRate}`);
                return false;
            }

            // Validate timestamp
            const nextFundingTime = parseInt(data.T);
            if (isNaN(nextFundingTime) || nextFundingTime <= 0) {
                return false;
            }

            return true;

        } catch (error) {
            console.error('[MarketDataService] Error validating funding data:', error);
            return false;
        }
    }

    /**
     * Handle WebSocket reconnection logic
     */
    handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`[MarketDataService] Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
            return;
        }

        this.reconnectAttempts++;
        console.log(`[MarketDataService] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);
        
        setTimeout(() => {
            this.startFundingRateStream();
        }, this.reconnectDelay);
    }

    /**
     * Get current funding rate for a specific symbol
     * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
     * @returns {Object|null} - Funding rate data or null if not found
     */
    getFundingRate(symbol) {
        return this.fundingRates.get(symbol) || null;
    }

    /**
     * Get all current funding rates
     * @returns {Array} - Array of all funding rate data
     */
    getAllFundingRates() {
        return Array.from(this.fundingRates.values());
    }

    /**
     * Get funding rates above a specific threshold
     * @param {number} threshold - Minimum funding rate threshold (e.g., 0.001 for 0.1%)
     * @returns {Array} - Array of funding rates above threshold
     */
    getHighFundingRates(threshold = 0.001) {
        return this.getAllFundingRates()
            .filter(data => Math.abs(data.fundingRate) >= threshold)
            .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
    }

    /**
     * Save funding rate data to JSON file
     */
    async saveFundingData() {
        try {
            const dataToSave = {
                timestamp: new Date().toISOString(),
                totalSymbols: this.monitoredSymbols.size,
                lastUpdate: this.lastUpdate?.toISOString(),
                fundingRates: Array.from(this.fundingRates.values())
            };

            await fs.writeFile(this.fundingDataFile, JSON.stringify(dataToSave, null, 2));
            console.log(`[MarketDataService] Saved funding data for ${this.monitoredSymbols.size} symbols`);

        } catch (error) {
            console.error('[MarketDataService] Error saving funding data:', error);
        }
    }

    /**
     * Load funding rate data from JSON file
     */
    async loadFundingData() {
        try {
            const data = await fs.readFile(this.fundingDataFile, 'utf8');
            const parsedData = JSON.parse(data);
            
            if (parsedData.fundingRates && Array.isArray(parsedData.fundingRates)) {
                parsedData.fundingRates.forEach(item => {
                    this.fundingRates.set(item.symbol, item);
                    this.monitoredSymbols.add(item.symbol);
                });
                
                console.log(`[MarketDataService] Loaded funding data for ${parsedData.fundingRates.length} symbols`);
            }

        } catch (error) {
            console.log('[MarketDataService] No existing funding data file found, starting fresh');
        }
    }

    /**
     * Get connection status
     * @returns {Object} - Connection status information
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            lastUpdate: this.lastUpdate,
            totalSymbols: this.monitoredSymbols.size,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Get service statistics
     * @returns {Object} - Service statistics
     */
    getStatistics() {
        const fundingRates = this.getAllFundingRates();
        const highRates = this.getHighFundingRates(0.001);
        
        return {
            totalSymbols: this.monitoredSymbols.size,
            averageFundingRate: fundingRates.reduce((sum, data) => sum + Math.abs(data.fundingRate), 0) / (fundingRates.length || 1),
            highFundingRateCount: highRates.length,
            maxFundingRate: Math.max(...fundingRates.map(data => Math.abs(data.fundingRate)), 0),
            lastUpdate: this.lastUpdate,
            isConnected: this.isConnected
        };
    }

    /**
     * Stop the WebSocket connection and save data
     */
    async stop() {
        console.log('[MarketDataService] Stopping market data service...');
        
        if (this.wsConnection) {
            this.wsConnection.close();
        }
        
        await this.saveFundingData();
        this.isConnected = false;
    }

    /**
     * Start the service with auto-save intervals
     */
    async start() {
        console.log('[MarketDataService] Starting market data service...');
        
        // Load existing data
        await this.loadFundingData();
        
        // Start WebSocket connection
        await this.startFundingRateStream();
        
        // Set up auto-save interval (every 5 minutes)
        this.saveInterval = setInterval(() => {
            this.saveFundingData();
        }, 5 * 60 * 1000);
        
        console.log('[MarketDataService] Market data service started successfully');
    }
}

module.exports = MarketDataService;
