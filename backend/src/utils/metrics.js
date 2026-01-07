/**
 * Metrics and Observability Module
 * Tracks key performance indicators and system health
 */

const logger = require('./logger');

class MetricsCollector {
  constructor() {
    this.metrics = {
      payments: {
        created: 0,
        succeeded: 0,
        failed: 0,
        processing: 0
      },
      workers: {
        charge: {
          processed: 0,
          failed: 0,
          avgProcessingTime: 0
        },
        reconcile: {
          processed: 0,
          failed: 0,
          paymentsUpdated: 0
        }
      },
      gateway: {
        calls: 0,
        errors: 0,
        avgResponseTime: 0
      },
      queue: {
        jobsEnqueued: 0,
        jobsCompleted: 0,
        jobsFailed: 0
      }
    };

    this.startTime = Date.now();
  }

  /**
   * Record payment creation
   */
  recordPaymentCreated() {
    this.metrics.payments.created++;
  }

  /**
   * Record payment status change
   */
  recordPaymentStatus(status) {
    if (this.metrics.payments[status] !== undefined) {
      this.metrics.payments[status]++;
    }
  }

  /**
   * Record worker job processing
   */
  recordWorkerJob(workerName, success, processingTime) {
    const worker = this.metrics.workers[workerName];
    if (!worker) return;

    worker.processed++;
    if (!success) worker.failed++;
    
    // Calculate moving average for processing time
    if (processingTime) {
      worker.avgProcessingTime = 
        (worker.avgProcessingTime * (worker.processed - 1) + processingTime) / worker.processed;
    }
  }

  /**
   * Record reconciliation update
   */
  recordReconciliationUpdate() {
    this.metrics.workers.reconcile.paymentsUpdated++;
  }

  /**
   * Record gateway call
   */
  recordGatewayCall(success, responseTime) {
    this.metrics.gateway.calls++;
    if (!success) this.metrics.gateway.errors++;
    
    if (responseTime) {
      this.metrics.gateway.avgResponseTime = 
        (this.metrics.gateway.avgResponseTime * (this.metrics.gateway.calls - 1) + responseTime) 
        / this.metrics.gateway.calls;
    }
  }

  /**
   * Record queue job
   */
  recordQueueJob(event) {
    if (event === 'enqueued') this.metrics.queue.jobsEnqueued++;
    if (event === 'completed') this.metrics.queue.jobsCompleted++;
    if (event === 'failed') this.metrics.queue.jobsFailed++;
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get metrics summary for health checks
   */
  getSummary() {
    const { payments, workers, gateway, queue } = this.metrics;
    
    return {
      payments: {
        total: payments.created,
        successRate: payments.created > 0 
          ? ((payments.succeeded / payments.created) * 100).toFixed(2) + '%'
          : 'N/A'
      },
      workers: {
        charge: {
          processed: workers.charge.processed,
          failureRate: workers.charge.processed > 0
            ? ((workers.charge.failed / workers.charge.processed) * 100).toFixed(2) + '%'
            : 'N/A'
        },
        reconcile: {
          runs: workers.reconcile.processed,
          updated: workers.reconcile.paymentsUpdated
        }
      },
      gateway: {
        calls: gateway.calls,
        errorRate: gateway.calls > 0
          ? ((gateway.errors / gateway.calls) * 100).toFixed(2) + '%'
          : 'N/A',
        avgResponseTime: Math.round(gateway.avgResponseTime) + 'ms'
      },
      queue: {
        enqueued: queue.jobsEnqueued,
        completed: queue.jobsCompleted,
        failed: queue.jobsFailed
      }
    };
  }

  /**
   * Log metrics periodically
   */
  startPeriodicLogging(intervalMs = 60000) {
    setInterval(() => {
      logger.info({ metrics: this.getSummary() }, 'Periodic metrics report');
    }, intervalMs);
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      payments: { created: 0, succeeded: 0, failed: 0, processing: 0 },
      workers: {
        charge: { processed: 0, failed: 0, avgProcessingTime: 0 },
        reconcile: { processed: 0, failed: 0, paymentsUpdated: 0 }
      },
      gateway: { calls: 0, errors: 0, avgResponseTime: 0 },
      queue: { jobsEnqueued: 0, jobsCompleted: 0, jobsFailed: 0 }
    };
    this.startTime = Date.now();
  }
}

// Singleton instance
const metrics = new MetricsCollector();

// Start periodic logging if enabled
if (process.env.ENABLE_METRICS === 'true') {
  const interval = parseInt(process.env.METRICS_LOG_INTERVAL || '60000', 10);
  metrics.startPeriodicLogging(interval);
  logger.info({ interval }, 'Metrics periodic logging enabled');
}

module.exports = metrics;
