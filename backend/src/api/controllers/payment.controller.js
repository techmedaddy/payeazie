require('dotenv').config();

const idempotencyService = require('../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');
const metrics = require('../../utils/metrics');
const gatewayClient = require('../../utils/gateway-client');
const {
    ALL_STATUSES,
    REFUNDABLE_STATUSES,
    RETRYABLE_STATUSES,
    canTransition,
    canBeRefunded,
    canBeRetried
} = require('../../utils/payment-status');

const sendResponse = (reply, statusCode, payload) => reply.code(statusCode).send(payload);
const VALID_DEMO_OUTCOMES = new Set(['auto', 'success', 'failure']);
const VALID_PROCESSING_SPEEDS = new Set(['normal', 'slow']);
const RETRY_GUARDRAILS = Object.freeze({
    MAX_ATTEMPTS: 3,
    COOLDOWN_SECONDS: 30
});
const PROCESSING_GUARDRAILS = Object.freeze({
    STUCK_THRESHOLD_SECONDS: 60
});

const transformPaymentResponse = (payment) => {
    if (!payment) return payment;
    return {
        id: payment.id,
        orderId: payment.order_id,
        idempotencyKey: payment.idempotency_key,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        gatewayChargeId: payment.gateway_charge_id,
        userId: payment.user_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
        processing: buildProcessingState(payment)
    };
};

const getAuditSummary = (entry, metadata = {}) => {
    const actor = metadata.worker || entry.triggered_by || 'system';

    if (entry.to_status === 'processing') {
        if (metadata.action === 'stuck_restart') {
            return 'Manual recovery restarted this stuck payment and the charge worker resumed processing.';
        }
        if (metadata.retryAttempt) {
            return `Retry attempt ${metadata.retryAttempt} is now processing in the charge worker.`;
        }
        return 'Payment picked up by the charge worker and moved into processing.';
    }

    if (entry.to_status === 'succeeded') {
        if (metadata.action === 'stuck_reconcile') {
            return metadata.reason || 'Manual reconciliation confirmed the payment succeeded at the gateway.';
        }
        if (metadata.retryAttempt) {
            return metadata.reason || `Retry attempt ${metadata.retryAttempt} completed successfully.`;
        }
        return metadata.reason || 'Payment completed successfully after gateway confirmation.';
    }

    if (entry.to_status === 'failed') {
        if (metadata.action === 'stuck_reconcile') {
            return metadata.reason || 'Manual reconciliation confirmed the payment failed at the gateway.';
        }
        if (metadata.action === 'stuck_restart_failed') {
            return metadata.error || metadata.reason || 'Manual recovery could not restart this payment.';
        }
        if (metadata.retryAttempt) {
            return metadata.error || metadata.reason || `Retry attempt ${metadata.retryAttempt} failed.`;
        }
        return metadata.error || metadata.reason || 'Payment processing failed.';
    }

    if (entry.to_status === 'refunded') {
        return metadata.refundReason
            ? `Refund requested: ${metadata.refundReason}`
            : 'Payment was refunded and funds were returned to the customer.';
    }

    if (entry.to_status === 'pending') {
        if (metadata.action === 'stuck_restart') {
            return metadata.reason || 'Manual recovery reset this stuck payment and queued it for another processing attempt.';
        }
        if (metadata.action === 'retry') {
            return metadata.reason || `Retry attempt ${metadata.retryAttempt || 'next'} was queued for reprocessing.`;
        }
        return 'Payment intent was created and queued for processing.';
    }

    return `Status changed from ${entry.from_status || 'unknown'} to ${entry.to_status} by ${actor}.`;
};

const getOperationSource = (entry, metadata = {}) => {
    if (metadata.operationSource) {
        return metadata.operationSource;
    }

    if ((entry.triggered_by || 'system') === 'user') {
        return entry.user_role === 'admin' || metadata.actorRole === 'admin'
            ? 'admin_triggered'
            : 'user_triggered';
    }

    return 'automatic';
};

const getOperationLabel = (entry, metadata = {}) => {
    if (metadata.operationLabel) {
        return metadata.operationLabel;
    }

    const operationSource = getOperationSource(entry, metadata);

    if (operationSource === 'admin_triggered') {
        return 'Admin-triggered';
    }

    if (operationSource === 'user_triggered') {
        return 'User-triggered';
    }

    return 'Automatic';
};

const transformAuditEntry = (entry) => {
    const metadata = entry.metadata || {};
    const operationSource = getOperationSource(entry, metadata);
    const operationLabel = getOperationLabel(entry, metadata);

    return {
        id: entry.id,
        paymentId: entry.payment_id,
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        createdAt: entry.created_at,
        triggeredBy: entry.triggered_by || 'system',
        actor: entry.user_id
            ? {
                id: entry.user_id,
                name: entry.user_name || null,
                email: entry.user_email || null,
                role: entry.user_role || metadata.actorRole || null
            }
            : null,
        worker: metadata.worker || null,
        jobId: metadata.jobId || null,
        chargeId: metadata.chargeId || null,
        gatewayProvider: metadata.gatewayProvider || null,
        gatewayStatus: metadata.gatewayStatus || entry.to_status,
        failureCode: metadata.failureCode || null,
        failureReason: metadata.error || null,
        refundReason: metadata.refundReason || null,
        operationSource,
        operationLabel,
        summary: getAuditSummary(entry, metadata),
        metadata
    };
};

