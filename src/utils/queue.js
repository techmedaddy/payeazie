require('dotenv').config();

const { Queue, Worker } = require('bullmq');
const logger = require('./logger');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required for BullMQ');
}

const connectionOptions = { connection: { url: redisUrl } };
const validQueues = new Set(['payment_charge', 'payment_reconcile']);

const assertQueueName = (name) => {
    if (!validQueues.has(name)) {
        throw new Error(`Queue name must be one of: ${Array.from(validQueues).join(', ')}`);
    }
    if (name.includes(':') || name.includes(' ')) {
        throw new Error('Queue names cannot contain colons or spaces');
    }
};

const createQueue = (name) => {
    assertQueueName(name);
    return new Queue(name, connectionOptions);
};

const createWorker = (name, processor) => {
    assertQueueName(name);
    const worker = new Worker(name, processor, {
        ...connectionOptions,
        concurrency: 5
    });

    worker.on('failed', (job, err) => {
        logger.error({ queue: name, jobId: job?.id, err }, 'BullMQ worker failed job');
    });

    worker.on('error', (err) => {
        logger.error({ queue: name, err }, 'BullMQ worker error');
    });

    return worker;
};

const queueClient = {
    payment_charge: createQueue('payment_charge'),
    payment_reconcile: createQueue('payment_reconcile'),
    add: async (queueName, jobName, payload, opts) => {
        assertQueueName(queueName);
        const queue = queueClient[queueName] || createQueue(queueName);
        return queue.add(jobName, payload, opts);
    }
};

module.exports = {
    createQueue,
    createWorker,
    queueClient
};