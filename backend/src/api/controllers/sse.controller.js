const Redis = require('ioredis');
const logger = require('../../utils/logger');

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
    throw new Error('REDIS_URL is required for SSE controller');
}

// Create Redis subscriber for listening to status events
const createRedisSubscriber = () => {
    const subscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });

    subscriber.on('error', (err) => {
        logger.error({ error: err.message }, 'sse: Redis subscriber error');
    });

    subscriber.on('connect', () => {
        logger.info('sse: Redis subscriber connected');
    });

    return subscriber;
};

/**
 * SSE endpoint to stream payment status updates
 * Client connects to GET /api/payments/:paymentId/stream
 */
const streamPaymentStatus = async (req, reply) => {
    const { paymentId } = req.params;

    if (!paymentId) {
        return reply.code(400).send({ error: 'paymentId is required' });
    }

    logger.info({ paymentId }, 'sse: client connected');

    // Set SSE headers
    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
    });

    // Create a dedicated Redis subscriber for this connection
    const subscriber = createRedisSubscriber();
    const channel = `payment:${paymentId}:status`;

    // Subscribe to payment-specific channel
    await subscriber.subscribe(channel, (err) => {
        if (err) {
            logger.error({ error: err.message, paymentId }, 'sse: failed to subscribe');
            reply.raw.end();
        } else {
            logger.info({ paymentId, channel }, 'sse: subscribed to channel');
        }
    });

    // Handle incoming messages
    subscriber.on('message', (chan, message) => {
        try {
            const event = JSON.parse(message);
            
            // Send SSE formatted message
            const sseData = `data: ${JSON.stringify(event)}\n\n`;
            reply.raw.write(sseData);
            
            logger.debug({ 
                paymentId, 
                fromStatus: event.fromStatus, 
                toStatus: event.toStatus 
            }, 'sse: event sent to client');
            
            // If payment reached a final status, close the connection
            if (event.toStatus === 'succeeded' || event.toStatus === 'failed') {
                logger.info({ paymentId, finalStatus: event.toStatus }, 'sse: final status reached, closing connection');
                setTimeout(() => {
                    reply.raw.end();
                }, 1000); // Give client time to receive final message
            }
        } catch (err) {
            logger.error({ error: err.message, paymentId }, 'sse: error processing message');
        }
    });

    // Send keep-alive ping every 30 seconds
    const keepAliveInterval = setInterval(() => {
        reply.raw.write(': ping\n\n');
    }, 30000);

    // Handle client disconnect
    req.raw.on('close', () => {
        logger.info({ paymentId }, 'sse: client disconnected');
        clearInterval(keepAliveInterval);
        subscriber.unsubscribe(channel);
        subscriber.quit();
    });

    // Handle server errors
    reply.raw.on('error', (err) => {
        logger.error({ error: err.message, paymentId }, 'sse: connection error');
        clearInterval(keepAliveInterval);
        subscriber.unsubscribe(channel);
        subscriber.quit();
    });
};

module.exports = {
    streamPaymentStatus
};
