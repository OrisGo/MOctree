///|
priv enum Region {
  Box(@geom.Aabb)
  Ray(@geom.Ray)
}

///|
fn Region::intersects(self : Region, bounds : @geom.Aabb) -> Bool {
  match self {
    Box(b) => b.intersects(bounds)
    Ray(ray) => ray.intersects(bounds)
  }
}

///|
fn validate_output(
  output : FixedArray[UInt32],
  offset : Int32,
  capacity : Int32?,
) -> Int32 raise QueryError {
  guard offset >= 0 && offset <= output.length() else {
    raise InvalidOutputRange
  }
  let length = capacity.unwrap_or(output.length() - offset)
  guard length >= 0 && length <= output.length() - offset else {
    raise InvalidOutputRange
  }
  length
}

///|
fn StaticObjectIndex::run_query(
  self : StaticObjectIndex,
  region : Region,
  output : FixedArray[UInt32],
  workspace : Workspace,
  offset : Int32,
  capacity : Int32?,
) -> QueryStats raise QueryError {
  let capacity = validate_output(output, offset, capacity)
  guard workspace.capacity() >= self.summary.workspace_required else {
    raise InsufficientWorkspace(
      required=self.summary.workspace_required,
      available=workspace.capacity(),
    )
  }
  let mut top = 1
  workspace.stack[0] = 0
  let mut visited = 0
  let mut tested = 0
  let mut hits = 0
  let mut written = 0
  while top > 0 {
    top -= 1
    let node = self.nodes[workspace.stack[top]]
    visited += 1
    let contained = match region {
      Box(query) => query.contains(node.bounds)
      Ray(_) => false
    }
    if contained {
      hits += node.subtree_count
      let available = capacity - written
      let count = if available < node.subtree_count {
        available
      } else {
        node.subtree_count
      }
      for i in node.start..<(node.start + count) {
        output[offset + written] = self.entries[self.order[i]].id
        written += 1
      }
      // Descendants need neither node pruning nor object intersection tests.
    } else if region.intersects(node.bounds) {
      for i in node.start..<(node.start + node.count) {
        let entry = self.entries[self.order[i]]
        tested += 1
        if region.intersects(entry.bounds) {
          hits += 1
          if written < capacity {
            output[offset + written] = entry.id
            written += 1
          }
        }
      }
      // Reverse push yields ascending child order during DFS.
      for i = node.child_count - 1; i >= 0; i = i - 1 {
        workspace.stack[top] = node.first_child + i
        top += 1
      }
    }
  }
  {
    written,
    total_hits: hits,
    completeness: if written == hits {
      Complete
    } else {
      Truncated
    },
    visited_nodes: visited,
    tested_objects: tested,
  }
}

///|
/// Writes only the valid prefix of the selected output range; always counts all hits.
pub fn StaticObjectIndex::query_aabb_into(
  self : StaticObjectIndex,
  query : @geom.Aabb,
  output : FixedArray[UInt32],
  workspace : Workspace,
  offset~ : Int32 = 0,
  capacity? : Int32,
) -> QueryStats raise QueryError {
  self.run_query(Box(query), output, workspace, offset, capacity)
}

///|
pub fn StaticObjectIndex::query_ray_candidates_into(
  self : StaticObjectIndex,
  query : @geom.Ray,
  output : FixedArray[UInt32],
  workspace : Workspace,
  offset~ : Int32 = 0,
  capacity? : Int32,
) -> QueryStats raise QueryError {
  self.run_query(Ray(query), output, workspace, offset, capacity)
}

///|
/// Allocating convenience query. Result order is unspecified.
pub fn StaticObjectIndex::query_aabb(
  self : StaticObjectIndex,
  query : @geom.Aabb,
) -> Array[UInt32] {
  let buffer = FixedArray::make(self.entries.length(), 0U)
  let stats = try! self.query_aabb_into(query, buffer, self.workspace())
  Array::makei(stats.written, i => buffer[i])
}

///|
/// Allocating convenience query; IDs are not sorted by distance.
pub fn StaticObjectIndex::query_ray_candidates(
  self : StaticObjectIndex,
  query : @geom.Ray,
) -> Array[UInt32] {
  let buffer = FixedArray::make(self.entries.length(), 0U)
  let stats = try! self.query_ray_candidates_into(
    query,
    buffer,
    self.workspace(),
  )
  Array::makei(stats.written, i => buffer[i])
}
