require('dotenv').config();

const { createWorker } = require('../utils/queue');
const db = require('../db');
const logger = require('../utils/logger');
const gatewayClient = require('../utils/gateway-client');

const DEFAULT_WINDOW_MINUTES = 30;
const FINAL_STATUSES = new Set(['succeeded', 'failed', 'refunded']);

const fetchNonFinalPayments = () => {
    return db.any(
        `SELECT id, status, gateway_charge_id
         FROM payments
         WHERE status NOT IN ('succeeded', 'failed', 'refunded')
           AND gateway_charge_id IS NOT NULL
           AND updated_at >= NOW() - ($1 || ' minutes')::interval`,
        [DEFAULT_WINDOW_MINUTES]
    );
};

const reconcilePayment = async (payment) => {
    try {
        const remote = await gatewayClient.lookup(payment.gateway_charge_id);

        if (!remote) {
            logger.warn({ paymentId: payment.id }, 'reconcile.worker.missingGatewayRecord');
            return;
        }

        if (remote.status === payment.status || FINAL_STATUSES.has(payment.status) && FINAL_STATUSES.has(remote.status)) {
            return;
        }

        await db.tx(async t => {
            await t.none(
                `UPDATE payments
                 SET status = $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [payment.id, remote.status]
            );
        });

        logger.info({ paymentId: payment.id, status: remote.status }, 'reconcile.worker.updatedStatus');
    } catch (err) {
        logger.error({ paymentId: payment.id, err }, 'reconcile.worker.paymentFailed');
    }
};

const worker = createWorker('payment_reconcile', async (job) => {
    logger.info({ jobId: job?.id }, 'reconcile.worker.jobStart');

    try {
        const candidates = await fetchNonFinalPayments();

        if (!candidates.length) {
            logger.info('reconcile.worker.noCandidates');
            return;
        }

        for (const payment of candidates) {
            await reconcilePayment(payment);
        }

        logger.info({ processed: candidates.length }, 'reconcile.worker.jobComplete');
    } catch (err) {
        logger.error({ err, jobId: job?.id }, 'reconcile.worker.jobFailed');
        throw err;
    }
});

worker.on('error', (err) => {
    logger.error({ err }, 'reconcile.worker.redisError');
});

module.exports = worker;