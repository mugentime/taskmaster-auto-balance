/**
 * Binance Error Mapping Utility
 * 
 * Translates Binance API error codes to user-friendly messages
 * with actionable remediation steps
 */

const BINANCE_ERROR_CODES = {
    // Insufficient margin/balance errors
    '-2019': {
        label: 'Insufficient Futures Margin',
        category: 'balance',
        severity: 'high',
        description: 'Your futures wallet doesn\'t have enough USDT for this trade',
        remediation: [
            'Transfer more USDT to your Futures wallet',
            'Reduce the position size',
            'Lower the leverage',
            'Enable auto-transfer from Spot wallet'
        ]
    },
    
    // Order validation errors
    '-2010': {
        label: 'New Order Rejected',
        category: 'validation',
        severity: 'medium',
        description: 'The order was rejected by Binance',
        remediation: [
            'Check minimum order size requirements',
            'Verify symbol is actively trading',
            'Ensure price is within allowed range',
            'Check account permissions'
        ]
    },
    
    '-4164': {
        label: 'Order Would Immediately Trigger',
        category: 'pricing',
        severity: 'medium',
        description: 'The order price would cause immediate execution',
        remediation: [
            'Use market orders instead of limit orders',
            'Adjust the limit price',
            'Check current market price',
            'Consider using stop orders'
        ]
    },
    
    // Filter violations
    '-2021': {
        label: 'Invalid Order Quantity',
        category: 'filters',
        severity: 'medium',
        description: 'Order quantity violates trading rules',
        remediation: [
            'Adjust quantity to meet step size requirements',
            'Check minimum and maximum quantity limits',
            'Ensure quantity meets minimum notional value',
            'Round quantity to proper decimal places'
        ]
    },
    
    '-2027': {
        label: 'Invalid Order Price',
        category: 'filters',
        severity: 'medium',
        description: 'Order price violates trading rules',
        remediation: [
            'Adjust price to meet tick size requirements',
            'Check minimum and maximum price limits',
            'Round price to proper decimal places',
            'Check current market price range'
        ]
    },
    
    // Leverage errors
    '-4028': {
        label: 'Leverage Not Supported',
        category: 'leverage',
        severity: 'medium',
        description: 'The requested leverage is not supported for this symbol',
        remediation: [
            'Use a lower leverage ratio',
            'Check maximum leverage for this symbol',
            'Verify your account tier leverage limits',
            'Consider using a different symbol'
        ]
    },
    
    // Account/permission errors
    '-2015': {
        label: 'Invalid API Key',
        category: 'auth',
        severity: 'critical',
        description: 'API key is invalid or has been revoked',
        remediation: [
            'Check API key is correct and active',
            'Verify API secret matches the key',
            'Ensure API key has required permissions',
            'Regenerate API key if necessary'
        ]
    },
    
    '-1021': {
        label: 'Timestamp Synchronization Error',
        category: 'sync',
        severity: 'medium',
        description: 'Request timestamp is outside acceptable window',
        remediation: [
            'Synchronize system clock with NTP',
            'Check system timezone settings',
            'Retry the request',
            'Enable automatic time synchronization'
        ]
    },
    
    // Market status errors
    '-1013': {
        label: 'Invalid Quantity',
        category: 'filters',
        severity: 'medium',
        description: 'Order quantity is invalid',
        remediation: [
            'Check minimum order quantity',
            'Verify step size compliance',
            'Ensure quantity is not zero or negative',
            'Check maximum order quantity limits'
        ]
    },
    
    '-1111': {
        label: 'Invalid Precision',
        category: 'filters',
        severity: 'medium',
        description: 'Precision exceeds maximum for this symbol',
        remediation: [
            'Round quantity to proper precision',
            'Check symbol trading rules',
            'Use fewer decimal places',
            'Verify step size requirements'
        ]
    }
};

/**
 * Map Binance error to user-friendly format
 */
