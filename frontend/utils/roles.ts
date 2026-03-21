export const INTERNAL_OPERATOR_ROLES = ['admin', 'ops'] as const;

export const isInternalOperatorRole = (role: string | null | undefined): boolean =>
  INTERNAL_OPERATOR_ROLES.includes((role || '').toLowerCase() as (typeof INTERNAL_OPERATOR_ROLES)[number]);
