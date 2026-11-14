// T44 (R25): fails if a built bundle contains a secret. Scans extension/.output and dashboard/dist for
// (1) the exact secret values held locally (.env.test, .env.db.*), (2) new-style secret keys
// (sb_secret_ + key characters), (3) JWTs whose payload has role "service_role".
// A bare "sb_secret_" or "service_role" is not a finding: supabase-js contains them as literals.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dirs = ['extension/.output', 'dashboard/dist'].map((d) => join(root, d)).filter(existsSync);
if (!dirs.length) {
  console.error('No build output found. Run `npm run build` first.');
  process.exit(2);
}

const secretValues = [];
for (const file of readdirSync(root).filter((f) => f === '.env.test' || f.startsWith('.env.db.'))) {
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    const m = /^(SUPABASE_TEST_SECRET_KEY|SUPABASE_DB_PASSWORD|ICU_CRON_SECRET|TEST_USER_PASSWORD)=(.+)$/.exec(line.trim());
    if (m && m[2].length >= 12) secretValues.push({ name: `${file}:${m[1]}`, value: m[2] });
  }
}

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|css|html|json|map)$/.test(f)) files.push(p);
  }
};
dirs.forEach(walk);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const s of secretValues) if (text.includes(s.value)) findings.push(`${file}: contains ${s.name}`);
  for (const m of text.matchAll(/sb_secret_[A-Za-z0-9_-]{10,}/g)) findings.push(`${file}: secret key ${m[0].slice(0, 14)}…`);
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') findings.push(`${file}: service_role JWT`);
    } catch {
      // not a JWT payload
    }
  }
}

console.log(`Scanned ${files.length} files in ${dirs.map((d) => d.slice(root.length + 1)).join(', ')} against ${secretValues.length} local secret values.`);
if (findings.length) {
  console.error(`SECRETS FOUND:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('No secrets found.');
