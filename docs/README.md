# 文档索引

初次使用请从[项目 README](../README.md)开始。当前产品为静态 Double AABB 对象索引；核心算法使用 MoonBit，JavaScript 用于宿主包装器与浏览器验证工具。

## 使用与接入

| 文档 | 用途 |
| --- | --- |
| [API 使用说明](api.md) | MoonBit 构建、查询、批量请求、缓冲与遍历 |
| [接口契约](contracts.md) | 几何边界、错误、容量、结果完整性和所有权 |
| [wasm 线性内存适配](wasm-linear.md) | 当前 JavaScript/WASM 批量接入方式 |
| [包说明](package-readme.md) | 库归档内容与使用边界 |

## 设计与开发

- [结构设计](architecture.md)：当前包边界、存储与宿主适配，另列规划职责。
- [项目方案](project-plan.md)：范围、验收要求及扩展路线；规划能力不代表已经实现。
- [CI 与发布准备](ci.md)：工作流、候选包及隔离消费者验证。
- [浏览器基准说明](../benchmarks/README.md)：运行方法、测量口径及修改后的验收。

## 验收与实验记录

以下报告是对应源码、工具链和环境下的记录，不表示当前版本已重新执行全部测试。算法选型先读[对比总结](comparison-summary.md)，再查关联实验的原始数据。

| 类别 | 报告 |
| --- | --- |
| 核心正确性 | [第一阶段验收](validation-m1.md)、[批量查询验收](validation-batch.md) |
| 宿主与浏览器 | [双后端实验原型](wasm-prototype.md)、[浏览器验收](validation-browser.md) |
| AABB 算法对照 | [MoonSTRtree 对照](validation-strtree.md)、[子树优化后的 STR 复测](validation-subtree-strtree.md) |
| 点数据共同域 | [walkzzz 对照](validation-walkzzz.md)；不等同于专用点云功能 |
| 已采用的优化 | [子树整体命中](validation-subtree.md)、[DFS 条目布局](validation-layout.md)、[射线顺序复测](validation-ray-order.md) |
| 未采用的实验 | [子树实际内容边界](validation-content-bounds.md)；生产实现未保留该改动 |
| 性能诊断 | [热力图与专项 CPU 采样](validation-diagnostics.md) |
| 历史工具链问题 | [编译器 ICE 调查](ice-2-llvm-target-std-bundle.md)；不作为当前后端支持状态的证明 |

实验记录保留原路径，便于追溯源码、数据和已有链接。开发工具与实验资料不随库归档发布，具体排除规则见 [`.moonignore`](../.moonignore)。
