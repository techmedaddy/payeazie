const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is missing');
}

const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
});

module.exports = {
    createQueue: (name) => new Queue(name, { connection }),
    createWorker: (name, processor) => new Worker(name, processor, { connection }),
    createQueueEvents: (name) => new QueueEvents(name, { connection })
};