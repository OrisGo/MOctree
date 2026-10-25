# MOctree

使用纯 MoonBit 实现核心算法的三维空间索引库，面向浏览器等 WebAssembly 运行环境。通过八叉树组织对象的轴对齐包围盒（AABB），为区域筛选、框选和射线拾取提供候选对象查询。

核心采用双精度坐标，批量构建后只读查询，不依赖 DOM、Three.js、WebGPU 或特定 WASI 宿主。MoonBit 模块名为 `orisgo/octree`。

> 项目处于开发阶段：静态索引核心与 wasm 批量适配已实现，M2 尚未整体验收，首版尚未正式发布。

## 功能

- **空间查询**：AABB 相交、有限区间射线候选查询，以及对应的批量查询接口。
- **明确的结果状态**：准确总命中数、限量输出和截断标记，支持复用结果缓冲与查询工作区。
- **构建预算**：显式限制对象数、节点数和深度；达到细分限制后保留对象并扫描，不静默丢弃数据。
- **结构与统计**：只读层级遍历，以及节点访问量、对象测试量和命中量统计。
- **WASM 接入**：独立 JavaScript 包装器，支持线性内存批量传输、错误详情与传输预算。
- **正确性验证**：暴力扫描对照、随机与退化数据测试，以及可复现的浏览器基准。

## 快速开始

### 获取源码

当前从源码构建，需先安装 MoonBit 工具链：

```sh
git clone https://github.com/OrisGo/MOctree.git
cd MOctree
moon check --target wasm
moon test --target wasm
```

已记录验收使用的编译器为 `moonc v0.10.16+b1a0e846e`。WASM 适配模块与 JavaScript 包装器需要匹配使用，具体要求见[线性内存适配文档](docs/wasm-linear.md)。

### MoonBit 中构建与查询

消费包在 `moon.pkg` 中导入 `orisgo/octree`，别名使用 `@octree`。以下片段展示构建和查询流程，需放在允许 `raise` 的函数中，或使用 `try/catch` 处理几何与构建错误：

```moonbit
let root = @octree.Cube::new(@octree.Vec3::origin(), 100.0)
let bounds = @octree.Aabb::new(
  @octree.Vec3::new(1.0, 2.0, 3.0),
  @octree.Vec3::new(4.0, 5.0, 6.0),
)
let index = @octree.StaticObjectIndex::build(
  [@octree.Entry::new(42U, bounds)],
  root~,
  max_objects=1000,
  max_nodes=4096,
)
let ids = index.query_aabb(bounds)
// ids 包含对象 ID 42U。
```

便捷查询会分配结果缓冲与工作区。频繁查询可使用 `query_aabb_into` 或 `query_ray_candidates_into` 复用缓冲；批量请求使用对应的 `*_batch_into` 接口。完整用法见 [API 使用说明](docs/api.md)，精确签名见[生成接口](pkg.generated.mbti)。

### JavaScript / 浏览器接入

构建 wasm 线性内存适配模块：

```sh
moon build adapters/linear --target wasm --release
```

