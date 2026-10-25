# AABB 子树整体命中优化对照

`run.mjs` 在 Node.js 中交替测量两个 release wasm 模块，复用现有 linear 包装器、
固定种子数据和独立 JS 暴力扫描。没有新增生产后端或核心依赖。

## 复现

基线提交为 `03a0ab2`。在独立的基线 checkout 中构建并保存模块：

```sh
moon build adapters/linear --target wasm --release
cp _build/wasm/release/build/adapters/linear/linear.wasm /tmp/moctree-before.wasm
```

回到优化分支执行：

```sh
moon build adapters/linear --target wasm --release
node benchmarks/subtree/run.mjs /tmp/moctree-before.wasm \
  _build/wasm/release/build/adapters/linear/linear.wasm /tmp/moctree-subtree-results.json
```

输出文件必须不存在，避免覆盖已有结果。不要在计时同时编译、运行测试或 profiler。
实际归档数据与结论见 [验收报告](../../docs/validation-subtree.md)。
本目录修改后执行 `node --check benchmarks/subtree/run.mjs` 和上述完整对照，
再执行根 README 的提交前检查。本脚本不修改浏览器页面或 profile 模块。

## 测量边界

- Node.js WASM 线性内存后端，release stripped；不是浏览器或纯核心函数基准。
- 种子 20261025，1 千/1 万/10 万对象，均匀、双簇和全重叠分布，根 [-100,100]³。
- 每批 8 条查询；局部盒、根的 8 个子区盒、全根盒三种负载。
- 每条容量分别为 0、64、N，准确计数、限量、完整输出；每个组合计时前对照暴力扫描，
  核对 totalHits、written、状态、ID 唯一性和成员关系。两模块另执行各 30 项共同域验收。
- 20 次预热、100 次采样，逐轮交换 before/after 顺序；记录所有样本及 nearest-rank p50/p95/p99。
  包含传输、范围检查、核心查询、结果复制、报告创建及调用内 GC；不含数据生成和校验。
  计时后消费 checksum。批次分位数不转换成单条查询分位数。
- 每组 9 次独立实例构建，交替顺序，实例化在计时外；包含输入传输、校验、构建和工作区创建。
  构建样本不预热，首样本可能包含 JIT 成本，原始值保留，9 样本尾分位数较粗。
- 计时完成后为每个规模/分布/版本新建实例，记录初始化、构建、依次执行 20 批全根
  count/cap64/all 及释放后的 `memory.buffer.byteLength`。线性内存不收缩，构建后容量是
  此前分配容量的高水位，后续状态包含分配器保留空间；不是活跃堆峰值或稳态存活字节。
  输入逻辑字节为 `52N+32`，完整输出每批逻辑 ID 字节为 `32N`，两版本相同。
- 节点新增一个 Int32 是逻辑存储增量；实际字节由编译布局、分配器及内存增长粒度决定。
  不用逻辑增量替代实测内存。未测进程 RSS、构建中活跃堆峰值、GC 次数或受限设备。
