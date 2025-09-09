const MarketDataService = require('../services/MarketDataService');
const WebSocket = require('ws');
const fs = require('fs').promises;

// Mock WebSocket and filesystem operations
jest.mock('ws');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn()
    }
}));

describe('MarketDataService', () => {
    let marketDataService;
    let mockWebSocket;

    beforeEach(() => {
        marketDataService = new MarketDataService();
        
        // Mock WebSocket instance
        mockWebSocket = {
            on: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN
        };
        
        WebSocket.mockImplementation(() => mockWebSocket);
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        if (marketDataService.saveInterval) {
            clearInterval(marketDataService.saveInterval);
        }
    });

    describe('Constructor', () => {
        test('should initialize with default values', () => {
            expect(marketDataService.wsConnection).toBeNull();
            expect(marketDataService.fundingRates.size).toBe(0);
            expect(marketDataService.isConnected).toBe(false);
            expect(marketDataService.reconnectAttempts).toBe(0);
            expect(marketDataService.maxReconnectAttempts).toBe(5);
        });

        test('should initialize data directory', async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for async init
            expect(fs.mkdir).toHaveBeenCalled();
        });
    });

    describe('Data Validation', () => {
        test('should validate correct funding data', () => {
            const validData = {
                s: 'BTCUSDT',
                p: '45000.50',
                r: '0.0001',
                T: '1640995200000'
            };

            expect(marketDataService.validateFundingData(validData)).toBe(true);
        });

        test('should reject data missing required fields', () => {
            const invalidData1 = { s: 'BTCUSDT', p: '45000.50' }; // Missing r
            const invalidData2 = { s: 'BTCUSDT', r: '0.0001' }; // Missing p
            const invalidData3 = { p: '45000.50', r: '0.0001' }; // Missing s

            expect(marketDataService.validateFundingData(invalidData1)).toBe(false);
            expect(marketDataService.validateFundingData(invalidData2)).toBe(false);
            expect(marketDataService.validateFundingData(invalidData3)).toBe(false);
        });

        test('should reject non-USDT symbols', () => {
            const nonUsdtData = {
                s: 'BTCETH',
                p: '45000.50',
                r: '0.0001',
                T: '1640995200000'
            };

            expect(marketDataService.validateFundingData(nonUsdtData)).toBe(false);
        });

        test('should reject invalid mark prices', () => {
            const invalidPriceData1 = {
                s: 'BTCUSDT',
                p: '0',
                r: '0.0001',
                T: '1640995200000'
            };

            const invalidPriceData2 = {
                s: 'BTCUSDT',
                p: '-1000',
                r: '0.0001',
                T: '1640995200000'
            };

            expect(marketDataService.validateFundingData(invalidPriceData1)).toBe(false);
            expect(marketDataService.validateFundingData(invalidPriceData2)).toBe(false);
        });

        test('should reject extreme funding rates', () => {
            const extremeRateData = {
                s: 'BTCUSDT',
                p: '45000.50',
                r: '0.15', // 15% funding rate
                T: '1640995200000'
            };

            expect(marketDataService.validateFundingData(extremeRateData)).toBe(false);
        });

        test('should reject invalid timestamps', () => {
            const invalidTimestampData = {
                s: 'BTCUSDT',
                p: '45000.50',
                r: '0.0001',
                T: '0'
            };

            expect(marketDataService.validateFundingData(invalidTimestampData)).toBe(false);
        });
    });

    describe('WebSocket Connection', () => {
        test('should create WebSocket connection on start', async () => {
            await marketDataService.startFundingRateStream();

            expect(WebSocket).toHaveBeenCalledWith('wss://fstream.binance.com/ws/!markPrice@arr@1s');
            expect(mockWebSocket.on).toHaveBeenCalledWith('open', expect.any(Function));
            expect(mockWebSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockWebSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
            expect(mockWebSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
        });

        test('should handle WebSocket open event', async () => {
            await marketDataService.startFundingRateStream();
            
            // Simulate WebSocket open event
            const openHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'open')[1];
            openHandler();

            expect(marketDataService.isConnected).toBe(true);
            expect(marketDataService.reconnectAttempts).toBe(0);
        });

        test('should handle WebSocket close event', async () => {
            marketDataService.handleReconnection = jest.fn();
            await marketDataService.startFundingRateStream();
            
            // Simulate WebSocket close event
            const closeHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'close')[1];
            closeHandler(1000, 'Normal closure');

            expect(marketDataService.isConnected).toBe(false);
            expect(marketDataService.handleReconnection).toHaveBeenCalled();
        });

        test('should handle WebSocket error event', async () => {
            await marketDataService.startFundingRateStream();
            
            // Simulate WebSocket error event
            const errorHandler = mockWebSocket.on.mock.calls.find(call => call[0] === 'error')[1];
            const mockError = new Error('Connection failed');
            errorHandler(mockError);

            expect(marketDataService.isConnected).toBe(false);
        });
    });

    describe('Data Processing', () => {
        beforeEach(() => {
            // Mock console methods to avoid test output noise
            jest.spyOn(console, 'log').mockImplementation();
            jest.spyOn(console, 'error').mockImplementation();
        });

        afterEach(() => {
            console.log.mockRestore();
            console.error.mockRestore();
        });

        test('should process valid funding rate data', () => {
            const mockMessage = [{
                s: 'BTCUSDT',
                p: '45000.50',
                r: '0.0005',
                T: '1640995200000'
            }, {
                s: 'ETHUSDT',
                p: '3200.75',
                r: '0.0002',
                T: '1640995200000'
            }];

            marketDataService.handleFundingRateData(Buffer.from(JSON.stringify(mockMessage)));

            expect(marketDataService.fundingRates.size).toBe(2);
            expect(marketDataService.getFundingRate('BTCUSDT')).toBeTruthy();
            expect(marketDataService.getFundingRate('ETHUSDT')).toBeTruthy();
            expect(marketDataService.monitoredSymbols.size).toBe(2);
        });

        test('should filter out non-USDT symbols', () => {
            const mockMessage = [{
                s: 'BTCETH',
                p: '15.50',
                r: '0.0005',
                T: '1640995200000'
            }, {
                s: 'ETHBTC',
                p: '0.075',
                r: '0.0002',
                T: '1640995200000'
            }];

            marketDataService.handleFundingRateData(Buffer.from(JSON.stringify(mockMessage)));

            expect(marketDataService.fundingRates.size).toBe(0);
            expect(marketDataService.monitoredSymbols.size).toBe(0);
        });

        test('should log high funding rates', () => {
            const mockMessage = [{
                s: 'TESTUSDT',
                p: '1.00',
                r: '0.005', // 0.5% - high funding rate
                T: '1640995200000'
            }];

            marketDataService.handleFundingRateData(Buffer.from(JSON.stringify(mockMessage)));

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('High funding rate detected: TESTUSDT = 0.5000%')
            );
        });

        test('should handle malformed JSON data gracefully', () => {
            const invalidJson = Buffer.from('invalid json data');
            
            marketDataService.handleFundingRateData(invalidJson);

            expect(console.error).toHaveBeenCalledWith(
                '[MarketDataService] Error processing funding rate data:',
                expect.any(Error)
            );
            expect(marketDataService.fundingRates.size).toBe(0);
        });
    });

    describe('Data Retrieval', () => {
        beforeEach(() => {
            // Add some test data
            marketDataService.fundingRates.set('BTCUSDT', {
                symbol: 'BTCUSDT',
                fundingRate: 0.0005,
                markPrice: 45000,
                timestamp: Date.now()
            });

            marketDataService.fundingRates.set('ETHUSDT', {
                symbol: 'ETHUSDT',
                fundingRate: 0.002,
                markPrice: 3200,
                timestamp: Date.now()
            });

            marketDataService.fundingRates.set('ADAUSDT', {
                symbol: 'ADAUSDT',
                fundingRate: -0.0001,
                markPrice: 0.5,
                timestamp: Date.now()
            });
        });

        test('should get funding rate for specific symbol', () => {
            const btcData = marketDataService.getFundingRate('BTCUSDT');
            expect(btcData.symbol).toBe('BTCUSDT');
            expect(btcData.fundingRate).toBe(0.0005);
        });

        test('should return null for non-existent symbol', () => {
            const result = marketDataService.getFundingRate('NONEXISTENT');
            expect(result).toBeNull();
        });

        test('should get all funding rates', () => {
            const allRates = marketDataService.getAllFundingRates();
            expect(allRates).toHaveLength(3);
            expect(allRates.map(r => r.symbol)).toEqual(
                expect.arrayContaining(['BTCUSDT', 'ETHUSDT', 'ADAUSDT'])
            );
        });

        test('should get high funding rates above threshold', () => {
            const highRates = marketDataService.getHighFundingRates(0.001);
            expect(highRates).toHaveLength(1); // Only ETHUSDT with 0.002
            expect(highRates[0].symbol).toBe('ETHUSDT');
        });

        test('should sort high funding rates by absolute value descending', () => {
            // Add more test data
            marketDataService.fundingRates.set('TESTUSDT', {
                symbol: 'TESTUSDT',
                fundingRate: 0.003,
                markPrice: 1,
                timestamp: Date.now()
            });

            const highRates = marketDataService.getHighFundingRates(0.001);
            expect(highRates).toHaveLength(2);
            expect(highRates[0].symbol).toBe('TESTUSDT'); // 0.003
            expect(highRates[1].symbol).toBe('ETHUSDT');  // 0.002
        });
    });

    describe('Connection Status', () => {
        test('should return connection status', () => {
            marketDataService.isConnected = true;
            marketDataService.lastUpdate = new Date();
            marketDataService.monitoredSymbols.add('BTCUSDT');
            marketDataService.reconnectAttempts = 2;

            const status = marketDataService.getConnectionStatus();

            expect(status.connected).toBe(true);
            expect(status.lastUpdate).toBeInstanceOf(Date);
            expect(status.totalSymbols).toBe(1);
            expect(status.reconnectAttempts).toBe(2);
        });

        test('should return service statistics', () => {
            // Add test data with different funding rates
            marketDataService.fundingRates.set('BTCUSDT', {
                symbol: 'BTCUSDT',
                fundingRate: 0.001,
                markPrice: 45000,
                timestamp: Date.now()
            });

            marketDataService.fundingRates.set('ETHUSDT', {
                symbol: 'ETHUSDT',
                fundingRate: 0.002,
                markPrice: 3200,
                timestamp: Date.now()
            });

            marketDataService.isConnected = true;
            marketDataService.lastUpdate = new Date();
            marketDataService.monitoredSymbols.add('BTCUSDT');
            marketDataService.monitoredSymbols.add('ETHUSDT');

            const stats = marketDataService.getStatistics();

            expect(stats.totalSymbols).toBe(2);
            expect(stats.averageFundingRate).toBe(0.0015); // (0.001 + 0.002) / 2
            expect(stats.highFundingRateCount).toBe(2); // Both above 0.001 threshold
            expect(stats.maxFundingRate).toBe(0.002);
            expect(stats.isConnected).toBe(true);
            expect(stats.lastUpdate).toBeInstanceOf(Date);
        });
    });

    describe('File Operations', () => {
        test('should save funding data to file', async () => {
            marketDataService.fundingRates.set('BTCUSDT', {
                symbol: 'BTCUSDT',
                fundingRate: 0.001,
                markPrice: 45000,
                timestamp: Date.now()
            });

            marketDataService.monitoredSymbols.add('BTCUSDT');
            marketDataService.lastUpdate = new Date();

            await marketDataService.saveFundingData();

            expect(fs.writeFile).toHaveBeenCalled();
            const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(savedData.totalSymbols).toBe(1);
            expect(savedData.fundingRates).toHaveLength(1);
            expect(savedData.fundingRates[0].symbol).toBe('BTCUSDT');
        });

        test('should load funding data from file', async () => {
            const mockData = {
                timestamp: new Date().toISOString(),
                totalSymbols: 1,
                fundingRates: [{
                    symbol: 'BTCUSDT',
                    fundingRate: 0.001,
                    markPrice: 45000,
                    timestamp: Date.now()
                }]
            };

            fs.readFile.mockResolvedValue(JSON.stringify(mockData));

            await marketDataService.loadFundingData();

            expect(marketDataService.fundingRates.size).toBe(1);
            expect(marketDataService.getFundingRate('BTCUSDT')).toBeTruthy();
            expect(marketDataService.monitoredSymbols.has('BTCUSDT')).toBe(true);
        });

        test('should handle missing data file gracefully', async () => {
            fs.readFile.mockRejectedValue(new Error('File not found'));
            
            // Mock console.log to check the message
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await marketDataService.loadFundingData();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[MarketDataService] No existing funding data file found, starting fresh'
            );
            expect(marketDataService.fundingRates.size).toBe(0);

            consoleSpy.mockRestore();
        });
    });

    describe('Service Lifecycle', () => {
        test('should start service with all components', async () => {
            marketDataService.loadFundingData = jest.fn();
            marketDataService.startFundingRateStream = jest.fn();
            
            await marketDataService.start();

            expect(marketDataService.loadFundingData).toHaveBeenCalled();
            expect(marketDataService.startFundingRateStream).toHaveBeenCalled();
            expect(marketDataService.saveInterval).toBeDefined();
        });

        test('should stop service and clean up', async () => {
            marketDataService.wsConnection = mockWebSocket;
            marketDataService.saveInterval = setInterval(() => {}, 1000);
            marketDataService.saveFundingData = jest.fn();

            await marketDataService.stop();

            expect(mockWebSocket.close).toHaveBeenCalled();
            expect(marketDataService.saveFundingData).toHaveBeenCalled();
            expect(marketDataService.isConnected).toBe(false);
        });
    });
});
