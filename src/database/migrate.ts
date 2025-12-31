import { initializeDatabase } from './schema.js';

async function main() {
  console.log('Running database migration...');
  await initializeDatabase();
  console.log('Database migration completed!');
}

main().catch(console.error);
