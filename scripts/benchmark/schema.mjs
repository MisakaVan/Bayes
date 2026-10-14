import { readFileSync, readdirSync } from 'node:fs';

export function benchmarkMigrations() {
  return readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort().map((name) => {
    const sql = readFileSync(`migrations/${name}`, 'utf8');
    // Fresh replay: 0004 rebuilds users without ef_pass, so 0017's legacy
    // drop cannot execute. This adaptation is exclusively for a new test DB.
    if (name === '0017_drop_users_ef_pass.sql') {
      if (sql.trim() !== 'ALTER TABLE users DROP COLUMN ef_pass;') throw new Error('Legacy migration changed; review benchmark bootstrap.');
      return { name, sql: '-- 0017: ef_pass already absent after fresh 0004 replay.' };
    }
    return { name, sql };
  });
}
