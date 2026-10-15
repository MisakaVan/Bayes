# 2026-10-15 10:00–16:30 端点请求情况报告

查询对象：`oem-backend`，北京时间 `10:00:00–16:30:01`；数据来自 Cloudflare Workers Observability 已有 invocation 记录，没有发起业务请求。

GraphQL 主窗口参考总量为 **107,019** 次 invocation；Observability 端点分组返回 **99,782** 个可归属到 path 的观测请求、**511** 个原始 method/path/outcome 分组，脱敏后 **92** 个端点模板、**112** 个端点/状态行。另一个同窗口、无分组的 Observability 查询返回 102,994 次参考 invocation。两种查询都启用自适应采样，且部分事件没有可用 HTTP path，不能直接相减；下表以端点分组结果为准。查询读取 10.28 GB 日志数据，这只是查询扫描量，不是业务流量。

## 口径

- `req` 是该端点/状态的 invocation 数；`ok` 外的状态单独列出。
- CPU 与 wall time 单位均为毫秒。
- `p50/p95/p99` 只有 `exact=是` 时是该脱敏端点模板的精确分组分位数；同一模板合并多个动态路径时显示 `—`，加权平均和请求数仍准确，具体子分组保存在 JSON 的 `rawGroups`。
- Worker wall time 不是浏览器 TTFB；`connect`、通知和定位流必须按连接生命周期解读。

## 端点/状态完整表

