# Benchmark / SLO 运行说明与预算

首期状态：本地工具可运行；独立 Worker、logger、upstream、Container 已构建验证。远端资源待预算确认和实际创建。

## 本地运行

```sh
pnpm run bench:local benchmark/results/before.json
pnpm run bench:local benchmark/results/after.json
pnpm run bench:compare benchmark/results/before.json benchmark/results/after.json
pnpm run bench:check
node scripts/benchmark/cli.mjs fixture benchmark/fixture.generated.sql
node scripts/benchmark/cli.mjs bootstrap benchmark/bootstrap.generated.sql
```

`BENCH_ITERATIONS` 可设置 3–1000。测试执行应用的 SQL/缓存回源函数；不以 mock SQL 代替真实 SQLite。
本地报告 JSON schemaVersion=1，保存原始时长、每次业务操作平均服务操作数、正确性和缺口。

`slo:check baseline candidate [policy]` 与 compare 使用同一门禁：0=通过，1=失败/无效输入，2=证据不足。
local policy 仅验正确性与 D1/KV 操作预算；remote policy 要求平台 CPU、handler 时长至少 1,000 个样本、5 个独立轮次，95% bootstrap 比值上限不超过 1.05。
多轮以每轮统计量重采样，不能把同一轮相关请求都当作独立实验。20 个样本的 starter manifest 仅用于可行性校准。
缺失 CPU 是 null；不允许不完整样本、重复 run、错误数据集、runtime/config 差异或异常遥测值静默通过。

## 隔离配置与初始化

复制并填写 `wrangler.benchmark.example.json`、`wrangler.benchmark-logger.example.json`、`benchmark/remote.example.json` 到对应非 example 文件。

需要独立的业务/错误/性能指标 D1、KV、R2、三类队列及 DLQ、DO、Container、Rate Limiting namespace、专用 Redis。
upstream 使用 `wrangler.benchmark-upstream.json`。main 只引用 `benchmark/worker.ts`；生产 main 仍是 `src/index.ts`，不加载 benchmark meter/egress。

1. 先创建资源并替换所有 REPLACE 值；保留资源清单和创建时间。
2. 新业务 D1 使用生成的 bootstrap SQL，**不要直接 replay 生产 migration 0017**；bootstrap 已明确处理旧 DROP。不要向已初始化或生产 DB 执行 bootstrap。
3. 错误 D1 使用 `oem-logger/migrations`；指标 D1 使用 `benchmark/migrations`。
4. 导入合成 fixture。提交应用和 benchmark 源码后运行 `node scripts/benchmark/cli.mjs prepare wrangler.benchmark.json benchmark/profile.stress.json`，记录 fixture/config SHA256 与 source commit；配置改变需重新 prepare。身份端点还返回平台部署 version ID，报告不能只记录运行脚本时本地 HEAD。
5. 配置随机 benchmark token、测试专用 Better Auth/HMAC/Endfield 凭证密钥、专用 Redis token。第三方凭证仅填虚拟值；不要整体导入 .dev.vars。
6. worker 身份、auth callback/Cookie/CORS、R2 资产地址都指向 benchmark 域名。
7. 执行 isolation 检查，通过后才部署专用 upstream、logger 和主 Worker。生产部署脚本不会用于测试环境。

```sh
node scripts/benchmark/cli.mjs isolation wrangler.benchmark.json
pnpm exec wrangler deploy --dry-run --config wrangler.benchmark.json
```

isolation 会拒绝生产资源标识、生产 routes、外部 DO、缺失队列消费者、缺失测试服务和未填占位符。
它是配置校验，不替代账号资源核对。尤其 Redis URL/secrets、两个 logger D1 的真实身份须在资源创建时核验。
环境状态、共享账号配额和预算应在远端运行前记录。批准预算前不创建付费资源、不发压。

## 远端执行及导入平台 CPU

测试 token 从 `BENCHMARK_TOKEN` 环境变量读取，不在参数、报告或日志保存。
每个请求携带 run/sample/scenario ID；必须先通过 benchmark identity 检查，不跟随重定向。
固定到达率超过并发或时长预算时记录 dropped/failure；超时、HTTP 错误和 partial 都保留在分母中。

```sh
pnpm run bench:plan benchmark/remote.json
pnpm run bench:remote benchmark/remote.json benchmark/results/run1.json
```