const getRetryAttemptsUsed = (auditLog = []) =>
    auditLog.filter((entry) => entry?.metadata?.action === 'retry' && entry?.toStatus === 'pending').length;

const getLatestRetryEntry = (auditLog = []) =>
    [...auditLog].reverse().find((entry) => entry?.metadata?.action === 'retry' && entry?.toStatus === 'pending') || null;

const getLatestFailureEntry = (auditLog = []) =>
    [...auditLog].reverse().find((entry) => entry?.toStatus === 'failed') || null;

const getLatestProcessingEntry = (auditLog = []) =>
    [...auditLog].reverse().find((entry) => entry?.toStatus === 'processing') || null;

const buildProcessingState = (payment, auditLog = []) => {
    const status = payment?.status;
    const rawStartedAt =
        getLatestProcessingEntry(auditLog)?.createdAt ||
        payment?.updated_at ||
        payment?.updatedAt ||
        null;
    const active = status === 'processing';
    const startedAt = active ? rawStartedAt : null;
    const startedAtMillis = startedAt ? new Date(startedAt).getTime() : null;
    const elapsedSeconds = Number.isFinite(startedAtMillis)
        ? Math.max(0, Math.floor((Date.now() - startedAtMillis) / 1000))
        : null;
    const isStuck = active && elapsedSeconds !== null
        ? elapsedSeconds >= PROCESSING_GUARDRAILS.STUCK_THRESHOLD_SECONDS
        : false;
    const gatewayChargeId = payment?.gateway_charge_id || payment?.gatewayChargeId || null;
    const canReconcile = active && isStuck && Boolean(gatewayChargeId);
    const canRestart = active && isStuck && !gatewayChargeId;

    let recoveryState = 'not_processing';
    let message = 'Recovery actions only apply to processing payments.';

    if (active && !isStuck) {
        recoveryState = 'healthy';
        message = 'This payment is still processing within the expected window.';
    } else if (canReconcile) {
        recoveryState = 'reconcile';
        message = 'The payment looks stuck. Reconcile with the gateway to confirm the final outcome.';
    } else if (canRestart) {
        recoveryState = 'restart';
        message = 'The payment looks stuck before a charge was recorded. Restart processing to try again safely.';
    }

    return {
        active,
        startedAt,
        elapsedSeconds,
        thresholdSeconds: PROCESSING_GUARDRAILS.STUCK_THRESHOLD_SECONDS,
        isStuck,
        hasGatewayCharge: Boolean(gatewayChargeId),
        stuckSince: active && isStuck && Number.isFinite(startedAtMillis)
            ? new Date(startedAtMillis + (PROCESSING_GUARDRAILS.STUCK_THRESHOLD_SECONDS * 1000)).toISOString()
            : null,
        recovery: {
            eligible: canReconcile || canRestart,
            state: recoveryState,
            canReconcile,
            canRestart,
            message
        }
    };
};

const getRetryState = (currentStatus, auditLog = []) => {
    const attemptsUsed = getRetryAttemptsUsed(auditLog);
    const attemptsRemaining = Math.max(0, RETRY_GUARDRAILS.MAX_ATTEMPTS - attemptsUsed);
    const latestFailure = getLatestFailureEntry(auditLog);
    const latestRetry = getLatestRetryEntry(auditLog);
    const availableAtMillis = latestFailure
        ? new Date(latestFailure.createdAt).getTime() + (RETRY_GUARDRAILS.COOLDOWN_SECONDS * 1000)
        : null;
    const availableAt = Number.isFinite(availableAtMillis) ? new Date(availableAtMillis).toISOString() : null;
    const coolingDown = Boolean(availableAtMillis && Date.now() < availableAtMillis);
    const eligibleStatus = canBeRetried(currentStatus);
    const eligible = eligibleStatus && attemptsRemaining > 0 && !coolingDown;

    let state = 'not_eligible';
    let message = 'Only failed payments can be retried.';

    if (eligible) {
        state = 'eligible';
        message = attemptsUsed === 0
            ? 'This failed payment can be reprocessed.'
            : `Retry attempt ${attemptsUsed + 1} is available.`;
    } else if (eligibleStatus && coolingDown) {
        state = 'cooldown';
        message = `Retry will unlock ${availableAt ? `at ${availableAt}` : 'after the cooldown window'}.`;
    } else if (eligibleStatus && attemptsRemaining === 0) {
        state = 'exhausted';
        message = `Retry limit reached. This payment has already used ${RETRY_GUARDRAILS.MAX_ATTEMPTS} retry attempts.`;
    } else if (currentStatus === 'processing') {
        message = 'Processing payments cannot be retried while work is still in flight. Use recovery actions if the payment looks stuck.';
    } else if (currentStatus === 'pending') {
        message = 'Pending payments are already queued for processing and do not need a retry.';
    } else if (currentStatus === 'succeeded') {
        message = 'Succeeded payments cannot be retried because the charge already completed.';
    } else if (currentStatus === 'refunded') {
        message = 'Refunded payments cannot be retried because the funds were already returned.';
    }

    return {
        eligible,
        state,
        retryableStatuses: RETRYABLE_STATUSES,
        attemptsUsed,
        attemptsRemaining,
        maxAttempts: RETRY_GUARDRAILS.MAX_ATTEMPTS,
        cooldownSeconds: RETRY_GUARDRAILS.COOLDOWN_SECONDS,
        availableAt,
        lastRetriedAt: latestRetry?.createdAt || null,
        message
    };
};

