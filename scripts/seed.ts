import { seedDatabase, seedDatabaseIfEmpty } from '../src/db/seed';

export { seedDatabase, seedDatabaseIfEmpty };

const force = process.argv.includes('--force');
seedDatabase(force)
  .then(() => {
    console.log('[Seed] Script completed successfully.');
  })
  .catch((err) => {
    console.error('[Seed] Error during seeding:', err);
    process.exit(1);
  });
