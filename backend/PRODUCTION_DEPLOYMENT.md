# Production Deployment Guide

## Overview

This guide covers deploying the PayEazie payment processing system to production environments including Railway, Render, Fly.io, AWS, and other cloud platforms.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Redis Setup](#redis-setup)
5. [Platform-Specific Deployments](#platform-specific-deployments)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring and Observability](#monitoring-and-observability)
8. [Scaling Considerations](#scaling-considerations)
9. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Code Readiness

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Database migrations are up to date
- [ ] Environment variables documented
- [ ] Graceful shutdown implemented
- [ ] Health checks configured
- [ ] Error handling comprehensive
- [ ] Logging properly configured

### Infrastructure Readiness

- [ ] PostgreSQL database provisioned
- [ ] Redis instance provisioned
- [ ] SSL/TLS certificates configured
- [ ] Domain name configured (if applicable)
- [ ] Firewall rules configured
- [ ] Backup strategy in place

### Security Checklist

- [ ] Environment variables secured (not in code)
- [ ] Database credentials rotated
- [ ] CORS configured appropriately
- [ ] Rate limiting enabled
- [ ] Input validation implemented
- [ ] SQL injection prevention (parameterized queries)
- [ ] Secrets encrypted at rest

---

## Environment Configuration

### Required Environment Variables

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@host:5432/database
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis
REDIS_URL=redis://user:password@host:6379
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=5000

# Workers
ENABLE_WORKERS=true
WORKER_CONCURRENCY=5
RECONCILE_CRON=*/5 * * * *

# Metrics
ENABLE_METRICS=true
METRICS_LOG_INTERVAL=60000

# Gateway (Production)
GATEWAY_API_URL=https://gateway.example.com/api
GATEWAY_API_KEY=your_secret_key_here
GATEWAY_TIMEOUT=30000
```

### Optional Configuration

```bash
# Feature Flags
ENABLE_RECONCILIATION=true
ENABLE_IDEMPOTENCY=true

# Performance
REQUEST_TIMEOUT=30000
SHUTDOWN_GRACE_PERIOD=5000

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
DATADOG_API_KEY=your_datadog_key
```

---

## Database Setup

### 1. Provision PostgreSQL

Choose a managed PostgreSQL service:
- **Railway**: Built-in PostgreSQL plugin
- **Render**: PostgreSQL add-on
- **AWS RDS**: Managed PostgreSQL
- **Heroku**: Heroku Postgres
- **DigitalOcean**: Managed Databases

### 2. Run Migrations

```bash
# From your local machine or CI/CD pipeline
cd backend
npm run migrate

# Or manually
psql $DATABASE_URL -f migrations/001_alter_order_id_to_text.sql
```

### 3. Initialize Database

```bash
npm run init-db
```

### 4. Connection Pooling

Configure connection limits based on your tier:

```javascript
// backend/src/db/config/db.js
const pgp = require('pg-promise')({
  // Production settings
  max: process.env.DB_POOL_MAX || 10,
  min: process.env.DB_POOL_MIN || 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});
```

---

## Redis Setup

### 1. Provision Redis

Options:
- **Railway**: Redis plugin
- **Render**: Redis add-on
- **Redis Cloud**: Managed Redis
- **AWS ElastiCache**: Managed Redis
- **DigitalOcean**: Managed Redis

### 2. Configure Connection

Ensure `REDIS_URL` is set with authentication:

```bash
REDIS_URL=redis://:password@host:6379
```

### 3. Test Connection

```bash
redis-cli -u $REDIS_URL ping
# Expected: PONG
```

---

## Platform-Specific Deployments

### Railway

1. **Create New Project**
   ```bash
   railway login
   railway init
   railway link
   ```

2. **Add Services**
   - PostgreSQL: `railway add postgresql`
   - Redis: `railway add redis`

3. **Set Environment Variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set LOG_LEVEL=info
   # ... other variables
   ```

4. **Deploy**
   ```bash
   railway up
   ```

5. **Run Migrations**
   ```bash
   railway run npm run migrate
   ```

### Render

1. **Create Web Service**
   - Connect GitHub repository
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`

2. **Add Services**
   - PostgreSQL: Create database service
   - Redis: Create Redis service

3. **Set Environment Variables**
   - Add all required variables in Render dashboard

4. **Deploy**
   - Render automatically deploys on git push

### Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create fly.toml**
   ```toml
   app = "payeazie"
   
   [build]
     dockerfile = "Dockerfile"
   
   [env]
     NODE_ENV = "production"
     PORT = "8080"
   
   [[services]]
     internal_port = 8080
     protocol = "tcp"
   
     [[services.ports]]
       port = 80
       handlers = ["http"]
     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]
   ```

3. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY backend/package*.json ./
   RUN npm ci --only=production
   COPY backend/ ./
   EXPOSE 8080
   CMD ["npm", "start"]
   ```

4. **Deploy**
   ```bash
   fly deploy
   ```

### Docker Deployment (Generic)

```dockerfile
# Dockerfile
FROM node:18-alpine

# Install dependencies first (better caching)
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy application code
COPY backend/ ./

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["npm", "start"]
```

```bash
# Build
docker build -t payeazie-backend .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_URL=$REDIS_URL \
  -e NODE_ENV=production \
  payeazie-backend
```

---

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-domain.com/health
# Expected: {"status":"ok","database":"connected","redis":"connected"}
```

### 2. Metrics Endpoint

```bash
curl https://your-domain.com/metrics/summary
```

### 3. Create Test Payment

```bash
./scripts/test-payment-api.sh
```

### 4. Verify Workers

Check logs for:
```
charge.worker job started
reconcile.worker job started
```

### 5. Run Full System Verification

```bash
./scripts/verify-system.sh
```

---

## Monitoring and Observability

### Metrics Endpoints

- `/health` - System health status
- `/metrics` - Detailed metrics
- `/metrics/summary` - Summary view

### Logging

Logs are structured JSON in production:

```json
{
  "level": "INFO",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "charge.worker job succeeded",
  "paymentId": "abc123",
  "status": "succeeded"
}
```

### External Monitoring

**Sentry** (Error Tracking)
```bash
npm install @sentry/node
```

```javascript
// In server.js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

**Datadog** (Metrics & APM)
```bash
npm install dd-trace
```

```javascript
// At top of server.js
require('dd-trace').init();
```

**Prometheus** (Metrics)
```bash
npm install prom-client
```

### Log Aggregation

- **Datadog Logs**: Automatically collected with agent
- **Loggly**: Forward logs via syslog
- **Papertrail**: Stream logs to Papertrail
- **CloudWatch**: AWS native logging

---

## Scaling Considerations

### Horizontal Scaling

When scaling to multiple instances:

1. **Database Connection Pooling**
   - Limit connections per instance
   - Use connection poolers like PgBouncer

2. **Worker Coordination**
   - BullMQ handles distributed workers automatically
   - Each instance can run workers concurrently

3. **Sticky Sessions**
   - Not required for this API (stateless)

4. **Health Checks**
   - Configure load balancer to use `/health` endpoint

### Vertical Scaling

Resource allocation per instance:

**Small** (Basic)
- CPU: 1 vCPU
- RAM: 512MB
- Instances: 2
- Handles: ~100 req/min

**Medium** (Production)
- CPU: 2 vCPU
- RAM: 2GB
- Instances: 3
- Handles: ~500 req/min

**Large** (High Traffic)
- CPU: 4 vCPU
- RAM: 4GB
- Instances: 5+
- Handles: ~2000 req/min

### Database Scaling

- **Read Replicas**: For heavy read workloads
- **Connection Pooling**: Use PgBouncer
- **Partitioning**: Partition payments table by date

### Redis Scaling

- **Cluster Mode**: For high availability
- **Persistence**: Enable RDB/AOF for durability
- **Eviction Policy**: Set to `noeviction` for queues

---

## Troubleshooting

### Workers Not Starting

**Symptom**: No worker logs, jobs stuck in queue

**Solutions**:
1. Check `ENABLE_WORKERS` environment variable
2. Verify Redis connection: `redis-cli -u $REDIS_URL ping`
3. Check worker logs for errors
4. Ensure `REDIS_URL` format is correct

### Database Connection Issues

**Symptom**: "Connection refused" or timeout errors

**Solutions**:
1. Verify `DATABASE_URL` format
2. Check database firewall rules
3. Test connection: `psql $DATABASE_URL -c "SELECT 1"`
4. Verify SSL requirements: append `?ssl=true` to DATABASE_URL

### High Memory Usage

**Symptom**: Process killed due to OOM

**Solutions**:
1. Reduce `DB_POOL_MAX` connection limit
2. Reduce `WORKER_CONCURRENCY` setting
3. Enable Redis memory limits
4. Upgrade instance RAM

### Job Failures

**Symptom**: Jobs failing repeatedly

**Solutions**:
1. Check gateway connectivity
2. Review job error logs
3. Verify payment data integrity
4. Check for database locks (FOR UPDATE)

### Slow Response Times

**Symptom**: High latency on API calls

**Solutions**:
1. Check database query performance
2. Add database indexes if needed
3. Monitor Redis latency
4. Enable connection pooling
5. Review gateway response times

---

## Security Best Practices

### 1. Environment Variables

Never commit `.env` files. Use platform secrets:

```bash
# Railway
railway variables set DB_PASSWORD=secret

# Render
# Use Environment Variables in dashboard

# Fly.io
fly secrets set DB_PASSWORD=secret
```

### 2. Database Security

- Use SSL connections: `DATABASE_URL=...?ssl=true`
- Rotate credentials regularly
- Use least-privilege database users
- Enable audit logging

### 3. API Security

- Implement rate limiting (express-rate-limit)
- Add helmet for security headers
- Validate all inputs
- Use HTTPS only in production

### 4. Worker Security

- Isolate worker processes
- Limit worker concurrency
- Implement job timeouts
- Sanitize job data

---

## Maintenance

### Regular Tasks

**Daily**
- Monitor error rates
- Check queue depths
- Review slow queries

**Weekly**
- Analyze metrics trends
- Review failed jobs
- Update dependencies

**Monthly**
- Database backups verification
- Security audit
- Performance tuning
- Capacity planning

### Backup Strategy

**Database Backups**
```bash
# Daily backups
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Redis Backups**
- Enable RDB snapshots
- Configure AOF persistence
- Copy dump.rdb regularly

### Disaster Recovery

1. **Database Restore**
   ```bash
   psql $DATABASE_URL < backup-20240115.sql
   ```

2. **Redis Restore**
   ```bash
   redis-cli -u $REDIS_URL --rdb dump.rdb
   ```

3. **Application Rollback**
   - Use git tags for releases
   - Keep previous 3 versions deployed
   - Test rollback procedure regularly

---

## Support

For issues:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Review [WORKER_FLOW.md](./WORKER_FLOW.md)
3. Check application logs
4. Contact DevOps team

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