const getRefundState = (payment, auditLog = []) => {
    const latestRefund = [...auditLog].reverse().find((entry) => entry?.toStatus === 'refunded') || null;
    const refundEligible = canBeRefunded(payment.status);
    const hasGatewayCharge = Boolean(payment.gateway_charge_id || payment.gatewayChargeId);

    let state = 'not_eligible';
    let message = 'Only succeeded payments can be refunded.';

    if (latestRefund || payment.status === 'refunded') {
        state = 'refunded';
        message = 'This payment has already been refunded and cannot be refunded again.';
    } else if (refundEligible && hasGatewayCharge) {
        state = 'eligible';
        message = 'This payment can be refunded because it completed successfully.';
    } else if (refundEligible && !hasGatewayCharge) {
        state = 'blocked_missing_charge';
        message = 'Refunds are blocked until a gateway charge is recorded for this payment.';
    } else if (payment.status === 'failed') {
        message = 'Failed payments were never successfully captured, so there is nothing to refund.';
    } else if (payment.status === 'processing') {
        message = 'Wait for processing to finish before refunding this payment.';
    } else if (payment.status === 'pending') {
        message = 'Pending payments have not been charged yet and cannot be refunded.';
    }

    return {
        eligible: refundEligible && hasGatewayCharge && !latestRefund,
        state,
        refundableStatuses: REFUNDABLE_STATUSES,
        refundedAt: latestRefund?.createdAt || null,
        hasGatewayCharge,
        message
    };
};

const getRetryDemoOptions = (auditLog = []) => {
    const latestDemoMetadata = [...auditLog]
        .reverse()
        .map((entry) => entry?.metadata || {})
        .find((metadata) => metadata.demoOutcome || metadata.processingSpeed) || {};

    return {
        outcome: VALID_DEMO_OUTCOMES.has(latestDemoMetadata.demoOutcome)
            ? latestDemoMetadata.demoOutcome
            : 'auto',
        processingSpeed: VALID_PROCESSING_SPEEDS.has(latestDemoMetadata.processingSpeed)
            ? latestDemoMetadata.processingSpeed
            : 'normal'
    };
};

const buildPaymentDetailsResponse = (payment, auditLog = []) => {
    const response = transformPaymentResponse(payment);
    const transformedAuditLog = auditLog.map(transformAuditEntry);
    const latestActivity = transformedAuditLog[transformedAuditLog.length - 1] || null;
    const latestFailure = getLatestFailureEntry(transformedAuditLog);
    const processingEvent = getLatestProcessingEntry(transformedAuditLog);
    const latestRefund = [...transformedAuditLog].reverse().find((entry) => entry.toStatus === 'refunded') || null;
    const refundState = getRefundState(payment, transformedAuditLog);
    const retryState = getRetryState(response.status, transformedAuditLog);
    const processingState = buildProcessingState(payment, transformedAuditLog);

    return {
        ...response,
        gateway: {
            provider: latestActivity?.gatewayProvider || 'mock',
            chargeId: response.gatewayChargeId || latestActivity?.chargeId || null,
            lastKnownStatus: latestActivity?.gatewayStatus || response.status
        },
        processingDetails: processingEvent
            ? {
                startedAt: processingEvent.createdAt,
                worker: processingEvent.worker,
                jobId: processingEvent.jobId
            }
            : null,
        processing: processingState,
        failureDetails: latestFailure
            ? {
                reason: latestFailure.failureReason || latestFailure.summary,
                code: latestFailure.failureCode,
                worker: latestFailure.worker,
                jobId: latestFailure.jobId,
                failedAt: latestFailure.createdAt,
                chargeId: latestFailure.chargeId
            }
            : null,
        refundDetails: latestRefund
            ? {
                reason: latestRefund.refundReason || latestRefund.summary,
                refundedAt: latestRefund.createdAt,
                worker: latestRefund.worker,
                jobId: latestRefund.jobId,
                chargeId: latestRefund.chargeId,
                gatewayStatus: latestRefund.gatewayStatus,
                triggeredBy: latestRefund.triggeredBy,
                actor: latestRefund.actor
            }
            : null,
        refund: refundState,
        retry: retryState,
        latestActivity: latestActivity
            ? {
                summary: latestActivity.summary,
                createdAt: latestActivity.createdAt,
                triggeredBy: latestActivity.triggeredBy,
                operationSource: latestActivity.operationSource,
                operationLabel: latestActivity.operationLabel,
                worker: latestActivity.worker,
                jobId: latestActivity.jobId
            }
            : null,
        auditLog: transformedAuditLog
    };
};

