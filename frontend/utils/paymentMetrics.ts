import { PaymentResponse, PaymentStatus } from '../types';

export interface PaymentMetricsStory {
  completedOutcomes: number;
  successfulOutcomes: number;
  failedOutcomes: number;
  refundedOutcomes: number;
  successRate: number;
  failureRate: number;
  refundRate: number;
  averageResolutionMs: number | null;
  headline: string;
  narrative: string;
}

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const formatPercent = (value: number) => `${value.toFixed(1)}%`;

export const formatDurationShort = (durationMs: number | null): string => {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return 'N/A';
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
};

export const buildPaymentMetricsStory = (payments: PaymentResponse[]): PaymentMetricsStory => {
  const successfulPayments = payments.filter(
    (payment) =>
      payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.REFUNDED
  );
  const failedPayments = payments.filter((payment) => payment.status === PaymentStatus.FAILED);
  const refundedPayments = payments.filter((payment) => payment.status === PaymentStatus.REFUNDED);
  const completedOutcomes = successfulPayments.length + failedPayments.length;
  const successRate =
    completedOutcomes > 0 ? (successfulPayments.length / completedOutcomes) * 100 : 0;
  const failureRate =
    completedOutcomes > 0 ? (failedPayments.length / completedOutcomes) * 100 : 0;
  const refundRate =
    successfulPayments.length > 0 ? (refundedPayments.length / successfulPayments.length) * 100 : 0;

  const resolutionDurations = payments
    .filter(
      (payment) =>
        payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.FAILED
    )
    .map((payment) => new Date(payment.updatedAt).getTime() - new Date(payment.createdAt).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);

  const averageResolutionMs = average(resolutionDurations);

  if (completedOutcomes === 0) {
    return {
      completedOutcomes,
      successfulOutcomes: successfulPayments.length,
      failedOutcomes: failedPayments.length,
      refundedOutcomes: refundedPayments.length,
      successRate,
      failureRate,
      refundRate,
      averageResolutionMs,
      headline: 'Waiting for completed outcomes',
      narrative:
        'Success, failure, refund, and latency trends will appear once payments start reaching final statuses.',
    };
  }

  const successLead =
    successRate >= 90
      ? 'Most payment attempts are resolving cleanly.'
      : failureRate >= 20
        ? 'Failure pressure is elevated and worth operator attention.'
        : 'Payment outcomes look generally healthy with some recoverable churn.';

  const refundLead =
    refundRate >= 15
      ? 'Refund activity is materially affecting net captured volume.'
      : 'Refund activity remains within a normal range.';

  const latencyLead = averageResolutionMs !== null
    ? `Average resolution time is ${formatDurationShort(averageResolutionMs)} from creation to final status.`
    : 'Latency will appear once succeeded or failed payments are available.';

  return {
    completedOutcomes,
    successfulOutcomes: successfulPayments.length,
    failedOutcomes: failedPayments.length,
    refundedOutcomes: refundedPayments.length,
    successRate,
    failureRate,
    refundRate,
    averageResolutionMs,
    headline: `${formatPercent(successRate)} success rate with ${formatPercent(failureRate)} failure pressure`,
    narrative: `${successLead} ${refundLead} ${latencyLead}`,
  };
};