| # | method | endpoint template | outcome | req | CPU avg | CPU p50 | CPU p95 | CPU p99 | CPU max | wall avg | wall p50 | wall p95 | wall p99 | wall max | raw variants | exact |
|---:|:---:|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 1 | GET | /uploads/v1/images | ok | 35261 | 6.803 | 2 | 30 | 69 | 183 | 254.166 | 55 | 1080 | 1732 | 5309 | 1 | 是 |
| 2 | GET | /uploads/v1/comments | ok | 16898 | 10.948 | 2 | 55 | 94 | 177 | 550.187 | 400 | 1624 | 2022 | 8909 | 1 | 是 |
| 3 | GET | /comments | ok | 9586 | 1.807 | 1 | 4 | 6 | 11 | 407.584 | 382 | 879 | 1060 | 17243 | 1 | 是 |
| 4 | GET | /uploads/v1/images/mine | ok | 8734 | 13.292 | 3 | 62 | 100 | 178 | 794.708 | 613 | 2051 | 2525 | 8940 | 1 | 是 |
| 5 | GET | /images | ok | 7319 | 1.682 | 1 | 4 | 6 | 11 | 281.308 | 210 | 760 | 954 | 3514 | 1 | 是 |
| 6 | GET | /progress/v1/stats | ok | 3928 | 2.695 | 1 | 14 | 26 | 44 | 142.108 | 39 | 738 | 1174 | 7421 | 1 | 是 |
| 7 | POST | /sync | ok | 2800 | 15.064 | 15 | 25 | 31 | 57 | 9898.015 | 10580 | 11148 | 11543 | 13198 | 1 | 是 |
| 8 | POST | /apply | ok | 2745 | 2.021 | 2 | 5 | 8 | 19 | 79.449 | 34 | 347 | 724 | 1713 | 1 | 是 |
| 9 | POST | /progress/v1/sync | ok | 2539 | 14.105 | 11 | 52 | 86 | 170 | 1491.483 | 1394 | 2824 | 3288 | 4370 | 1 | 是 |
| 10 | GET | /auth/v1/session | ok | 1458 | 29.342 | 20 | 79 | 119 | 172 | 977.139 | 771 | 3243 | 4007 | 7475 | 1 | 是 |
| 11 | GET | /progress-stats | ok | 1102 | 1.26 | 1 | 2 | 4 | 13 | 363.611 | 206 | 1086 | 1507 | 2218 | 1 | 是 |
| 12 | POST | /uploads/v1/comments/translations | ok | 913 | 5.726 | 4 | 14 | 25 | 39 | 662.567 | 581 | 1346 | 2501 | 6115 | 1 | 是 |
| 13 | GET | /binding/v1/endfield/status | ok | 774 | 8.761 | 2 | 35 | 96 | 143 | 532.329 | 255 | 1893 | 2165 | 2590 | 1 | 是 |
| 14 | GET | /connect | canceled | 663 | 1.861 | 2 | 4 | 5 | 8 | 167.327 | 93 | 271 | 1695 | 4897 | 1 | 是 |
| 15 | GET | /state | ok | 598 | 10.01 | 9 | 25 | 34 | 64 | 331.853 | 219 | 629 | 4592 | 10193 | 1 | 是 |
| 16 | GET | /notify/v1/live | responseStreamDisconnected | 488 | 49.301 | 43 | 84 | 111 | 127 | 1130.893 | 989 | 2489 | 2885 | 5424 | 1 | 是 |
| 17 | POST | /uploads/v1/images | ok | 473 | 15.013 | 12 | 32 | 59 | 109 | 1858.529 | 1263 | 4720 | 6221 | 7341 | 1 | 是 |
| 18 | GET | /notify/v1/live | canceled | 423 | 49.229 | 44 | 78 | 93 | 122 | 1244.028 | 1048 | 2631 | 3074 | 3709 | 1 | 是 |
| 19 | POST | /progress/v1/manifest | ok | 405 | 16.035 | 13 | 31 | 76 | 133 | 943.395 | 720 | 2269 | 2780 | 4185 | 1 | 是 |
| 20 | GET | /locator/position | ok | 383 | 13.953 | 7 | 56 | 107 | 122 | 3801.849 | 1273 | 19114 | 46954 | 68154 | 1 | 是 |
| 21 | GET | /uploads/v1/file/poi/:param/:param/:file.webp | ok | 344 | 1.86 | — | — | — | — | 274.587 | — | — | — | — | 318 | 否 |
| 22 | GET | /progress/v1/state | ok | 328 | 3.799 | 1 | 15 | 54 | 94 | 868.32 | 796 | 2064 | 2875 | 3511 | 1 | 是 |
| 23 | POST | /prepare | ok | 113 | 4.478 | 5 | 8 | 11 | 12 | 2454.699 | 2211 | 4141 | 4706 | 5171 | 1 | 是 |
| 24 | GET | /me/v1/contributions/:param/preview | ok | 110 | 6.055 | — | — | — | — | 507.855 | — | — | — | — | 78 | 否 |
| 25 | GET | /connect | responseStreamDisconnected | 96 | 2.292 | 2 | 4 | 6 | 6 | 191.542 | 176 | 346 | 729 | 729 | 1 | 是 |
| 26 | GET | /locator/position-stream | exception | 92 | 259.772 | 89 | 1077 | 2363 | 2363 | 846723.707 | 271271 | 4348884 | 6767126 | 6767126 | 1 | 是 |
| 27 | OPTIONS | /progress/v1/manifest | ok | 80 | 7.912 | 2 | 23 | 54 | 54 | 8.887 | 3 | 24 | 63 | 63 | 1 | 是 |
| 28 | POST | /auth/v1/sign-in/email | ok | 78 | 113.013 | 101 | 228 | 249 | 249 | 985.436 | 850 | 1792 | 2485 | 2485 | 1 | 是 |
| 29 | GET | /notify/v1/live | ok | 67 | 37.955 | 38 | 74 | 87 | 87 | 1471.687 | 1458 | 2670 | 3613 | 3613 | 1 | 是 |
| 30 | OPTIONS | /uploads/v1/comments/translations | ok | 63 | 1.952 | 1 | 12 | 15 | 15 | 2.587 | 2 | 12 | 16 | 16 | 1 | 是 |
| 31 | POST | /locator/agree-policy | ok | 62 | 6.919 | 4 | 17 | 61 | 61 | 858.952 | 533 | 2509 | 2845 | 2845 | 1 | 是 |
| 32 | POST | /auth/v1/sign-in/social | ok | 53 | 33.358 | 27 | 75 | 100 | 100 | 710.717 | 571 | 1438 | 1518 | 1518 | 1 | 是 |
| 33 | GET | /connect | ok | 48 | 2.604 | 2 | 5 | 6 | 6 | 177.083 | 130 | 261 | 1784 | 1784 | 1 | 是 |
| 34 | POST | /binding/v1/endfield/exchange-token | ok | 44 | 95.045 | 81 | 201 | 223 | 223 | 12325.318 | 7296 | 39015 | 64930 | 64930 | 1 | 是 |
| 35 | GET | /progress/v1/archive/state | ok | 44 | 6.795 | 1 | 43 | 63 | 63 | 938.932 | 777 | 2632 | 2638 | 2638 | 1 | 是 |
| 36 | POST | /auth/v1/session/exchange | ok | 43 | 16.977 | 15 | 30 | 34 | 34 | 1311.628 | 1044 | 2998 | 3739 | 3739 | 1 | 是 |
| 37 | OPTIONS | /progress/v1/sync | ok | 43 | 2.302 | 1 | 12 | 14 | 14 | 3.07 | 2 | 13 | 14 | 14 | 1 | 是 |
| 38 | GET | /archive/state | ok | 42 | 3.143 | 3 | 6 | 8 | 8 | 287.976 | 279 | 470 | 1400 | 1400 | 1 | 是 |
| 39 | GET | /auth/v1/callback/google | ok | 38 | 53.184 | 37 | 164 | 172 | 172 | 2181.316 | 1940 | 4596 | 5210 | 5210 | 1 | 是 |
| 40 | POST | /progress/v1/archive/manifest | ok | 38 | 4.105 | 3 | 15 | 22 | 22 | 471.447 | 466 | 921 | 1043 | 1043 | 1 | 是 |
| 41 | POST | /binding/v1/endfield/bind-role | ok | 34 | 14.029 | 12 | 29 | 30 | 30 | 1182.441 | 1137 | 1827 | 3746 | 3746 | 1 | 是 |
| 42 | POST | /binding/v1/endfield/unlink | ok | 28 | 5.286 | 2 | 18 | 52 | 52 | 449.929 | 137 | 2142 | 2219 | 2219 | 1 | 是 |
| 43 | PATCH | /auth/v1/profile | ok | 25 | 26.04 | 18 | 69 | 114 | 114 | 1305.6 | 1165 | 2710 | 2777 | 2777 | 1 | 是 |
| 44 | GET | /locator/position-stream | canceled | 25 | 393.28 | 276 | 1150 | 1714 | 1714 | 1564745.96 | 1113719 | 4653026 | 5714100 | 5714100 | 1 | 是 |
| 45 | POST | /uploads/v1/comments | ok | 21 | 13.905 | 12 | 30 | 36 | 36 | 789 | 759 | 1204 | 1572 | 1572 | 1 | 是 |
| 46 | GET | /me/v1/contributions | ok | 16 | 10.75 | 11 | 23 | 23 | 23 | 460.813 | 198 | 3044 | 3044 | 3044 | 1 | 是 |
| 47 | POST | /archive/sync | ok | 15 | 8.133 | 6 | 18 | 18 | 18 | 801.533 | 834 | 1122 | 1122 | 1122 | 1 | 是 |
| 48 | OPTIONS | /auth/v1/sign-in/social | ok | 15 | 5.533 | 1 | 18 | 18 | 18 | 6.133 | 2 | 19 | 19 | 19 | 1 | 是 |
| 49 | POST | /progress/v1/archive/sync | ok | 14 | 19.857 | 11 | 83 | 83 | 83 | 1590.786 | 1767 | 3070 | 3070 | 3070 | 1 | 是 |
| 50 | GET | /notify/v1/system/messages | ok | 13 | 17.846 | 12 | 94 | 94 | 94 | 890.769 | 657 | 2549 | 2549 | 2549 | 1 | 是 |
| 51 | POST | /progress/v1/sync | canceled | 13 | 9.154 | 10 | 26 | 26 | 26 | 1649.231 | 1271 | 3098 | 3098 | 3098 | 1 | 是 |
| 52 | GET | /moderation/v1/pending | ok | 12 | 24.333 | 13 | 107 | 107 | 107 | 254.083 | 185 | 717 | 717 | 717 | 1 | 是 |
| 53 | OPTIONS | /progress/v1/archive/manifest | ok | 12 | 6.833 | 1 | 23 | 23 | 23 | 7.333 | 2 | 24 | 24 | 24 | 1 | 是 |
| 54 | OPTIONS | /auth/v1/sign-in/email | ok | 11 | 7.182 | 1 | 24 | 24 | 24 | 8 | 2 | 25 | 25 | 25 | 1 | 是 |
| 55 | GET | /me/v1/overview | ok | 11 | 16 | 13 | 30 | 30 | 30 | 629.091 | 537 | 2014 | 2014 | 2014 | 1 | 是 |
| 56 | GET | /notify/v1/community/messages | ok | 11 | 19.364 | 4 | 62 | 62 | 62 | 921.727 | 812 | 2683 | 2683 | 2683 | 1 | 是 |
| 57 | GET | / | ok | 10 | 6.3 | 2 | 13 | 13 | 13 | 6.7 | 3 | 13 | 13 | 13 | 1 | 是 |
| 58 | GET | /auth/v1/session | canceled | 10 | 23.2 | 10 | 62 | 62 | 62 | 345.6 | 236 | 1329 | 1329 | 1329 | 1 | 是 |
| 59 | POST | /notify/v1/system/messages/read | ok | 10 | 2.2 | 2 | 4 | 4 | 4 | 238.2 | 151 | 491 | 491 | 491 | 1 | 是 |
| 60 | POST | /auth/v1/email-otp/send-verification-otp | ok | 9 | 62.444 | 50 | 122 | 122 | 122 | 3657.111 | 3689 | 4636 | 4636 | 4636 | 1 | 是 |
| 61 | POST | /auth/v1/sign-out | ok | 8 | 38.25 | 31 | 57 | 57 | 57 | 1341.125 | 1052 | 2410 | 2410 | 2410 | 1 | 是 |
| 62 | OPTIONS | /binding/v1/endfield/exchange-token | ok | 8 | 5 | 2 | 17 | 17 | 17 | 5.625 | 3 | 17 | 17 | 17 | 1 | 是 |
| 63 | OPTIONS | /auth/v1/profile | ok | 7 | 13.429 | 19 | 32 | 32 | 32 | 14.143 | 20 | 33 | 33 | 33 | 1 | 是 |
| 64 | POST | /auth/v1/register | ok | 7 | 160 | 141 | 206 | 206 | 206 | 3903.857 | 2737 | 6132 | 6132 | 6132 | 1 | 是 |
| 65 | OPTIONS | /auth/v1/email-otp/send-verification-otp | ok | 6 | 14 | 11 | 40 | 40 | 40 | 15 | 12 | 43 | 43 | 43 | 1 | 是 |
| 66 | OPTIONS | /binding/v1/endfield/bind-role | ok | 6 | 1.167 | 1 | 2 | 2 | 2 | 2.167 | 2 | 5 | 5 | 5 | 1 | 是 |
| 67 | OPTIONS | /locator/agree-policy | ok | 6 | 2.333 | 1 | 8 | 8 | 8 | 3 | 2 | 9 | 9 | 9 | 1 | 是 |
| 68 | OPTIONS | /auth/v1/session/exchange | ok | 5 | 4.2 | 1 | 17 | 17 | 17 | 4.8 | 2 | 18 | 18 | 18 | 1 | 是 |
| 69 | OPTIONS | /auth/v1/sign-out | ok | 5 | 4.8 | 2 | 12 | 12 | 12 | 5 | 2 | 12 | 12 | 12 | 1 | 是 |
| 70 | POST | /fanout | ok | 5 | 1.2 | 1 | 2 | 2 | 2 | 3.8 | 4 | 5 | 5 | 5 | 1 | 是 |
| 71 | GET | /progress/v1/state | canceled | 5 | 4.4 | 2 | 8 | 8 | 8 | 516 | 110 | 2210 | 2210 | 2210 | 1 | 是 |
| 72 | GET | /sync/v1/official | ok | 5 | 112.6 | 92 | 227 | 227 | 227 | 15934.8 | 1216 | 68450 | 68450 | 68450 | 1 | 是 |
| 73 | GET | /uploads/v1/comments | canceled | 5 | 38.8 | 50 | 82 | 82 | 82 | 858.4 | 845 | 1344 | 1344 | 1344 | 1 | 是 |
| 74 | GET | /auth/v1/callback/github | ok | 4 | 48.25 | 38 | 66 | 66 | 66 | 2720 | 2516 | 3058 | 3058 | 3058 | 1 | 是 |
| 75 | OPTIONS | /binding/v1/endfield/unlink | ok | 4 | 1.25 | 1 | 2 | 2 | 2 | 1.75 | 1 | 3 | 3 | 3 | 1 | 是 |
| 76 | GET | /locator/position | canceled | 4 | 10 | 4 | 24 | 24 | 24 | 36563.25 | 3223 | 97326 | 97326 | 97326 | 1 | 是 |
| 77 | GET | /admin/v1/reports/registrations | ok | 3 | 14 | 13 | 21 | 21 | 21 | 321 | 235 | 509 | 509 | 509 | 1 | 是 |
| 78 | OPTIONS | /auth/v1/register | ok | 3 | 6.333 | 2 | 16 | 16 | 16 | 7.333 | 3 | 17 | 17 | 17 | 1 | 是 |
| 79 | GET | /auth/v1/reset-password-preview | ok | 3 | 1.667 | 2 | 2 | 2 | 2 | 337 | 253 | 508 | 508 | 508 | 1 | 是 |
| 80 | GET | /auth/v1/reset-password/:param | ok | 3 | 21 | 20 | 30 | 30 | 30 | 1063.333 | 797 | 1606 | 1606 | 1606 | 1 | 是 |
| 81 | GET | /favicon.ico | ok | 3 | 5.667 | 1 | 15 | 15 | 15 | 6.333 | 2 | 16 | 16 | 16 | 1 | 是 |
| 82 | PATCH | /moderation/v1/:param/status | ok | 3 | 33.333 | — | — | — | — | 1004.667 | — | — | — | — | 3 | 否 |
| 83 | OPTIONS | /uploads/v1/images | ok | 3 | 1 | 1 | 1 | 1 | 1 | 1.333 | 1 | 2 | 2 | 2 | 1 | 是 |
| 84 | GET | /uploads/v1/images/mine | canceled | 3 | 45.667 | 42 | 94 | 94 | 94 | 1159 | 1191 | 1396 | 1396 | 1396 | 1 | 是 |
| 85 | POST | /auth/v1/forget-password | ok | 2 | 60 | 53 | 67 | 67 | 67 | 3402.5 | 3025 | 3780 | 3780 | 3780 | 1 | 是 |
| 86 | POST | /auth/v1/reset-password | ok | 2 | 116 | 108 | 124 | 124 | 124 | 1940 | 1273 | 2607 | 2607 | 2607 | 1 | 是 |
| 87 | OPTIONS | /moderation/v1/:param/status | ok | 2 | 8.5 | — | — | — | — | 10 | — | — | — | — | 2 | 否 |
| 88 | POST | /notify/v1/community/messages/read | ok | 2 | 2.5 | 2 | 3 | 3 | 3 | 384 | 165 | 603 | 603 | 603 | 1 | 是 |
| 89 | OPTIONS | /progress/v1/archive/sync | ok | 2 | 14.5 | 12 | 17 | 17 | 17 | 15.5 | 13 | 18 | 18 | 18 | 1 | 是 |
| 90 | GET | /state | canceled | 2 | 8 | 7 | 9 | 9 | 9 | 211.5 | 150 | 273 | 273 | 273 | 1 | 是 |
| 91 | GET | /uploads/v1/images | canceled | 2 | 48 | 42 | 54 | 54 | 54 | 1049.5 | 903 | 1196 | 1196 | 1196 | 1 | 是 |
| 92 | GET | /uploads/v1/images/:param | ok | 2 | 3.5 | — | — | — | — | 133.5 | — | — | — | — | 2 | 否 |
| 93 | POST | /uploads/v1/images/:param/recall | ok | 2 | 13.5 | — | — | — | — | 1333 | — | — | — | — | 2 | 否 |
| 94 | GET | /admin/v1/reports/translations | ok | 1 | 11 | 11 | 11 | 11 | 11 | 211 | 211 | 211 | 211 | 211 | 1 | 是 |
| 95 | GET | /admin/v1/reports/ugc-likes | ok | 1 | 60 | 60 | 60 | 60 | 60 | 535 | 535 | 535 | 535 | 535 | 1 | 是 |
| 96 | GET | /archive/state | canceled | 1 | 3 | 3 | 3 | 3 | 3 | 170 | 170 | 170 | 170 | 170 | 1 | 是 |
| 97 | GET | /auth/v1/callback/discord | ok | 1 | 25 | 25 | 25 | 25 | 25 | 1515 | 1515 | 1515 | 1515 | 1515 | 1 | 是 |
| 98 | GET | /auth/v1/callback/google | canceled | 1 | 15 | 15 | 15 | 15 | 15 | 2014 | 2014 | 2014 | 2014 | 2014 | 1 | 是 |
| 99 | GET | /auth/v1/error | ok | 1 | 6 | 6 | 6 | 6 | 6 | 395 | 395 | 395 | 395 | 395 | 1 | 是 |
| 100 | OPTIONS | /auth/v1/forget-password | ok | 1 | 20 | 20 | 20 | 20 | 20 | 21 | 21 | 21 | 21 | 21 | 1 | 是 |
| 101 | POST | /binding/v1/endfield/bind-role | canceled | 1 | 11 | 11 | 11 | 11 | 11 | 578 | 578 | 578 | 578 | 578 | 1 | 是 |
| 102 | GET | /binding/v1/endfield/status | canceled | 1 | 15 | 15 | 15 | 15 | 15 | 1445 | 1445 | 1445 | 1445 | 1445 | 1 | 是 |
| 103 | GET | /locator/position-stream | loadShed | 1 | 569 | 569 | 569 | 569 | 569 | 2237828 | 2237828 | 2237828 | 2237828 | 2237828 | 1 | 是 |
| 104 | GET | /moderation/v1/images/coverage | ok | 1 | 28 | 28 | 28 | 28 | 28 | 235 | 235 | 235 | 235 | 235 | 1 | 是 |
| 105 | GET | /moderation/v1/images/duplicates | ok | 1 | 57 | 57 | 57 | 57 | 57 | 226 | 226 | 226 | 226 | 226 | 1 | 是 |
| 106 | OPTIONS | /notify/v1/community/messages/read | ok | 1 | 24 | 24 | 24 | 24 | 24 | 26 | 26 | 26 | 26 | 26 | 1 | 是 |
| 107 | GET | /progress/v1/archive/state | canceled | 1 | 1 | 1 | 1 | 1 | 1 | 145 | 145 | 145 | 145 | 145 | 1 | 是 |
| 108 | POST | /progress/v1/manifest | canceled | 1 | 10 | 10 | 10 | 10 | 10 | 572 | 572 | 572 | 572 | 572 | 1 | 是 |
| 109 | GET | /robots.txt | ok | 1 | 1 | 1 | 1 | 1 | 1 | 3 | 3 | 3 | 3 | 3 | 1 | 是 |
| 110 | OPTIONS | /uploads/v1/comments | ok | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 1 | 是 |
| 111 | POST | /uploads/v1/comments/:param/recall | ok | 1 | 18 | 18 | 18 | 18 | 18 | 1749 | 1749 | 1749 | 1749 | 1749 | 1 | 是 |
| 112 | GET | /uploads/v1/public-file/poi/aurylene/:param/Mn5DYNFA-80h.webp | ok | 1 | 2 | 2 | 2 | 2 | 2 | 94 | 94 | 94 | 94 | 94 | 1 | 是 |