const validateIntentFields = ({ orderId, amount, currency, idempotencyKey }) => {
    const errors = [];
    
    // Required field validation
    if (!orderId || typeof orderId !== 'string') {
        errors.push({ field: 'orderId', message: 'orderId is required and must be a string' });
    }
    
    if (amount === undefined || amount === null) {
        errors.push({ field: 'amount', message: 'amount is required' });
    } else if (typeof amount !== 'number') {
        errors.push({ field: 'amount', message: 'amount must be a number' });
    } else if (amount <= 0) {
        errors.push({ field: 'amount', message: 'amount must be greater than 0' });
    }
    
    if (!currency || typeof currency !== 'string') {
        errors.push({ field: 'currency', message: 'currency is required and must be a string' });
    } else if (currency.length !== 3) {
        errors.push({ field: 'currency', message: 'currency must be exactly 3 characters (e.g., USD, EUR)' });
    }
    
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        errors.push({ field: 'idempotency-key', message: 'Idempotency-Key header is required' });
    }
    
    return errors;
};

const normalizeDemoOptions = (demo) => {
    if (!demo || typeof demo !== 'object') {
        return {
            outcome: 'auto',
            processingSpeed: 'normal'
        };
    }

    const outcome = VALID_DEMO_OUTCOMES.has(demo.outcome) ? demo.outcome : 'auto';
    const processingSpeed = VALID_PROCESSING_SPEEDS.has(demo.processingSpeed)
        ? demo.processingSpeed
        : 'normal';

    return {
        outcome,
        processingSpeed
    };
};

const createPaymentIntent = async (req, reply) => {
    // Log incoming request details
    const logger = require('../../utils/logger');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 CREATE PAYMENT INTENT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Request User:', JSON.stringify(req.user, null, 2));
    console.log('📋 User ID:', req.user?.id);
    console.log('📋 User Email:', req.user?.email);
    console.log('📋 User Role:', req.user?.role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    logger.info({
        body: req.body,
        headers: {
            'idempotency-key': req.headers['idempotency-key'],
            'content-type': req.headers['content-type']
        },
        user: req.user
    }, 'createPaymentIntent: incoming request');

    const { orderId, amount, currency, demo } = req.body || {};
    const idempotencyKey = req.headers['idempotency-key'];
    const demoOptions = normalizeDemoOptions(demo);
    
    logger.debug({
        orderId,
        amount,
        currency,
        idempotencyKey,
        amountType: typeof amount
    }, 'createPaymentIntent: extracted fields');

    const validationErrors = validateIntentFields({ orderId, amount, currency, idempotencyKey });

    if (validationErrors.length > 0) {
        logger.warn({ errors: validationErrors }, 'createPaymentIntent: validation failed');
        return sendResponse(reply, 400, { 
            error: 'Validation failed', 
            details: validationErrors 
        });
    }

    try {
        logger.debug({ orderId, idempotencyKey, userId: req.user?.id, demoOptions }, 'createPaymentIntent: calling idempotency.resolve');
        const record = await idempotencyService.resolve(orderId, idempotencyKey, amount, currency, req.user?.id, demoOptions);
        
        // Record metrics
        metrics.recordPaymentCreated();
        metrics.recordPaymentStatus(record.status);
        
        logger.info({ paymentId: record.id, status: record.status, userId: req.user?.id }, 'createPaymentIntent: success');
        const statusCode = record.status === 'processing' ? 202 : 200;
        const response = transformPaymentResponse(record);
        return sendResponse(reply, statusCode, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            name: err.name,
            statusCode: err.statusCode,
            orderId,
            idempotencyKey
        }, 'createPaymentIntent: error caught');
        
        // Return specific error for idempotency conflicts
        if (err.name === 'IdempotencyConflictError') {
            return sendResponse(reply, 409, { error: err.message });
        }
        
        // Return specific error for duplicate order attempts
        if (err.name === 'DuplicateOrderError') {
            return sendResponse(reply, 422, { 
                error: 'Duplicate order', 
                message: err.message,
                existingPaymentId: err.existingPaymentId,
                existingStatus: err.existingStatus
            });
        }
        
        return sendResponse(reply, 500, { error: 'Unable to create payment intent', details: err.message });
    }
};

