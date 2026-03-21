const logger = require('./logger');
const metrics = require('./metrics');

const FAILURE_REASONS = [
    {
        code: 'card_declined',
        message: 'The card was declined by the issuer.'
    },
    {
        code: 'insufficient_funds',
        message: 'The payment method has insufficient funds.'
    },
    {
        code: 'risk_review_required',
        message: 'The payment was flagged for additional risk review.'
    }
];

/**
 * Simulated gateway client for testing
 * In production, this would call actual payment gateway APIs
 */
module.exports = {
    /**
     * Create a charge with the gateway
     * Called by charge.worker.js
     */
    charge: async ({ amount, currency, idempotencyKey, demo = {} }) => {
        const startTime = Date.now();
        
        try {
            // Simulate network delay (30ms)
            await new Promise(resolve => setTimeout(resolve, 30));

            const chargeId = "ch_" + idempotencyKey.replace(/-/g, "");

            let status;
            if (demo.outcome === 'success') {
                status = 'succeeded';
            } else if (demo.outcome === 'failure') {
                status = 'failed';
            } else {
                const rand = Math.random();
                status = rand < 0.90 ? "succeeded" : "failed";
            }
            const failure =
                status === 'failed'
                    ? FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]
                    : null;

            logger.info({ chargeId, amount, currency, status, demo }, 'gatewayClient.charge simulated');

            const responseTime = Date.now() - startTime;
            metrics.recordGatewayCall(true, responseTime);

            // Build response object with required fields
            const response = {
                id: chargeId,
                amount,
                currency,
                status,
                provider: 'mock',
                failureCode: failure?.code || null,
                failureMessage: failure?.message || null,
                demoOutcome: demo.outcome || 'auto',
                processingSpeed: demo.processingSpeed || 'normal'
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
            const failure =
                status === 'failed'
                    ? FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)]
                    : null;

            const response = {
                id: chargeId,
                status,
                provider: 'mock',
                failureCode: failure?.code || null,
                failureMessage: failure?.message || null
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
    },

    /**
     * Refund a succeeded charge with the gateway.
     * Called by the refund action endpoint.
     */
    refund: async (chargeId) => {
        const startTime = Date.now();

        try {
            await new Promise(resolve => setTimeout(resolve, 30));

            const response = {
                id: chargeId,
                refundId: `rf_${chargeId.replace(/^ch_/, '')}`,
                status: 'refunded',
                provider: 'mock'
            };

            if (!response.id || !response.refundId || response.status !== 'refunded') {
                logger.error({ response }, '❌ gatewayClient.refund: invalid response structure');
                throw new Error('Invalid gateway refund response');
            }

            logger.info({ chargeId, refundId: response.refundId }, '✅ gatewayClient.refund simulated');
            metrics.recordGatewayCall(true, Date.now() - startTime);

            return response;
        } catch (err) {
            metrics.recordGatewayCall(false, Date.now() - startTime);
            throw err;
        }
    }
};
