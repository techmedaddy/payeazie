const server = require('fastify')({ logger: true });

// Initialize DB (side-effect)
require('./src/db');

// Register CORS
server.register(require('@fastify/cors'));

// Health Check
server.get('/health', async () => ({ status: 'ok' }));

// Register Routes
server.register(require('./src/api/routes/payment.routes'), { prefix: '/payments' });

// Start Server
const start = () => {
    const port = process.env.PORT || 3000;
    server.listen({ port, host: '0.0.0.0' })
        .catch(err => {
            server.log.error(err);
            process.exit(1);
        });
};

start();