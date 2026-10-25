# 子树实际内容边界：Chrome 前后及 STR 对照

基线必须来自 `61da14d`（包含 `74cfa25`）。在该版本的独立 checkout 运行
`moon build adapters/linear --target wasm --release`，把生成的
`_build/wasm/release/build/adapters/linear/linear.wasm` 保存为当前实验 checkout 的
`_build/browser-results/content-before.wasm`。不要用实验后的模块覆盖基线。

本轮没有保留生产优化。先在独立实验分支应用归档补丁（不要覆盖其他改动）：

```sh
git apply --unidiff-zero --check benchmarks/content-bounds/experiment.patch
git apply --unidiff-zero benchmarks/content-bounds/experiment.patch
```

补丁恢复本轮测量的内容边界实现及专用测试；普通 checkout 仍使用原生产核心。
然后构建并执行：

```sh
moon build adapters/linear --target wasm --release
moon -C benchmarks/strtree build --target wasm --release
node benchmarks/browser/content-run.mjs --quick
node benchmarks/browser/content-run.mjs --record
node benchmarks/browser/content-run.mjs --record
```

quick 只检查链路，不归档或冒充完整验收。两次正式运行各创建隔离 Chrome 会话；
每个会话内逐轮轮换 before/after/strtree 的构建和查询顺序。使用现有本机服务器和
Chrome 启动器，不关闭 Chrome 沙箱，不复用日常 profile。可用 `CHROME_BIN` 指定浏览器。
计时期间不要编译、测试或执行 profiler。结果文件使用唯一时间戳且不覆盖。

## 矩阵与语义

复用种子 20261025 数据，1 千/1 万/10 万对象 × 均匀/双簇/全重叠分布。
AABB 有局部、根的八个子区和全根三种负载；count/cap64/all 每条容量分别为 0/64/N，
每批 8 条查询。另在两个 MOctree 版本上对沿 +X 的射线做相同规模、分布和容量矩阵，
不把 STR 的不同射线能力纳入比较。每轮 243 行 AABB 加 54 行射线，共 297 行。

每行 20 次预热、100 次采样，记录全部原始样本及 nearest-rank p50/p95/p99。
计时前以独立 JS 几何谓词扫描，核对准确总数、写入数、状态、ID 成员与唯一性。
每模块另有 30 项共同域校验。STR 的 cap64 仍由公开 query 生成完整结果再截取；
具体 API 差异见 [STR 对照](../strtree/README.md)，不是纯算法公平排名。

计时包含适配输入、校验、查询、输出复制和报告创建，包含调用内 GC；
数据、oracle 和 checksum 在计时外。每 10 轮让出事件循环。all 模式预留并复制 8N
个 ID 槽位，不能把少命中时的大输出复制归因于树遍历。小于 0.1 ms 的数据易受计时粒度影响。

每种规模和分布记录三个模块各 5 个独立实例的构建样本；实例化不计时，构建含传输和校验。
两轮记录环境、模块原始/gzip9 字节与 SHA-256、测量及核心源码哈希、基线源码哈希、
STR 0.2.2 依赖源码清单哈希。基线提交关系由 Git 验证，生产代码无第二套索引实现。

## 内存

延迟测量完成后，为每个规模、分布、模块新建实例，共 27 组资源探针。
记录初始化、构建、依次执行 20 批全根 count/cap64/all 后的导出线性内存容量；
只读取 memory 大小，不读取运行时对象头。容量只增长，包含临时分配及分配器保留空间，
不是存活堆或进程 RSS。增长粒度可能掩盖内容边界的实际增量。

内容边界每个非空节点增加六个 Double 坐标载荷（48 字节），另有 Node 引用字段、
AABB/Vec3 的后端表示及分配开销；它们不能简单由逻辑容量统计推算。
空根复用单元边界作为占位，计数仍为 0。当前探针不测构建中活跃堆峰值或受限设备。
此处是实验成本说明，不表示这些字段已进入生产核心。

结果与是否保留实现的依据见 [实验报告](../../docs/validation-content-bounds.md)。
修改此基准后须完成上述两轮及根 README 要求的浏览器/后端/提交前验收。
