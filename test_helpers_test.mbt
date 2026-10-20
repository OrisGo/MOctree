///|
fn point(x : Double, y : Double, z : Double) -> @octree.Vec3 {
  @octree.Vec3::new(x, y, z)
}

///|
fn bounds(x : Double, y : Double, z : Double, size : Double) -> @octree.Aabb {
  try! @octree.Aabb::new(point(x, y, z), point(x + size, y + size, z + size))
}

///|
fn root() -> @octree.Cube {
  try! @octree.Cube::new(point(0.0, 0.0, 0.0), 128.0)
}

///|
fn same_ids(actual : Array[UInt32], expected : Array[UInt32]) -> Unit raise {
  actual.sort()
  expected.sort()
  assert_eq(actual.length(), expected.length())
  for i in 0..<actual.length() {
    assert_eq(actual[i], expected[i])
    if i > 0 {
      assert_true(actual[i] != actual[i - 1])
    }
  }
}

///|
fn build(
  entries : ArrayView[@octree.Entry],
  max_nodes~ : Int32 = 4096,
  max_depth~ : Int32 = 16,
  threshold~ : Int32 = 2,
) -> @octree.StaticObjectIndex {
  try! @octree.StaticObjectIndex::build(
    entries,
    root=root(),
    max_objects=entries.length(),
    max_nodes~,
    max_depth~,
    split_threshold=threshold,
  )
}
