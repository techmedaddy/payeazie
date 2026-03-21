const INTERNAL_OPERATOR_ROLES = Object.freeze(['admin', 'ops']);

const isInternalOperatorRole = (role) => INTERNAL_OPERATOR_ROLES.includes(role);

const canAccessAnyPayment = (user) => isInternalOperatorRole(user?.role || null);

module.exports = {
    INTERNAL_OPERATOR_ROLES,
    isInternalOperatorRole,
    canAccessAnyPayment
};
