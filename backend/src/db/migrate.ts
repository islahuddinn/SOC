import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

const PATCHES = [
  `ALTER TABLE escalations DROP CONSTRAINT IF EXISTS escalations_action_type_check`,
  `ALTER TABLE escalations ADD CONSTRAINT escalations_action_type_check
     CHECK (action_type IN ('refund', 'cancel', 'replacement', 'general'))`,
];

export async function migrate(): Promise<void> {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    for (const patch of PATCHES) {
      await client.query(patch);
    }
    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
