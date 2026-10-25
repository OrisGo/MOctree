# 浏览器验收、资源基准与 MoonFlame

这里测试 `orisgo/octree` 的浏览器 WASM 路径。`browser/` 为数据、独立扫描对照、
浏览器驱动和展示页；`profile/` 是独立 MoonBit 模块，仅依赖指定的
`gywcs101/moonflame@0.2.0` 生成火焰图。它不进入 octree 根模块依赖或计时路径。

## 运行

要求：项目当前 MoonBit 工具链、Node.js 22+（内置 WebSocket）、本机 Chrome/Chromium。
不需要 npm 依赖或 Playwright。首次构建报告模块需联网下载 Mooncakes 依赖。

```sh
node benchmarks/browser/build.mjs
node benchmarks/browser/verify.mjs
node benchmarks/browser/run.mjs
```

`CHROME_BIN=/path/to/chromium node benchmarks/browser/run.mjs` 可指定浏览器。
默认运行 108 个组合，约需数分钟；`--quick` 只测 1 千对象、20 次采样，用于连通性验证，
不可冒充完整基准。`--record` 在完整运行成功后另存带时间戳的原始结果到 `benchmarks/results/`，
不会覆盖已有记录。正常输出集中在被忽略的 `_build/browser-results/`：

- `results.json`：环境、模块体积/哈希、测量源码哈希、契约验收、所有原始延迟样本、资源快照。
- `build`、`query`、`query-broad` 各自的 `.cpuprofile`、`.folded`、`.svg`、`.hotspots.txt`。
- `dashboard.png` 与 `flamegraph.png`：浏览器实际渲染截图。

驱动启动只绑定 `127.0.0.1` 的临时 HTTP 服务和独立临时 Chrome 配置，结束后关闭两者并清理
该次临时配置；不复用日常浏览器 profile，不关闭 Chrome 自带沙箱。产物留在项目输出目录。
端口/浏览器启动受运行环境限制时需允许本机监听和启动子进程。

交互查看：

```sh
node benchmarks/browser/server.mjs 8765
```

