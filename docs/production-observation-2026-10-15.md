# 2026-10-15 生产负载观测方案

本轮目标：利用今日自然业务负载，找出 CPU、响应时间和服务用量的主要来源，检查已部署性能改动的运行表现。使用现有生产遥测及服务控制台，不创建 benchmark Worker、D1、Redis、Container 或 collector，不发压、不改变服务能力、采样率或恢复策略。

## 已确认的起点

- 2026-10-14 22:28:05（北京时间）部署版本 `42bcb033-ad84-4b96-8476-8dee3d90e217`，100% 流量。部署备注为 `User-hub fixes plus runtime performance f2f6f45; benchmark harness excluded`。观测开始和结束再核对版本；发生部署则按版本切分。
- 23:51 的生产复查：原来缺业务资料的 80 个已验证身份全部补齐；缺口、有效会话缺口、重复/无效数字 UID 均为 0。已有 4,794 个用户的 UID、昵称及后缀未变。详见[补齐证据](performance-evidence-2026-10-14/profile-repair.json)。这是存量修复，不代表新注册缺口已被永久阻止。
- 已通过生产 Worker settings API 确认：Observability 开启；invocation logs 开启且持久化，logs 采样率 100%；traces 持久化，采样率 5%。观测开始再核实配置与数据覆盖；配置开启不等于已经取得全部记录。查询字符串当前未自动清除，导出必须只保留路由路径并移除敏感 query。
- 当前 Chrome 中的 Cloudflare 标签已跳转到登录页，不能把它当作已登录控制台。Wrangler 的 Observability 字段查询仍返回 403/code 10000，但同一账号凭据可读取 GraphQL Workers Metrics 和 D1；先用 GraphQL 做 Worker 总体观测，再由控制台补端点级 CPU、Wall Time 和 Trace。OEM-ERR 只用于错误路径，不能代替成功请求分母。
- 9 月 28 日端点调查报告用作服务及调用链清单；它的错误留存数量不是本轮流量基线，旧端点和链路要与当前版本核对。

## 时间窗口与执行

统一使用北京时间，查询记录同时保存 UTC 时间，所有窗口左闭右开。

| 阶段 | 时间 | 内容 |
| --- | --- | --- |
| 准备 | 今晚 / 负载前 | 确认可读遥测、生产采样配置、服务权限；记录版本和已有告警 |
| 前窗口 | 开始前 30 分钟 | Worker/服务空闲用量、队列积压、资料缺口基线 |
| 负载窗口 | 实际开始至结束 | 5 分钟分桶，HTTP/WS/Cron/Queue 分开，记录峰值及业务类型 |
| 恢复窗口 | 结束后 30 分钟 | 队列完成/重试/DLQ、WS 占用及业务资料新缺口；积压未恢复则继续标为未完成 |
| 汇总 | 当日午后 | 导出聚合数据、慢请求 traces，给出端点排名和下一阶段优化项 |

此前的预案曾把历史检索切在 **06:00–12:00**（北京时间）；本次验收改用 **10:00 至当前**的统一主窗口，避免把不同负载阶段混在一起。若明早实际高负载时间另有定义，再按实际时间追加切分。

优先查询已留存的历史聚合；不需要持续维持 `tail` 或长连接。峰值期间可人工查看现有仪表盘，结束后批量查询同一窗口。不存在完整历史数据的项目明确留缺口，不临时启动新采集服务。

## 指标口径

