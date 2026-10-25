# 浏览器连续视口、选框与 DFS 条目布局实验

基线为 `2b9bb52`，包含 `74cfa25` 和 `61da14d`；不要求这些提交已合并 main。
从基线构建并保存模块，之后再构建候选，不能把候选覆盖为基线：

```sh
moon build adapters/linear --target wasm --release
mkdir -p _build/browser-results
cp _build/wasm/release/build/adapters/linear/linear.wasm _build/browser-results/layout-before.wasm
```

候选的取得方式及是否保留生产实现见 [报告](../../docs/validation-layout.md)。
准备好候选后执行：

```sh
moon build adapters/linear --target wasm --release
moon -C benchmarks/strtree build --target wasm --release
node benchmarks/browser/layout-test.mjs
node benchmarks/browser/layout-ui-test.mjs
node benchmarks/browser/layout-run.mjs --quick
node benchmarks/browser/layout-run.mjs --record
node benchmarks/browser/layout-run.mjs --record
```

本机 Chrome 与 HTTP 权限要求沿用 [浏览器说明](../README.md)。两个正式命令顺序执行，
每轮独立 Chrome 会话，会话内轮换基线、候选、STR 的构建和查询次序。
计时期间不得并行编译、测试或采样 profiler。quick 仅验证链路，禁止同时使用 --record。
每轮完整 621 行，每个规模分文件归档，以免单文件超出仓库大小限制；这些文件属于同一轮，
通过 startedAt 关联。忽略目录的 layout.json 保留整轮数据。

## 查询生成与正确性

`layout-data.mjs` 固定种子和公式；对象数据沿用 `data.mjs` 的 20261025 种子。
规模 1 千/1 万/10 万，均匀、双簇、完全重叠；每场景 64 条查询，8 条一批、8 批一个周期。
连续视口的中心沿三维闭合曲线移动，三种半边长为 6/28/75；选框中心独立分散在
[-80,80)，半边长围绕 3/24/70 逐轴变化。所有坐标数组保存在原始记录的 workloads。
尺寸标签不是命中率标签，不按目标比例筛选查询；perBatch.hitsPerQuery 记录每条实际命中数，
actualHitRate 为完整 64 条查询的命中比例。完全相同的重叠对象不能产生单条中等命中率，
跨帧平均比例不得冒充单条比例。

全根 broad 单独报告，无默认业务权重。射线使用显式有限区间与连续变化起点/方向，
只对照两版 MOctree；STR 三维 AABB API 没有参与射线排名。
AABB 是候选区域查询，不是网格精确拾取或完整视锥剔除。

三种输出为 count/cap64/all，每条容量分别为 0/64/N。全部保持准确命中总数。
all 按现有 ABI 复制 8N 槽位；原始记录的 inputBytes/outputBytes 包含坐标、范围、ID 与报告载荷，
不代表堆分配量。STR cap64 仍由公开 query 产生全部结果后截取；STR 对象测试和访问数为 null。

计时前，每种几何查询对全部对象独立 JS 扫描，核对总数、完整性、唯一 ID 与成员。
`layout-test.mjs` 另做 2,880 组配对检查，覆盖三个分布、三档节点预算、移动/选框/全根/射线、
零/1/64/恰好填满/多余容量和非零输出偏移；比较两版全部报告及实际 ID 输出。
核心与适配的随机、边界、退化及极端数值检查仍需单独执行，不能由这个适中坐标 oracle 替代。

## 样本与资源

20 次预热、100 个原始批次样本，逐轮轮换后端；序列索引为 `(round+warmups)%8`。
因此正式样本首批为第 4 批，每批出现 12 或 13 次，三个后端完全相同。
分位数描述这个固定序列；actualHitRate 描述完整周期，二者没有隐含业务加权。
构建取 5 个独立实例，实例化在计时外，传输、校验、核心构建和工作区创建在计时内。
所有延迟包含公开调用与宿主复制，未隔离纯遍历时间。

主计时结束后另建 27 个资源实例，记录初始化、构建、20 次全根 count/cap64/all 后的线性容量。
单独包装输入/输出回调计时，归档每次回调累计耗时及该次完整调用耗时；包含回调校验、复制和
额外计时开销，不包含回调外的分配、staging 或报告构造。不能从主延迟中直接减去探针数据，
小于计时粒度的回调测量尤其粗糙。探针只用于说明传输成本，不用于后端纯算法排名。

线性容量不是活跃堆峰值，不是精确存活字节；临时数组和分配器保留可能被容量增长粒度掩盖。
本实验没有构建中活跃堆峰值、GC 次数、进程 RSS 或受限设备测量。
记录包含工具链、CPU、浏览器、源码/基线源码/模块/STR 0.2.2 依赖 SHA-256 及模块 gzip9 大小。
两轮范围不是置信区间，不删掉退化组合，不将观测差异直接解释为统计显著性。

本轮已保留候选生产实现。复现时先在基线独立 checkout 构建 before，再回到本提交构建 after；
不要在本提交直接保存 before，否则会错误地比较两个候选模块。
两轮完成后可审计全部记录（明确指定本次六个文件，避免混入未来轮次）：

```sh
node benchmarks/browser/layout-audit.mjs benchmarks/results/2026-10-25T13-15-43-500Z-layout-*-chrome.json benchmarks/results/2026-10-25T13-18-44-170Z-layout-*-chrome.json
```

正式测量后仅修复页面文字属性：textLayout 改为 textContent。
若要逐字节恢复测量源码，可在临时 checkout 使用以下补丁（会恢复旧显示问题）：

```sh
git apply --unidiff-zero benchmarks/layout/measured-ui.patch
```

补丁不改变布局、查询、传输或计时函数；审计同时接受精确测量版本和仅修复显示后的版本。
