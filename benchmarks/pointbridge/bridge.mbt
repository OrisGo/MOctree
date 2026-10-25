///|
// Benchmark-only point-to-degenerate-AABB adapter, not a production point index.
priv struct State {
  mut tree : @objects.StaticObjectIndex?
  mut workspace : @objects.Workspace?
  mut points : FixedArray[Double]
}

///|
let state : State = { tree: None, workspace: None, points: [], }

///|
#export_name("point_build")
pub fn build(_mode : Int32, count : Int32) -> Int32 {
  let data = FixedArray::make(count * 3, 0.0)
  input(0, data, data.length())
  let entries = Array::makei(count, i => {
    let v = @geom.Vec3::new(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])
    @objects.Entry::new(i.reinterpret_as_uint(), try! @geom.Aabb::new(v, v))
  })
  let tree = @objects.StaticObjectIndex::build(
    entries,
    root=@geom.Cube::new(@geom.Vec3::origin(), 100.0),
    max_objects=count,
    max_nodes=count * 2 + 1,
  ) catch {
    _ => return 1
  }
  state.tree = Some(tree)
  state.workspace = Some(tree.workspace())
  state.points = data
  0
}

///|
#export_name("point_query")
pub fn query(count : Int32, capacity : Int32) -> Unit {
  let coordinates = FixedArray::make(count * 6, 0.0)
  input(0, coordinates, coordinates.length())
  let result = FixedArray::make(count * capacity * 3, 0.0)
  let report = FixedArray::make(count * 4, 0)
  let ids = FixedArray::make(capacity, 0U)
  let tree = state.tree.unwrap()
  for i in 0..<count {
    let p = i * 6
    let b = try! @geom.Aabb::new(
      @geom.Vec3::new(coordinates[p], coordinates[p + 1], coordinates[p + 2]),
      @geom.Vec3::new(
        coordinates[p + 3],
        coordinates[p + 4],
        coordinates[p + 5],
      ),
    )
    let stats = try! tree.query_aabb_into(b, ids, state.workspace.unwrap())
    report[i * 4] = stats.total_hits
    report[i * 4 + 1] = stats.written
    report[i * 4 + 2] = stats.visited_nodes
    report[i * 4 + 3] = stats.tested_objects
    for j in 0..<stats.written {
      let src = ids[j].reinterpret_as_int() * 3
      for k in 0..<3 {
        result[(i * capacity + j) * 3 + k] = state.points[src + k]
      }
    }
  }
  output(result, result.length())
  reports(report, report.length())
}

///|
#export_name("point_release")
pub fn release() -> Unit {
  state.tree = None
  state.workspace = None
  state.points = []
}