const getPaymentStatus = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId, userId: req.user?.id }, 'getPaymentStatus: incoming request');

    if (!paymentId) {
        logger.warn('getPaymentStatus: missing paymentId');
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        logger.debug({ paymentId }, 'getPaymentStatus: calling orchestrator.fetchStatus');
        const payment = await paymentOrchestrator.fetchStatus(paymentId);
        
        if (!payment) {
            logger.warn({ paymentId }, 'getPaymentStatus: payment not found');
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }
        
        // Check ownership (unless admin)
        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            logger.warn({ 
                paymentId, 
                userId: req.user.id, 
                paymentUserId: payment.user_id 
            }, 'getPaymentStatus: unauthorized access attempt');
            return sendResponse(reply, 403, { error: 'Forbidden', message: 'You do not have permission to access this payment' });
        }
        
        const auditLog = await statusTransition.getAuditLog(paymentId);

        logger.info({ paymentId, status: payment.status, auditCount: auditLog.length }, 'getPaymentStatus: success');
        const response = buildPaymentDetailsResponse(payment, auditLog);
        return sendResponse(reply, 200, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId
        }, 'getPaymentStatus: error caught');
        return sendResponse(reply, 500, { error: 'Unable to fetch payment status' });
    }
};

const getPaymentAuditLog = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId, userId: req.user?.id }, 'getPaymentAuditLog: incoming request');

    if (!paymentId) {
        logger.warn('getPaymentAuditLog: missing paymentId');
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        // First, fetch payment to check ownership
        const payment = await paymentOrchestrator.fetchStatus(paymentId);
        
        if (!payment) {
            logger.warn({ paymentId }, 'getPaymentAuditLog: payment not found');
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }
        
        // Check ownership (unless admin)
        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            logger.warn({ 
                paymentId, 
                userId: req.user.id, 
                paymentUserId: payment.user_id 
            }, 'getPaymentAuditLog: unauthorized access attempt');
            return sendResponse(reply, 403, { error: 'Forbidden', message: 'You do not have permission to access this payment' });
        }
        
        const auditLog = await statusTransition.getAuditLog(paymentId);
        logger.info({ paymentId, count: auditLog.length }, 'getPaymentAuditLog: success');
        return sendResponse(reply, 200, { paymentId, auditLog: auditLog.map(transformAuditEntry) });
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId
        }, 'getPaymentAuditLog: error caught');
        return sendResponse(reply, 500, { error: 'Unable to fetch audit log' });
    }
};

const refundPayment = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};
    const refundReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';

    logger.info({ paymentId, userId: req.user?.id }, 'refundPayment: incoming request');

    if (!paymentId) {
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    if (!refundReason || refundReason.length < 5) {
        return sendResponse(reply, 400, {
            error: 'Refund reason is required',
            message: 'Provide a refund reason with at least 5 characters.'
        });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);

        if (!payment) {
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }

        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            return sendResponse(reply, 403, {
                error: 'Forbidden',
                message: 'You do not have permission to refund this payment'
            });
        }

        if (!canBeRefunded(payment.status)) {
            return sendResponse(reply, 409, {
                error: 'Refund not allowed',
                message: `Payments in status "${payment.status}" cannot be refunded`,
                currentStatus: payment.status,
                refundableStatuses: REFUNDABLE_STATUSES
            });
        }

        if (!payment.gateway_charge_id) {
            return sendResponse(reply, 409, {
                error: 'Refund not available',
                message: 'This payment does not have a gateway charge to refund'
            });
        }

        const gatewayRefund = await gatewayClient.refund(payment.gateway_charge_id);

        const updatedPayment = await paymentOrchestrator.transitionStatus(
            paymentId,
            'refunded',
            {
                chargeId: payment.gateway_charge_id,
                refundId: gatewayRefund.refundId,
                gatewayProvider: gatewayRefund.provider || 'mock',
                gatewayStatus: gatewayRefund.status,
                actorRole: req.user?.role || 'user',
                refundReason,
                reason: `Refund requested by ${req.user?.email || req.user?.id || 'user'}.`
            },
            req.user?.id || null,
            'user'
        );

        const auditLog = await statusTransition.getAuditLog(paymentId);
        const response = buildPaymentDetailsResponse(updatedPayment, auditLog);

        logger.info({
            paymentId,
            userId: req.user?.id,
            refundId: gatewayRefund.refundId
        }, 'refundPayment: success');

        return sendResponse(reply, 200, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId,
            userId: req.user?.id
        }, 'refundPayment: error caught');

        if (err.name === 'StatusTransitionError' || err.name === 'InvalidTransitionError') {
            return sendResponse(reply, 409, {
                error: 'Refund not allowed',
                message: err.message
            });
        }

        return sendResponse(reply, 500, {
            error: 'Unable to refund payment',
            details: err.message
        });
    }
};