## 端点汇总表（合并状态）

| # | method | endpoint template | total req | ok req | non-ok req | non-ok rate | outcomes |
|---:|:---:|:---|---:|---:|---:|---:|:---|
| 1 | GET | /uploads/v1/images | 35263 | 35261 | 2 | 0.006% | ok=35261, canceled=2 |
| 2 | GET | /uploads/v1/comments | 16903 | 16898 | 5 | 0.030% | ok=16898, canceled=5 |
| 3 | GET | /comments | 9586 | 9586 | 0 | 0.000% | ok=9586 |
| 4 | GET | /uploads/v1/images/mine | 8737 | 8734 | 3 | 0.034% | ok=8734, canceled=3 |
| 5 | GET | /images | 7319 | 7319 | 0 | 0.000% | ok=7319 |
| 6 | GET | /progress/v1/stats | 3928 | 3928 | 0 | 0.000% | ok=3928 |
| 7 | POST | /sync | 2800 | 2800 | 0 | 0.000% | ok=2800 |
| 8 | POST | /apply | 2745 | 2745 | 0 | 0.000% | ok=2745 |
| 9 | POST | /progress/v1/sync | 2552 | 2539 | 13 | 0.509% | ok=2539, canceled=13 |
| 10 | GET | /auth/v1/session | 1468 | 1458 | 10 | 0.681% | ok=1458, canceled=10 |
| 11 | GET | /progress-stats | 1102 | 1102 | 0 | 0.000% | ok=1102 |
| 12 | GET | /notify/v1/live | 978 | 67 | 911 | 93.149% | responseStreamDisconnected=488, canceled=423, ok=67 |
| 13 | POST | /uploads/v1/comments/translations | 913 | 913 | 0 | 0.000% | ok=913 |
| 14 | GET | /connect | 807 | 48 | 759 | 94.052% | canceled=663, responseStreamDisconnected=96, ok=48 |
| 15 | GET | /binding/v1/endfield/status | 775 | 774 | 1 | 0.129% | ok=774, canceled=1 |
| 16 | GET | /state | 600 | 598 | 2 | 0.333% | ok=598, canceled=2 |
| 17 | POST | /uploads/v1/images | 473 | 473 | 0 | 0.000% | ok=473 |
| 18 | POST | /progress/v1/manifest | 406 | 405 | 1 | 0.246% | ok=405, canceled=1 |
| 19 | GET | /locator/position | 387 | 383 | 4 | 1.034% | ok=383, canceled=4 |
| 20 | GET | /uploads/v1/file/poi/:param/:param/:file.webp | 344 | 344 | 0 | 0.000% | ok=344 |
| 21 | GET | /progress/v1/state | 333 | 328 | 5 | 1.502% | ok=328, canceled=5 |
| 22 | GET | /locator/position-stream | 118 | 0 | 118 | 100.000% | exception=92, canceled=25, loadShed=1 |
| 23 | POST | /prepare | 113 | 113 | 0 | 0.000% | ok=113 |
| 24 | GET | /me/v1/contributions/:param/preview | 110 | 110 | 0 | 0.000% | ok=110 |
| 25 | OPTIONS | /progress/v1/manifest | 80 | 80 | 0 | 0.000% | ok=80 |
| 26 | POST | /auth/v1/sign-in/email | 78 | 78 | 0 | 0.000% | ok=78 |
| 27 | OPTIONS | /uploads/v1/comments/translations | 63 | 63 | 0 | 0.000% | ok=63 |
| 28 | POST | /locator/agree-policy | 62 | 62 | 0 | 0.000% | ok=62 |
| 29 | POST | /auth/v1/sign-in/social | 53 | 53 | 0 | 0.000% | ok=53 |
| 30 | GET | /progress/v1/archive/state | 45 | 44 | 1 | 2.222% | ok=44, canceled=1 |
| 31 | POST | /binding/v1/endfield/exchange-token | 44 | 44 | 0 | 0.000% | ok=44 |
| 32 | GET | /archive/state | 43 | 42 | 1 | 2.326% | ok=42, canceled=1 |
| 33 | POST | /auth/v1/session/exchange | 43 | 43 | 0 | 0.000% | ok=43 |
| 34 | OPTIONS | /progress/v1/sync | 43 | 43 | 0 | 0.000% | ok=43 |
| 35 | GET | /auth/v1/callback/google | 39 | 38 | 1 | 2.564% | ok=38, canceled=1 |
| 36 | POST | /progress/v1/archive/manifest | 38 | 38 | 0 | 0.000% | ok=38 |
| 37 | POST | /binding/v1/endfield/bind-role | 35 | 34 | 1 | 2.857% | ok=34, canceled=1 |
| 38 | POST | /binding/v1/endfield/unlink | 28 | 28 | 0 | 0.000% | ok=28 |
| 39 | PATCH | /auth/v1/profile | 25 | 25 | 0 | 0.000% | ok=25 |
| 40 | POST | /uploads/v1/comments | 21 | 21 | 0 | 0.000% | ok=21 |
| 41 | GET | /me/v1/contributions | 16 | 16 | 0 | 0.000% | ok=16 |
| 42 | POST | /archive/sync | 15 | 15 | 0 | 0.000% | ok=15 |
| 43 | OPTIONS | /auth/v1/sign-in/social | 15 | 15 | 0 | 0.000% | ok=15 |
| 44 | POST | /progress/v1/archive/sync | 14 | 14 | 0 | 0.000% | ok=14 |
| 45 | GET | /notify/v1/system/messages | 13 | 13 | 0 | 0.000% | ok=13 |
| 46 | GET | /moderation/v1/pending | 12 | 12 | 0 | 0.000% | ok=12 |
| 47 | OPTIONS | /progress/v1/archive/manifest | 12 | 12 | 0 | 0.000% | ok=12 |
| 48 | OPTIONS | /auth/v1/sign-in/email | 11 | 11 | 0 | 0.000% | ok=11 |
| 49 | GET | /me/v1/overview | 11 | 11 | 0 | 0.000% | ok=11 |
| 50 | GET | /notify/v1/community/messages | 11 | 11 | 0 | 0.000% | ok=11 |
| 51 | GET | / | 10 | 10 | 0 | 0.000% | ok=10 |
| 52 | POST | /notify/v1/system/messages/read | 10 | 10 | 0 | 0.000% | ok=10 |
| 53 | POST | /auth/v1/email-otp/send-verification-otp | 9 | 9 | 0 | 0.000% | ok=9 |
| 54 | POST | /auth/v1/sign-out | 8 | 8 | 0 | 0.000% | ok=8 |
| 55 | OPTIONS | /binding/v1/endfield/exchange-token | 8 | 8 | 0 | 0.000% | ok=8 |
| 56 | OPTIONS | /auth/v1/profile | 7 | 7 | 0 | 0.000% | ok=7 |
| 57 | POST | /auth/v1/register | 7 | 7 | 0 | 0.000% | ok=7 |
| 58 | OPTIONS | /auth/v1/email-otp/send-verification-otp | 6 | 6 | 0 | 0.000% | ok=6 |
| 59 | OPTIONS | /binding/v1/endfield/bind-role | 6 | 6 | 0 | 0.000% | ok=6 |
| 60 | OPTIONS | /locator/agree-policy | 6 | 6 | 0 | 0.000% | ok=6 |
| 61 | OPTIONS | /auth/v1/session/exchange | 5 | 5 | 0 | 0.000% | ok=5 |
| 62 | OPTIONS | /auth/v1/sign-out | 5 | 5 | 0 | 0.000% | ok=5 |
| 63 | POST | /fanout | 5 | 5 | 0 | 0.000% | ok=5 |
| 64 | GET | /sync/v1/official | 5 | 5 | 0 | 0.000% | ok=5 |
| 65 | GET | /auth/v1/callback/github | 4 | 4 | 0 | 0.000% | ok=4 |
| 66 | OPTIONS | /binding/v1/endfield/unlink | 4 | 4 | 0 | 0.000% | ok=4 |
| 67 | GET | /admin/v1/reports/registrations | 3 | 3 | 0 | 0.000% | ok=3 |
| 68 | OPTIONS | /auth/v1/register | 3 | 3 | 0 | 0.000% | ok=3 |
| 69 | GET | /auth/v1/reset-password-preview | 3 | 3 | 0 | 0.000% | ok=3 |
| 70 | GET | /auth/v1/reset-password/:param | 3 | 3 | 0 | 0.000% | ok=3 |
| 71 | GET | /favicon.ico | 3 | 3 | 0 | 0.000% | ok=3 |
| 72 | PATCH | /moderation/v1/:param/status | 3 | 3 | 0 | 0.000% | ok=3 |
| 73 | OPTIONS | /uploads/v1/images | 3 | 3 | 0 | 0.000% | ok=3 |
| 74 | POST | /auth/v1/forget-password | 2 | 2 | 0 | 0.000% | ok=2 |
| 75 | POST | /auth/v1/reset-password | 2 | 2 | 0 | 0.000% | ok=2 |
| 76 | OPTIONS | /moderation/v1/:param/status | 2 | 2 | 0 | 0.000% | ok=2 |
| 77 | POST | /notify/v1/community/messages/read | 2 | 2 | 0 | 0.000% | ok=2 |
| 78 | OPTIONS | /progress/v1/archive/sync | 2 | 2 | 0 | 0.000% | ok=2 |
| 79 | GET | /uploads/v1/images/:param | 2 | 2 | 0 | 0.000% | ok=2 |
| 80 | POST | /uploads/v1/images/:param/recall | 2 | 2 | 0 | 0.000% | ok=2 |
| 81 | GET | /admin/v1/reports/translations | 1 | 1 | 0 | 0.000% | ok=1 |
| 82 | GET | /admin/v1/reports/ugc-likes | 1 | 1 | 0 | 0.000% | ok=1 |
| 83 | GET | /auth/v1/callback/discord | 1 | 1 | 0 | 0.000% | ok=1 |
| 84 | GET | /auth/v1/error | 1 | 1 | 0 | 0.000% | ok=1 |
| 85 | OPTIONS | /auth/v1/forget-password | 1 | 1 | 0 | 0.000% | ok=1 |
| 86 | GET | /moderation/v1/images/coverage | 1 | 1 | 0 | 0.000% | ok=1 |
| 87 | GET | /moderation/v1/images/duplicates | 1 | 1 | 0 | 0.000% | ok=1 |
| 88 | OPTIONS | /notify/v1/community/messages/read | 1 | 1 | 0 | 0.000% | ok=1 |
| 89 | GET | /robots.txt | 1 | 1 | 0 | 0.000% | ok=1 |
| 90 | OPTIONS | /uploads/v1/comments | 1 | 1 | 0 | 0.000% | ok=1 |
| 91 | POST | /uploads/v1/comments/:param/recall | 1 | 1 | 0 | 0.000% | ok=1 |
| 92 | GET | /uploads/v1/public-file/poi/aurylene/:param/Mn5DYNFA-80h.webp | 1 | 1 | 0 | 0.000% | ok=1 |