| 问题 | 指标与分组 | 获取与限制 |
| --- | --- | --- |
| CPU 花在哪里 | 按版本、事件类型、method/路由模板统计次数、CPU p50/p95/p99、平均值及总量；分别列 CPU 总量前五和 p95 前五 | Workers Metrics / Observability。查询前发现真实字段；`$workers.cpuTimeMs` 是官方字段示例。统计单位为 invocation，内部入口单列，不能相加成为用户请求量 |
| 用户是否变慢 | 普通 HTTP 的服务端响应阶段耗时；可用的浏览器真实请求 TTFB/完整响应 p50/p95 | Worker wall time 另列，不能当作客户端响应时间。现有客户端无被动数据时，客户端响应指标记为缺失；可用一次正常使用的浏览器 Network 时间线补充个案，不据此推断总体 p95 |
| 链路是否过长 | 每条可完整关联 trace 的服务边界次数、串行关键路径耗时、同服务重复调用、重试次数 | D1/KV/R2/DO/WorkerEntrypoint/Container/外部 HTTP 等；只统计真实 span，覆盖不了的边界记缺失，不把同 isolate 函数算网络跳 |
| 用量是否合理 | 每完成业务操作的资源操作数；无业务分母时按每 1,000 个同类 HTTP 请求规范化，保留总量 | Redis REST 请求与命令、SQL 查询与 rows_read/write 分开；请求形态、冷暖缓存、批量 marker 数和图片大小必须可比 |
| 连接是否浪费 | 通知与定位分别记录建链、重连、断开、消息/自动应答、DO 活跃时长；有分母才计算每连接小时 | 心跳、fanout、握手不能充当用户数/PV；定位出站 WS 与通知休眠分别分析。没有连接小时分母时只给原始量 |
| 功能是否保持 | 5xx、异常、超时、partial、429、注册后资料缺口、队列完成年龄和 DLQ | HTTP 状态与 Worker invocation outcome 不相等；正常业务拒绝与系统错误分开。失败保留分母；HTTP 已返回不代表后台任务已完成 |

CPU 总量仅在平台提供完整计量或已知采样权重时报告；只有采样日志时写“样本 CPU 总量”，不把样本数当完整请求数。p95/p99 不能由多个分桶的分位数再求平均，需要原始样本或平台完整窗口聚合。不同采样率、截断数据、异常遥测值必须标注。

## 所有服务的覆盖清单

| 服务 / 套件 | 本轮观察内容 | 数据来源与可达性 |
| --- | --- | --- |
| 主 Worker、Hono、Zod、Better Auth、nanoid、skland-kit | 端点 CPU、auth/session 路径、错误与调用链 | 平台遥测访问待解决；这些库在 isolate 内，不伪造独立服务用量或库级 CPU 归因 |
| PublicReadCache / WorkerEntrypoint、Cache API | 外层批量读取与内部调用、冷暖回源、同 key 重复读取 | 可关联 traces / 已有缓存指标；无命中字段时不能只凭延迟推断命中率 |
| 业务 D1（DB）、错误 D1（OEM_ERR） | 查询次数、读写行、延迟；异常类型、新资料缺口 | D1 分库查询已可用，控制台服务用量权限待核实；错误库仅诊断，不提供成功请求分母 |
| OEM_KV、UGC R2 / 资产 CDN | get/put/delete、回源、对象读写和字节量 | Cloudflare 服务指标及 traces；跨账号/网站静态资产不并入业务 API 请求分母 |
| User / Stats / Notification DO | 请求、CPU、活跃 duration/存储、alarm、同步完成和通知连接 | 各 namespace 自身 Metrics / traces，权限待核实；外层 Worker 数值不能代替 DO 数值 |
| moderation / translation / webhook Queue，三类 DLQ | 接收、完成、重试、积压、年龄、DLQ | 队列控制台与现有任务状态；须覆盖恢复窗口 |
| 图片 Container、sharp、HEIF 转换 | 启动、运行 CPU/内存/时长、转换延迟与失败 | Container Metrics / 现有日志；没有上传样本则本轮未覆盖，不能验收图片质量 |
| CF Rate Limiting、Upstash Redis | 限流拒绝；REST 请求、命令、延迟与错误 | 现有控制台 / traces，访问待核实；不扫描 Redis keys，不改套餐或限流 |
| Cloudflare Email、Resend | 发送量、失败、重试及实际提供方 | 现有日志、控制台和已有聚合；不额外发送邮件，不读取收件人明细 |
| Google/GitHub/Discord OAuth | 真实登录交换次数、外部延迟与失败 | 已有 traces/错误；没有登录业务则未覆盖，不制造测试账号 |
| Google Translation、OpenAI Moderation、Discord webhook | 实际调用、重试、延迟、任务完成和配额 | traces、队列及提供方已有使用量；不提交额外翻译/审核/消息，无权限则记缺口 |
| Endfield / Skland / Skport HTTP 与 WS | token/角色/定位请求、凭证刷新、重连、消息延迟 | 现有真实请求 traces/错误/连接指标；不增加定位连接 |
| Cron、logger Tail Worker | 空闲/繁忙 CPU、资源操作、错误写入用量 | 独立事件和 Worker Metrics；纳入系统成本但不混入 HTTP 延迟 |

