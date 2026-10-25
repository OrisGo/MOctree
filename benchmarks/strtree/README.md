# MoonSTRtree 三维 WASM 对照

此目录是独立基准模块，固定使用 `LING71671/moon_strtree@0.2.2`（Apache-2.0）。
只通过其公开 `StrTree3D::build/query/query_count` 接口调用；不修改依赖源码、不向 MOctree 根模块添加依赖。

## 复现

```sh
moon -C benchmarks/strtree update
moon -C benchmarks/strtree fmt --check
moon -C benchmarks/strtree check --target wasm --deny-warn
moon -C benchmarks/strtree build --target wasm
moon build adapters/linear --target wasm
node benchmarks/browser/compare-test.mjs debug
moon -C benchmarks/strtree build --target wasm --release
moon build adapters/linear --target wasm --release
node benchmarks/browser/compare-test.mjs release
moon -C benchmarks/strtree info --target wasm
node benchmarks/browser/compare-run.mjs --record
```

`--quick` 仅测 1 千对象、20 次采样，不允许与 `--record` 合用。正式记录使用 100 次采样、
20 次预热和 5 次独立实例构建。自动浏览器驱动沿用 [浏览器基准](../README.md) 的隔离 Chrome、
本机 HTTP、release stripped、逐轮轮换顺序和计时边界；本对照还轮换构建后端顺序。
不在计时期间运行 profiler、内存探针或编译任务。

输出为 `_build/browser-results/comparison.json` 和 `comparison.png`，`--record` 另存时间戳原始数据到
`benchmarks/results/`。记录含两套模块的体积/压缩体积/哈希、环境、测量源码哈希及下载依赖的源码文件哈希。
本模块只有 wasm 线性内存桥；跨后端比较不是本次范围，根库的 wasm-gc 测试仍须通过。

启动 `node benchmarks/browser/server.mjs 8765` 后，打开
[交互对照页](http://127.0.0.1:8765/benchmarks/browser/comparison.html?saved)。
页面可筛选分布、查询负载和输出模式，下载全部原始数据。

## 共同语义与差异

复用固定种子 `20261025` 数据和独立 JS 扫描谓词。规模 1 千/1 万/10 万；均匀、双簇、全重叠；
局部 AABB 和全根 AABB；每批 8 条，共 162 个组合（含 JS 扫描基线）。坐标均为适中有限 Double，
闭合边界，相切命中；每条查询要求准确命中数、唯一且有效的 ID，结果顺序不限。
射线不纳入本次对照，避免把对象 AABB 射线、线段与网格射线的不同语义混用。

三种输出模式：

| 模式 | MOctree | MoonSTRtree |
| --- | --- | --- |
| `count` | 零容量查询，继续准确计数 | 公开 `query_count`，不生成命中数组 |
| `cap64` | 每条最多写 64 个 ID，继续准确计数 | 公开 `query` 生成全部命中，再映射并截取最多 64 个 ID |
| `all` | 每条预留 N 个 ID，输出全部命中 | 公开 `query` 生成全部命中，再映射到同样大小的输出缓冲 |

共同 JS 包装器为 `adapters/linear/client.mjs`，输入复制、输出复制和报告解码路径相同。
STR 的三维公开 API 没有 `query_into`；使用完整结果再截取是桥接行为，不声称是库原生有界输出。
即使 `all` 模式，双方内部临时分配仍不同。因此这是**现有公开 API 加适配的端到端对照**，
不隔离纯算法、内存布局或某一条指令的效果。

STR 的 ID 为非负 Int；桥使用输入序号作为内部 ID，另存 UInt32 表映射回原始 ID，包含 `0xffffffff`。
映射表构建和结果映射均计入相应耗时与容量。MOctree 原生存储 UInt32 ID，无此额外表。
STR 三维接口不公开节点访问/对象测试计数，这些字段存为 `null`，不捏造为 0 或用总节点数代替。

STR 使用默认节点容量 16；MOctree 使用默认分裂阈值 16、默认最大深度及 `2N+1` 节点预算。
二者参数的含义不同，不宣称具有相同节点数或相同内存预算。未做参数调优搜索。
MOctree 构建还执行固定根、唯一 ID、容量等契约校验，STR 桥不实现这些相同保证，
故构建结果包含不同的校验成本。JS 扫描“构建”只复制输入，不能等同于构建索引。

桥为**仅供受控基准使用的入口**，使用生产包装器的传输形状，但不实现完整生产错误协议、
全局预算或任意输入验证，不应作为 MoonSTRtree 通用发布适配层。非法输入语义不参与本轮排名。

## 验收与资源口径

三个后端分别执行 30 项共同域校验，包括空索引、空批次、角相切、点/线退化、跨分割面、根外查询、
零容量、截断、恰好填满、最大 UInt32 ID、输入快照、输出生命周期和实例隔离，以及三类分布和分散查询。
另对每个计时组合使用独立扫描核对总命中数、写入数、完整性、ID 成员与唯一性。
Node 对两套 Wasm 执行 debug/release 集成；浏览器另验证接口和页面筛选。

每批延迟包含输入 staging、公开查询、内部遍历/分配、必要 ID 映射、结果复制及 JS 报告创建。
不含数据生成、预建查询数组、扫描校验、UI 更新或事件循环让出。
100 个样本的 p99 是粗粒度观测，不是延迟保证；批次 p99 不能除以 8 当作单条查询 p99。

计时矩阵完成后，为两个 Wasm 后端各创建一个新的 10 万均匀对象实例，记录初始化、构建、
依次执行 20 批全根计数/限量/完整输出后的线性内存容量。由于后续阶段复用该实例，
后面容量可能包含前面阶段分配器保留空间；不能据此计算单次查询净分配。
本探针没有测量活跃堆峰值、GC 次数或进程 RSS，不能与各库的逻辑存储估算直接比较。
