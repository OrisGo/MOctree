# JS/WASM 双后端适配原型

日期：2026-10-23。状态：实验原型，位于 `adapters/prototype`；不冻结生产 ABI，M2 尚未完成。

## 已实现的接口与生命周期

`client.mjs` 的 `createPrototype(wasmBytes)` 创建一个独立 WebAssembly 实例，返回同步
`build`、`query`、`release` 方法。一个实例拥有一个静态索引和一个复用工作区，多个实例互不共享状态。
核心 geom/objects 不依赖此适配层。

| 调用 | 输入和结果 |
|---|---|
| `build({ ids, bounds, root, maxObjects, maxNodes })` | ids 为 Uint32Array；bounds 为 Float64Array，每对象 minXYZ、maxXYZ 共六坐标；root 为中心 XYZ、半边长共四个 Double。预算为非负 Int32，节点预算仍由核心要求至少 1 |
| `query('aabb', coordinates, ranges, outputCapacity)` | 每条六坐标；ranges 为 Int32Array，每条 offset、capacity；返回新 Uint32Array ids 和逐条 reports |
| `query('ray', coordinates, ranges, outputCapacity)` | 每条 originXYZ、directionXYZ、t_min、t_max 共八个 Double，其余同上 |
| `release()` | 清除模块持有的索引、工作区和临时数据引用，JS 包装器此后拒绝调用；重复释放合法 |

JS 包装器验证数组类型、长度、整数范围并拒绝共享缓冲。几何合法性交给 MoonBit，
不在 JS 复制几何谓词。输入由同步 staging 复制到 MoonBit 值，调用返回后修改输入不影响索引。
构建失败保持旧索引；无效对象不会被静默跳过形成部分索引。
成功构建释放构建条目 staging 的元素引用，查询 staging 在下次查询或 release 时清除。

输出属于调用者，各次查询返回独立副本，后续调用/释放不使旧结果失效。
输出数组初始化为零，只消费每条区间的 written 前缀；ID 0 是合法 ID，不是空值标记。
UInt32 在 Wasm i32 边界的符号表示由 JS `>>> 0` 恢复，覆盖最大 ID 4294967295。
本原型没有调用者输出缓冲复用接口。

`release` 释放的是引用，不保证 WASM 线性内存收缩或 GC 立即回收。
不需要实例时还应丢弃 JS 包装器引用。初始化失败、内存耗尽和运行时 trap 不作为业务状态恢复。

## 状态草案

成功条目返回 `{ status, written, totalHits, visitedNodes, testedObjects }`，status 0 为 Complete、1 为 Truncated。
几何失败条目只返回 `{ error }`：10 非有限数、11 倒置边界、12 无效根、13 全零方向、14 无效射线区间。
错误项没有伪造的命中总数。范围预校验与核心批量接口一致，包括错误项的范围也参与校验。

整体调用失败抛 JS Error：原型状态 1 为构建几何失败、2 为构建失败、3 为无效协议参数、
4 为尚无索引、5 为输出越界、6 为区间重叠、7 为工作区不足。
JS 类型/结构错误抛 TypeError 或 RangeError。构建错误详情与批次出错位置目前未传输，
正式协议需要保留核心错误详情；这些数字仅用于原型，不是稳定版本协议。

底层标量导出是包装器内部协议，不应直接用于应用。直接调用时需遵循 begin/stage/execute 顺序；
report 非法位置/字段返回 -1，result_id 非法位置返回 0，不作为公开错误接口。
单实例同步顺序执行，不提供重入、共享内存或线程并发支持。

## 传输决策与限制

两后端使用同一套标量函数导出：逐对象/逐查询 staging，一次 execute 执行整批核心查询，
执行完成后读取结果字段和 ID。遍历过程中不回调 JS，不暴露 MoonBit 数组、节点或堆指针。
这种方式已验证双后端语义，但跨语言调用次数仍随对象、查询及写入数量增长，
不满足最终高效批量传输目标，不应据此宣称生产性能或零拷贝。

后续需分别验证线性内存与 wasm-gc 的大块传输方式，再确定导出名称、版本握手、
缓冲布局、复制成本和失效规则。正式适配还需错误详情、资源上限、浏览器端到端与资源测量。

2026-10-25 更新：已另行实现 [wasm 线性内存批量适配 v1](wasm-linear.md)，提供整块复制、
版本检查、错误详情和传输预算；此标量原型继续保留作双后端语义对照。
wasm-gc 块传输、浏览器端到端与资源测量仍待完成。

实现参考 [MoonBit FFI](https://docs.moonbitlang.com/en/latest/language/ffi.html)
及 [包配置](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html)，
使用 foreign_library 和 export_name；精确可用性以本机工具链编译与执行结果为依据。

## 复现与验收

```sh
moon build adapters/prototype --target wasm
moon build adapters/prototype --target wasm-gc
node adapters/prototype/integration.mjs
```

本机 Linux、MoonBit 0.1.20261020 / moonc v0.10.16+b1a0e846e、Node.js v22.23.1。
双后端集成测试通过：构建、AABB/射线批量、逐条错误、截断、零容量、空批次、空索引、
越界、重叠、最大 UInt32 ID、失败重建保留旧索引、输入快照、输出副本和重复释放。
确定性点盒数据与独立 JS AABB 扫描对照，并比较两后端报告与结果一致。

上述命令输出的未压缩 debug 模块体积仅用于识别本次构建，不是发布体积或性能基准。
本轮未验证浏览器/移动设备，未测量峰值内存、GC、复制耗时及端到端延迟。
仓库 prek 不包含 Node 集成测试，修改适配层后必须额外执行以上命令。
