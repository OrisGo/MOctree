///|
/// A query or its geometry validation error, with an explicit output interval.
pub struct BatchQuery[T] {
  query : Result[T, @geom.GeometryError]
  offset : Int32
  capacity : Int32
}

///|
pub fn[T] BatchQuery::new(
  query : Result[T, @geom.GeometryError],
  offset~ : Int32,
  capacity~ : Int32,
) -> BatchQuery[T] {
  { query, offset, capacity, }
}

///|
pub(all) suberror BatchError {
  InvalidOutputRange(position~ : Int32)
  OverlappingOutputRanges(first~ : Int32, second~ : Int32)
  InsufficientWorkspace(required~ : Int32, available~ : Int32)
} derive(Debug, Eq)

///|
pub extend BatchError with @debug.Debug::{to_repr}

///|
pub extend BatchError with Eq::{equal, not_equal}

///|
fn[T] StaticObjectIndex::run_batch(
  self : StaticObjectIndex,
  queries : ArrayView[BatchQuery[T]],
  output : FixedArray[UInt32],
  workspace : Workspace,
  region : (T) -> Region,
) -> Array[Result[QueryStats, @geom.GeometryError]] raise BatchError {
  let intervals : Array[(Int32, Int32, Int32)] = []
  for i in 0..<queries.length() {
    let q = queries[i]
    guard q.offset >= 0 &&
      q.offset <= output.length() &&
      q.capacity >= 0 &&
      q.capacity <= output.length() - q.offset else {
      raise InvalidOutputRange(position=i)
    }
    if q.capacity > 0 {
      intervals.push((q.offset, q.offset + q.capacity, i))
    }
  }
  intervals.sort_by(fn(a, b) { a.0.compare(b.0) })
  for i in 1..<intervals.length() {
    let previous = intervals[i - 1]
    let current = intervals[i]
    guard previous.1 <= current.0 else {
      raise OverlappingOutputRanges(first=previous.2, second=current.2)
    }
  }
  // An empty batch needs no traversal memory.
  guard queries.is_empty() ||
    workspace.capacity() >= self.summary.workspace_required else {
    raise InsufficientWorkspace(
      required=self.summary.workspace_required,
      available=workspace.capacity(),
    )
  }
  let reports = []
  for q in queries {
    match q.query {
      Err(error) => reports.push(Err(error))
      Ok(query) => {
        // All range and workspace checks have already succeeded for the batch.
        let report = try! self.run_query(
          region(query),
          output,
          workspace,
          q.offset,
          Some(q.capacity),
        )
        reports.push(Ok(report))
      }
    }
  }
  reports
}

///|
/// Validates every output interval before writing; reports follow input order.
pub fn StaticObjectIndex::query_aabb_batch_into(
  self : StaticObjectIndex,
  queries : ArrayView[BatchQuery[@geom.Aabb]],
  output : FixedArray[UInt32],
  workspace : Workspace,
) -> Array[Result[QueryStats, @geom.GeometryError]] raise BatchError {
  self.run_batch(queries, output, workspace, b => Box(b))
}

///|
pub fn StaticObjectIndex::query_ray_candidates_batch_into(
  self : StaticObjectIndex,
  queries : ArrayView[BatchQuery[@geom.Ray]],
  output : FixedArray[UInt32],
  workspace : Workspace,
) -> Array[Result[QueryStats, @geom.GeometryError]] raise BatchError {
  self.run_batch(queries, output, workspace, ray => Ray(ray))
}
