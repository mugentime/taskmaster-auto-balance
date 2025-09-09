// Fixed balance checker with timestamp correction
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

class FixedBinanceAPI {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://fapi.binance.com';
        
        // Calculate time offset to fix timestamp issues
        this.timeOffset = -8 * 30 * 24 * 60 * 60 * 1000; // Roughly 8 months back
    }

    getTimestamp() {
        return Date.now() + this.timeOffset;
    }

    createSignature(params) {
        const queryString = Object.keys(params)
            .map(key => `${key}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    async makeRequest(endpoint, params = {}) {
        const timestamp = this.getTimestamp();
        const requestParams = {
            ...params,
            timestamp,
            recvWindow: 10000
        };

        const signature = this.createSignature(requestParams);
        requestParams.signature = signature;

        const queryString = Object.keys(requestParams)
            .map(key => `${key}=${encodeURIComponent(requestParams[key])}`)
            .join('&');

        const url = `${this.baseURL}${endpoint}?${queryString}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(`API Error: ${error.response.data.msg || error.message}`);
            }
            throw error;
        }
    }

    async getAccountInfo() {
        return await this.makeRequest('/fapi/v2/account');
    }

    async getPositions() {
        return await this.makeRequest('/fapi/v2/positionRisk');
    }
}

async function checkAccount() {
    console.log('🔧 FIXED BALANCE CHECKER');
    console.log('========================');
    
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
        console.log('❌ ERROR: API credentials not found');
        return;
    }
    
    console.log(`🔑 API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`);
    console.log(`⏰ System Time: ${new Date().toLocaleString()}`);
    console.log(`🔧 Corrected Time: ${new Date(Date.now() - 8 * 30 * 24 * 60 * 60 * 1000).toLocaleString()}`);
    console.log('');
    
    try {
        const api = new FixedBinanceAPI(apiKey, apiSecret);
        
        console.log('📡 Testing API connection with timestamp correction...');
        const account = await api.getAccountInfo();
        
        console.log('✅ API CONNECTION SUCCESSFUL!');
        console.log('');
        
        console.log('💰 FUTURES ACCOUNT BALANCE');
        console.log('==========================');
        
        const usdtAsset = account.assets.find(a => a.asset === 'USDT') || {
            asset: 'USDT',
            walletBalance: '0',
            availableBalance: '0',
            crossUnPnl: '0'
        };
        
        console.log(`💼 Wallet Balance: $${parseFloat(usdtAsset.walletBalance).toFixed(2)}`);
        console.log(`💵 Available Balance: $${parseFloat(usdtAsset.availableBalance).toFixed(2)}`);
        console.log(`📈 Unrealized PnL: $${parseFloat(usdtAsset.crossUnPnl).toFixed(4)}`);
        console.log('');
        
        console.log('📊 ACCOUNT STATUS');
        console.log('=================');
        console.log(`✅ Can Trade: ${account.canTrade ? 'YES' : 'NO'}`);
        console.log(`✅ Can Withdraw: ${account.canWithdraw ? 'YES' : 'NO'}`);
        console.log(`📋 Total Assets: ${account.assets.length}`);
        console.log('');
        
        // Get positions
        console.log('📍 Getting active positions...');
        const positions = await api.getPositions();
        const activePositions = positions.filter(p => parseFloat(p.positionAmt) !== 0);
        
        if (activePositions.length > 0) {
            console.log(`📈 ACTIVE POSITIONS (${activePositions.length})`);
            console.log('============================');
            
            let totalPnL = 0;
            activePositions.forEach((pos, index) => {
                const side = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
                const pnl = parseFloat(pos.unRealizedProfit);
                const percentage = parseFloat(pos.percentage);
                totalPnL += pnl;
                
                console.log(`${index + 1}. ${pos.symbol} - ${side}`);
                console.log(`   Size: ${Math.abs(parseFloat(pos.positionAmt))}`);
                console.log(`   Entry: $${parseFloat(pos.entryPrice).toFixed(4)}`);
                console.log(`   Mark: $${parseFloat(pos.markPrice).toFixed(4)}`);
                console.log(`   PnL: $${pnl.toFixed(4)} (${percentage.toFixed(2)}%)`);
                console.log('');
            });
            
            console.log(`💰 TOTAL UNREALIZED PnL: $${totalPnL.toFixed(4)}`);
        } else {
            console.log('📍 No active positions found');
        }
        
        console.log('');
        console.log('🎉 TIMESTAMP ISSUE RESOLVED!');
        console.log('✅ API calls working normally');
        
    } catch (error) {
        console.log('❌ ERROR:', error.message);
        
        if (error.message.includes('Timestamp')) {
            console.log('');
            console.log('💡 TIMESTAMP STILL NEEDS ADJUSTMENT');
            console.log('Try running this as Administrator:');
            console.log('w32tm /resync');
        }
    }
}

checkAccount().catch(console.error);
