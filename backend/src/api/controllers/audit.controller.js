const paymentAuditModel = require('../../db/models/payment_audit.model');
const logger = require('../../utils/logger');
const { canAccessAnyPayment } = require('../../utils/roles');

/**
 * Get audit logs for the authenticated user's payments
 * Regular users only see their own audit logs
 * Admin users can see all audit logs
 */
const getAuditLogs = async (request, reply) => {
    try {
        const user = request.user;
        
        if (!user) {
            return reply.code(401).send({
                success: false,
                error: 'Unauthorized'
            });
        }

        // Parse pagination params
        const page = parseInt(request.query.page) || 1;
        const limit = parseInt(request.query.limit) || 50;
        const offset = (page - 1) * limit;

        // Validate pagination params
        if (page < 1 || limit < 1 || limit > 100) {
            return reply.code(400).send({
                success: false,
                error: 'Invalid pagination parameters'
            });
        }

        let logs, totalCount;

        // Admin users can see all audit logs
        if (canAccessAnyPayment(user)) {
            // Filter by user_id if provided in query
            const filterUserId = request.query.user_id;
            
            if (filterUserId) {
                logs = await paymentAuditModel.getAuditLogsByUser(filterUserId, limit, offset);
                totalCount = await paymentAuditModel.countAuditLogsByUser(filterUserId);
            } else {
                logs = await paymentAuditModel.getAllAuditLogs(limit, offset);
                totalCount = await paymentAuditModel.countAllAuditLogs();
            }
        } else {
            // Regular users only see their own audit logs
            logs = await paymentAuditModel.getAuditLogsByUser(user.id, limit, offset);
            totalCount = await paymentAuditModel.countAuditLogsByUser(user.id);
        }

        const totalPages = Math.ceil(totalCount / limit);

        logger.info({ 
            userId: user.id, 
            role: user.role,
            page,
            limit,
            totalCount
        }, 'audit-logs: fetched audit logs');

        return reply.send({
            success: true,
            data: {
                logs,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        logger.error({ 
            error: error.message,
            userId: request.user?.id
        }, 'audit-logs: failed to fetch audit logs');
        
        return reply.code(500).send({
            success: false,
            error: 'Failed to fetch audit logs'
        });
    }
};

/**
 * Get audit logs for a specific payment
 * Users can only see audit logs for their own payments
 * Admin users can see audit logs for any payment
 */
const getPaymentAuditLogs = async (request, reply) => {
    try {
        const user = request.user;
        const { paymentId } = request.params;
        
        if (!user) {
            return reply.code(401).send({
                success: false,
                error: 'Unauthorized'
            });
        }

        if (!paymentId) {
            return reply.code(400).send({
                success: false,
                error: 'Payment ID is required'
            });
        }

        // Get the audit logs
        const logs = await paymentAuditModel.getAuditLog(paymentId);

        if (!logs || logs.length === 0) {
            return reply.code(404).send({
                success: false,
                error: 'No audit logs found for this payment'
            });
        }

        // Check authorization (unless admin)
        if (!canAccessAnyPayment(user)) {
            // Verify the payment belongs to the user
            const firstLog = logs[0];
            if (firstLog.user_id && firstLog.user_id !== user.id) {
                return reply.code(403).send({
                    success: false,
                    error: 'Forbidden'
                });
            }
        }

        logger.info({ 
            userId: user.id, 
            paymentId,
            logCount: logs.length
        }, 'audit-logs: fetched payment audit logs');

        return reply.send({
            success: true,
            data: logs
        });
    } catch (error) {
        logger.error({ 
            error: error.message,
            userId: request.user?.id,
            paymentId: request.params.paymentId
        }, 'audit-logs: failed to fetch payment audit logs');
        
        return reply.code(500).send({
            success: false,
            error: 'Failed to fetch payment audit logs'
        });
    }
};

module.exports = {
    getAuditLogs,
    getPaymentAuditLogs
};
