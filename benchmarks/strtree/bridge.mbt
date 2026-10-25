///|
// Benchmark-only bridge for validated, finite AABB workloads. This is NOT a
// production implementation of MOctree's error/budget contract. Reusing the
// transport shape keeps host copies and report decoding identical.
priv struct State {
  mut index : @strtree.StrTree3D?
  mut ids : FixedArray[UInt32]
}

///|
let state : State = { index: None, ids: [], }

///|
#export_name("octree_abi_version")
pub fn abi_version() -> Int32 {
  1
}

///|
fn box(data : FixedArray[Double], p : Int32) -> @strtree.Box3D {
  @strtree.Box3D::new(
    data[p],
    data[p + 1],
    data[p + 2],
    data[p + 3],
    data[p + 4],
    data[p + 5],
  )
}

///|
#export_name("octree_build")
pub fn build(count : Int32, _max_objects : Int32, _max_nodes : Int32) -> Int32 {
  let root = FixedArray::make(4, 0.0)
  input_f64(0, root, 4)
  let ids = FixedArray::make(count, 0U)
  let bounds = FixedArray::make(count * 6, 0.0)
  input_u32(1, ids, count)
  input_f64(2, bounds, count * 6)
  // STR IDs are nonnegative Int. Index by ordinal and map back to the exact
  // external UInt32 ID, including 0xffffffff; never change the test dataset.
  let items = Array::makei(count, i => (box(bounds, i * 6), i))
  state.index = Some(@strtree.StrTree3D::build(items, node_capacity=16))
  state.ids = ids
  0
}

///|
#export_name("octree_query")
pub fn query(kind : Int32, count : Int32, capacity : Int32) -> Int32 {
  guard kind == 0 else { abort("STR benchmark supports AABB only") }
  guard state.index is Some(index) else { abort("build first") }
  let coordinates = FixedArray::make(count * 6, 0.0)
  let ranges = FixedArray::make(count * 2, 0)
  input_f64(0, coordinates, count * 6)
  input_i32(1, ranges, count * 2)
  let output = FixedArray::make(capacity, 0U)
  let reports = FixedArray::make(count * 5, 0)
  for i in 0..<count {
    let q = box(coordinates, i * 6)
    let offset = ranges[i * 2]
    let limit = ranges[i * 2 + 1]
    let (total, written) = if limit == 0 {
      (index.query_count(q), 0)
    } else {
      let hits = index.query(q)
      let n = if hits.length() < limit { hits.length() } else { limit }
      for j in 0..<n {
        output[offset + j] = state.ids[hits[j]]
      }
      (hits.length(), n)
    }
    reports[i * 5] = if total > written { 1 } else { 0 }
    reports[i * 5 + 1] = written
    reports[i * 5 + 2] = total
    // No public traversal counters. Host converts these sentinels to null.
    reports[i * 5 + 3] = -1
    reports[i * 5 + 4] = -1
  }
  output_u32(output, capacity)
  output_i32(reports, count * 5)
  0
}

///|
#export_name("octree_release")
pub fn release() -> Unit {
  state.index = None
  state.ids = []
}
