# Benchmark evidence

Environment: local; commit: 460eed3e274a26ba6b1abb273a69159fb2cbf580; runtime: v25.9.0.

Local duration is not Cloudflare CPU. Missing measurements are not zero. Operation counts are application operations, not invoices.

| Scenario | Attempts / failures | Duration p50 / p95 ms | Worker CPU p95 ms | Operations per attempt | Correct |
| --- | --- | --- | --- | --- | --- |
| comments/1/cold/batch-origin | 10 / 0 | 1.171 / 2.690 | unavailable | d1.query=1, kv.get=1, kv.put=1 | true |
| comments/1/cold/per-marker-origin | 10 / 0 | 1.015 / 1.126 | unavailable | d1.query=1, kv.get=1, kv.put=1 | true |
| comments/1/kv-warm/batch-origin | 10 / 0 | 0.090 / 0.123 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/kv-warm/per-marker-origin | 10 / 0 | 0.087 / 0.095 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/mixed/batch-origin | 10 / 0 | 0.084 / 0.086 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/1/mixed/per-marker-origin | 10 / 0 | 0.085 / 0.095 | unavailable | d1.query=0, kv.get=1, kv.put=0 | true |
| comments/10/cold/batch-origin | 10 / 0 | 7.113 / 9.981 | unavailable | d1.query=1, kv.get=10, kv.put=10 | true |
| comments/10/cold/per-marker-origin | 10 / 0 | 9.220 / 10.287 | unavailable | d1.query=10, kv.get=10, kv.put=10 | true |
| comments/10/kv-warm/batch-origin | 10 / 0 | 0.776 / 1.957 | unavailable | d1.query=0, kv.get=10, kv.put=0 | true |
| comments/10/kv-warm/per-marker-origin | 10 / 0 | 0.769 / 1.125 | unavailable | d1.query=0, kv.get=10, kv.put=0 | true |
| comments/10/mixed/batch-origin | 10 / 0 | 4.281 / 4.779 | unavailable | d1.query=1, kv.get=10, kv.put=5 | true |
| comments/10/mixed/per-marker-origin | 10 / 0 | 5.236 / 6.689 | unavailable | d1.query=5, kv.get=10, kv.put=5 | true |
| comments/50/cold/batch-origin | 10 / 0 | 31.171 / 37.901 | unavailable | d1.query=1, kv.get=50, kv.put=50 | true |
| comments/50/cold/per-marker-origin | 10 / 0 | 48.803 / 53.300 | unavailable | d1.query=50, kv.get=50, kv.put=50 | true |
| comments/50/kv-warm/batch-origin | 10 / 0 | 3.527 / 4.174 | unavailable | d1.query=0, kv.get=50, kv.put=0 | true |
| comments/50/kv-warm/per-marker-origin | 10 / 0 | 3.272 / 4.470 | unavailable | d1.query=0, kv.get=50, kv.put=0 | true |
| comments/50/mixed/batch-origin | 10 / 0 | 17.969 / 18.866 | unavailable | d1.query=1, kv.get=50, kv.put=25 | true |
| comments/50/mixed/per-marker-origin | 10 / 0 | 24.371 / 27.171 | unavailable | d1.query=25, kv.get=50, kv.put=25 | true |
| comments/100/cold/batch-origin | 10 / 0 | 67.619 / 78.321 | unavailable | d1.query=1, kv.get=100, kv.put=100 | true |
| comments/100/cold/per-marker-origin | 10 / 0 | 92.946 / 94.703 | unavailable | d1.query=100, kv.get=100, kv.put=100 | true |
| comments/100/kv-warm/batch-origin | 10 / 0 | 6.722 / 9.034 | unavailable | d1.query=0, kv.get=100, kv.put=0 | true |
| comments/100/kv-warm/per-marker-origin | 10 / 0 | 6.743 / 7.775 | unavailable | d1.query=0, kv.get=100, kv.put=0 | true |
| comments/100/mixed/batch-origin | 10 / 0 | 38.463 / 52.727 | unavailable | d1.query=1, kv.get=100, kv.put=50 | true |
| comments/100/mixed/per-marker-origin | 10 / 0 | 54.534 / 130.321 | unavailable | d1.query=50, kv.get=100, kv.put=50 | true |
| progress/bitmap/1000 | 10 / 0 | 0.012 / 0.041 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |
| progress/bitmap/10000 | 10 / 0 | 0.007 / 0.029 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |
| progress/bitmap/100000 | 10 / 0 | 0.064 / 0.141 | unavailable | d1.query=0, kv.get=0, kv.put=0 | true |

Coverage gaps:

- Cloudflare Worker CPU, D1 rows_read and remote latency are unavailable locally.
- Cache origin scenarios do not measure WorkerEntrypoint response-cache hits or internal fetch billing.
- Synthetic default profile is not yet fitted to current production distributions.
- Auth, DO, Queue, Cron, Container, Redis and third-party end-to-end benchmarks require isolated resources.