使用 [`adapters/linear/client.mjs`](adapters/linear/client.mjs) 中的 `createLinear` 加载匹配的 WASM 模块，通过 `build`、`query` 和 `release` 管理索引。输入为对象 ID 与包围盒坐标数组，输出包含 ID 数组及逐条查询报告。加载方式、数据布局与错误处理见[接入示例](docs/wasm-linear.md#使用)。

当前线性内存适配仅支持 `wasm`；`wasm-gc` 的宿主传输仍使用[实验原型](docs/wasm-prototype.md)作语义对照。

## 适用范围

适合对象几何保持不变、构建后反复查询的三维场景。移动选框、改变查询区域或射线不需要重建；对象增删或 AABB 改变时需要重建索引。

- 查询精确到包围盒谓词；射线命中 AABB 不代表命中真实网格，精确模型相交由应用完成。
- 每个对象仅存储一次，跨分割面的对象保留在内部节点并参与查询。根外对象明确报错。
- 缓冲不足仍计算准确命中总数，并报告截断；结果不排序，射线候选不保证按距离排列。
- 当前没有增量更新、实际单精度存储或专用点云近邻查询。零尺寸 AABB 可以表示点，不等同于专用点云索引。
- 节点预算不是运行时字节上限；不承诺零分配、零拷贝或移动设备容量。

边界相切、数值校验、所有权和容量行为详见[接口契约](docs/contracts.md)。

## 基准与验证

仓库包含 1 千、1 万、10 万对象规模的浏览器验收、扫描正确性对照和资源记录，并分别提供有体积 AABB 与点数据的算法对照。性能随数据分布、查询范围和输出量变化，选型时应结合实际负载。

- [运行浏览器基准](benchmarks/README.md)：环境准备、测量方法与验收步骤。
- [对比总结](docs/comparison-summary.md)：适用场景、性能取舍及各项原始报告索引。
- [浏览器验收报告](docs/validation-browser.md)：测量环境、结果和资源统计边界。
- [专项性能诊断](docs/validation-diagnostics.md)：热力图、CPU 采样与火焰图。

现有性能数据来自固定环境中的合成负载，不构成真实业务帧率或受限设备性能保证。线性内存容量也不等于活跃堆峰值。

## 仓库组成

| 位置 | 职责 |
| --- | --- |
| `geom/`、`objects/`、根包 | MoonBit 几何、索引构建、查询与公开接口 |
| `adapters/linear/` | MoonBit WASM 桥接及 JavaScript 调用包装器 |
| `adapters/prototype/` | 用于后端语义对照的实验适配 |
| `benchmarks/` | 浏览器基准、算法对照、独立扫描校验和性能诊断 |
| `scripts/ci/` | 仓库检查与验收辅助脚本 |

JavaScript 主要用于宿主传输和开发工具，索引算法在 MoonBit 中执行。直接使用 MoonBit API 不依赖 JavaScript 包装器。库归档通过 [`.moonignore`](.moonignore) 排除基准、CI 脚本及集成测试，保留供宿主调用的包装器。

## 文档导航

完整分类见[文档索引](docs/README.md)。使用说明描述当前接口，实验报告保留各次测量时的版本与结论。

| 文档 | 内容 |
| --- | --- |
| [API 使用说明](docs/api.md) | 构建、查询、结果缓冲、批量请求与遍历 |
| [接口契约](docs/contracts.md) | 几何边界、错误、容量及所有权语义 |
| [WASM 线性适配](docs/wasm-linear.md) | JavaScript 接入、协议与集成验收 |
| [结构设计](docs/architecture.md) | 包边界、存储职责及适配层设计 |
| [项目方案](docs/project-plan.md) | 首版范围、里程碑和扩展路线 |
| [第一阶段验收](docs/validation-m1.md) / [批量查询验收](docs/validation-batch.md) | 核心与批量接口的验证记录 |
| [CI 与发布准备](docs/ci.md) | 工作流、候选包及发布边界 |

## 路线图

首版仍需完善 wasm-gc 块传输、受限设备验收、空间划分交互示例和算法对照基准。性能优化依据专项诊断结果逐项验证。

后续扩展方向包括实际单精度存储、动态对象索引及专用点云索引。这些能力尚未实现，具体边界与阶段安排见[项目方案](docs/project-plan.md)。

## 提交前验收

安装 MoonBit 工具链与 prek（至少 0.4.9），首次克隆后执行：

```sh
prek install
prek validate-config .pre-commit-config.yaml
prek run --all-files
```

每次提交先完成改动对应的验收，暂存文件后执行 `prek run` 和 `git diff --cached --check`，复核暂存差异。Git 提交时也会通过已安装的钩子运行 prek。钩子安装是每个本地克隆的操作，不随仓库文件自动生效。

配置使用 prek 内置文本检查和本机 MoonBit 命令，无需下载远端 hook 仓库。MoonBit 包源码或配置变更会触发格式化及 wasm、wasm-gc 的检查和测试；纯文档变更不触发这些编译检查。格式化如修改文件，需要复核、重新暂存并重跑。

独立 `.mbtx` 调研脚本仅接受通用文本检查，不自动执行其网络或文件操作。公开 API 变化仍需额外运行 `moon info` 并复核生成接口；JS/native 验证、性能测量和其他契约验收按任务范围补充。

适配层变更还需执行 [双后端原型测试](docs/wasm-prototype.md#复现与验收)及
[线性内存适配 debug/release 集成测试](docs/wasm-linear.md#复现与验收)，这些 Node 测试不在 hooks 中。
浏览器基准和独立 MoonFlame 模块的修改还需执行 [各自验收](benchmarks/README.md#修改后的验收)。
MoonSTRtree 对照桥需额外执行 [独立模块及 debug/release 集成验收](benchmarks/strtree/README.md#复现)。
walkzzz 点对照需执行 [独立模块、点桥及浏览器验收](benchmarks/walkzzz/README.md#构建与验收)；
常规 CI 尚不覆盖该独立模块和点矩阵，不能用根模块 hooks 或 CI 绿灯替代。

GitHub Actions 配置位于 `.github/workflows/ci.yml` 和 `browser.yml`，核心验收脚本位于 `scripts/ci/`。
工作流推送到远端后才会运行；required checks 需在首次成功运行后由仓库管理员启用。
CI 生成经过解包消费者验证的候选源码包，不自动发布。库归档通过 `.moonignore` 排除基准与开发资料，
发布包说明见 [package-readme](docs/package-readme.md)。

## 许可证

[Apache-2.0](LICENSE)。
