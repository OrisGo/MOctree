///|
// Common finite in-root point workload only. No production error/ID contract.
priv struct State {
  mut ordinary : @oct.OctreeNode?
  mut loose : @loose.LooseOctNode?
}

///|
let state : State = { ordinary: None, loose: None, }

///|
#export_name("point_build")
pub fn build(mode : Int32, count : Int32) -> Int32 {
  let data = FixedArray::make(count * 3, 0.0)
  input(0, data, data.length())
  state.ordinary = None
  state.loose = None
  if mode == 0 {
    let tree = @oct.octree_new(0.0, 0.0, 0.0, 200.0, 16, 16)
    for i in 0..<count {
      @oct.octree_insert(
        tree,
        @point.Point3D::new(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]),
      )
    }
    state.ordinary = Some(tree)
  } else {
    let tree = @loose.loose_octree_new(0.0, 0.0, 0.0, 200.0, 2.0, 16)
    for i in 0..<count {
      @loose.loose_octree_insert(
        tree,
        @point.Point3D::new(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]),
      )
    }
    state.loose = Some(tree)
  }
  0
}

///|
#export_name("point_query")
pub fn query(count : Int32, capacity : Int32) -> Unit {
  let coordinates = FixedArray::make(count * 6, 0.0)
  input(0, coordinates, coordinates.length())
  let result = FixedArray::make(count * capacity * 3, 0.0)
  let report = FixedArray::make(count * 4, 0)
  for i in 0..<count {
    let p = i * 6
    let hits = match state.ordinary {
      Some(tree) =>
        @oct.octree_range_query(
          tree,
          coordinates[p],
          coordinates[p + 1],
          coordinates[p + 2],
          coordinates[p + 3],
          coordinates[p + 4],
          coordinates[p + 5],
        )
      None =>
        @loose.loose_octree_query(
          state.loose.unwrap(),
          coordinates[p],
          coordinates[p + 1],
          coordinates[p + 2],
          coordinates[p + 3],
          coordinates[p + 4],
          coordinates[p + 5],
        )
    }
    let written = if hits.length() < capacity {
      hits.length()
    } else {
      capacity
    }
    report[i * 4] = hits.length()
    report[i * 4 + 1] = written
    report[i * 4 + 2] = -1
    report[i * 4 + 3] = -1
    for j in 0..<written {
      let dest = (i * capacity + j) * 3
      result[dest] = hits[j].x
      result[dest + 1] = hits[j].y
      result[dest + 2] = hits[j].z
    }
  }
  output(result, result.length())
  reports(report, report.length())
}

///|
#export_name("point_release")
pub fn release() -> Unit {
  state.ordinary = None
  state.loose = None
}
