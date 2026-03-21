const db = require('../../db');
const logger = require('../../utils/logger');
const Redis = require('ioredis');
const { ALLOWED_TRANSITIONS, canTransition } = require('../../utils/payment-status');
const { isInternalOperatorRole } = require('../../utils/roles');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    throw new Error('REDIS_URL is required for status transition service');
}

// Create dedicated Redis publisher for events
const redisPublisher = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redisPublisher.on('error', (err) => {
    logger.error({ error: err.message }, 'status-transition: Redis publisher error');
});

redisPublisher.on('connect', () => {
    logger.info('status-transition: Redis publisher connected');
});

class StatusTransitionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StatusTransitionError';
    }
}

const OPERATION_SOURCE = Object.freeze({
    AUTOMATIC: 'automatic',
    USER_TRIGGERED: 'user_triggered',
    ADMIN_TRIGGERED: 'admin_triggered'
});

/**
 * Validate if a status transition is allowed
 */
const isValidTransition = (fromStatus, toStatus) => {
    return canTransition(fromStatus, toStatus);
};

/**
 * Emit a status change event via Redis pub/sub
 */
const emitStatusEvent = async (paymentId, fromStatus, toStatus, metadata = {}) => {
    try {
        const event = {
            type: 'payment.status.changed',
            paymentId,
            fromStatus,
            toStatus,
            timestamp: new Date().toISOString(),
            metadata
        };
        
        const channel = `payment:${paymentId}:status`;
        await redisPublisher.publish(channel, JSON.stringify(event));
        
        // Also publish to a global channel for monitoring
        await redisPublisher.publish('payment:status:all', JSON.stringify(event));
        
        logger.info({ 
            paymentId, 
            fromStatus, 
            toStatus, 
            channel 
        }, 'status-transition: event emitted');
    } catch (err) {
        logger.error({ 
            error: err.message, 
            paymentId, 
            fromStatus, 
            toStatus 
        }, 'status-transition: failed to emit event');
        // Don't throw - event emission failure shouldn't fail the transaction
    }
};

const classifyOperationSource = (triggeredBy, actorRole = null) => {
    if (triggeredBy === 'user') {
        return isInternalOperatorRole(actorRole)
            ? OPERATION_SOURCE.ADMIN_TRIGGERED
            : OPERATION_SOURCE.USER_TRIGGERED;
    }

    return OPERATION_SOURCE.AUTOMATIC;
};

const toOperationLabel = (operationSource) => {
    switch (operationSource) {
        case OPERATION_SOURCE.ADMIN_TRIGGERED:
            return 'Admin-triggered';
        case OPERATION_SOURCE.USER_TRIGGERED:
            return 'User-triggered';
        default:
            return 'Automatic';
    }
};

const enrichOpsMetadata = (metadata = {}, triggeredBy = 'system') => {
    const actorRole = metadata.actorRole || null;
    const operationSource = metadata.operationSource || classifyOperationSource(triggeredBy, actorRole);

    return {
        ...metadata,
        actorRole,
        operationSource,
        operationLabel: metadata.operationLabel || toOperationLabel(operationSource)
    };
};

/**
 * Create an audit log entry for a status transition
 */
