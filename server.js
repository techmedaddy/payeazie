require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');

const paymentRoutes = require('./src/api/routes/payment.routes');
require('./src/db');

const ensureEnv = () => {
    const missing = ['DATABASE_URL', 'REDIS_URL'].filter((key) => !process.env[key]);
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

const buildServer = () => {
    ensureEnv();

    const app = Fastify({ logger: true });

    app.register(cors, { origin: true });
    app.get('/health', async () => ({ status: 'ok' }));
    app.register(paymentRoutes);

    return app;
};

const start = async () => {
    const app = buildServer();
    const port = Number(process.env.PORT) || 3000;

    try {
        const address = await app.listen({ port, host: '0.0.0.0' });
        app.log.info({ address, port }, 'Fastify server started');
        app.log.info('Env OK: DATABASE_URL and REDIS_URL present');
    } catch (err) {
        app.log.error(err, 'Fastify server failed to start');
        process.exit(1);
    }
};

start();