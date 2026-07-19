import { validateRefund, validateCancellation } from '../guardrails';
import { pool } from '../db/pool';

export interface ExecuteRefundInput {
  orderId: number;
  amount: number;
  requesterEmail: string;
  escalationId?: number;
  supportRequestId?: number;
}

export interface ExecuteCancelInput {
  orderId: number;
  requesterEmail: string;
  escalationId?: number;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  refundId?: number;
}

export async function executeRefund(input: ExecuteRefundInput): Promise<ExecutionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [input.orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: `Order ${input.orderId} not found.` };
    }

    const row = orderResult.rows[0];
    const order = {
      id: Number(row.id),
      customer_email: String(row.customer_email),
      customer_name: String(row.customer_name),
      status: row.status,
      total_amount: Number(row.total_amount),
      refunded_amount: Number(row.refunded_amount),
      shipped_at: row.shipped_at,
      created_at: String(row.created_at),
    };

    const guardrail = validateRefund({
      order: order as Parameters<typeof validateRefund>[0]['order'],
      amount: input.amount,
      requesterEmail: input.requesterEmail,
    });

    if (!guardrail.allowed) {
      await client.query('ROLLBACK');
      return { success: false, message: guardrail.reason };
    }

    let refundId: number;
    try {
      const insertResult = await client.query(
        `INSERT INTO refunds (order_id, escalation_id, support_request_id, amount, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [input.orderId, input.escalationId ?? null, input.supportRequestId ?? null, input.amount]
      );
      refundId = Number(insertResult.rows[0].id);
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505') {
        return {
          success: false,
          message: 'A refund is already in progress for this order. Duplicate refund rejected.',
        };
      }
      throw err;
    }

    const newRefunded = order.refunded_amount + input.amount;
    if (newRefunded > order.total_amount) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Refund would exceed order total. Transaction rolled back.' };
    }

    await client.query(`UPDATE orders SET refunded_amount = $1 WHERE id = $2`, [newRefunded, input.orderId]);
    await client.query(`UPDATE refunds SET status = 'completed' WHERE id = $1`, [refundId]);
    await client.query('COMMIT');

    return {
      success: true,
      message: `Refund of $${input.amount.toFixed(2)} processed for order ${input.orderId}.`,
      refundId,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeCancellation(input: ExecuteCancelInput): Promise<ExecutionResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [input.orderId]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: `Order ${input.orderId} not found.` };
    }

    const row = orderResult.rows[0];
    const order = {
      id: Number(row.id),
      customer_email: String(row.customer_email),
      customer_name: String(row.customer_name),
      status: row.status,
      total_amount: Number(row.total_amount),
      refunded_amount: Number(row.refunded_amount),
      shipped_at: row.shipped_at,
      created_at: String(row.created_at),
    };

    const guardrail = validateCancellation({
      order: order as Parameters<typeof validateCancellation>[0]['order'],
      requesterEmail: input.requesterEmail,
    });

    if (!guardrail.allowed) {
      await client.query('ROLLBACK');
      return { success: false, message: guardrail.reason };
    }

    await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [input.orderId]);

    if (input.escalationId) {
      await client.query(
        `UPDATE escalations SET status = 'executed', executed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [input.escalationId]
      );
    }

    await client.query('COMMIT');
    return { success: true, message: `Order ${input.orderId} cancelled successfully.` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function executeApprovedEscalation(
  escalationId: number,
  approvedBy: string
): Promise<ExecutionResult> {
  const client = await pool.connect();
  let escalation: Record<string, unknown>;
  let requesterEmail: string;

  try {
    await client.query('BEGIN');

    const escResult = await client.query(
      `UPDATE escalations
       SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [escalationId, approvedBy]
    );

    if (escResult.rows.length === 0) {
      await client.query('ROLLBACK');
      const current = await pool.query('SELECT status, approved_by FROM escalations WHERE id = $1', [escalationId]);
      const row = current.rows[0];
      if (row?.status === 'executed' || row?.status === 'approved') {
        return {
          success: false,
          message: `Escalation already ${row.status}${row.approved_by ? ` by ${row.approved_by}` : ''}. No duplicate execution.`,
        };
      }
      if (row?.status === 'rejected') {
        return { success: false, message: 'Escalation was already rejected.' };
      }
      return { success: false, message: 'Escalation is no longer pending approval.' };
    }

    escalation = escResult.rows[0];
    const supportRequest = await client.query(
      'SELECT customer_email FROM support_requests WHERE id = $1',
      [escalation.support_request_id]
    );
    requesterEmail = String(supportRequest.rows[0].customer_email);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  let result: ExecutionResult;
  const actionType = String(escalation.action_type);
  const orderId = escalation.order_id != null ? Number(escalation.order_id) : null;

  if (actionType === 'refund') {
    if (orderId == null) {
      result = { success: false, message: 'Refund escalation missing order ID.' };
    } else {
      result = await executeRefund({
        orderId,
        amount: Number(escalation.proposed_amount),
        requesterEmail,
        escalationId,
        supportRequestId: Number(escalation.support_request_id),
      });
    }
  } else if (actionType === 'cancel') {
    if (orderId == null) {
      result = { success: false, message: 'Cancellation escalation missing order ID.' };
    } else {
      result = await executeCancellation({ orderId, requesterEmail, escalationId });
    }
  } else {
    result = {
      success: true,
      message: actionType === 'replacement'
        ? 'Replacement approved. Fulfillment team notified.'
        : 'Escalation approved. Manual follow-up recorded.',
    };
  }

  await pool.query(
    `UPDATE escalations
     SET status = $2, executed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
         execution_error = $4, updated_at = NOW()
     WHERE id = $1`,
    [escalationId, result.success ? 'executed' : 'failed', result.success, result.success ? null : result.message]
  );

  return result;
}

export async function rejectEscalation(
  escalationId: number,
  rejectedBy: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const result = await pool.query(
    `UPDATE escalations
     SET status = 'rejected', rejection_reason = $3, approved_by = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [escalationId, rejectedBy, reason]
  );

  if (result.rows.length === 0) {
    const current = await pool.query('SELECT status FROM escalations WHERE id = $1', [escalationId]);
    return {
      success: false,
      message: `Cannot reject: escalation is already ${current.rows[0]?.status ?? 'unknown'}.`,
    };
  }

  return { success: true, message: 'Escalation rejected.' };
}