const retryPayment = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId, userId: req.user?.id }, 'retryPayment: incoming request');

    if (!paymentId) {
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);

        if (!payment) {
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }

        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            return sendResponse(reply, 403, {
                error: 'Forbidden',
                message: 'You do not have permission to retry this payment'
            });
        }

        const auditLog = await statusTransition.getAuditLog(paymentId);
        const transformedAuditLog = auditLog.map(transformAuditEntry);
        const retryState = getRetryState(payment.status, transformedAuditLog);

        if (!canBeRetried(payment.status)) {
            return sendResponse(reply, 409, {
                error: 'Retry not allowed',
                message: `Payments in status "${payment.status}" cannot be retried`,
                currentStatus: payment.status,
                retry: retryState
            });
        }

        if (!retryState.eligible) {
            return sendResponse(reply, 409, {
                error: 'Retry not allowed',
                message: retryState.message,
                currentStatus: payment.status,
                retry: retryState
            });
        }

        const nextRetryAttempt = retryState.attemptsUsed + 1;
        const retryDemoOptions = getRetryDemoOptions(auditLog);
        const retryMetadata = {
            action: 'retry',
            actorRole: req.user?.role || 'user',
            retryAttempt: nextRetryAttempt,
            previousChargeId: payment.gateway_charge_id || null,
            previousFailureReason: transformedAuditLog
                .slice()
                .reverse()
                .find((entry) => entry.toStatus === 'failed')
                ?.failureReason || null,
            demoOutcome: retryDemoOptions.outcome,
            processingSpeed: retryDemoOptions.processingSpeed,
            reason: `Retry attempt ${nextRetryAttempt} requested by ${req.user?.email || req.user?.id || 'user'}.`
        };

        const updatedPayment = await paymentOrchestrator.retryPayment(
            paymentId,
            retryMetadata,
            req.user?.id || null,
            'user'
        );

        try {
            await idempotencyService.enqueueChargeJob(paymentId, retryDemoOptions, {
                action: 'retry',
                retryAttempt: nextRetryAttempt
            });
        } catch (queueErr) {
            logger.error({
                paymentId,
                retryAttempt: nextRetryAttempt,
                error: queueErr.message
            }, 'retryPayment: enqueue failed, reverting payment to failed');

            await paymentOrchestrator.transitionStatus(paymentId, 'failed', {
                action: 'retry_enqueue_failed',
                retryAttempt: nextRetryAttempt,
                error: queueErr.message,
                reason: 'Retry request could not be queued for processing.'
            }, null, 'system');

            throw queueErr;
        }

        const refreshedAuditLog = await statusTransition.getAuditLog(paymentId);
        const response = buildPaymentDetailsResponse(updatedPayment, refreshedAuditLog);

        logger.info({
            paymentId,
            userId: req.user?.id,
            retryAttempt: nextRetryAttempt
        }, 'retryPayment: success');

        return sendResponse(reply, 202, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId,
            userId: req.user?.id
        }, 'retryPayment: error caught');

        if (err.name === 'StatusTransitionError' || err.name === 'InvalidTransitionError') {
            return sendResponse(reply, 409, {
                error: 'Retry not allowed',
                message: err.message
            });
        }

        return sendResponse(reply, 500, {
            error: 'Unable to retry payment',
            details: err.message
        });
    }
};

const reconcileProcessingPayment = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId, userId: req.user?.id }, 'reconcileProcessingPayment: incoming request');

    if (!paymentId) {
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);

        if (!payment) {
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }

        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            return sendResponse(reply, 403, {
                error: 'Forbidden',
                message: 'You do not have permission to reconcile this payment'
            });
        }

        const auditLog = await statusTransition.getAuditLog(paymentId);
        const transformedAuditLog = auditLog.map(transformAuditEntry);
        const processingState = buildProcessingState(payment, transformedAuditLog);

        if (payment.status !== 'processing') {
            return sendResponse(reply, 409, {
                error: 'Reconciliation not allowed',
                message: `Payments in status "${payment.status}" cannot be reconciled manually`,
                processing: processingState
            });
        }

        if (!processingState.isStuck) {
            return sendResponse(reply, 409, {
                error: 'Reconciliation not allowed',
                message: 'This payment is still within the normal processing window.',
                processing: processingState
            });
        }

        if (!payment.gateway_charge_id) {
            return sendResponse(reply, 409, {
                error: 'Reconciliation not available',
                message: 'No gateway charge is available to reconcile. Restart processing instead.',
                processing: processingState
            });
        }

        const remote = await gatewayClient.lookup(payment.gateway_charge_id);

        if (!remote?.status) {
            return sendResponse(reply, 502, {
                error: 'Gateway reconciliation failed',
                message: 'The gateway did not return a status for this charge.'
            });
        }

        if (remote.status === payment.status) {
            const response = buildPaymentDetailsResponse(payment, auditLog);
            return sendResponse(reply, 200, {
                ...response,
                processing: {
                    ...response.processing,
                    recovery: {
                        ...response.processing?.recovery,
                        message: 'Gateway still reports this payment as processing.'
                    }
                }
            });
        }

        if (!canTransition(payment.status, remote.status)) {
            return sendResponse(reply, 409, {
                error: 'Reconciliation not allowed',
                message: `Gateway returned status "${remote.status}", which cannot be applied from "${payment.status}".`
            });
        }

        const updatedPayment = await paymentOrchestrator.transitionStatus(paymentId, remote.status, {
            action: 'stuck_reconcile',
            actorRole: req.user?.role || 'user',
            chargeId: payment.gateway_charge_id,
            gatewayProvider: remote.provider || 'mock',
            gatewayStatus: remote.status,
            reason: `Manual reconciliation confirmed gateway status: ${remote.status}.`
        }, req.user?.id || null, 'user');

        const refreshedAuditLog = await statusTransition.getAuditLog(paymentId);
        const response = buildPaymentDetailsResponse(updatedPayment, refreshedAuditLog);

        logger.info({
            paymentId,
            userId: req.user?.id,
            finalStatus: remote.status
        }, 'reconcileProcessingPayment: success');

        return sendResponse(reply, 200, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId,
            userId: req.user?.id
        }, 'reconcileProcessingPayment: error caught');

        if (err.name === 'StatusTransitionError' || err.name === 'InvalidTransitionError') {
            return sendResponse(reply, 409, {
                error: 'Reconciliation not allowed',
                message: err.message
            });
        }

        return sendResponse(reply, 500, {
            error: 'Unable to reconcile payment',
            details: err.message
        });
    }
};

