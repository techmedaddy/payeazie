require('dotenv').config();

const { Queue, Worker } = require('bullmq');
const logger = require('./logger');
const metrics = require('./metrics');

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

    worker.on('completed', (job) => {
        logger.info({ queue: name, jobId: job.id }, 'BullMQ worker completed job');
        metrics.recordQueueJob('completed');
    });

    worker.on('failed', (job, err) => {
        logger.error({ queue: name, jobId: job?.id, err }, 'BullMQ worker failed job');
        metrics.recordQueueJob('failed');
    });

    worker.on('error', (err) => {
        logger.error({ queue: name, err }, 'BullMQ worker error');
    });

    return worker;
};

// Initialize queues once
const queues = {
    payment_charge: createQueue('payment_charge'),
    payment_reconcile: createQueue('payment_reconcile')
};

const queueClient = {
    ...queues,
    add: async (queueName, jobName, payload, opts = {}) => {
        assertQueueName(queueName);
        const queue = queues[queueName];
        metrics.recordQueueJob('enqueued');
        return queue.add(jobName, payload, {
            attempts: 3,          // retry up to 3 times
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false,
            ...opts
        });
    }
};

module.exports = {
    createQueue,
    createWorker,
    queueClient
};
