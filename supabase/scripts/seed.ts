import { resetData, seedUsers, testEnvConfigured } from './testEnv.ts';

if (!testEnvConfigured) {
  console.error('Missing .env.test (see .env.test.example).');
  process.exit(1);
}
const mode = process.argv[2];
if (mode === 'seed') await seedUsers();
else if (mode === 'reset') await resetData();
else {
  console.error('usage: node supabase/scripts/seed.ts seed|reset');
  process.exit(1);
}
console.log(`${mode} done`);