各服务保持其真实计量粒度：有的提供分钟级，有的只提供小时/每日用量。只按可对齐窗口比较，不能把当日累计量拆成假想的 5 分钟量。“本轮无调用”与“无法获取数据”分别标注。

## 数据获取与额外资源

首选已有登录的 Cloudflare 控制台：Workers & Pages → oem-backend → Metrics / Observability，选定时间窗口，再查看 D1、KV、R2、DO、Queues、Container；第三方用已有控制台。当前控制台登录尚未成立，因此已先用 GraphQL Workers Metrics 查询 `oem-backend` 的请求、错误、子请求和 CPU 分组摘要；这不需要新资源，也不产生业务流量。API 自动查询只使用本机配置的受限 Token，不在聊天、命令参数或报告中保存 Token。

Cloudflare 遥测查询 API 要求 `Workers Observability Write` 权限，虽然本轮只执行读取；如使用该权限，不执行保存查询、共享链接或配置修改。其他服务按所需读取权限开放，不申请全局 API Key。[API 权限说明](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/)

本轮新增远端资源为 **0**；没有合成压测、遥测写入表或额外业务第三方调用。新增操作仅为管理面查询、少量只读 D1 聚合和本地报告文件。D1 聚合会产生读行用量，日志/trace 保持现有计费；不承诺绝对零成本。资料缺口只在前/后窗口各核对一次，避免峰值期间反复全表扫描。历史遥测优先分组查询，遇限流停止轮询，保留覆盖缺口。

保存聚合、字段/采样配置、时间/版本和脱敏路由。原始 Cookie、Authorization、OTP、邮件、UID、坐标、请求正文不进入可提交证据；敏感导出只在本机忽略目录中保留，报告不共享查询链接。

## 判断结果及下一阶段

1. 先完成覆盖表及端点排名：样本数、完整请求分母来源、CPU、HTTP 响应指标、服务操作量和失败率。每端点至少 100 个可用样本才把 p95 用作初步诊断；p99 少于 1,000 个样本只展示参考值。达不到则标证据不足，这些是工作门槛，不是已批准 SLO。
2. 在可比路由、业务输入、区域、事件类型、版本及采样条件下比较历史窗口。首轮诊断提示线：CPU/响应 p95 或单位资源用量比可比基线升高 20% 且持续三个 5 分钟桶；新资料缺口、异常积压或关键功能失败单独提示，不等待性能阈值。
3. 今晚部署含性能改动及其他功能修复，且没有采集交错的同输入生产基线；真实流量差异、缓存、输入量与上游变化都可能影响结果。明天可建立运行基线和排序瓶颈，不能单独证明 `f2f6f45` 带来某个百分比改进。
4. 无客户端时延、完整 CPU 或某服务实际完成数据时，相应验收状态为“未覆盖/证据不足”。不因错误库低计数或零调用而给出全服务通过。
5. 根据真实热点选一两项下一阶段优化；只对生产观测无法解释的热点补本地同输入实验。正式绝对 SLO 在本轮得到路由分布后确认，使用真实流量观测验收；合成 benchmark 及 remote 门禁已撤除，见[当前验收流程](benchmark-slo.md)。

