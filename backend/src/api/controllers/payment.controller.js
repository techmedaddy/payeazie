require('dotenv').config();

const idempotencyService = require('../../core/idempotency/idempotency.service');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');
const metrics = require('../../utils/metrics');

const sendResponse = (reply, statusCode, payload) => reply.code(statusCode).send(payload);
const VALID_DEMO_OUTCOMES = new Set(['auto', 'success', 'failure']);
const VALID_PROCESSING_SPEEDS = new Set(['normal', 'slow']);

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
        updatedAt: payment.updated_at
    };
};

const getAuditSummary = (entry, metadata = {}) => {
    const actor = metadata.worker || entry.triggered_by || 'system';

    if (entry.to_status === 'processing') {
        return 'Payment picked up by the charge worker and moved into processing.';
    }

    if (entry.to_status === 'succeeded') {
        return metadata.reason || 'Payment completed successfully after gateway confirmation.';
    }

    if (entry.to_status === 'failed') {
        return metadata.error || metadata.reason || 'Payment processing failed.';
    }

    if (entry.to_status === 'pending') {
        return 'Payment intent was created and queued for processing.';
    }

    return `Status changed from ${entry.from_status || 'unknown'} to ${entry.to_status} by ${actor}.`;
};

const transformAuditEntry = (entry) => {
    const metadata = entry.metadata || {};

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
                email: entry.user_email || null
            }
            : null,
        worker: metadata.worker || null,
        jobId: metadata.jobId || null,
        chargeId: metadata.chargeId || null,
        gatewayProvider: metadata.gatewayProvider || null,
        gatewayStatus: metadata.gatewayStatus || entry.to_status,
        failureCode: metadata.failureCode || null,
        failureReason: metadata.error || null,
        summary: getAuditSummary(entry, metadata),
        metadata
    };
};

const buildPaymentDetailsResponse = (payment, auditLog = []) => {
    const response = transformPaymentResponse(payment);
    const transformedAuditLog = auditLog.map(transformAuditEntry);
    const latestActivity = transformedAuditLog[transformedAuditLog.length - 1] || null;
    const latestFailure = [...transformedAuditLog].reverse().find((entry) => entry.toStatus === 'failed') || null;
    const processingEvent = transformedAuditLog.find((entry) => entry.toStatus === 'processing') || null;

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
        latestActivity: latestActivity
            ? {
                summary: latestActivity.summary,
                createdAt: latestActivity.createdAt,
                triggeredBy: latestActivity.triggeredBy,
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
    const validStatuses = ['pending', 'processing', 'succeeded', 'failed', 'refunded'];
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
    listPayments
};
