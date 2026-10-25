# wasm 线性内存批量适配 v1

日期：2026-10-25。状态：`adapters/linear` 已实现并在本机 Node.js 验证；
仅支持 `wasm` 目标。`wasm-gc` 继续使用实验原型作语义对照，M2 尚未整体验收。

## 使用

```js
import { createLinear, OctreeError } from './adapters/linear/client.mjs';

// wasmBytes 是匹配此包装器的 linear.wasm 的 BufferSource 或 WebAssembly.Module。
const index = await createLinear(wasmBytes, { maxTransferBytes: 64 * 1024 * 1024 });
index.build({
  ids: new Uint32Array([0, 4294967295]),
  bounds: new Float64Array([0,0,0,0,0,0, 1,1,1,2,2,2]),
  root: new Float64Array([0,0,0,10]),
  maxObjects: 2,
  maxNodes: 64,
});
const { ids, reports } = index.query(
  'aabb',
  new Float64Array([-10,-10,-10,10,10,10]),
  new Int32Array([0,2]),
  2,
);
// 只消费 ids 的 [offset, offset + reports[i].written) 区间。
index.release();
```

应用入口为 JS 包装器，不直接操作模块内存或底层导出。一个包装器拥有独立的模块实例、
索引和复用工作区。创建实例是异步操作，`build`、`query`、`release` 是同步操作。
目标宿主须支持 WebAssembly 和小端 TypedArray；大端 JS 宿主明确拒绝。

| 方法 | 输入与行为 |
|---|---|
| `build({ ids, bounds, root, maxObjects, maxNodes })` | IDs 为 Uint32Array；bounds 为 Float64Array，每对象 minXYZ、maxXYZ 六个 Double；root 为中心 XYZ、半边长四个 Double。复制输入并批量构建 |
| `query('aabb', coordinates, ranges, outputCapacity)` | 每条六坐标；ranges 为 Int32Array，每条 offset、capacity；outputCapacity 为输出 ID 数量 |
| `query('ray', coordinates, ranges, outputCapacity)` | 每条 originXYZ、directionXYZ、t_min、t_max 八坐标；其他规则同上 |
| `release()` | 清除索引和工作区引用，包装器丢弃模块引用；以后拒绝构建/查询，重复释放合法 |

数组必须为同一 JS realm 中、固定长度、非共享且未 detached 的相应 TypedArray。
允许带 byteOffset 的子视图；只复制视图覆盖的元素。拒绝可调整大小的 ArrayBuffer。
预算和计数要求非负整数；`maxNodes = 0` 由构建错误报告。
树的分裂阈值和最大深度沿用核心默认值（16、16）。

## 结果、错误和生命周期

几何、根外对象、单归属、范围预校验和完整性均遵循 [核心契约](contracts.md)。
JS 不重复实现几何谓词。返回 `{ ids: Uint32Array, reports: Array }`：

- 成功条目为 `{ status, written, totalHits, visitedNodes, testedObjects }`，status 0 为 Complete，1 为 Truncated。
- 几何错误条目为 `{ error: { code, status, domain? } }`，不提供虚构的命中数量；NonFinite 的 domain 为 `aabb` 或 `ray`。
- 错误项也参与输出区间预校验。区间相邻合法，非空区间重叠整体失败，零容量不占空间。
- 输出数组长度等于 outputCapacity，空隙和未写入位置初始化为 0。ID 0 合法；有效性由 written 决定。
- 保留准确 totalHits；零容量可计数；恰好填满且没有遗漏时仍为 Complete。

整体业务错误抛 `OctreeError`，具有字符串 `code`、数值 `status`、对象 `details` 和 message。
JS 类型和结构检查失败抛 TypeError / RangeError；版本不匹配抛 Error。
几何构造或构建业务失败保留旧索引，批次错误不发布输出。

