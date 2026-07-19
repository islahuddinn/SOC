import { pool } from './pool';
import { seed } from './seed';

export async function seedIfEmpty(): Promise<void> {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
  const count = Number(result.rows[0]?.count ?? 0);

  if (count > 0) {
    console.log(`Database has ${count} orders — skipping seed.`);
    return;
  }

  console.log('Empty database detected — running seed...');
  await seed();
}

if (require.main === module) {
  seedIfEmpty()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed-if-empty failed:', err);
      process.exit(1);
    });
}
