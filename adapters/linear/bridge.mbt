///|
priv struct State {
  mut index : @objects.StaticObjectIndex?
  mut workspace : @objects.Workspace?
}

///|
let state : State = { index: None, workspace: None, }

///|
#export_name("octree_abi_version")
pub fn abi_version() -> Int32 {
  1
}

///|
// Each individual transport allocation is limited to signed Int32 bytes.
#export_name("octree_build")
pub fn build(count : Int32, max_objects : Int32, max_nodes : Int32) -> Int32 {
  guard count >= 0 && count <= 2147483647 / 48 else {
    return fail(3, 0, 0, "invalid object count")
  }
  let root_data = FixedArray::make(4, 0.0)
  input_f64(0, root_data, 4)
  let root = @geom.Cube::new(vec(root_data, 0), root_data[3]) catch {
    e => return fail(geometry_code(e), -1, 0, geometry_message(e))
  }
  // Reject capacities before allocating object transport buffers.
  guard max_objects >= 0 else { return fail(20, 0, 0, "max_objects") }
  guard max_nodes >= 1 else { return fail(20, 0, 0, "max_nodes") }
  guard count <= max_objects else { return fail(21, max_objects, count, "") }
  let ids = FixedArray::make(count, 0U)
  let bounds = FixedArray::make(count * 6, 0.0)
  input_u32(1, ids, count)
  input_f64(2, bounds, count * 6)
  let entries : Array[@objects.Entry] = []
  for i = 0; i < count; i = i + 1 {
    let box = @geom.Aabb::new(vec(bounds, i * 6), vec(bounds, i * 6 + 3)) catch {
      e =>
        return fail(
          geometry_code(e),
          i,
          ids[i].reinterpret_as_int(),
          geometry_message(e),
        )
    }
    entries.push(@objects.Entry::new(ids[i], box))
  }
  try {
    let index = @objects.StaticObjectIndex::build(
      entries,
      root~,
      max_objects~,
      max_nodes~,
    )
    let workspace = index.workspace()
    state.index = Some(index)
    state.workspace = Some(workspace)
    0
  } catch {
    @objects.BuildError::InvalidConfig(message) => fail(20, 0, 0, message)
    @objects.BuildError::ObjectCapacityExceeded(limit~, actual~) =>
      fail(21, limit, actual, "")
    @objects.BuildError::DuplicateId(position~, id~) =>
      fail(22, position, id.reinterpret_as_int(), "")
    @objects.BuildError::OutsideRoot(position~, id~) =>
      fail(23, position, id.reinterpret_as_int(), "")
  }
}

///|
#export_name("octree_query")
pub fn query(kind : Int32, count : Int32, capacity : Int32) -> Int32 {
  guard kind == 0 || kind == 1 else {
    return fail(3, 0, 0, "invalid query kind")
  }
  let stride = if kind == 0 { 6 } else { 8 }
  guard count >= 0 &&
    count <= 2147483647 / (stride * 8) &&
    capacity >= 0 &&
    capacity <= 2147483647 / 4 else {
    return fail(3, 0, 0, "invalid query or output count")
  }
  guard state.index is Some(index) else {
    return fail(4, 0, 0, "index not built")
  }
  guard state.workspace is Some(workspace) else {
    return fail(4, 0, 0, "index not built")
  }
  let coordinates = FixedArray::make(count * stride, 0.0)
  let ranges = FixedArray::make(count * 2, 0)
  input_f64(0, coordinates, count * stride)
  input_i32(1, ranges, count * 2)
  let output = FixedArray::make(capacity, 0U)
  try {
    let reports = if kind == 0 {
      let requests : Array[@objects.BatchQuery[@geom.Aabb]] = []
      for i = 0; i < count; i = i + 1 {
        let geometry = try
          @geom.Aabb::new(vec(coordinates, i * 6), vec(coordinates, i * 6 + 3))
        catch {
          e => Err(e)
        } noraise {
          box => Ok(box)
        }
        requests.push(
          @objects.BatchQuery::new(
            geometry,
            offset=ranges[i * 2],
            capacity=ranges[i * 2 + 1],
          ),
        )
      }
      index.query_aabb_batch_into(requests, output, workspace)
    } else {
      let requests : Array[@objects.BatchQuery[@geom.Ray]] = []
      for i = 0; i < count; i = i + 1 {
        let geometry = try
          @geom.Ray::new(
            vec(coordinates, i * 8),
            vec(coordinates, i * 8 + 3),
            t_min=coordinates[i * 8 + 6],
            t_max=coordinates[i * 8 + 7],
          )
        catch {
          e => Err(e)
        } noraise {
          ray => Ok(ray)
        }
        requests.push(
          @objects.BatchQuery::new(
            geometry,
            offset=ranges[i * 2],
            capacity=ranges[i * 2 + 1],
          ),
        )
      }
      index.query_ray_candidates_batch_into(requests, output, workspace)
    }
    let packed = FixedArray::make(count * 5, 0)
    for i = 0; i < count; i = i + 1 {
      match reports[i] {
        Err(e) => packed[i * 5] = geometry_code(e)
        Ok(r) => {
          packed[i * 5] = if r.completeness == @objects.Completeness::Complete {
            0
          } else {
            1
          }
          packed[i * 5 + 1] = r.written
          packed[i * 5 + 2] = r.total_hits
          packed[i * 5 + 3] = r.visited_nodes
          packed[i * 5 + 4] = r.tested_objects
        }
      }
    }
    output_i32(packed, packed.length())
    output_u32(output, capacity)
    0
  } catch {
    @objects.BatchError::InvalidOutputRange(position~) =>
      fail(30, position, 0, "")
    @objects.BatchError::OverlappingOutputRanges(first~, second~) =>
      fail(31, first, second, "")
    @objects.BatchError::InsufficientWorkspace(required~, available~) =>
      fail(32, required, available, "")
  }
}

///|
#export_name("octree_release")
pub fn release() -> Unit {
  state.index = None
  state.workspace = None
}
