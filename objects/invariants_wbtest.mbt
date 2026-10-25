///|
test "node pool ranges, child masks, containment and single ownership" {
  let root = @geom.Cube::new(@geom.Vec3::origin(), 128.0)
  let entries = Array::makei(200, fn(i) {
    let x = (i * 19 % 180 - 90).to_double()
    let y = (i * 37 % 180 - 90).to_double()
    let z = (i * 53 % 180 - 90).to_double()
    let b = if i % 7 == 0 {
      root.bounds
    } else {
      try! @geom.Aabb::new(
        @geom.Vec3::new(x, y, z),
        @geom.Vec3::new(x + 0.1, y + 0.1, z + 0.1),
      )
    }
    Entry::new(i.reinterpret_as_uint(), b)
  })
  for budget in [1, 9, 32, 2000] {
    let tree = StaticObjectIndex::build(
      entries,
      root~,
      max_objects=200,
      max_nodes=budget,
      split_threshold=2,
    )
    let seen = FixedArray::make(entries.length(), 0)
    let parents = FixedArray::make(tree.nodes.length(), 0)
    for n in tree.nodes {
      assert_true(
        n.start >= 0 &&
        n.count >= 0 &&
        n.start + n.count <= tree.entries.length(),
      )
      for i in n.start..<(n.start + n.count) {
        let object = tree.entries[i].id.reinterpret_as_int()
        seen[object] += 1
        assert_true(n.bounds.contains(entries[object].bounds))
      }
      let mut end = n.start + n.count
      for i in 0..<n.child_count {
        let child = tree.nodes[n.first_child + i]
        assert_eq(child.start, end)
        end += child.subtree_count
      }
      assert_eq(end, n.start + n.subtree_count)
      for i in n.start..<end {
        assert_true(n.bounds.contains(tree.entries[i].bounds))
      }
      let mut mask = 0U
      let mut last_octant = -1
      for i in 0..<n.child_count {
        let child_id = n.first_child + i
        let child = tree.nodes[child_id]
        parents[child_id] += 1
        assert_eq(child.depth, n.depth + 1)
        assert_true(child.octant > last_octant)
        last_octant = child.octant
        mask = mask | (1U << child.octant)
        assert_true(n.bounds.contains(child.bounds))
      }
      assert_eq(mask, n.child_mask)
    }
    for count in seen {
      assert_eq(count, 1)
    }
    assert_eq(tree.nodes[0].subtree_count, entries.length())
    assert_eq(parents[0], 0)
    for i in 1..<parents.length() {
      assert_eq(parents[i], 1)
    }
    assert_true(tree.nodes.length() <= budget)
  }
}
