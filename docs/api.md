# API 使用说明

核心由 `OrisGo/octree/geom` 和 `OrisGo/octree/objects` 两个公开包组成。根包 `OrisGo/octree` 导出便捷入口，以下代码以根包别名 `@octree` 为例。

精确接口可查阅 [根包接口](../pkg.generated.mbti)、[几何接口](../geom/pkg.generated.mbti)和 [对象索引接口](../objects/pkg.generated.mbti)。这些文件由 `moon info` 生成，不手工编辑。

## 构建

以下操作可能抛出有类型的错误，应放在允许 `raise` 的函数中或使用 `try/catch` 处理。

```moonbit
let root = @octree.Cube::new(@octree.Vec3::origin(), 100.0)
let box = @octree.Aabb::new(
  @octree.Vec3::new(1.0, 2.0, 3.0),
  @octree.Vec3::new(4.0, 5.0, 6.0),
)
let index = @octree.StaticObjectIndex::build(
  [@octree.Entry::new(42U, box)],
  root~,
  max_objects=1000,
  max_nodes=4096,
)
```

默认最大深度 16、分裂阈值 16，可通过 `max_depth` 和 `split_threshold` 调整。节点预算停止细分会降低查询效率，但不会丢弃条目。

几何构造可抛出 GeometryError；构建可抛出 BuildError。Aabb/Cube/Ray 的字段是只读的，校验集中在构造阶段；Entry 只能引用合法 Aabb。

## 查询与缓冲

```moonbit
let ids = index.query_aabb(box)
let ray = @octree.Ray::new(
  @octree.Vec3::origin(),
  @octree.Vec3::new(1.0, 1.0, 1.0),
  t_min=0.0,
  t_max=10.0,
)
let candidates = index.query_ray_candidates(ray)
```

两种便捷查询分配结果缓冲与工作区。它们不排序，射线结果也不保证最近对象在前。

频繁查询使用调用者缓冲：

```moonbit
let workspace = index.workspace()
let output = FixedArray::make(64, 0U)
let report = index.query_aabb_into(
  box, output, workspace, offset=4, capacity=60,
)
// 有效结果为 output[4] 到 output[4 + report.written - 1]。
// report.total_hits 是全部命中数。
// report.completeness 区分 Complete 和 Truncated。
```

射线对应 `query_ray_candidates_into`，参数结构相同。即使容量不足仍继续计数。`capacity=0` 可只计数；扩容后重查，不支持续查游标。

非法输出区间与工作区不足返回 QueryError，写入前完成校验。几何输入已由其构造函数校验。

索引不保留 output/workspace；调用者可在完成一次操作后复用。同一工作区不能同时用于遍历和回调内查询。

## 纯 MoonBit 批量查询

```moonbit
let requests = [
  @octree.BatchQuery::new(Ok(box), offset=0, capacity=32),
  @octree.BatchQuery::new(Ok(box), offset=32, capacity=32),
]
let reports = index.query_aabb_batch_into(requests, output, workspace)
// reports[i] 为 Ok(QueryStats) 或 Err(GeometryError)。
```

射线使用 `query_ray_candidates_batch_into` 和 `BatchQuery[Ray]`。
每条请求显式指定 offset、capacity；返回报告数组顺序与输入相同。
构造几何时捕获的 `GeometryError` 可以包装为 Err 传入，该项不写输出，其他项继续执行。
结果不足仍计算准确 total_hits；不会借用其他请求的容量。

所有区间在查询前统一校验，包含 Err 请求的区间。越界、非空区间重叠或非空批次
工作区不足抛出 `BatchError`，输出不变。相邻区间和零容量区间合法；
空批次可使用容量为零的工作区。输出未写部分保持原值。
批次复用工作区，但分配区间排序临时数组和逐条报告数组；请求与缓冲均不被索引保留。
这两个入口是纯 MoonBit API。JavaScript/WASM 批量调用使用独立适配层；源码仓库中的 `docs/wasm-linear.md` 说明已实现的 wasm 线性内存协议，`docs/wasm-prototype.md` 说明后端语义对照原型。

## 只读遍历

`index.visit(workspace, visitor)` 按前序 DFS 遍历，回调收到 NodeInfo，返回 true 继续、false 停止。

NodeInfo 的 `object_count` 只表示直属对象，不是子树对象总数。用 `index.node_object_id(node_id, offset)` 读取直属对象 ID。父节点也可能有对象，不要只处理叶子。

节点 ID 对当前索引有效；root 的 ID 为 0，octant 为 -1。其他节点 octant 表示在父节点中的八分区编号。

## 暴力对照

`scan_aabb(entries, query)` 和 `scan_ray_candidates(entries, ray)` 对原始条目逐项扫描，分配并返回结果。它们不构建树、不校验 ID 唯一性，重复输入 ID 会原样保留；用于测试和很小的数据集。

树与暴力结果按集合比较，同时检查树结果没有重复。单独的几何解析测试用于避免“共享谓词出错但树与扫描仍一致”的盲区。

## 当前限制

- 核心仅提供静态 Double 对象索引，无动态更新、单精度类型或点云近邻。wasm 批量宿主接口由独立适配层提供，wasm-gc 块传输尚未完成。
- 仅有限且非负的射线参数区间；不做网格精确相交。
- 普通单归属树会在跨分割面对象较多时退化为扫描。
- 构建使用有界深度递归与临时分桶，最终存储采用节点数组和 DFS 连续条目数组；现有资源记录不等于完整活跃堆峰值测量。
- 元素容量统计不等于运行时字节数；没有零分配或移动设备容量承诺。