const restartProcessingPayment = async (req, reply) => {
    const logger = require('../../utils/logger');
    const statusTransition = require('../../core/status-transition/status-transition.service');
    const { paymentId } = req.params || {};

    logger.info({ paymentId, userId: req.user?.id }, 'restartProcessingPayment: incoming request');

    if (!paymentId) {
        return sendResponse(reply, 400, { error: 'paymentId is required' });
    }

    try {
        const payment = await paymentOrchestrator.fetchStatus(paymentId);

        if (!payment) {
            return sendResponse(reply, 404, { error: 'Payment not found' });
        }

        if (req.user && req.user.role !== 'admin' && payment.user_id !== req.user.id) {
            return sendResponse(reply, 403, {
                error: 'Forbidden',
                message: 'You do not have permission to restart this payment'
            });
        }

        const auditLog = await statusTransition.getAuditLog(paymentId);
        const transformedAuditLog = auditLog.map(transformAuditEntry);
        const processingState = buildProcessingState(payment, transformedAuditLog);

        if (payment.status !== 'processing') {
            return sendResponse(reply, 409, {
                error: 'Restart not allowed',
                message: `Payments in status "${payment.status}" cannot be restarted`,
                processing: processingState
            });
        }

        if (!processingState.isStuck) {
            return sendResponse(reply, 409, {
                error: 'Restart not allowed',
                message: 'This payment is still within the normal processing window.',
                processing: processingState
            });
        }

        if (payment.gateway_charge_id) {
            return sendResponse(reply, 409, {
                error: 'Restart not available',
                message: 'A gateway charge already exists for this payment. Reconcile it instead of restarting.',
                processing: processingState
            });
        }

        const restartMetadata = {
            action: 'stuck_restart',
            actorRole: req.user?.role || 'user',
            elapsedSeconds: processingState.elapsedSeconds,
            reason: `Manual recovery restarted this payment after ${processingState.elapsedSeconds || 0}s without a gateway charge.`
        };

        const retryDemoOptions = getRetryDemoOptions(auditLog);
        const updatedPayment = await paymentOrchestrator.restartProcessingPayment(
            paymentId,
            restartMetadata,
            req.user?.id || null,
            'user'
        );

        try {
            await idempotencyService.enqueueChargeJob(paymentId, retryDemoOptions, {
                action: 'stuck_restart'
            });
        } catch (queueErr) {
            logger.error({
                paymentId,
                error: queueErr.message
            }, 'restartProcessingPayment: enqueue failed, marking payment failed');

            await paymentOrchestrator.transitionStatus(paymentId, 'failed', {
                action: 'stuck_restart_failed',
                error: queueErr.message,
                reason: 'Manual recovery could not requeue the payment.'
            }, null, 'system');

            throw queueErr;
        }

        const refreshedAuditLog = await statusTransition.getAuditLog(paymentId);
        const response = buildPaymentDetailsResponse(updatedPayment, refreshedAuditLog);

        logger.info({
            paymentId,
            userId: req.user?.id
        }, 'restartProcessingPayment: success');

        return sendResponse(reply, 202, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            paymentId,
            userId: req.user?.id
        }, 'restartProcessingPayment: error caught');

        if (err.name === 'StatusTransitionError' || err.name === 'InvalidTransitionError') {
            return sendResponse(reply, 409, {
                error: 'Restart not allowed',
                message: err.message
            });
        }

        return sendResponse(reply, 500, {
            error: 'Unable to restart payment processing',
            details: err.message
        });
    }
};

