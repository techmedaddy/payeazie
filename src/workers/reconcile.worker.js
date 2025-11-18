const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');

const runReconciliation = async () => {
    logger.info('Starting reconciliation run');

    try {
        const payments = await db.any(
            "SELECT * FROM payments WHERE created_at > NOW() - INTERVAL '24 hours' AND status != 'succeeded' AND gateway_charge_id IS NOT NULL"
        );

        for (const payment of payments) {
            try {
                const gatewayData = await gatewayClient.fetchCharge(payment.gateway_charge_id);

                if (gatewayData.status === 'succeeded' && payment.status !== 'succeeded') {
                    await db.none(
                        "UPDATE payments SET status = 'succeeded', updated_at = NOW() WHERE id = $1",
                        [payment.id]
                    );
                    logger.info({ paymentId: payment.id }, 'Reconciled: Payment updated to succeeded');
                } else if (gatewayData.status === 'failed' && payment.status === 'processing') {
                    await db.none(
                        "UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1",
                        [payment.id]
                    );
                    logger.info({ paymentId: payment.id }, 'Reconciled: Payment updated to failed');
                } else if (gatewayData.status !== payment.status) {
                    logger.warn({ 
                        paymentId: payment.id, 
                        dbStatus: payment.status, 
                        gatewayStatus: gatewayData.status 
                    }, 'Status mismatch detected');
                }
            } catch (err) {
                logger.error({ err, paymentId: payment.id }, 'Failed to reconcile individual payment');
            }
        }
    } catch (err) {
        logger.error({ err }, 'Reconciliation run failed');
    }

    logger.info('Reconciliation run complete');
};

module.exports = { runReconciliation };