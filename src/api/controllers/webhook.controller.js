const db = require('../../db');
const paymentOrchestrator = require('../../core/orchestrator/payment.orchestrator');

const insertEvent = (eventId, payload) => {
    return db.oneOrNone(
        `INSERT INTO gateway_events(event_id, payload)
         VALUES($1, $2)
         ON CONFLICT(event_id) DO NOTHING
         RETURNING event_id` ,
        [eventId, payload]
    );
};

const applyStatusUpdate = async ({ paymentId, chargeId, status }) => {
    if (!paymentId || !status) {
        return null;
    }
    if (typeof paymentOrchestrator.applyWebhook === 'function') {
        return paymentOrchestrator.applyWebhook({ paymentId, chargeId, status });
    }
    if (typeof paymentOrchestrator.applyGatewayResult === 'function') {
        return paymentOrchestrator.applyGatewayResult(paymentId, { id: chargeId, status });
    }
    return null;
};

const handleWebhook = async (payload) => {
    const eventId = payload?.id;
    const charge = payload?.data?.object;
    const chargeId = charge?.id;
    const status = charge?.status;
    const paymentId = charge?.metadata?.paymentId;

    if (!eventId || !chargeId) {
        return { ok: true, deduped: true };
    }

    const recorded = await insertEvent(eventId, payload);

    if (!recorded) {
        return { ok: true, deduped: true };
    }

    await applyStatusUpdate({ paymentId, chargeId, status });
    return { ok: true, deduped: false };
};

module.exports = {
    handleWebhook
};