打开 [本地报告页](http://127.0.0.1:8765/benchmarks/browser/index.html?saved)。
页面可重新运行、按分布/负载筛选、导出 JSON；火焰图支持缩放与搜索。
直接运行页面只测性能，资源探针与 CPU profile 由自动验收脚本另行执行。
若没有本地输出，可查看仓库内 `results/` 的历史 JSON，或重新执行完整脚本生成展示产物。

## 数据与计时口径

- 种子 `20261025`，LCG；规模 1,000 / 10,000 / 100,000，固定根 `[0,0,0,100]`。
- 均匀：对象最小坐标在 [-90,90)，轴长在 [0,2)；聚簇：两团中心约 ±40；
  全重叠：每个盒均为 [-50,50]³。对象 ID 含 0 和最大 UInt32。
- 节点预算 `2N+1`，核心默认深度/分裂阈值；没有为了降低耗时丢弃对象。
- 每批 8 条查询，每条独立容量 64。局部 AABB 为两簇附近的边长 10 的盒；
  射线沿 +X 穿过簇附近，显式区间 [0,200]；全根 AABB 覆盖所有对象。
- 比较 wasm 块传输、wasm 标量、wasm-gc 标量及 JS 连续数组暴力扫描。
  扫描返回相同容量的 ID/报告，统计准确总命中；JS 算法与语言均不同，不能将差异单独归因于树或 WASM。

**查询**：每组合 20 次预热、100 次采样，后端次序逐轮轮换。一份样本是一次完整公开批量查询，
包含 staging/输入复制、核心遍历、范围校验、结果复制和 JS 报告对象构造；包含调用内发生的 GC。
不含数据生成、预先创建查询数组、正确性对照、UI 更新和进程间通信。
每十轮让出事件循环；让出和结果 checksum 在计时外。
分位数使用排序后 nearest rank，不把批次 p99 除以 8 冒充单条查询 p99。
100 个样本的尾部分位数较粗，不提供稳定尾延迟承诺。

**构建**：5 个独立实例各构建一次，报告原始值与分位数；实例化在构建计时外。
输入已存在，计时包含传输、条目转换、构建、工作区创建。仅 5 个样本，p95/p99 等于最大值，
主要参考 p50。JS 扫描的“构建”只复制输入数组，并不创建空间索引。

**首次可查询**：每后端记录一次，从本地 HTTP fetch 开始到实例化、1 千均匀对象构建及首批
查询返回。数据预先生成；fetch 使用 no-store。它是本地启动观测，不代表公网加载时间；
浏览器编译/JIT/系统缓存和后端启动顺序仍可能影响结果，不宣称严格冷启动。

**体积**：release stripped 的 Wasm 原始字节、Node zlib gzip level 9 字节及 SHA-256。
不包含 JS 包装器、HTML 或报告库。分析版本单独用 `--release --no-strip` 构建以保留函数名，
不用于上述延迟与发布体积比较。

## 正确性

浏览器对三个 WASM 入口执行空索引/批次、边界相切、UInt32 ID、AABB/射线、逐条错误、
截断/精确填满、零容量、范围溢出/重叠、失败重建、输入快照、输出生命周期、实例隔离及释放测试。
每个性能组合计时前，使用独立 JS AABB/射线谓词暴力扫描全部对象；检查命中总数、written、
完整性、返回 ID 成员和唯一性。截断结果顺序未指定，不强迫它与扫描使用相同前缀。
计时后消费结果 checksum，避免将结果完全丢弃。

独立 JS 谓词只用于本基准的适中有限坐标，不替代核心 NaN、溢出、极端值和随机测试。
本轮浏览器性能分布只有三类；核心/适配集成测试另有八类分布。

## 资源快照的覆盖范围

性能计时结束后，另建一个 10 万均匀对象的 linear 实例。仅在该资源探针中截获
`WebAssembly.instantiate` 的 memory 导出，不读运行时对象头；初始化完成后立即恢复函数。
按基线、初始化、构建、100 批查询、释放记录：

- `memory.buffer.byteLength`：已分配线性内存容量，包含对象、临时分配及分配器保留空间。
  由于该实例的线性内存只增长，构建后容量也体现此前已分配容量的高水位；不是活跃堆峰值。
- CDP `Runtime.getHeapUsage`：usedSize、totalSize、embedderHeapUsedSize、backingStorageSize。
  每个快照前显式 GC，仅用于可比较的调用后状态，不能代表正常延迟或 GC 周期。
- 宿主输入、结果 ID 数组的逻辑字节。JS 报告对象、核心内存不能由元素数直接换算。

release 项的线性容量/输出字节在丢弃引用**前**读取；该项 CDP heap 在丢弃引用并 GC **后**读取。
不保证线性内存收缩。Chrome 的 backingStorageSize 不应视为包含所有 Wasm 容量，也不要与
其他字段盲目相加。此测量没有进程 RSS 峰值、构建中活跃堆峰值或 wasm-gc 对象归属数据。
真实受限设备容量仍需单独验收。

## MoonFlame 链路

用户指定包：[gywcs101/moonflame 0.2.0](https://mooncakes.io/docs/gywcs101/moonflame@0.2.0)，
MIT，[源码](https://github.com/gywcs101/moonflame)。实际下载的 README 和接口确认它负责渲染，
不负责采样。这里使用其纯计算库，编译为 JS 在 Node 中生成 SVG；octree 被测目标仍为 WASM。

Chrome CDP Profiler 另行采样请求间隔为 1,000 μs，分别持续至少 1.5 秒：
10 万均匀对象反复重建、射线批量查询、全根 AABB 批量查询。每次采样前索引已建立并预热，
绘图在 Chrome 停止采样后进行。重建 profile 会包含新旧索引替换/释放的成本，区别于独立实例构建基准。

转换器按 `Profile.samples` 的节点路径聚合；**每个样本权重为 1，单位 count**。
保留 GC、program、idle、JS 与 Wasm 帧；对分号/换行等折叠栈分隔字符作转义。
不把采样间隔或 timeDeltas 强行分摊为精确函数耗时。短函数可能缺少样本；采样比例仅作定位线索。
MoonFlame 使用 64 帧深度上限，过深栈由库归入 `(deeper)`。
部分 WASM 函数名称仍是 MoonBit mangled symbol，但包名和函数名片段可搜索。
浏览器验收同时检查生成 SVG 的脚本初始化、WASM 查询帧、缩放、搜索和复位。

参考：[MoonBit 官方 Chrome 分析方法](https://www.moonbitlang.com/blog/profile-wasm-from-js)、
[CDP Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)、
[CDP Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)。

## 修改后的验收

```sh
node benchmarks/browser/verify.mjs
moon -C benchmarks/profile fmt
moon -C benchmarks/profile check --target js --deny-warn
moon -C benchmarks/profile test --target js --deny-warn
moon -C benchmarks/profile info --target js
node benchmarks/browser/build.mjs
node benchmarks/browser/run.mjs
```

再按根 README 暂存、执行 prek 和审查暂存差异。根模块 hooks 不会代替上述独立模块与浏览器检查。
原始运行记录属于明确归档的基准数据；构建输出、依赖、临时 Chrome 配置和普通日志不入库。
