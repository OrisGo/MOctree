# CI、浏览器验收与发布准备

当前仓库提供两条 GitHub Actions 工作流：基础 CI 与浏览器正确性验收。
它们在 PR、推送 `main` 和手动触发时运行，没有发布凭据，不自动发布 Mooncakes 或部署站点。
工作流文件进入远端后才会运行；本地验证不能替代首次 GitHub runner 的实际结果。

## 合并前检查

| 工作流 / job | 覆盖范围 |
| --- | --- |
| `CI` / `Core, adapters and package` | actionlint、prek 全库检查、JS 语法、Markdown 本地链接；根模块 wasm/wasm-gc；生成接口一致性；MoonFlame JS 测试；线性适配 debug/release 与 STR 集成；实际发布包与隔离消费者 |
| `Browser` / `Browser correctness` | release 构建；Chrome 快速矩阵、扫描正确性对照、MoonFlame SVG 交互；STR 快速矩阵及页面筛选 |

根模块的格式、wasm/wasm-gc 检查与测试由现有 prek 配置执行，CI 不重复定义另一套检查。
prek 后检查 Git 差异，避免工具自动修复文件后仍然将原提交判为通过。
独立模块不由根 hooks 覆盖，`scripts/ci/validate.mjs` 显式执行其检查。
STR 桥没有 MoonBit 单元测试；实际验收是 Node debug/release 集成和浏览器扫描对照，不把零测试计作测试通过。

浏览器常规运行使用 `--quick`：原矩阵 36 组、70 项浏览器契约断言；STR 54 组、90 项共同域校验。
快速采样仅用于连通性和正确性，不代表完整性能验收，不设置耗时通过阈值。

两个工作流始终触发，不使用整个工作流的路径跳过规则。单次任务有超时限制，同一 PR 的旧运行可取消。
仓库管理员在首次 Actions 运行成功后，应在 `main` 的 ruleset 中将上述两个 job 设为 required checks。
**仅提交 YAML 不会自动开启分支保护**；本次未修改远端规则。

## 固定环境

- Runner：`ubuntu-24.04`，Linux x86_64；不声明 macOS/Windows CI 覆盖。
- Node：22.23.1，使用固定 SHA 的 `actions/setup-node`。
- MoonBit：官方归档 `0.10.16+b1a0e846e`，对应 moon/moonrun 0.1.20261020 和 moonc v0.10.16+b1a0e846e。
- core：与编译器相同版本；显式构建 wasm、wasm-gc、JS 的 core bundle。
- prek：0.4.14；actionlint：1.7.7。
- MoonFlame：0.2.0；MoonSTRtree：0.2.2，各自保持在独立模块中。

工具下载地址与 SHA-256 在 [tools.json](../scripts/ci/tools.json) 中。
[安装脚本](../scripts/ci/install-tools.py) 只接受全新目标目录，校验归档后安装，不修改用户已有 `~/.moon`。
在 Actions 中安装于 runner 临时目录，通过 `GITHUB_PATH` 和 `GITHUB_ENV` 配置后续步骤。
自定义安装脚本按官方归档方式设置可执行权限及构建 core，未使用浮动 `latest`。

Chrome 使用 Ubuntu runner 已安装的 `/usr/bin/google-chrome`，版本随镜像更新；每次运行记录实际版本。
保留 Chrome 沙箱及独立临时 profile。如果 runner 缺少 Chrome 或不能启动沙箱，任务应失败并报告，
不得以关闭沙箱或跳过浏览器测试掩盖失败。固定浏览器版本和专用性能机器属于后续性能门禁工作。

Chrome 主进程退出后，子进程仍可能短暂写入临时 profile。清理使用 Node `rm` 的有限重试
（最多 10 次、100 ms 线性退避），处理 `ENOTEMPTY` 等可重试错误；重试耗尽仍报告失败。
浏览器清理抛错时也会关闭本地 HTTP 服务，避免进程挂起。只删除本次 `mkdtemp` 创建的目录。

不缓存 `_build` 或下载依赖目录；新 runner 必须真实构建。当前依赖规模较小，先以可复现性优先。
所有外部 Actions 固定完整提交 SHA，默认 `contents: read`，checkout 不持久保存凭据。
PR 使用 `pull_request`，不以高权限事件执行 PR 代码。

