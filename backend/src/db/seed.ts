import { pool } from './pool';

export async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('TRUNCATE refunds, tool_calls, agent_runs, escalations, support_requests, order_items, orders RESTART IDENTITY CASCADE');

    const orders = [
      { id: 1043, email: 'alice@example.com', name: 'Alice Johnson', status: 'delivered', total: 89.99, refunded: 0, shipped: '2026-07-01' },
      { id: 1044, email: 'bob@example.com', name: 'Bob Smith', status: 'processing', total: 149.50, refunded: 0, shipped: null },
      { id: 1045, email: 'carol@example.com', name: 'Carol Davis', status: 'shipped', total: 59.99, refunded: 0, shipped: '2026-07-10' },
      { id: 1046, email: 'alice@example.com', name: 'Alice Johnson', status: 'delivered', total: 34.99, refunded: 34.99, shipped: '2026-06-15' },
      { id: 1047, email: 'dave@example.com', name: 'Dave Wilson', status: 'pending', total: 199.00, refunded: 0, shipped: null },
    ];

    for (const o of orders) {
      await client.query(
        `INSERT INTO orders (id, customer_email, customer_name, status, total_amount, refunded_amount, shipped_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [o.id, o.email, o.name, o.status, o.total, o.refunded, o.shipped]
      );
    }

    const items = [
      [1043, 'Wireless Headphones', 1, 89.99],
      [1044, 'Smart Watch', 1, 149.50],
      [1045, 'Phone Case', 2, 29.995],
      [1046, 'USB Cable', 1, 34.99],
      [1047, 'Laptop Stand', 1, 199.00],
    ];

    for (const [orderId, product, qty, price] of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_name, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
        [orderId, product, qty, price]
      );
    }

    await client.query(`SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders))`);

    await client.query('COMMIT');
    console.log('Seed data inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
