const logger = require('./logger');
const metrics = require('./metrics');

/**
 * Simulated gateway client for testing
 * In production, this would call actual payment gateway APIs
 */
module.exports = {
    /**
     * Create a charge with the gateway
     * Called by charge.worker.js
     */
    charge: async ({ amount, currency, idempotencyKey }) => {
        const startTime = Date.now();
        
        try {
            // Simulate network delay (30ms)
            await new Promise(resolve => setTimeout(resolve, 30));

            const chargeId = "ch_" + idempotencyKey.replace(/-/g, "");

            // Simulate realistic outcomes: 90% succeeded, 10% failed
            // Note: Removed 'processing' status - gateway should return terminal status
            // If a real gateway returns 'processing', handle via reconciliation worker
            const rand = Math.random();
            const status = rand < 0.90 ? "succeeded" : "failed";

            logger.info({ chargeId, amount, currency, status }, 'gatewayClient.charge simulated');

            const responseTime = Date.now() - startTime;
            metrics.recordGatewayCall(true, responseTime);

            // Build response object with required fields
            const response = {
                id: chargeId,
                amount,
                currency,
                status
            };
            
            // Strict validation: MUST have id and status
            if (!response.id || typeof response.id !== 'string') {
                logger.error({ response }, '❌ gatewayClient.charge: missing or invalid id');
                throw new Error('Invalid gateway response: missing or invalid charge id');
            }
            
            if (!response.status || (response.status !== 'succeeded' && response.status !== 'failed')) {
                logger.error({ response }, '❌ gatewayClient.charge: missing or invalid status');
                throw new Error('Invalid gateway response: status must be succeeded or failed');
            }
            
            logger.info({ 
                chargeId: response.id, 
                status: response.status 
            }, '✅ gatewayClient.charge: validated response');
            
            return response;
        } catch (err) {
            metrics.recordGatewayCall(false, Date.now() - startTime);
            throw err;
        }
    },

    /**
     * Lookup/fetch a charge status from the gateway
     * Called by reconcile.worker.js
     */
    lookup: async (chargeId) => {
        const startTime = Date.now();
        
        try {
            // Simulate network delay (30ms)
            await new Promise(resolve => setTimeout(resolve, 30));

            // Simulate reconciliation: processing charges eventually succeed or fail
            const rand = Math.random();
            const status = rand < 0.85 ? "succeeded" : "failed";

            const response = {
                id: chargeId,
                status
            };
            
            // Validate response structure
            if (!response.id || !response.status) {
                logger.error({ response }, '❌ gatewayClient.lookup: invalid response structure');
                throw new Error('Invalid gateway lookup response: missing id or status');
            }
            
            logger.info({ chargeId, status }, '✅ gatewayClient.lookup simulated');

            const responseTime = Date.now() - startTime;
            metrics.recordGatewayCall(true, responseTime);

            return response;
        } catch (err) {
            metrics.recordGatewayCall(false, Date.now() - startTime);
            throw err;
        }
    }
};
