const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');

module.exports = async function (fastify, opts) {
    fastify.post('/intent', paymentController.createIntent);
    fastify.post('/webhook', webhookController.handleWebhook);
};