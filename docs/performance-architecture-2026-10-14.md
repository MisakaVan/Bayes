# Bayes 架构、性能成本与分阶段验收调查

日期：2026-10-14（Asia/Shanghai）。分支：Bayes / Atlos `perf/benchmark`。
源码出发点：Bayes `adc1625`；Atlos 从现有 user-hub 分支创建，不重置其已有提交。

本报告延续 2026-09-28 端点调查和 bulk 评论调查。当前工作包括源码审查、生产只读聚合、新 benchmark 工具和局部候选优化。
尚未部署测试环境或生产代码，不能把本地验证写成线上收益或完成全部服务验收。

## 证据口径

- 客户端完整响应、Worker handler 返回、invocation wall time、异步完成、WS 存活时间分别计量。
- Worker CPU 使用平台 TraceItem.cpuTime；本地 SQLite/Node 耗时不代替它。
- 同步关键路径上的串行等待、跨服务操作总数、最大并发、重试放大分别表示。
- HTTP 200 + partial、遗漏点位、后台任务失败、错误的最终状态均不算完整业务成功。
- 原始服务操作单位与费用估算分开；内部 fetch、Redis REST 请求、Redis 命令和 SQL 次数不能相互替换。
- OEM_ERR 是错误明细库，无全量成功分母；不能从其条目计算全站错误率、流量排名、p95 或 WS 会话数。

## 架构与主要成本

| 子系统 | 当前数据流 | 主要性能风险 / 验收重点 |
| --- | --- | --- |
| 默认 fetch | notification upgrade 判断 → Hono request-id/CORS → 路由、中间件 | Benchmark 单独包装默认入口；pre-Hono WS 同样经过测试身份校验 |
| 认证 | Better Auth/D1 → profile；身份和用户各有 10 秒 isolate 缓存及 in-flight 去重 | 冷暖身份、session 续期、失效和 profile 恢复分别测；不得扩大缓存陈旧期 |
| 公共图片/评论 | 每 marker PRC fetch → Worker response cache → KV → D1；登录后另加 viewer overlay | 100 marker 对应 100 次内部调用；并发 8 不减少总次数；PRC 内部 loader 仅当前调用范围有效 |
| 评论 SQL | 点位根评论和投票排序 → 递归后代 → 每父节点排名 → 返回树 | 后排序裁剪仍遍历不可见于最终响应的后代；深/宽测试需要记录执行计划和扫描量 |
| 进度 | 用户 DO 串行同步 → D1 mutation/outbox → stats DO 幂等 apply → alarm/D1 snapshot | 保留 per-user 顺序、幂等和冲突语义；成本包括异步交付、receipt 和清理 |
| 通知 | D1 持久化 → hydrate + unread → 每用户 NDO fanout；connect 读取 ready snapshot | 心跳回调导致唤醒；批量逐条串行读取值得后续评估；不可改为低频推送 |
| 定位 | 认证/绑定 → 上游 token HTTP → 双向 WebSocket 桥接 | 出站 WS 无法套用通知服务的休眠节省；断开、重连和有效定位延迟独立测 |
| 上传 | upload Redis 限流 → Container 转换 → R2/D1 → 审核队列 | 冷启动、60 秒处理时限、连接断开重试、图片质量及最终审核结果 |
| Queue | moderation/translation 消费主要逐条执行；webhook 队列独立 | batch size 10、timeout 5 秒；吞吐、重试、DLQ、完成年龄；仅对可独立操作考虑并行 |
| Cron | 每分钟 progress recovery、karma、可选 backfill；profile recovery 每 5 分钟 | 空闲循环也访问 D1/Redis；不能延迟恢复或省略健康判定来减少用量 |
| Logger | Tail 筛选异常 → OEM_ERR batch；每日清理 | 保留异常可查性；性能采样只在 benchmark logger 新增，生产不写逐请求指标 |

### 全服务覆盖表

| 服务 / 套件 | 已有证据与首期工具 | 待远端验收 |
| --- | --- | --- |
| Worker / Hono / Zod / Better Auth / nanoid / skland-kit / Resend SDK | 源码链路、现有正确性测试；独立 Worker 与 Tail CPU collector | 冷暖 CPU、依赖分段时间、套件初始化和认证路径 |
| PublicReadCache | 本地回源完整结果、SQL/KV 操作预算；当前逐 marker 缓存保留 | response-cache 命中率、缓存入口自身 CPU/调用成本、失效后读 |
| D1 DB | 当前聚合分布；合成数据库完整迁移 replay、真实 SQL 与执行计划 | rows_read/written、SQL duration、远端读写/冲突/历史增长 |
| D1 OEM_ERR | 独立 logger 配置和 dry-run | 错误写入、保留/清理和额外费用 |
| KV / R2 | KV 本地冷暖合批；benchmark binding meter | 传播延迟、操作数、字节量、失效和 orphan 维护 |
| DO User/Stats/Notification | 现有同步和生命周期测试、心跳兼容测试 | 每类 DO 自身 CPU、存储、alarm、活跃时长；不可只测默认 Worker CPU |
| Rate Limiting / Upstash Redis | 独立 namespace 配置；REST 请求与命令计数 | 平台限流、专用 Redis 延迟与配额、租约/OTP 原子性 |
| Queues / DLQ | 独立 producer/consumer 配置，队列名转换和事件 meter | 真正消费、重试、DLQ、积压与最终任务完成；HTTP starter 不包含这些 |
| Container / sharp / HEIF | Docker 镜像实际构建通过；原转换正确性测试 | 冷暖转换、运行时长、CPU/内存和质量对比 |
| Cloudflare Email / Resend / OAuth / Google Translation / OpenAI Moderation / Endfield / Discord | benchmark egress 使用显式配置替身；未配置依赖返回明确错误 | 首轮真实第三方端到端不验收；生产只读证据另列 |
| Observability / Tail | 100% benchmark 采样、指标 D1 表、7 天保留 | collector 本身用量、平台采样及内部入口覆盖；生产配置未扩大采样 |

