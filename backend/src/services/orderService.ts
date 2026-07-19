import type { Order, OrderItem } from '@soc/shared';
import { pool } from '../db/pool';

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: Number(row.id),
    customer_email: String(row.customer_email),
    customer_name: String(row.customer_name),
    status: row.status as Order['status'],
    total_amount: Number(row.total_amount),
    refunded_amount: Number(row.refunded_amount),
    shipped_at: row.shipped_at ? String(row.shipped_at) : null,
    created_at: String(row.created_at),
  };
}

export async function getOrderById(orderId: number): Promise<Order | null> {
  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (result.rows.length === 0) return null;
  return mapOrder(result.rows[0]);
}

export async function getOrderWithItems(orderId: number): Promise<{ order: Order; items: OrderItem[] } | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  const items: OrderItem[] = itemsResult.rows.map((row) => ({
    id: Number(row.id),
    order_id: Number(row.order_id),
    product_name: String(row.product_name),
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
  }));

  return { order, items };
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const result = await pool.query(
    'SELECT * FROM orders WHERE LOWER(customer_email) = LOWER($1) ORDER BY created_at DESC',
    [email]
  );
  return result.rows.map(mapOrder);
}