| status / code | details / message |
|---|---|
| 3 InvalidProtocol | 底层参数错误，message 给出原因；正常包装器调用会提前检查 |
| 4 IndexNotBuilt | 尚未成功构建 |
| 10 NonFinite、11 InvertedBounds、12 InvalidRoot、13 ZeroDirection、14 InvalidInterval | 构建错误给出 source 为 root，或 source 为 object 并携带 position、UInt32 id；NonFinite 还包含 domain |
| 20 InvalidConfig | details.field 和 message 保留核心配置字段名 |
| 21 ObjectCapacityExceeded | limit、actual |
| 22 DuplicateId、23 OutsideRoot | position、UInt32 id |
| 30 InvalidOutputRange | position |
| 31 OverlappingOutputRanges | first、second |
| 32 InsufficientWorkspace | required、available；当前包装器自动创建足够工作区，正常调用不可触发 |

输入在同步调用期间复制，调用返回后修改输入不影响索引。模块不持有宿主输入引用。
传输数组、请求和报告都是调用内临时数据，不留在模块全局状态中。
每次查询返回独立结果副本；后续查询、重建或释放不使旧结果失效。
同实例不允许重入；包装器会拒绝在参数 getter 等回调中重入构建、查询或释放。

运行时 trap、复制回调异常和内存耗尽不视为可恢复业务错误。包装器在底层调用抛异常后
禁止继续构建/查询，应释放包装器并创建新实例。`release` 不保证线性内存收缩或宿主立即 GC。

## 传输预算与复制成本

`maxTransferBytes` 默认为 64 MiB，可配置为 0–2147483647 的整数；调用前检查：

- 构建：`32 + N × 52` 字节（root、IDs、六坐标）。
- AABB 查询：`B × 76 + C × 4` 字节。
- 射线查询：`B × 92 + C × 4` 字节。

N 为对象数，B 为查询数，C 为 outputCapacity。查询预算包含输入坐标、区间、
每条五个 Int32 的报告以及完整输出容量。单个数组的字节数也必须能用非负 Int32 表示，
所有乘法在分配前作上限检查。超预算直接报错，不丢弃、裁剪或分段截断请求。

这些是逻辑传输字节，不是实际内存上限。实际内存还包含 JS 输入、MoonBit 传输副本、
构建条目与分桶、索引、工作区、查询请求、区间排序临时数组、核心报告、打包报告、
JS 输出副本及运行时开销；重建时新旧索引可能同时存活。查询复用工作区，
但每次仍分配传输/结果数组，不承诺零分配或零拷贝。
输出按全部容量复制，包括未写入空间；调用者应按需求选择容量。

## 内部传输协议与工具链边界

版本 1 导出 `octree_abi_version() -> i32`、`octree_build(count, maxObjects, maxNodes) -> i32`、
`octree_query(kind, count, capacity) -> i32`、`octree_release()` 和 `memory`。
包装器在首次业务调用前检查版本及导出；这些导出供匹配的包装器使用。
模块字节须为可信构建产物，版本检查不验证任意不可信 Wasm 的行为。

业务导出返回 0 表示成功，其他状态在返回前通过 `octree_v1.failure` 给出详情。
kind 0 为 AABB，1 为 ray。数组是小端连续数值载荷，length 单位为元素：

| 导入 | 用途 |
|---|---|
| `input_f64(slot, pointer, length)` | 构建 slot 0 为 root，2 为 bounds；查询 slot 0 为 coordinates |
| `input_u32(slot, pointer, length)` | 构建 slot 1 为 IDs |
| `input_i32(slot, pointer, length)` | 查询 slot 1 为 offset/capacity 对 |
| `output_i32(pointer, length)` | 按请求顺序排列，每条 status、written、totalHits、visitedNodes、testedObjects 五个 Int32；几何错误只有 status 有意义，其余为 0 |
| `output_u32(pointer, length)` | 完整的 ID 输出缓冲 |
| `failure(code, a, b, messagePointer, messageByteLength)` | a/b 对应位置、ID 位模式或预算等字段；message 为 UTF-8，配置字段名或 NonFinite domain 等 |

