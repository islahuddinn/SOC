import type { GuardrailResult, Order, OrderStatus } from '@soc/shared';

const SHIPPED_STATUSES: OrderStatus[] = ['shipped', 'delivered'];

export interface RefundGuardrailInput {
  order: Order;
  amount: number;
  requesterEmail: string;
}

export interface CancelGuardrailInput {
  order: Order;
  requesterEmail: string;
}

export interface OrderAccessInput {
  order: Order | null;
  orderId: number;
  requesterEmail: string;
}

/** Verify the requester owns the order — enforced in code, not prompts. */
export function validateOrderAccess(input: OrderAccessInput): GuardrailResult {
  if (!input.order) {
    return {
      allowed: false,
      reason: `Order ${input.orderId} not found. Cannot proceed with a hallucinated or invalid order ID.`,
      requiresEscalation: false,
    };
  }

  if (input.order.customer_email.toLowerCase() !== input.requesterEmail.toLowerCase()) {
    return {
      allowed: false,
      reason: `Order ${input.orderId} belongs to another customer. Access denied.`,
      requiresEscalation: false,
    };
  }

  return { allowed: true, reason: 'Order access verified.', requiresEscalation: false };
}

/** Refund guardrails — enforced in application code before any refund executes. */
export function validateRefund(input: RefundGuardrailInput): GuardrailResult {
  const access = validateOrderAccess({
    order: input.order,
    orderId: input.order.id,
    requesterEmail: input.requesterEmail,
  });
  if (!access.allowed) return access;

  if (input.amount <= 0) {
    return { allowed: false, reason: 'Refund amount must be positive.', requiresEscalation: false };
  }

  const remaining = Number(input.order.total_amount) - Number(input.order.refunded_amount);

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: `Order ${input.order.id} is already fully refunded.`,
      requiresEscalation: false,
    };
  }

  if (input.amount > remaining) {
    return {
      allowed: false,
      reason: `Refund amount $${input.amount.toFixed(2)} exceeds remaining refundable balance $${remaining.toFixed(2)}.`,
      requiresEscalation: false,
    };
  }

  if (input.amount > Number(input.order.total_amount)) {
    return {
      allowed: false,
      reason: `Refund amount $${input.amount.toFixed(2)} exceeds order total $${Number(input.order.total_amount).toFixed(2)}.`,
      requiresEscalation: false,
    };
  }

  // Policy: all refunds require human approval (incorrect refund is worse than escalation)
  return {
    allowed: true,
    reason: 'Refund passes validation but requires human approval per store policy.',
    requiresEscalation: true,
  };
}

/** Cancellation guardrails — enforced in application code. */
export function validateCancellation(input: CancelGuardrailInput): GuardrailResult {
  const access = validateOrderAccess({
    order: input.order,
    orderId: input.order?.id ?? 0,
    requesterEmail: input.requesterEmail,
  });
  if (!access.allowed) return access;

  if (input.order!.status === 'cancelled') {
    return {
      allowed: false,
      reason: `Order ${input.order!.id} is already cancelled.`,
      requiresEscalation: false,
    };
  }

  if (SHIPPED_STATUSES.includes(input.order!.status)) {
    return {
      allowed: false,
      reason: `Order ${input.order!.id} has already shipped and cannot be cancelled.`,
      requiresEscalation: false,
    };
  }

  // Unshipped cancellations can auto-execute if agent proposes them
  return {
    allowed: true,
    reason: 'Cancellation passes validation.',
    requiresEscalation: false,
  };
}

/** Replacement always requires human review. */
export function validateReplacement(input: OrderAccessInput): GuardrailResult {
  const access = validateOrderAccess(input);
  if (!access.allowed) return access;

  return {
    allowed: true,
    reason: 'Replacement requests always require human approval.',
    requiresEscalation: true,
  };
}

export function isOrderShipped(status: OrderStatus): boolean {
  return SHIPPED_STATUSES.includes(status);
}
