///|
/// Linear oracle: allocates results, performs no tree pruning or ID validation.
/// Duplicate input IDs remain duplicated. Intended for verification and tiny inputs.
pub fn scan_aabb(input : ArrayView[Entry], query : @geom.Aabb) -> Array[UInt32] {
  let result : Array[UInt32] = []
  for entry in input {
    if query.intersects(entry.bounds) {
      result.push(entry.id)
    }
  }
  result
}

///|
pub fn scan_ray_candidates(
  input : ArrayView[Entry],
  query : @geom.Ray,
) -> Array[UInt32] {
  let result : Array[UInt32] = []
  for entry in input {
    if query.intersects(entry.bounds) {
      result.push(entry.id)
    }
  }
  result
}
