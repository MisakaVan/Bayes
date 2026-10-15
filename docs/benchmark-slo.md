# 真实流量性能观测与 SLO 验收

2026-10-15 决策：使用 Cloudflare CLI（`cf`）查询现有 Workers Observability、Metrics 和 traces，结合各服务现有用量数据，替代合成 benchmark。已移除独立 benchmark Worker、mock 上游、Tail 指标 collector、合成 fixture、主动请求器、本地计时跑分和对应 SLO CLI。保留业务正确性、幂等、缓存失效、协议兼容等本地回归测试。

## 执行与交付

1. 固定北京时间起止窗口及 UTC 对应时间，记录部署版本、日志/trace 采样率和数据留存；窗口内有部署则按版本拆分。
2. 用 `cf o11y telemetry query` 读取已有数据，按真实字段 `$workers.event.request.method`、`$workers.event.path`、`$workers.outcome` 分组。动态路径按路由模板归并并脱敏。查询返回达到 limit 时分页，保留全部分组。
3. 每个端点交付请求数、结果状态、CPU 平均/p50/p95/p99/max、wall 平均/p50/p95/p99/max及五分钟趋势。普通 HTTP、内部入口、Cron/Queue、WebSocket/流分别解释。
4. 优先核查 CPU 总量和高分位、串行等待、重复回源、跨服务调用次数、重试及重连。CPU 总量仅在平台计量或采样权重明确时报告；trace 不完整时不推断完整调用链复杂度。
5. 按同一时间窗口补充 D1、KV、R2、DO、Queue/DLQ、Container、Redis 和第三方的真实用量、失败及完成情况；无权限、无调用、无数据分别记录。完整服务清单见[生产观测方案](production-observation-2026-10-15.md)。
6. 保存查询时间、过滤器、覆盖范围、采样元数据及脱敏结果。完整端点大表和机器可读 JSON 一起保留，便于复核。

## 验收口径

- 真实流量观测是当前性能评估的主线；CLI 是查询工具，指标覆盖取决于已有遥测。缺少客户端 TTFB、第三方用量或 trace 边界时，明确标记未覆盖。
- 跨版本比较匹配路由、输入量、缓存状态、区域、事件类型、业务峰值和采样条件，分别报告 CPU、响应阶段耗时和单位业务资源用量；流量结构变化不能归因于代码优化。
- 保留失败分母；系统异常与客户端断开分开。长连接 wall time 是生命周期相关指标，不能作为普通 HTTP 响应速度。
- 多个动态路径的 p95/p99 不能合并平均；需要重新查询共同分组或完整样本。样本量不足的分位数只用于定位，不宣告 SLO 通过。
- 绝对 SLO 在真实端点基线及服务覆盖确认后确定；现阶段沿用观测方案中的相对变化提示，不自动宣告通过。
- 性能优化必须同时通过相关功能回归，保留完整业务结果、时效、顺序、幂等、失败恢复和推送能力；不能靠 partial、降低推送频率、延迟任务或其他服务降级降低用量。

## 已有结果

- [2026-10-15 生产观测方案及分析](production-observation-2026-10-15.md)
- [10:00–16:30 全窗口端点大表](performance-evidence-2026-10-14/production-endpoint-report-2026-10-15-1000-1630.md)
- [端点、状态及五分钟数据 JSON](performance-evidence-2026-10-14/production-endpoint-report-2026-10-15-1000-1630.json)

历史本地 benchmark 结果仅作归档证据，不能代表 Cloudflare Worker CPU 或证明线上收益。不再维护合成 benchmark 环境和命令。
