# MoonBit Octree

面向浏览器等 WASM 运行环境的轻量三维空间索引库，优先保证资源可控、查询正确和批量调用效率。

项目采用“共享几何与基础设施，对象索引与点云索引分别设计，静态与动态类型独立”的路线。首版实现双精度、批量构建、只读查询的 AABB 对象索引；后续扩展单精度存储、动态写入和点云索引。

## 当前状态

截至 2026-10-25，静态对象索引、wasm 线性适配、浏览器验收及当前对照报告已形成阶段性成果。
M2 尚未整体验收，这不代表首版已发布。第一阶段核心已实现：

- Double 几何类型与校验、固定根单归属 AABB 八叉树。
- 显式对象/节点/深度预算，批量构建、AABB 相交与有限区间射线查询。
- 调用者结果缓冲、可复用工作区、准确命中总数及完整性状态。
- 只读前序遍历、结构/查询统计、暴力扫描与边界和随机对照测试。

2026-10-23 补充纯 MoonBit 批量 AABB/射线查询，支持批次输出区间预校验和逐条结果/几何错误。用法见 [API 使用说明](docs/api.md)。
本次后端验证及限制见 [批量查询验收](docs/validation-batch.md)。

已补充 [JS/WASM 双后端实验原型](docs/wasm-prototype.md)，验证标量 staging 与批量查询的端到端语义。
2026-10-25 实现 [wasm 线性内存批量适配 v1](docs/wasm-linear.md)：整块复制输入/结果、版本检查、
错误详情及传输预算，已完成 Node.js debug/release 验证。
已增加 [浏览器验收与资源基准](benchmarks/README.md)，包含 1 千/1 万/10 万对象的查询对照、
资源快照，以及 `moonflame@0.2.0` 渲染的 Chrome WASM 采样火焰图。
本次实测结果与限制见 [浏览器验收报告](docs/validation-browser.md)。
已完成 [MoonSTRtree 三维同语义对照](docs/validation-strtree.md)，覆盖计数、限量和完整 AABB 输出。
已完成 [AABB 子树整体命中优化与前后对照](docs/validation-subtree.md)，保留准确计数及统计口径。
新版已完成 [同浏览器 MoonSTRtree 两轮复测](docs/validation-subtree-strtree.md)，明确整体命中优势与局部查询瓶颈。
已归档 [子树实际内容边界实验](docs/validation-content-bounds.md)：两轮 Chrome 对照后，因构建、内存和完整输出代价未保留生产改动。
已完成 [连续视口/选框负载与 DFS 条目布局实验](docs/validation-layout.md)，保留直接条目访问，记录完整输出收益及[射线顺序平衡复测](docs/validation-ray-order.md)。
已完成 [walkzzz 点索引共同域对照](docs/validation-walkzzz.md)，与有体积 AABB 基准分开报告。
整体取舍、动态更新边界及下一阶段热力图/火焰图定位任务见 [对比总结](docs/comparison-summary.md)。

## 适用范围与当前限制

当前适合批量构建后反复查询的静态 AABB 场景，支持准确总命中数、限量输出和明确的截断状态。
移动选框或改变查询射线不需要重建；对象增删，或移动、旋转、缩放导致索引中的 AABB 改变时，
需要重新构建。当前没有增量更新接口，点数据对照使用零尺寸 AABB 适配，不代表已有专用点云索引。

已测负载中，MOctree 在全根计数、限量输出和部分高命中查询上有优势，均匀局部 AABB 查询仍落后于
MoonSTRtree；walkzzz 普通 Octree 在点构建上更快。两类实验的输入和接口成本不同，不能合成总榜。
这些结论来自固定环境中的合成负载，尚未完成真实业务轨迹及受限设备验证；线性内存容量也不等于活跃堆峰值。
具体数值、环境和限制以 [对比总结](docs/comparison-summary.md)及关联原始报告为准。

## 下一阶段

优先用热力图定位慢场景，再用专项 CPU 火焰图区分遍历、对象判断、结果物化、传输及分配成本，
依据证据选择优化。热力图和逐场景、逐后端火焰图仍待实施；已有通用 MoonFlame 验收不等于完成专项诊断。
详细交付与验收要求见 [定位任务](docs/comparison-summary.md#下一阶段先定位再选择优化)。

wasm-gc 块传输、受限设备验收、空间划分交互示例和完整算法对照基准仍待完成。
动态写入、实际单精度存储和专用点云索引属于后续扩展，不自动进入本轮性能定位范围。

## 设计文档

- [项目方案与扩展路线](docs/project-plan.md)：应用场景、首版范围、里程碑和验收要求。
- [结构设计](docs/architecture.md)：包边界、存储职责、动态类型、精度和 WASM 适配。
- [接口契约](docs/contracts.md)：已确认并落实的第一阶段语义，以及后续阶段的契约边界。
- [API 使用说明](docs/api.md)：构建、查询、缓冲和遍历的调用方法。
- [第一阶段验收](docs/validation-m1.md)：测试矩阵、环境及未验证范围。
- [CI 与发布准备](docs/ci.md)：合并检查、浏览器验收、手动完整基准及发布包边界。

现有 [编译器 ICE 调查记录](docs/ice-2-llvm-target-std-bundle.md)属于历史开发环境资料，不构成当前后端支持状态的证明。

模块名为 `orisgo/octree`，许可证配置为 Apache-2.0。依赖与包导入应使用此命名空间。

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
