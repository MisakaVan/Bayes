# Benchmark evidence

Environment: local; commit: 460eed3e274a26ba6b1abb273a69159fb2cbf580; runtime: v25.9.0.

Local duration is not Cloudflare CPU. Missing measurements are not zero. Operation counts are application operations, not invoices.

| Scenario | Attempts / failures | Duration p50 / p95 ms | Worker CPU p95 ms | Operations per attempt | Correct |
| --- | --- | --- | --- | --- | --- |
| comments/1/cold/batch-origin | 10 / 0 | 1.092 / 1.578 | unavailable | d1.query=1, kv.get=1, kv.put=1 | true |
| comments/1/cold/per-marker-origin | 10 / 0 | 1.058 / 1.268 | unavailable | d1.query=1, kv.get=1, kv.put=1 | true |
| comments/1/kv-warm/batch-origin | 10 / 0 | 0.093 / 0.109 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/kv-warm/per-marker-origin | 10 / 0 | 0.086 / 0.106 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/mixed/batch-origin | 10 / 0 | 0.086 / 0.098 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/mixed/per-marker-origin | 10 / 0 | 0.095 / 0.100 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/10/cold/batch-origin | 10 / 0 | 7.576 / 9.439 | unavailable | d1.query=1, kv.get=10, kv.put=10 | true |
| comments/10/cold/per-marker-origin | 10 / 0 | 9.476 / 9.972 | unavailable | d1.query=10, kv.get=10, kv.put=10 | true |
| comments/10/kv-warm/batch-origin | 10 / 0 | 0.721 / 2.394 | unavailable | d1.query=0, kv.get=10, kv.put=0 | true |
| comments/10/kv-warm/per-marker-origin | 10 / 0 | 0.696 / 1.187 | unavailable | d1.query=0, kv.get=10, kv.put=0 | true |
| comments/10/mixed/batch-origin | 10 / 0 | 3.924 / 4.082 | unavailable | d1.query=1, kv.get=10, kv.put=5 | true |
| comments/10/mixed/per-marker-origin | 10 / 0 | 4.951 / 5.949 | unavailable | d1.query=5, kv.get=10, kv.put=5 | true |
| comments/50/cold/batch-origin | 10 / 0 | 35.208 / 53.592 | unavailable | d1.query=1, kv.get=50, kv.put=50 | true |
| comments/50/cold/per-marker-origin | 10 / 0 | 47.206 / 54.826 | unavailable | d1.query=50, kv.get=50, kv.put=50 | true |
| comments/50/kv-warm/batch-origin | 10 / 0 | 3.339 / 4.114 | unavailable | d1.query=0, kv.get=50, kv.put=0 | true |
| comments/50/kv-warm/per-marker-origin | 10 / 0 | 3.368 / 3.955 | unavailable | d1.query=0, kv.get=50, kv.put=0 | true |
| comments/50/mixed/batch-origin | 10 / 0 | 18.883 / 21.289 | unavailable | d1.query=1, kv.get=50, kv.put=25 | true |
| comments/50/mixed/per-marker-origin | 10 / 0 | 25.812 / 27.806 | unavailable | d1.query=25, kv.get=50, kv.put=25 | true |
| comments/100/cold/batch-origin | 10 / 0 | 72.901 / 134.194 | unavailable | d1.query=1, kv.get=100, kv.put=100 | true |
| comments/100/cold/per-marker-origin | 10 / 0 | 97.017 / 140.654 | unavailable | d1.query=100, kv.get=100, kv.put=100 | true |
| comments/100/kv-warm/batch-origin | 10 / 0 | 7.134 / 19.290 | unavailable | d1.query=0, kv.get=100, kv.put=0 | true |
| comments/100/kv-warm/per-marker-origin | 10 / 0 | 6.827 / 8.235 | unavailable | d1.query=0, kv.get=100, kv.put=0 | true |
| comments/100/mixed/batch-origin | 10 / 0 | 38.481 / 66.033 | unavailable | d1.query=1, kv.get=100, kv.put=50 | true |
| comments/100/mixed/per-marker-origin | 10 / 0 | 55.851 / 63.396 | unavailable | d1.query=50, kv.get=100, kv.put=50 | true |
| progress/bitmap/1000 | 10 / 0 | 0.017 / 0.027 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |
| progress/bitmap/10000 | 10 / 0 | 0.016 / 0.030 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |
| progress/bitmap/100000 | 10 / 0 | 0.120 / 0.144 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |

Coverage gaps:

- Cloudflare Worker CPU, D1 rows_read and remote latency are unavailable locally.
- Cache origin scenarios do not measure WorkerEntrypoint response-cache hits or internal fetch billing.
- Synthetic default profile is not yet fitted to current production distributions.
- Auth, DO, Queue, Cron, Container, Redis and third-party end-to-end benchmarks require isolated resources.
