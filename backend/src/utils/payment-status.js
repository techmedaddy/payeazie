/**
 * Payment status constants
 * Use these throughout the codebase to avoid typos
 */
module.exports = {
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  
  // Helper to check if status is final
  isFinal: (status) => {
    return ['succeeded', 'failed', 'refunded'].includes(status);
  },
  
  // Get all final statuses
  getFinalStatuses: () => {
    return ['succeeded', 'failed', 'refunded'];
  }
};