## 10:00 后实测结果（北京时间）

本次主窗口为 `2026-10-15 10:00:00` 至 `16:30:01`（UTC 对应 `02:00:00` 至 `08:30:01`），固定在部署版本 `42bcb033-ad84-4b96-8476-8dee3d90e217`。完整的 5 分钟粒度、method/path/outcome 分组和脱敏后的端点大表保存在[端点请求报告](performance-evidence-2026-10-14/production-endpoint-report-2026-10-15-1000-1630.md)及[端点请求 JSON 证据](performance-evidence-2026-10-14/production-endpoint-report-2026-10-15-1000-1630.json)。

- GraphQL 主窗口参考为 `107,019` 次 invocation，`105,955` 次成功；非成功状态 `1,064` 次（`0.994%`），其中客户端断开 `507`、响应流断开 `465`、脚本异常 `91`、load shed `1`。GraphQL `errors` 为 `92`（`0.0860%`），subrequests `11,846`。
- 成功请求 CPU `p50 2.226 ms / p99 79.917 ms`；Worker wall time `p50 245.07 ms / p99 2,672.668 ms`。wall time 不是客户端 TTFB，长连接必须单独解释。
- Observability 端点分组返回 `99,782` 个可归属到 path 的观测请求，包含 `511` 个原始 method/path/outcome 分组、`92` 个脱敏端点模板、`112` 个端点/状态行。另一个无分组查询返回 `102,994` 次参考 invocation；两者是独立自适应采样查询，不能用差值推断缺失端点请求。
- 请求量最大的成功端点是 `GET /uploads/v1/images`（35,261，CPU p99 69 ms，wall p99 1.732 s）、`GET /uploads/v1/comments`（16,898，94 ms，2.022 s）、`GET /comments`（9,586，6 ms，1.060 s）、`GET /uploads/v1/images/mine`（8,734，100 ms，2.525 s）和 `GET /images`（7,319，6 ms，0.954 s）。
- 响应速度优先候选是 `POST /sync`（2,800，wall p50 10.580 s / p95 11.148 s / p99 11.543 s）、`GET /locator/position`（383，wall p50 1.273 s / p95 19.114 s / p99 46.954 s）和 `POST /progress/v1/sync`（2,539，wall p50 1.394 s / p95 2.824 s / p99 3.288 s）。
- CPU p99 优先候选是 `GET /auth/v1/session`（1,458，119 ms）、`GET /locator/position`（107 ms）、`GET /uploads/v1/images/mine`（100 ms）、`GET /binding/v1/endfield/status`（96 ms）和 `GET /uploads/v1/comments`（94 ms）。
- 连接类异常集中在 `GET /connect`（canceled 663、responseStreamDisconnected 96）、`GET /notify/v1/live`（canceled 423、responseStreamDisconnected 488）和 `GET /locator/position-stream`（exception 92、canceled 25、load shed 1）。定位流异常的 wall p50 约 271 秒、p95 约 72.5 分钟、p99 约 112.8 分钟；这是连接/上游等待候选，不能直接归因于 Worker CPU。

这次已经完成端点级大表；后续优化按 `/sync`、`/locator/position`、`/locator/position-stream`、`/notify/v1/live`、`/connect` 的真实调用链继续下钻。端点报告保留每个原始分组的数值统计；动态路径只保存脱敏模板和数字指标，不保留用户、票据或资产标识。此次没有创建远端 benchmark 资源、没有发压，也没有修改生产流量或服务配置。

## 当日交付

一份观测报告：负载窗口/版本/覆盖限制、CPU 和延迟前五端点、服务用量与后台恢复、auth 资料缺口、慢链路证据及按收益排序的下一阶段工作。没有开启定时任务或通知；执行时点和访问方式确认后再安排。

指标依据：[Workers Metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)、[Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)、[Traces 与采样](https://developers.cloudflare.com/workers/observability/traces/)。来源核验日期 2026-10-14。
