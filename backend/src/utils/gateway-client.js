module.exports = {
    createCharge: async ({ amount, currency, idempotencyKey }) => {
        // Simulate network delay deterministically (30ms)
        await new Promise(resolve => setTimeout(resolve, 30));

        const chargeId = "ch_" + idempotencyKey.replace(/-/g, "");

        return {
            id: chargeId,
            amount,
            currency,
            status: "succeeded"
        };
    },

    fetchCharge: async (chargeId) => {
        // Simulate network delay deterministically (30ms)
        await new Promise(resolve => setTimeout(resolve, 30));

        return {
            id: chargeId,
            status: "succeeded"
        };
    }
};