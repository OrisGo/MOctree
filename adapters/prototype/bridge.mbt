///|
priv struct State {
  mut index : @objects.StaticObjectIndex?
  mut workspace : @objects.Workspace?
  mut entries : Array[@objects.Entry]
  mut invalid_input : Bool
  mut boxes : Array[@objects.BatchQuery[@geom.Aabb]]
  mut rays : Array[@objects.BatchQuery[@geom.Ray]]
  mut output : FixedArray[UInt32]
  mut reports : Array[Result[@objects.QueryStats, @geom.GeometryError]]
}

///|
let state : State = {
  index: None,
  workspace: None,
  entries: [],
  invalid_input: false,
  boxes: [],
  rays: [],
  output: FixedArray::make(0, 0U),
  reports: [],
}

///|
#export_name("begin_objects")
pub fn begin_objects() -> Unit {
  state.entries.clear()
  state.invalid_input = false
}

///|
#export_name("add_object")
pub fn add_object(
  id : UInt32,
  x : Double,
  y : Double,
  z : Double,
  xx : Double,
  yy : Double,
  zz : Double,
) -> Int32 {
  try {
    let b = @geom.Aabb::new(
      @geom.Vec3::new(x, y, z),
      @geom.Vec3::new(xx, yy, zz),
    )
    state.entries.push(@objects.Entry::new(id, b))
    0
  } catch {
    _ => {
      state.invalid_input = true
      1
    }
  }
}

///|
#export_name("build_index")
pub fn build_index(
  x : Double,
  y : Double,
  z : Double,
  half : Double,
  max_objects : Int32,
  max_nodes : Int32,
) -> Int32 {
  guard !state.invalid_input else { return 1 }
  let root = @geom.Cube::new(@geom.Vec3::new(x, y, z), half) catch {
    _ => return 1
  }
  try {
    let index = @objects.StaticObjectIndex::build(
      state.entries,
      root~,
      max_objects~,
      max_nodes~,
    )
    let workspace = index.workspace()
    state.index = Some(index)
    state.workspace = Some(workspace)
    state.entries.clear()
    state.reports.clear()
    state.output = FixedArray::make(0, 0U)
    0
  } catch {
    _ => 2
  }
}

///|
#export_name("begin_queries")
pub fn begin_queries(capacity : Int32) -> Int32 {
  guard capacity >= 0 else { return 3 }
  state.boxes.clear()
  state.rays.clear()
  state.reports.clear()
  state.output = FixedArray::make(capacity, 0U)
  0
}

///|
#export_name("add_aabb")
pub fn add_aabb(
  x : Double,
  y : Double,
  z : Double,
  xx : Double,
  yy : Double,
  zz : Double,
  offset : Int32,
  capacity : Int32,
) -> Unit {
  let query = try
    @geom.Aabb::new(@geom.Vec3::new(x, y, z), @geom.Vec3::new(xx, yy, zz))
  catch {
    e => Err(e)
  } noraise {
    b => Ok(b)
  }
  state.boxes.push(@objects.BatchQuery::new(query, offset~, capacity~))
}

///|
#export_name("add_ray")
pub fn add_ray(
  x : Double,
  y : Double,
  z : Double,
  dx : Double,
  dy : Double,
  dz : Double,
  lo : Double,
  hi : Double,
  offset : Int32,
  capacity : Int32,
) -> Unit {
  let query = try
    @geom.Ray::new(
      @geom.Vec3::new(x, y, z),
      @geom.Vec3::new(dx, dy, dz),
      t_min=lo,
      t_max=hi,
    )
  catch {
    e => Err(e)
  } noraise {
    r => Ok(r)
  }
  state.rays.push(@objects.BatchQuery::new(query, offset~, capacity~))
}

///|
#export_name("execute")
pub fn execute(kind : Int32) -> Int32 {
  state.reports.clear()
  guard state.index is Some(index) else { return 4 }
  guard state.workspace is Some(workspace) else { return 4 }
  guard kind == 0 || kind == 1 else { return 3 }
  try {
    state.reports = if kind == 0 {
      index.query_aabb_batch_into(state.boxes, state.output, workspace)
    } else {
      index.query_ray_candidates_batch_into(state.rays, state.output, workspace)
    }
    0
  } catch {
    @objects.BatchError::InvalidOutputRange(..) => 5
    @objects.BatchError::OverlappingOutputRanges(..) => 6
    @objects.BatchError::InsufficientWorkspace(..) => 7
  }
}

///|
#export_name("report")
pub fn report(i : Int32, field : Int32) -> Int32 {
  guard i >= 0 && i < state.reports.length() else { return -1 }
  match state.reports[i] {
    Err(e) =>
      if field != 0 {
        -1
      } else {
        match e {
          @geom.GeometryError::NonFinite(_) => 10
          @geom.GeometryError::InvertedBounds => 11
          @geom.GeometryError::InvalidRoot => 12
          @geom.GeometryError::ZeroDirection => 13
          @geom.GeometryError::InvalidInterval => 14
        }
      }
    Ok(r) =>
      match field {
        0 =>
          if r.completeness == @objects.Completeness::Complete {
            0
          } else {
            1
          }
        1 => r.written
        2 => r.total_hits
        3 => r.visited_nodes
        4 => r.tested_objects
        _ => -1
      }
  }
}

///|
#export_name("result_id")
pub fn result_id(i : Int32) -> UInt32 {
  if i >= 0 && i < state.output.length() {
    state.output[i]
  } else {
    0U
  }
}

///|
#export_name("release")
pub fn release() -> Unit {
  state.index = None
  state.workspace = None
  state.entries = []
  state.boxes = []
  state.rays = []
  state.reports = []
  state.output = FixedArray::make(0, 0U)
}