## 生产只读规模：2026-10-14

两条 SELECT 的返回均确认 rows_written=0。证据：`performance-evidence-2026-10-14/production-distributions.json`。

- 当前数据库 175,648,768 字节；评论 active 562、flagged 3、stale 107；图片 active 5,947、flagged 20、stale 228。
- 可见评论根节点 541、depth=1 共 23、depth=2 共 1。
- 可见评论点位：337 个仅 1 条，89 个 2–5 条，2 个 6–20 条，最大 8 条。
- 已处理 progress outbox 为 118,267；此快照无其它状态。
- 聚合不是调用量排名。深回复树应作为极端场景；当前实际分布提示公共读回环、认证、长连接和历史增长优先于立即重写深树 SQL。

## 当前实现与验证

1. 本地基准覆盖 27 个场景：1/10/50/100 marker × 冷/KV 暖/混合 × 合批/逐点回源，加 3 种 bitmap 大小。
2. 每场景 2 次预热、10 个观测；比较完整评论树，包括后台 KV 写入。100 marker 冷回源分别 1 / 100 SQL，输出相同；这不是现网调用数下降。
3. 初始合成分布刻意包含宽/深评论和无关历史；它是 stress profile，尚未拟合生产完整分布。不得以它代表生产平均输入。
4. Base64 编码使用已有 nodejs_compat Buffer，消除逐字节构建字符串；保持所有字节和 Uint8Array 子视图语义。解码校验不变。
5. 通知 DO 注册 `OEMping1` 平台回显，保留旧 nonce echo。客户端 50 秒间隔、15 秒 ACK 时限、两次 miss 门槛不变；首次 miss 后本连接永久转 nonce，迟到静态 ACK 无法匹配下一次探测。
6. bulk partial 增加 `failedMarkerIds`，保留 items/partial/status；私有 overlay 保留 metadata。Atlos 成功 marker 可缓存，失败 marker 拒绝并可重新请求；旧服务器 partial 的空项也不能负缓存。
7. Atlos 公共/私有图片、评论和个人图片批次按 100 分片，共享 8 个并发槽直到正文处理结束。这个改动防止超过服务器上限被静默截断，不宣称它减少总服务调用。
8. Fresh migration replay 发现 0017 仍删除已在 0004 消失的 ef_pass。仅 benchmark bootstrap 明确省略该过时 DROP；未修改生产迁移。

本地前后报告位于 `performance-evidence-2026-10-14/local-*.json`，标记 Node 版本、fixture/config hash 和缺口。
当前本地成本门禁通过；时长样本少且有调度/JIT 波动，不是远端性能 SLO。

### 本轮验证记录

- Bayes `pnpm run check`：WAF 清单、应用/logger 类型、lint、360 项测试和 logger dry-run 全部通过。
- benchmark TypeScript 与 10 项 Node 检查通过；另有 binding meter 和错误凭证清理 2 项测试通过。
- 本地基准前后各 27 场景，每场景 10 个观测；108 项正确性/操作数比较通过。
- Atlos：通知兼容、评论 partial/分片和已有 UGC 请求凭证共 9 项测试通过；`tsc --noEmit` 通过。
- benchmark 主 Worker、logger、upstream dry-run 通过；主 Worker dry-run 实际构建了本地图片 Container 镜像。没有远端部署。
- strict partial 旧测试原先只期待 items/partial；按本轮兼容新增 failedMarkerIds 更新了精确期望，保留了 no-store 和 overload 断言。
- Node 一轮中 100,000-point bitmap 中位耗时约 0.121 → 0.071ms；1,000-point 样本存在小幅波动。该结果仅是候选线索，不宣称 Worker CPU 已改善。

## 下一阶段决策

- 优先完成远端低量可行性运行，校准观测开销，再扩展为至少 5 轮、足够 p95 样本的完整对照。
- 逐点 PRC response cache 保持不动。冷回源合批需要同时证明热命中和失效不回退；禁止直接改为任意 marker 组合缓存。
- 保留现有 progress 查询效率索引和 viewer overlay 限定已返回 ID 的逻辑。当前没有证据要求替换它们。
- 通知批量 hydrate/unread/fanout、认证实例创建、维护循环和队列并行都先测，再选择实现；尚无生产 CPU 排名。
- 验收必须包含业务结果和全链路资源成本，不接受把同步耗时转移到后台作为总成本优化。
- 完整服务 SLO 仍未验收；绝对 CPU/延迟门槛须在真实基线后冻结。