logger 独立写 benchmark_samples，数据只包含关联 ID、状态、平台 CPU、handler/completion 时长和操作统计。指标保留 7 天。
性能 collector 与错误库独立；collector 自身 CPU/写入费用计入测试预算，不计入业务 Worker CPU。

从 BENCHMARK_METRICS 仅 SELECT 目标 run 的 `benchmark_samples`，将查询的 results 提取为扁平数组，不保存完整请求 header、Cookie 或业务正文。

```sh
node scripts/benchmark/cli.mjs telemetry benchmark/results/run1.json benchmark/results/run1-rows.json benchmark/results/run1-complete.json
node scripts/benchmark/cli.mjs aggregate benchmark/results/baseline.json benchmark/results/run1-complete.json benchmark/results/run2-complete.json
pnpm run slo:check benchmark/results/baseline.json benchmark/results/candidate.json
```

实际 SLO 需要至少五轮，同输入/配置、相同部署代码的各轮先聚合。基线和候选交错执行。
HTTP starter 不能证明 Queue、Cron、DO 自身、Container 或第三方完成；报告 gaps 不得删除来宣称全服务验收。
默认入口 resource meter 不包含 PublicReadCache/DO 内部 SQL，这些需要它们各自 trace/服务统计。D1 first/raw 无 metadata 的次数另外计数。
Cron 以 maintenance、Queue 以 queue 单独记录，不与 HTTP 延迟混合。CPU 包括观测和 waitUntil 开销；handlerDuration 不包括等待后台完成。

## 第三方替身

upstream profile 是 JSON 数组：每项 `match` 为完整 `METHOD origin/path`，指定 status/body/delayMs/headers。
未知依赖返回 502 BENCHMARK_MOCK_NOT_CONFIGURED，不能伪装集成成功。HTTP 外部 egress 路由至专用 mock Worker；专用 Redis 才可调用真实 REST。
Cloudflare Email send 也使用测试替身；生产发信实现不改。
未处于 benchmark 业务作用域的外部 egress 被拒绝。DO 内部、出站 WS 的完整替身接入仍待专项实现和验收；定位不可先当作已覆盖。

## 第一轮数量与费用估算

starter：3 场景（health、1 marker 暖读、10 marker 暖读），每场景 2 预热+20 正式，2 请求/秒，总时长预算 90 秒，并发上限 8。

| 单位 | 首轮估算 / 上限 |
| --- | --- |
| 外层 HTTP，包括 identity | 67 |
| marker cache 边界调用 | 242 |
| 全冷假设下 KV get / put、origin SQL | 各最多 242 |
| 指标记录，不含内部入口 | 最多 66 |
| 合成 fixture | 11,600 评论 + 生成的投票和 1 用户；写索引另计 |
| Container / 真第三方调用 | starter 为 0 |
| Cron / Queue / DO / logger / storage | 另计，不包含在上述 HTTP 数字 |

建议第一轮批准：**Cloudflare 新增用量预算 US$1，测试资源最多保留 24 小时，不新增付费 Redis 套餐**；已有免费专用 Redis 不满足时先报告所需费用。
估算按 included allowance 已耗尽处理，不能依赖免费额度；第一轮只做可行性运行，下一轮扩大样本前重新给预算。

核验价格日期 2026-10-14：

- Workers Standard：新增请求 $0.30/百万，CPU $0.02/百万 ms；Worker Caching 命中也可能计请求。[官方定价](https://developers.cloudflare.com/workers/platform/pricing/)
- D1：读 $0.001/百万行，写 $1/百万行；索引会增加写入行，存储另计。[官方定价](https://developers.cloudflare.com/d1/platform/pricing/)
- KV：读 $0.50/百万、写/删除/list 各 $5/百万。242 次冷写约 $0.00121。[官方定价](https://developers.cloudflare.com/kv/platform/pricing/)
- Container：按实际 vCPU 使用和配置内存/磁盘时长收费；starter 不启动转换实例。[官方定价](https://developers.cloudflare.com/containers/platform/pricing/)

fixture 初始化若按 150,000 个含索引 rows_written 预留，超额写约 $0.15。starter 与初始化建议预留 $1；这不是账单承诺或计费硬限额。
后台 Cron 不能因 HTTP 运行结束继续无人看管；保留期间需跟踪它的用量，清理测试环境时先关闭测试触发器再回收资源。
源码、指标和结果报告保存后才删除测试数据；不清理任何生产资源。
