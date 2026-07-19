import { validateRefund, validateCancellation, validateOrderAccess } from './index';
import type { Order } from '@soc/shared';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const baseOrder: Order = {
  id: 1043,
  customer_email: 'alice@example.com',
  customer_name: 'Alice',
  status: 'delivered',
  total_amount: 89.99,
  refunded_amount: 0,
  shipped_at: '2026-07-01',
  created_at: new Date().toISOString(),
};

// Refund exceeds payment
const overRefund = validateRefund({ order: baseOrder, amount: 100, requesterEmail: 'alice@example.com' });
assert(!overRefund.allowed, 'Rejects refund exceeding order total');

// Already refunded
const fullyRefunded = validateRefund({
  order: { ...baseOrder, refunded_amount: 89.99 },
  amount: 10,
  requesterEmail: 'alice@example.com',
});
assert(!fullyRefunded.allowed, 'Rejects refund on fully refunded order');

// Wrong customer
const wrongCustomer = validateOrderAccess({
  order: baseOrder,
  orderId: 1043,
  requesterEmail: 'bob@example.com',
});
assert(!wrongCustomer.allowed, 'Rejects access to another customer order');

// Cancel shipped order
const shippedCancel = validateCancellation({
  order: { ...baseOrder, status: 'shipped' },
  requesterEmail: 'alice@example.com',
});
assert(!shippedCancel.allowed, 'Rejects cancellation of shipped order');

// Valid unshipped cancel
const validCancel = validateCancellation({
  order: { ...baseOrder, status: 'processing', shipped_at: null },
  requesterEmail: 'alice@example.com',
});
assert(validCancel.allowed, 'Allows cancellation of unshipped order');

// Valid refund requires escalation
const validRefund = validateRefund({ order: baseOrder, amount: 50, requesterEmail: 'alice@example.com' });
assert(validRefund.allowed && validRefund.requiresEscalation, 'Valid refund requires escalation');

console.log('\nAll guardrail tests passed.');