## 优先优化候选

| endpoint | req | CPU p99 | wall p50 | wall p95 | wall p99 |
|:---|---:|---:|---:|---:|---:|
| GET /locator/position | 383 | 107 | 1273 | 19114 | 46954 |
| POST /sync | 2800 | 31 | 10580 | 11148 | 11543 |
| POST /uploads/v1/images | 473 | 59 | 1263 | 4720 | 6221 |
| POST /prepare | 113 | 11 | 2211 | 4141 | 4706 |
| GET /state | 598 | 34 | 219 | 629 | 4592 |
| GET /auth/v1/session | 1458 | 119 | 771 | 3243 | 4007 |
| POST /progress/v1/sync | 2539 | 86 | 1394 | 2824 | 3288 |
| GET /progress/v1/state | 328 | 54 | 796 | 2064 | 2875 |
| POST /progress/v1/manifest | 405 | 76 | 720 | 2269 | 2780 |
| GET /uploads/v1/images/mine | 8734 | 100 | 613 | 2051 | 2525 |
| POST /uploads/v1/comments/translations | 913 | 25 | 581 | 1346 | 2501 |
| GET /binding/v1/endfield/status | 774 | 96 | 255 | 1893 | 2165 |
| GET /uploads/v1/comments | 16898 | 94 | 400 | 1624 | 2022 |
| GET /uploads/v1/images | 35261 | 69 | 55 | 1080 | 1732 |
| GET /progress-stats | 1102 | 4 | 206 | 1086 | 1507 |
| GET /progress/v1/stats | 3928 | 26 | 39 | 738 | 1174 |
| GET /comments | 9586 | 6 | 382 | 879 | 1060 |
| GET /images | 7319 | 6 | 210 | 760 | 954 |
| POST /apply | 2745 | 8 | 34 | 347 | 724 |
| GET /uploads/v1/file/poi/:param/:param/:file.webp | 344 | — | — | — | — |

本报告的完整原始分组数字（已脱敏）及五分钟主窗口数据见同名 JSON。
