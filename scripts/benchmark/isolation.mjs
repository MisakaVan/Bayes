import { readFileSync } from 'node:fs';
import { hash } from './report.mjs';

export function configFingerprint(config) {
  const copy = structuredClone(config);
  delete copy.vars?.BENCHMARK_CONFIG_HASH;
  delete copy.vars?.BENCHMARK_SOURCE_COMMIT;
  return hash(copy);
}

export function checkIsolation(config, productionText) {
  const errors = [];
  const productionStrings = new Set([...productionText.matchAll(/"([^"\n]+)"/g)].map((match) => match[1]));
  const different = (label, value) => {
    if (!value || /REPLACE|PLACEHOLDER|<|>/i.test(value)) errors.push(`${label}: unprovisioned`);
    else if (productionStrings.has(value)) errors.push(`${label}: production resource`);
  };
  if (config.name !== 'oem-backend-benchmark') errors.push('Unexpected Worker name');
  if (config.main !== 'benchmark/worker.ts') errors.push('Expected benchmark entrypoint');
  if (config.routes?.length || config.env) errors.push('Production routes or nested environments are not allowed');
  if (config.vars?.BENCHMARK_ENVIRONMENT !== 'isolated-benchmark') errors.push('Missing benchmark identity');
  if (!/^[a-f0-9]{40}$/.test(config.vars?.BENCHMARK_SOURCE_COMMIT ?? '')) errors.push('Missing source revision');
  if (config.vars?.BENCHMARK_CONFIG_HASH !== configFingerprint(config)) errors.push('Config fingerprint mismatch');
  if (config.version_metadata?.binding !== 'BENCHMARK_VERSION') errors.push('Missing deployment metadata binding');
  for (const key of ['BENCHMARK_FIXTURE_HASH', 'BENCHMARK_CONFIG_HASH', 'BETTER_AUTH_URL', 'UGC_ASSET_BASE_URL']) different(`vars.${key}`, config.vars?.[key]);
  if ((config.d1_databases ?? []).filter((item) => item.binding === 'DB').length !== 1) errors.push('Missing isolated DB');
  if ((config.kv_namespaces ?? []).filter((item) => item.binding === 'OEM_KV').length !== 1) errors.push('Missing isolated KV');
  if ((config.r2_buckets ?? []).filter((item) => item.binding === 'UGC_BUCKET').length !== 1) errors.push('Missing isolated R2');
  for (const item of config.d1_databases ?? []) { different('D1 id', item.database_id); different('D1 name', item.database_name); }
  for (const item of config.kv_namespaces ?? []) different('KV id', item.id);
  for (const item of config.r2_buckets ?? []) different('R2 name', item.bucket_name);
  const expectedQueues = ['OEM_MODERATION_Q', 'OEM_TRANSLATION_Q', 'OEM_WEBHOOK_Q'];
  for (const binding of expectedQueues) if (!(config.queues?.producers ?? []).some((item) => item.binding === binding)) errors.push(`Missing ${binding}`);
  for (const item of config.queues?.producers ?? []) {
    different('Queue producer', item.queue);
    if (!(config.queues?.consumers ?? []).some((consumer) => consumer.queue === item.queue)) errors.push('Queue producer has no isolated consumer');
  }
  for (const item of config.queues?.consumers ?? []) { different('Queue consumer', item.queue); different('DLQ', item.dead_letter_queue); }
  for (const item of config.durable_objects?.bindings ?? []) if (item.script_name) errors.push('External DO namespace is not allowed');
  for (const name of ['OEM_USER_DO', 'OEM_STATS_DO', 'OEM_NOTIFICATION_DO', 'OEM_IMG_TRANS']) {
    if (!(config.durable_objects?.bindings ?? []).some((item) => item.name === name)) errors.push(`Missing ${name}`);
  }
  for (const item of config.ratelimits ?? []) different('Rate limit namespace', item.namespace_id);
  if (config.ratelimits?.length !== 3) errors.push('Expected three isolated rate limit bindings');
  if (!config.containers?.length) errors.push('Missing isolated Container');
  for (const item of config.containers ?? []) different('Container name', item.name);
  if (!config.services?.some((item) => item.binding === 'BENCHMARK_UPSTREAM' && item.service === 'oem-benchmark-upstream')) errors.push('Missing upstream mock Worker');
  if (config.services?.some((item) => item.service !== 'oem-benchmark-upstream')) errors.push('Unexpected service binding');
  if (config.tail_consumers?.length !== 1 || config.tail_consumers[0].service !== 'oem-benchmark-logger') errors.push('Expected isolated logger');
  if (config.vars?.UPSTASH_REDIS_REST_URL) different('Redis URL', config.vars.UPSTASH_REDIS_REST_URL);
  return errors;
}

export function assertIsolation(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const productionText = readFileSync('wrangler.toml', 'utf8') + readFileSync('oem-logger/wrangler.toml', 'utf8');
  const errors = checkIsolation(config, productionText);
  if (errors.length) throw new Error(`Benchmark isolation rejected:\n${errors.join('\n')}`);
  return config;
}
