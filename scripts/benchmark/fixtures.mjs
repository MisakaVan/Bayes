import { createHash } from 'node:crypto';

export const defaultProfile = {
  seed: 20261014, markers: 100, rootsPerMarker: 8, repliesPerRoot: 8,
  nestedDepth: 4, unrelatedComments: 2000
};

// These are synthetic distributions, not a copy of production records.
export function buildFixture(profile = defaultProfile) {
  for (const [key, value] of Object.entries(profile)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > (key === 'seed' ? 0xffffffff : 100000)) throw new Error(`Invalid fixture ${key}.`);
  }
  if (profile.markers < 1 || profile.markers > 100 || profile.nestedDepth > 100
    || profile.markers * profile.rootsPerMarker * (profile.repliesPerRoot + profile.nestedDepth + 1)
      + profile.unrelatedComments > 100000) throw new Error('Fixture exceeds the bounded generation budget.');
  let randomState = profile.seed;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState; };
  const sql = ["INSERT INTO users (uid, email, password_hash, nickname, uid_number, uid_suffix, avt) VALUES ('bench-author', 'author@benchmark.invalid', '', 'BenchmarkAuthor', 900001, 'test', 1);"];
  let comments = 0, votes = 0;
  function comment(id, marker, parent = null, depth = 0) {
    const created = new Date(Date.UTC(2026, 0, 1) + comments * 1000).toISOString();
    sql.push(`INSERT INTO ugc_submissions (id, kind, poi_id, poi_hash, poi_type, snapshot_id, user_id, content, status, parent_id, comment_depth, created_at, updated_at) VALUES ('${id}', 'comment', '${marker}', 'benchmark-hash', 'benchmark-poi', 'snapshot-${id}', 'bench-author', 'Synthetic comment ${comments}', 'active', ${parent === null ? 'NULL' : `'${parent}'`}, ${depth}, '${created}', '${created}');`);
    comments++;
    if (random() % 3 === 0) {
      sql.push(`INSERT INTO ugc_submission_votes (submission_id, user_id, value) VALUES ('${id}', 'bench-author', 1);`);
      votes++;
    }
  }
  const markerIds = Array.from({ length: profile.markers }, (_, index) => `bench-marker-${String(index).padStart(3, '0')}`);
  for (const marker of markerIds) {
    for (let root = 0; root < profile.rootsPerMarker; root++) {
      const id = `${marker}-root-${root}`;
      comment(id, marker);
      for (let reply = 0; reply < profile.repliesPerRoot; reply++) comment(`${id}-reply-${reply}`, marker, id, 1);
      let parent = `${id}-reply-0`;
      if (profile.repliesPerRoot > 0) {
        for (let depth = 2; depth <= profile.nestedDepth; depth++) {
          const child = `${id}-nested-${depth}`;
          comment(child, marker, parent, depth); parent = child;
        }
      }
    }
  }
  for (let index = 0; index < profile.unrelatedComments; index++) comment(`bench-outside-${index}`, `bench-outside-marker-${index}`);
  const text = sql.join('\n');
  return { profile, sql: text, markerIds, comments, votes,
    hash: createHash('sha256').update(text).digest('hex') };
}
