# MoonBit Octree

面向浏览器等 WASM 运行环境的轻量三维空间索引库，优先保证资源可控、查询正确和批量调用效率。

项目采用“共享几何与基础设施，对象索引与点云索引分别设计，静态与动态类型独立”的路线。首版实现双精度、批量构建、只读查询的 AABB 对象索引；后续扩展单精度存储、动态写入和点云索引。

## 当前状态

截至 2026-10-21，第一阶段核心已实现：

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
wasm-gc 块传输、受限设备验收、空间划分交互示例和完整算法对照基准仍待完成。
动态写入、单精度存储和点云索引仍属于后续路线。M2 尚未整体验收，第一阶段完成不代表首版已发布或已完成受限设备资源验收。

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

GitHub Actions 配置位于 `.github/workflows/ci.yml` 和 `browser.yml`，核心验收脚本位于 `scripts/ci/`。
工作流推送到远端后才会运行；required checks 需在首次成功运行后由仓库管理员启用。
CI 生成经过解包消费者验证的候选源码包，不自动发布。库归档通过 `.moonignore` 排除基准与开发资料，
发布包说明见 [package-readme](docs/package-readme.md)。
