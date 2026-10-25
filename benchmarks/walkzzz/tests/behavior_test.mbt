///|
// Observations of the pinned upstream version, not desired production semantics.
test "pinned upstream accepts an outside point but prunes its query" {
  let p = @point.Point3D::new(500.0, 0.0, 0.0)
  let tree = @oct.octree_new(0.0, 0.0, 0.0, 200.0, 16, 16)
  @oct.octree_insert(tree, p)
  assert_eq(@oct.octree_size(tree), 1)
  assert_eq(
    @oct.octree_range_query(tree, 499.0, -1.0, -1.0, 501.0, 1.0, 1.0).length(),
    0,
  )
  let loose = @loose.loose_octree_new(0.0, 0.0, 0.0, 200.0, 2.0, 16)
  @loose.loose_octree_insert(loose, p)
  assert_eq(@loose.loose_octree_count(loose), 1)
  assert_eq(
    @loose.loose_octree_query(loose, 499.0, -1.0, -1.0, 501.0, 1.0, 1.0).length(),
    0,
  )
}

///|
test "pinned ordinary tree refills the parent after subdivision" {
  let tree = @oct.octree_new(0.0, 0.0, 0.0, 200.0, 2, 16)
  for i in 0..<5 {
    @oct.octree_insert(tree, @point.Point3D::new(i.to_double(), 0.0, 0.0))
  }
  assert_true(tree.children is Some(_))
  assert_eq(tree.points.length(), 2)
  assert_eq(@oct.octree_size(tree), 5)
  assert_eq(
    @oct.octree_range_query(tree, -100.0, -100.0, -100.0, 100.0, 100.0, 100.0).length(),
    5,
  )
}
