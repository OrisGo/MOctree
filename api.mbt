///|
pub using @geom {type Vec3, type Aabb, type Cube, type Ray, type GeometryError}

///|
pub using @objects {
  type Entry,
  type StaticObjectIndex,
  type Workspace,
  type IndexStats,
  type QueryStats,
  type Completeness,
  type NodeInfo,
  type BuildError,
  type QueryError,
  scan_aabb,
  scan_ray_candidates,
}