## 完整基准与产物

在 Actions 的 `Browser` 工作流手动运行时，将 `full` 设为 true，可执行完整 108 组后端矩阵和
162 组 STR 对照。仍要求正确性通过，但不以延迟排名作为门禁。
普通共享 runner 的跑分不能直接与仓库中的 Ryzen 桌面记录比较，也不能将不同时间两次运行直接视为性能回归。
后续若设置耗时阈值，应在同一环境下顺序运行基线与候选版本，重复采样并记录波动。

浏览器构建/运行日志和已有 JSON、CPU profile、SVG、截图，无论步骤成功或失败都尝试上传。
如果失败发生在截图生成之前，就只有当时已生成的诊断文件；不承诺所有失败均有截图。
产物保留 14 天，不自动提交回 Git。仓库内历史基准仍由开发者明确归档。
CI 还上传通过消费者检查的源码 ZIP，作为候选分发包；它不是已发布版本，不包含预编译 WASM。

## 发布包边界

[.moonignore](../.moonignore) 排除基准、原始跑分、调研脚本、CI 配置、集成驱动和仓库开发文档。
保留核心/适配源码、生成接口、核心测试、JS 包装器、许可证、[包说明](package-readme.md)与[API 用法](api.md)。
模块元数据的 `readme` 指向包内自洽说明，`repository` 指向项目仓库；补充 Apache-2.0 许可证全文。

[package-smoke.py](../scripts/ci/package-smoke.py) 对 `moon package` 实际 ZIP 执行白名单与必要文件检查，
然后解压到全新临时目录。独立消费者通过 workspace 使用解包后的模块，而非仓库源码或已发布缓存；
执行 wasm/wasm-gc API 测试，并重新构建解包后的 linear 适配层，再由包内 JS 包装器验证边界命中与最大 UInt32 ID。
这证明源码分发内容自洽，不证明 Mooncakes 远端上传或注册表安装已经完成。

## 本地复现

在项目根目录、匹配工具链及 Node 环境下：

```sh
actionlint -shellcheck=""
prek run --all-files
node scripts/ci/check-files.mjs
node scripts/ci/validate.mjs
python3 scripts/ci/package-smoke.py
node benchmarks/browser/build.mjs
node benchmarks/browser/run.mjs --quick
node benchmarks/browser/compare-run.mjs --quick
git diff --exit-code
```

actionlint 校验 Actions 语法与表达式；关闭其可选 shellcheck 集成以免依赖 runner 的额外工具版本，
不是关闭工作流或实际 shell 步骤验收。工作流明确使用 bash，其默认 `-eo pipefail` 保留管道中失败状态。
修改源码或工作流后按根 README 完成暂存、prek 和提交检查。

## 暂不实施

定时性能门禁、自动工具链升级、发布标签校验与 Mooncakes 上传、GitHub Pages 部署尚未启用。
正式发布前还需完成项目里程碑验收，确定版本策略、发布权限及凭据，并验证注册表端的包安装。
本次配置没有自动推送、自动合并、自动发布或定时任务。

## 本次本地验收

2026-10-25，在 Linux x86_64 本机完成：

- 从官方固定归档向全新目录安装工具并校验 SHA-256，三个 core 目标构建成功。
- 将暂存内容检出到无 `_build`、无 `.mooncakes` 的临时仓库，完整执行基础 CI 命令通过；
  两个独立模块的依赖在该检出中重新下载，未借用项目原有构建产物。
- 包内消费者 wasm/wasm-gc 各 28 项测试通过（原核心 27 项加消费者 1 项），包内 JS/WASM 验证通过。
- 临时检出的 Chrome 156 快速验收通过：原矩阵 36 组、70 项断言、三份采样与 SVG 交互；
  STR 对照 54 组、90 项共同域校验及筛选交互通过。
- 在临时检出中分别放开基准文件打包和破坏生成接口，确认 CI 分别报告发布清单违规与接口过期；
  随后恢复文件并检查工作区无变化。
- actionlint、prek 全库检查和暂存差异检查通过。

本机不是 GitHub 的 Ubuntu runner；Actions 调度、artifact 上传、runner 的 Chrome 环境和 required checks
仍须在推送后的首次远端运行中确认。没有将这些未执行部分记为通过。