/**
 * List payments with pagination and optional status filter
 * Query params: page (default: 1), limit (default: 20, max: 100), status (optional)
 */
const listPayments = async (req, reply) => {
    const logger = require('../../utils/logger');
    const db = require('../../db');
    
    // Extract and validate query parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const status = req.query.status || null;
    const offset = (page - 1) * limit;
    
    logger.info({ page, limit, status }, 'listPayments: incoming request');
    
    // Validate status filter if provided
    const validStatuses = ALL_STATUSES;
    if (status && !validStatuses.includes(status)) {
        return sendResponse(reply, 400, { 
            error: 'Invalid status filter',
            details: `status must be one of: ${validStatuses.join(', ')}`
        });
    }
    
    try {
        // Build query with user_id filter and optional status filter
        let countQuery = 'SELECT COUNT(*) as total FROM payments';
        let dataQuery = 'SELECT * FROM payments';
        const params = [];
        const conditions = [];
        
        // Filter by user_id unless user is admin
        if (req.user && req.user.role !== 'admin') {
            conditions.push('user_id = $' + (params.length + 1));
            params.push(req.user.id);
        }
        
        if (status) {
            conditions.push('status = $' + (params.length + 1));
            params.push(status);
        }
        
        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            countQuery += whereClause;
            dataQuery += whereClause;
        }
        
        dataQuery += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);
        
        // Execute queries
        const [countResult, payments] = await Promise.all([
            db.one(countQuery, params.slice(0, -2)), // Count query doesn't need limit/offset
            db.any(dataQuery, params)
        ]);
        
        const total = parseInt(countResult.total);
        const totalPages = Math.ceil(total / limit);
        
        logger.info({ 
            total, 
            page, 
            totalPages, 
            returned: payments.length,
            userId: req.user?.id,
            isAdmin: req.user?.role === 'admin'
        }, 'listPayments: success');
        
        return sendResponse(reply, 200, {
            data: payments.map(transformPaymentResponse),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            filters: {
                status: status || 'all'
            }
        });
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            page,
            limit,
            status,
            name: err.name,
            code: err.code
        }, 'listPayments: error caught');
        return sendResponse(reply, 500, { error: 'Unable to list payments', details: err.message });
    }
};

/**
 * Create payment (simplified version of createPaymentIntent)
 * Uses auto-generated idempotency key if not provided
 */
const createPayment = async (req, reply) => {
    const logger = require('../../utils/logger');
    const { v4: uuidv4 } = require('uuid');
    
    const { orderId, amount, currency, demo } = req.body || {};
    let idempotencyKey = req.headers['idempotency-key'];
    const demoOptions = normalizeDemoOptions(demo);
    
    // Auto-generate idempotency key if not provided (for simple POST /api/payments)
    if (!idempotencyKey) {
        idempotencyKey = uuidv4();
        logger.debug({ idempotencyKey }, 'createPayment: auto-generated idempotency key');
    }
    
    logger.info({
        orderId,
        amount,
        currency,
        hasIdempotencyKey: !!req.headers['idempotency-key'],
        userId: req.user?.id
    }, 'createPayment: incoming request');
    
    // Validate fields (idempotency key is now always present)
    const validationErrors = validateIntentFields({ orderId, amount, currency, idempotencyKey });
    
    if (validationErrors.length > 0) {
        logger.warn({ errors: validationErrors }, 'createPayment: validation failed');
        return sendResponse(reply, 400, { 
            error: 'Validation failed', 
            details: validationErrors 
        });
    }
    
    try {
        const record = await idempotencyService.resolve(orderId, idempotencyKey, amount, currency, req.user?.id, demoOptions);
        
        metrics.recordPaymentCreated();
        metrics.recordPaymentStatus(record.status);
        
        logger.info({ 
            paymentId: record.id, 
            status: record.status,
            idempotencyKey,
            userId: req.user?.id
        }, 'createPayment: success');
        
        const response = transformPaymentResponse(record);
        return sendResponse(reply, 201, response);
    } catch (err) {
        logger.error({
            error: err.message,
            stack: err.stack,
            orderId,
            userId: req.user?.id
        }, 'createPayment: error caught');
        
        if (err.name === 'IdempotencyConflictError') {
            return sendResponse(reply, 409, { 
                error: 'Idempotency conflict',
                details: err.message 
            });
        }
        
        // Return specific error for duplicate order attempts
        if (err.name === 'DuplicateOrderError') {
            return sendResponse(reply, 422, { 
                error: 'Duplicate order',
                message: err.message,
                existingPaymentId: err.existingPaymentId,
                existingStatus: err.existingStatus
            });
        }
        
        return sendResponse(reply, 500, { 
            error: 'Unable to create payment', 
            details: err.message 
        });
    }
};

module.exports = {
    createPaymentIntent,
    createPayment,
    getPaymentStatus,
    getPaymentAuditLog,
    listPayments,
    refundPayment,
    retryPayment,
    reconcileProcessingPayment,
    restartProcessingPayment
};
