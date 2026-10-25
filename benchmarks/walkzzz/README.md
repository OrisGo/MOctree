# walkzzz 点索引共同域对照

固定依赖 `walkzzz/moon-geometry@0.251.0`（MIT），只使用其公开的
`base/core`、`spatial/octree`、`spatial/loose_octree`；没有修改依赖源码或根模块依赖。
`benchmarks/pointbridge` 属于根模块的独立基准包，将点转换成零尺寸 AABB，
不代表 MOctree 已新增生产点云索引。两套基准桥不实现完整生产错误协议。

## 构建与验收

```sh
moon -C benchmarks/walkzzz update
moon -C benchmarks/walkzzz fmt --check
moon -C benchmarks/walkzzz check --target wasm --deny-warn
moon -C benchmarks/walkzzz test --target wasm
moon -C benchmarks/walkzzz info --target wasm
moon build benchmarks/pointbridge --target wasm
moon -C benchmarks/walkzzz build --target wasm
node benchmarks/browser/points-test.mjs debug
moon build benchmarks/pointbridge --target wasm --release
moon -C benchmarks/walkzzz build --target wasm --release
node benchmarks/browser/points-test.mjs release
node benchmarks/browser/points-run.mjs --quick
node benchmarks/browser/points-run.mjs --record
node benchmarks/browser/points-run.mjs --record --reverse-order
```

驱动复用现有本地服务器和隔离 Chrome，开启原有浏览器沙箱；将构建模块复制至忽略目录
`_build/browser-results/points-*.wasm` 供页面读取。quick 只有 1 千对象、24 样本，不能归档。
正式两轮依次运行，不在计时期间编译、测试或采样 profiler。每轮按规模归档三个 JSON，
由相同 startedAt 关联；旧数据不会覆盖。忽略目录 points.json 保留最近一次整轮结果。
修改后执行上述独立验收、根 README 提交检查；共享浏览器基础设施有改动时还需通用浏览器验收。
当前 CI 不自动执行本独立依赖模块及点矩阵，修改时须按此处命令验收，不能以根模块 hooks 替代。

## 公平性边界

- 输入为根 `[-100,100]³` 内有限点，固定种子 20261025；1 千/1 万/10 万。
  uniform 为各轴 `[-90,90)`；cluster 为双簇；duplicates 为全部原点。重复坐标保留出现次数。
- 普通 Octree 容量阈值 16、深度 16；Loose Octree 的源码阈值固定 8，loose_factor=2、深度 16。
  MOctree 默认阈值 16、深度 16、节点预算 `2N+1`。没有声称参数含义或节点数量相同。
- MOctree 从原始点构造零尺寸 AABB，ID 为输入序号，保留 3N Double 坐标表供输出映射。
  构建包含这项存储及 AABB/ID 校验；查询包含 ID 到坐标转换。walkzzz 原生输出 Point3D，
  无对应映射。两方均传入 3N Double，输出相同容量的三坐标槽位，使用同一个 JS 客户端。
- 普通和松散树通过逐点插入构建；MOctree 使用批量构建。这是各自公开接口的端到端比较。
- count/cap64/all 每条容量 0/64/N。MOctree 准确计数并限量取 ID；walkzzz 没有范围计数
  或限量接口，因此先调用完整范围查询，再取长度/截取。不得称为 walkzzz 原生 count 或 top-K。
- all 每批 8 条预留 8N 个三坐标槽，完整复制 `192N` 字节，即使实际少命中；报告为每条四个 Int。
  未写区域为零。命中总数和 written 表达完整/截断，顺序未指定。无距离排序或近邻语义。
- 三后端是相同 WASM 后端、同一浏览器会话；不对射线、动态删除、对象 AABB 或非法输入做排名。
  两个 walkzzz 模式共享一个包含两套实现的 WASM，其体积不能当作各子包独立最小体积。

## 查询和采样

复用 layout-data 的 64 帧小视口与分散中选框；另测根的八个子区、全根。
每批 8 条、每序列 8 批。内部子区与全根重复批次是明确的特殊负载，不赋予业务权重。
每轮 24 次预热、96 次正式采样，每批恰好 12 次。调度使用 measurementStep，
每个批次在三后端每个位置恰好 4 次，第二轮 phase=1。
计时包含传输、查询、分配、坐标映射和报告解码；不含 oracle、UI、checksum 和让出事件循环。
分位数为 nearest rank，统计单位为批次，不能除以 8 冒充单条分位数。
构建每组 5 个独立实例，实例化在计时外，不单独预热构建；五样本尾分位数较粗。

所有计时组合先做独立逐点闭合 AABB 扫描，按坐标多重集而不是集合校验。
限量结果只要求是期望多重集的合法子集且长度准确，完整输出要求全部出现次数。
每后端另有 32 项共同域检查：空数据、重复点、根边界/相切、分割面、线退化、根外查询、
零容量、限量、全根恰好填满、余量、输入快照和结果生命周期。
`points-test.mjs` 的根外点插入探针单独报告，不算共同域通过项，不修改上游来隐藏差异。

## 资源

主计时后另建每规模/分布/后端实例，记录 init/build 和依次 20 批全根 count/cap64/all 后
导出 memory 容量。容量包含临时分配、保留空间和增长粒度，不是活跃堆峰值或 RSS。
没有测 GC 次数、受限设备或精确存活字节；不能把坐标表或 order 的逻辑载荷当作实测峰值。
原始记录含模块字节/gzip9/哈希、编译器/Chrome/CPU、桥和核心源码哈希、完整依赖源码哈希。
没有自动发布 Issue；结论及根外输入复现见实验报告。

两轮完成后运行 `node benchmarks/browser/points-audit.mjs` 并明确传入本次六个规模分片文件。
该审计校验模块/源码/依赖哈希、原始分位数、三方计数、调度和坐标；Chrome 两轮坐标必须精确相同，
Node 对 sin/cos 生成坐标的重建只允许 1e-12 绝对误差。正式校验以实际 Chrome 坐标为准。
独立的两项上游行为测试在计时完成后添加，不改变被测桥或依赖；不会作为计时源码冒充归档内容。
