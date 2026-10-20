///|
test "documented root facade example" {
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
  same_ids(index.query_aabb(box), [42U])
  let ray = @octree.Ray::new(
    @octree.Vec3::origin(),
    @octree.Vec3::new(1.0, 1.0, 1.0),
    t_min=0.0,
    t_max=10.0,
  )
  same_ids(index.query_ray_candidates(ray), [42U])
  let workspace = index.workspace()
  let output = FixedArray::make(64, 0U)
  let report = index.query_aabb_into(
    box,
    output,
    workspace,
    offset=4,
    capacity=60,
  )
  assert_eq(report.total_hits, 1)
  assert_eq(report.written, 1)
  assert_eq(output[4], 42U)
  assert_eq(report.completeness, @octree.Completeness::Complete)
}