failure 的 a/b：几何错误为 position/id（root 使用 -1/0）；容量错误为 limit/actual；
重复 ID 和根外为 position/id；范围错误为 position/0；重叠为 first/second；
工作区为 required/available；其他状态为 0/0。

每次成功构建为一次 JS→Wasm 调用和三次输入回调；成功查询为一次 JS→Wasm 调用、
两次输入及两次输出回调，与对象/查询/命中数量无关。空数组仍走相同回调。
回调仅整块复制，查询遍历中不调用宿主，也没有逐命中回调。

配置使用 MoonBit 的 `export-memory-name`。借用 FFI 使用 `#borrow`，
并显式使用 `#unsafe_skip_stub_check`，模式参考本机 core/env 的 wasm `random_get`。
数字数组载荷指针是**适配层对已验证编译器的依赖**，不是 MoonBit 保证稳定的通用数组 ABI；
JS 不读取对象头、引用计数或索引内部结构。
升级编译器时须重新执行 debug/release 集成测试，模块与包装器成对交付。
参考 [官方包配置](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html)
和 [FFI 文档](https://docs.moonbitlang.com/en/latest/language/ffi.html)。

指针只在同步借用回调中有效，回调不得保留指针/视图、异步处理或重入 Wasm。
每次回调从当前 `memory.buffer` 创建视图，处理 MoonBit 分配导致的 memory.grow；
输出在回调返回前复制为独立 JS 数组。包装器不向应用暴露 memory 或 Wasm exports。
该路径不能直接用于 wasm-gc；两后端不同传输方式不改变核心查询语义。

## 复现与验收

```sh
moon build adapters/linear --target wasm
moon build adapters/prototype --target wasm
moon build adapters/prototype --target wasm-gc
node adapters/linear/integration.mjs

moon build adapters/linear --target wasm --release
moon build adapters/prototype --target wasm --release
moon build adapters/prototype --target wasm-gc --release
node adapters/linear/integration.mjs release
```

2026-10-25 本机 Linux x86_64（7.2.11-200.fc44）、moon/moonrun 0.1.20261020 (2284bd2)、
moonc v0.10.16+b1a0e846e、Node.js v22.23.1、prek 0.4.14：

- debug/release 集成测试通过：错误详情、最大 ID、输入子视图/快照、输出副本、
  精确填满/截断/计数、空输入/批次、非法区间/重叠、失败重建、实例隔离、重复释放、
  类型和传输预算、共享/可调整/已分离缓冲拒绝、重入拒绝和错误模块拒绝。
- 随机、聚簇、平面、细长、巨大跨节点、全重叠、重复位置、点盒八类分布，
  每类 128 个对象 × 3 档节点预算 × 24 条 AABB/24 条射线 × 3 档输出容量；
  与独立 JS 谓词扫描比较命中，与 wasm/wasm-gc 原型比较完整输出及统计。
- 插桩测试 1 千、1 万、10 万对象及缩回 1 个对象，验证实际 memory.grow 后数据正确、
  传输调用次数恒定；另用公开包装器验证 10 万对象构建/输出及随后重建的结果生命周期。
- `moon check` 和 `moon test` 的 wasm、wasm-gc 均通过，各 27 项核心测试。
- `moon fmt`、`moon info --target wasm` 完成并复核生成接口；暂存后的 `prek run`、
  `git diff --cached --check` 通过，JS 语法和本地文档链接目标检查通过。

未测量端到端延迟、峰值/稳态内存、GC 或吞吐；不由调用次数推断实际提速。
未验证浏览器、移动设备、大端宿主或 wasm-gc 块传输，不将本轮视为 M2 全部完成。
Node 集成测试尚不在 prek hooks 内，适配层变更必须额外执行上述两组命令。
