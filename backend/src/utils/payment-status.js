/**
 * Payment status constants and lifecycle helpers.
 * Keep backend status validation and refund eligibility aligned here.
 */
const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded'
});

const ALL_STATUSES = Object.freeze([
  PAYMENT_STATUS.PENDING,
  PAYMENT_STATUS.PROCESSING,
  PAYMENT_STATUS.SUCCEEDED,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.REFUNDED
]);

const FINAL_STATUSES = Object.freeze([
  PAYMENT_STATUS.SUCCEEDED,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.REFUNDED
]);

const REFUNDABLE_STATUSES = Object.freeze([
  PAYMENT_STATUS.SUCCEEDED
]);

const RETRYABLE_STATUSES = Object.freeze([
  PAYMENT_STATUS.FAILED
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [PAYMENT_STATUS.PENDING]: new Set([
    PAYMENT_STATUS.PROCESSING,
    PAYMENT_STATUS.FAILED
  ]),
  [PAYMENT_STATUS.PROCESSING]: new Set([
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.SUCCEEDED,
    PAYMENT_STATUS.FAILED
  ]),
  [PAYMENT_STATUS.SUCCEEDED]: new Set([
    PAYMENT_STATUS.REFUNDED
  ]),
  [PAYMENT_STATUS.FAILED]: new Set([
    PAYMENT_STATUS.PENDING
  ]),
  [PAYMENT_STATUS.REFUNDED]: new Set([])
});

const isFinal = (status) => FINAL_STATUSES.includes(status);

const canTransition = (fromStatus, toStatus) => {
  if (!fromStatus || !toStatus) {
    return false;
  }

  if (fromStatus === toStatus) {
    return true;
  }

  const allowedNext = ALLOWED_TRANSITIONS[fromStatus];
  return allowedNext ? allowedNext.has(toStatus) : false;
};

const canBeRefunded = (status) => REFUNDABLE_STATUSES.includes(status);
const canBeRetried = (status) => RETRYABLE_STATUSES.includes(status);

module.exports = {
  ...PAYMENT_STATUS,
  PAYMENT_STATUS,
  ALL_STATUSES,
  FINAL_STATUSES,
  REFUNDABLE_STATUSES,
  RETRYABLE_STATUSES,
  ALLOWED_TRANSITIONS,
  isFinal,
  canTransition,
  canBeRefunded,
  canBeRetried,
  getFinalStatuses: () => [...FINAL_STATUSES]
};
