# orisgo/octree

纯 MoonBit 静态三维 AABB 对象索引。输入、存储与计算使用 Double；批量构建后只读查询。

支持 AABB 相交、有限区间射线候选查询、批量查询、调用者结果缓冲及准确命中计数。
对象只存一次，跨分割面的对象保留在内部节点并参与查询。
构建要求显式固定根及对象/节点预算；根外对象和重复 ID 报错，节点预算耗尽时停止细分而不丢弃对象。
缓冲不足返回截断状态，不把未知总数伪装为准确计数。

导入根包 `orisgo/octree`，或公开包 `orisgo/octree/geom`、`orisgo/octree/objects`。
详见 [API 用法](api.md)、[生成接口](../pkg.generated.mbti)。Apache-2.0，见 [LICENSE](../LICENSE)。

发布包包含纯 MoonBit 源码及 `adapters/linear/client.mjs`、`adapters/prototype/client.mjs`。
WASM 文件需用匹配工具链构建，例如 `moon build adapters/linear --target wasm --release`。
线性适配 v1 依赖已验证的编译器数字数组表示；模块与 JS 包装器应成对使用并完成集成验收。
当前验收工具链为 moonc `v0.10.16+b1a0e846e`；不承诺任意编译器版本的二进制兼容性。

仓库内的浏览器基准、火焰图、调研脚本及历史测量数据不随库分发。
完整协议、构建步骤和验收限制见 [项目仓库](https://github.com/OrisGo/MOctree)。
当前尚未完成 M2 全部验收，不承诺动态写入、实际单精度存储或专用点云索引。
