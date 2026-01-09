const auditController = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Register audit log routes
 * @param {FastifyInstance} fastify
 * @param {object} options
 */
async function auditRoutes(fastify, options) {
    // Get audit logs (paginated)
    // Regular users see their own audit logs
    // Admin users can see all audit logs or filter by user_id
    fastify.get(
        '/audit-logs',
        { preHandler: [authenticate] },
        auditController.getAuditLogs
    );

    // Get audit logs for a specific payment
    fastify.get(
        '/audit-logs/:paymentId',
        { preHandler: [authenticate] },
        auditController.getPaymentAuditLogs
    );
}

module.exports = auditRoutes;
