const db = require('../../db');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');
const EventModel = require('../../db/models/event.model');

module.exports = {
    handleWebhook: async (req, reply) => {
        const event = req.body;

        if (!event?.id || !event?.data?.object?.id) {
            throw new Error('Invalid webhook structure');
        }

        const recorded = await EventModel.recordEvent(db, event.id, event);

        if (!recorded) {
            return reply.code(200).send();
        }

        await paymentOrchestrator.applyWebhookUpdate(
            event.data.object.id, 
            event.data.object.status
        );

        return reply.code(200).send();
    }
};