function mapBinanceError(error, context = {}) {
    const errorCode = error.code?.toString() || '-9999';
    const mapping = BINANCE_ERROR_CODES[errorCode];
    
    const baseError = {
        code: errorCode,
        originalMessage: error.message || error.msg || 'Unknown error',
        timestamp: new Date().toISOString(),
        context
    };
    
    if (mapping) {
        return {
            ...baseError,
            label: mapping.label,
            category: mapping.category,
            severity: mapping.severity,
            message: mapping.description,
            remediation: mapping.remediation,
            userFriendly: true
        };
    }
    
    // Generic error mapping for unknown codes
    return {
        ...baseError,
        label: 'Binance API Error',
        category: 'unknown',
        severity: 'medium',
        message: baseError.originalMessage,
        remediation: [
            'Check Binance system status',
            'Verify API credentials and permissions',
            'Try again in a few minutes',
            'Contact support if issue persists'
        ],
        userFriendly: false
    };
}

/**
 * Create context-aware error for margin issues
 */
function createMarginError(deficit, availableBalance, requiredMargin, symbol, leverage) {
    return {
        code: '-2019',
        label: 'Insufficient Futures Margin',
        category: 'balance',
        severity: 'high',
        message: `Insufficient margin for ${symbol} trade`,
        context: {
            symbol,
            leverage: `${leverage}x`,
            availableBalance: `${availableBalance.toFixed(2)} USDT`,
            requiredMargin: `${requiredMargin.toFixed(2)} USDT`,
            deficit: `${deficit.toFixed(2)} USDT`
        },
        remediation: [
            `Transfer ${Math.ceil(deficit)} USDT to Futures wallet`,
            `Reduce leverage to ${Math.max(1, Math.floor(leverage * 0.7))}x or lower`,
            `Reduce investment amount to fit available margin`,
            'Enable automatic transfer from Spot wallet'
        ],
        userFriendly: true
    };
}

/**
 * Create context-aware error for quantity/filter issues
 */
function createFilterError(filterType, value, requirement, symbol) {
    const errorMappings = {
        stepSize: {
            message: `Order quantity must be a multiple of ${requirement}`,
            remediation: [
                `Round quantity to nearest step size (${requirement})`,
                'Use a quantity calculator',
                'Reduce order precision'
            ]
        },
        minNotional: {
            message: `Order value must be at least ${requirement} USDT`,
            remediation: [
                'Increase order quantity',
                'Use a different symbol with lower minimum',
                'Check current price and adjust accordingly'
            ]
        },
        tickSize: {
            message: `Order price must be a multiple of ${requirement}`,
            remediation: [
                `Round price to nearest tick size (${requirement})`,
                'Use market orders instead of limit orders',
                'Check current market price'
            ]
        }
    };
    
    const mapping = errorMappings[filterType] || errorMappings.stepSize;
    
    return {
        code: '-2021',
        label: 'Filter Validation Failed',
        category: 'filters',
        severity: 'medium',
        message: mapping.message,
        context: {
            symbol,
            filterType,
            value: value?.toString(),
            requirement: requirement?.toString()
        },
        remediation: mapping.remediation,
        userFriendly: true
    };
}

/**
 * Extract and parse Binance error from axios response
 */
function extractBinanceError(error) {
    let binanceError = null;
    
    if (error.response?.data) {
        const data = error.response.data;
        binanceError = {
            code: data.code,
            message: data.msg || data.message,
            httpStatus: error.response.status
        };
    } else if (error.code && error.msg) {
        binanceError = {
            code: error.code,
            message: error.msg
        };
    }
    
    return binanceError || {
        code: -9999,
        message: error.message || 'Unknown error',
        httpStatus: error.response?.status
    };
}

module.exports = {
    BINANCE_ERROR_CODES,
    mapBinanceError,
    createMarginError,
    createFilterError,
    extractBinanceError
};
