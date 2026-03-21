const {
    PAYMENT_STATUS,
    FINAL_STATUSES,
    canTransition,
    canBeRefunded,
    isFinal
} = require('../../src/utils/payment-status');

describe('payment-status utility', () => {
    test('treats refunded as a final status', () => {
        expect(FINAL_STATUSES).toContain(PAYMENT_STATUS.REFUNDED);
        expect(isFinal(PAYMENT_STATUS.REFUNDED)).toBe(true);
    });

    test('allows refunding a succeeded payment', () => {
        expect(canBeRefunded(PAYMENT_STATUS.SUCCEEDED)).toBe(true);
        expect(canTransition(PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.REFUNDED)).toBe(true);
    });

    test('does not allow refunding non-succeeded payments', () => {
        expect(canBeRefunded(PAYMENT_STATUS.PENDING)).toBe(false);
        expect(canBeRefunded(PAYMENT_STATUS.PROCESSING)).toBe(false);
        expect(canBeRefunded(PAYMENT_STATUS.FAILED)).toBe(false);
        expect(canTransition(PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUNDED)).toBe(false);
        expect(canTransition(PAYMENT_STATUS.PROCESSING, PAYMENT_STATUS.REFUNDED)).toBe(false);
    });
});