const createAuditLog = async (t, paymentId, fromStatus, toStatus, metadata = {}, userId = null, triggeredBy = 'system') => {
    try {
        await t.none(
            `INSERT INTO payment_audit_log (payment_id, from_status, to_status, metadata, user_id, triggered_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [paymentId, fromStatus, toStatus, metadata, userId, triggeredBy]
        );
        
        logger.debug({ 
            paymentId, 
            fromStatus, 
            toStatus,
            userId,
            triggeredBy
        }, 'status-transition: audit log created');
    } catch (err) {
        logger.error({ 
            error: err.message, 
            paymentId 
        }, 'status-transition: failed to create audit log');
        throw err;
    }
};

/**
 * Transition a payment to a new status with audit logging and event emission
 * 
 * @param {string} paymentId - The payment ID
 * @param {string} toStatus - The target status
 * @param {object} metadata - Optional metadata about the transition
 * @param {string|null} userId - The user ID who triggered the transition (null for system)
 * @param {string} triggeredBy - Who/what triggered the transition ('user', 'worker', 'system')
 * @returns {Promise<object>} The updated payment record
 */
const buildUpdateStatement = (toStatus, options = {}) => {
    const assignments = ['status = $2', 'updated_at = NOW()'];

    if (options.clearGatewayChargeId) {
        assignments.push('gateway_charge_id = NULL');
    }

    return `UPDATE payments 
            SET ${assignments.join(', ')}
            WHERE id = $1 
            RETURNING *`;
};

const transitionStatus = async (paymentId, toStatus, metadata = {}, userId = null, triggeredBy = 'system', options = {}) => {
    if (!paymentId) {
        throw new Error('paymentId is required');
    }
    if (!toStatus) {
        throw new Error('toStatus is required');
    }

    logger.info({ paymentId, toStatus, metadata, userId, triggeredBy }, 'status-transition: starting transition');
    const opsMetadata = enrichOpsMetadata(metadata, triggeredBy);

    return db.tx(async (t) => {
        // Lock the payment row for update
        const payment = await t.oneOrNone(
            'SELECT * FROM payments WHERE id = $1 FOR UPDATE',
            [paymentId]
        );

        if (!payment) {
            throw new StatusTransitionError(`Payment ${paymentId} not found`);
        }

        const fromStatus = payment.status;

        // Check if transition is valid
        if (!isValidTransition(fromStatus, toStatus)) {
            throw new StatusTransitionError(
                `Invalid transition: ${fromStatus} -> ${toStatus}`
            );
        }

        // If same status, no-op
        if (fromStatus === toStatus) {
            logger.debug({ paymentId, status: fromStatus }, 'status-transition: no change needed');
            return payment;
        }

        // Update payment status
        const updated = await t.one(buildUpdateStatement(toStatus, options), [paymentId, toStatus]);

        // Create audit log entry within the transaction
        await createAuditLog(t, paymentId, fromStatus, toStatus, opsMetadata, userId, triggeredBy);

        logger.info({ 
            paymentId, 
            fromStatus, 
            toStatus,
            userId,
            triggeredBy
        }, 'status-transition: transition completed');

        // Emit event after transaction commits (outside the transaction)
        // We'll do this in a setImmediate to ensure transaction commits first
        setImmediate(() => {
            emitStatusEvent(paymentId, fromStatus, toStatus, opsMetadata);
        });

        return updated;
    });
};

const retryPayment = (paymentId, metadata = {}, userId = null, triggeredBy = 'user') =>
    transitionStatus(paymentId, 'pending', metadata, userId, triggeredBy, {
        clearGatewayChargeId: true
    });

const restartProcessingPayment = (paymentId, metadata = {}, userId = null, triggeredBy = 'user') =>
    transitionStatus(paymentId, 'pending', metadata, userId, triggeredBy, {
        clearGatewayChargeId: true
    });

/**
 * Get audit log for a payment
 */
const getAuditLog = async (paymentId) => {
    if (!paymentId) {
        throw new Error('paymentId is required');
    }

    return db.any(
        `SELECT 
            pal.*,
            u.email as user_email,
            u.name as user_name,
            u.role as user_role
         FROM payment_audit_log pal
         LEFT JOIN users u ON pal.user_id = u.id
         WHERE pal.payment_id = $1 
         ORDER BY pal.created_at ASC`,
        [paymentId]
    );
};

/**
 * Close Redis connections (for graceful shutdown)
 */
const closeConnections = async () => {
    try {
        await redisPublisher.quit();
        logger.info('status-transition: Redis publisher closed');
    } catch (err) {
        logger.error({ error: err.message }, 'status-transition: error closing connections');
    }
};

module.exports = {
    transitionStatus,
    retryPayment,
    restartProcessingPayment,
    getAuditLog,
    isValidTransition,
    emitStatusEvent,
    closeConnections,
    StatusTransitionError,
    ALLOWED_TRANSITIONS,
    OPERATION_SOURCE,
    classifyOperationSource,
    toOperationLabel
};
