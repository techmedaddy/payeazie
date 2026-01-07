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

            // Simulate realistic outcomes: 80% succeeded, 15% processing, 5% failed
            const rand = Math.random();
            const status = rand < 0.80 ? "succeeded" : rand < 0.95 ? "processing" : "failed";

            logger.info({ chargeId, amount, currency, status }, 'gatewayClient.charge simulated');

            const responseTime = Date.now() - startTime;
            metrics.recordGatewayCall(true, responseTime);

            return {
                id: chargeId,
                amount,
                currency,
                status
            };
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

            logger.info({ chargeId, status }, 'gatewayClient.lookup simulated');

            const responseTime = Date.now() - startTime;
            metrics.recordGatewayCall(true, responseTime);

            return {
                id: chargeId,
                status
            };
        } catch (err) {
            metrics.recordGatewayCall(false, Date.now() - startTime);
            throw err;
        }
    }
};
