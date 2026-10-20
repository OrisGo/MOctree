///|
test "empty index and depth zero retain a root" {
  let tree = build([], max_nodes=1)
  assert_eq(tree.stats().node_count, 1)
  assert_eq(tree.stats().depth, 0)
  assert_eq(tree.stats().object_count, 0)
  same_ids(tree.query_aabb(root().bounds), [])
  let out = FixedArray::make(0, 0U)
  let result = tree.query_aabb_into(root().bounds, out, tree.workspace())
  assert_eq(result.completeness, @octree.Completeness::Complete)
  assert_eq(result.visited_nodes, 1)
}

///|
test "build errors report capacity duplicate id and root escape" {
  let entry = @octree.Entry::new(0U, bounds(0.0, 0.0, 0.0, 1.0))
  assert_true(
    try {
      ignore(
        @octree.StaticObjectIndex::build(
          [entry],
          root=root(),
          max_objects=0,
          max_nodes=1,
        ),
      )
      false
    } catch {
      @octree.BuildError::ObjectCapacityExceeded(limit=0, actual=1) => true
      _ => false
    },
  )
  assert_true(
    try {
      ignore(
        @octree.StaticObjectIndex::build(
          [entry, entry],
          root=root(),
          max_objects=2,
          max_nodes=1,
        ),
      )
      false
    } catch {
      @octree.BuildError::DuplicateId(position=1, id=0U) => true
      _ => false
    },
  )
  assert_true(
    try {
      ignore(
        @octree.StaticObjectIndex::build(
          [@octree.Entry::new(7U, bounds(128.0, 0.0, 0.0, 1.0))],
          root=root(),
          max_objects=1,
          max_nodes=1,
        ),
      )
      false
    } catch {
      @octree.BuildError::OutsideRoot(position=0, id=7U) => true
      _ => false
    },
  )
}

///|
test "configuration validation" {
  for
    config in [
      (-1, 1, 16, 16),
      (1, 0, 16, 16),
      (1, 1, -1, 16),
      (1, 1, 65, 16),
      (1, 1, 16, 0),
    ] {
    let (objects, nodes, depth, threshold) = config
    assert_true(
      try {
        ignore(
          @octree.StaticObjectIndex::build(
            [],
            root=root(),
            max_objects=objects,
            max_nodes=nodes,
            max_depth=depth,
            split_threshold=threshold,
          ),
        )
        false
      } catch {
        @octree.BuildError::InvalidConfig(_) => true
        _ => false
      },
    )
  }
}

///|
test "internal objects split-plane ownership and closed-root faces" {
  let entries = [
    @octree.Entry::new(0U, bounds(-1.0, -1.0, -1.0, 2.0)),
    @octree.Entry::new(1U, bounds(0.0, 0.0, 0.0, 0.0)),
    @octree.Entry::new(2U, bounds(-2.0, -2.0, -2.0, 2.0)),
    @octree.Entry::new(4294967295U, bounds(128.0, 128.0, 128.0, 0.0)),
  ]
  let tree = build(entries, max_depth=1, threshold=1)
  assert_eq(tree.node_info(0).object_count, 1)
  assert_eq(tree.node_object_id(0, 0), 0U)
  let positive : Array[UInt32] = []
  tree.visit(tree.workspace(), fn(n) {
    if n.octant == 7 {
      for i in 0..<n.object_count {
        positive.push(try! tree.node_object_id(n.id, i))
      }
    }
    true
  })
  same_ids(positive, [1U, 4294967295U])
  same_ids(tree.query_aabb(bounds(0.0, 0.0, 0.0, 0.0)), [0U, 1U, 2U])
  same_ids(tree.query_aabb(bounds(128.0, 128.0, 128.0, 0.0)), [4294967295U])
}

///|
test "node budget does not partially split or lose objects" {
  let entries = Array::makei(8, fn(i) {
    @octree.Entry::new(
      i.reinterpret_as_uint(),
      bounds(
        if (i & 1) == 0 {
          -64.0
        } else {
          64.0
        },
        if (i & 2) == 0 {
          -64.0
        } else {
          64.0
        },
        if (i & 4) == 0 {
          -64.0
        } else {
          64.0
        },
        0.0,
      ),
    )
  })
  let stopped = build(entries, max_nodes=8, threshold=1)
  assert_eq(stopped.stats().node_count, 1)
  let split = build(entries, max_nodes=9, threshold=1)
  assert_eq(split.stats().node_count, 9)
  same_ids(stopped.query_aabb(root().bounds), split.query_aabb(root().bounds))
  let flat = build(entries, max_depth=0, threshold=1)
  assert_eq(flat.stats().node_count, 1)
  same_ids(
    flat.query_aabb(root().bounds),
    @octree.scan_aabb(entries, root().bounds),
  )
}

///|
test "single-child chains stop at depth or numerical degeneracy" {
  let entries = [
    @octree.Entry::new(1U, bounds(0.0, 0.0, 0.0, 0.0)),
    @octree.Entry::new(2U, bounds(0.0, 0.0, 0.0, 0.0)),
  ]
  let tree = build(entries, max_depth=64, threshold=1)
  assert_eq(tree.stats().depth, 64)
  assert_eq(tree.stats().node_count, 65)
  same_ids(tree.query_aabb(bounds(0.0, 0.0, 0.0, 0.0)), [1U, 2U])
  let tiny_root = @octree.Cube::new(point(0.0, 0.0, 0.0), 5.0e-324)
  let tiny = @octree.StaticObjectIndex::build(
    entries,
    root=tiny_root,
    max_objects=2,
    max_nodes=100,
    max_depth=64,
    split_threshold=1,
  )
  assert_true(tiny.stats().depth <= 2)
  same_ids(tiny.query_aabb(tiny_root.bounds), [1U, 2U])
}

///|
test "input snapshots are independent and construction is deterministic" {
  let entries = Array::makei(40, i => {
    @octree.Entry::new(
      i.reinterpret_as_uint(),
      bounds(i.to_double() - 20.0, 2.0, 3.0, 0.25),
    )
  })
  let first = build(entries)
  let second = build(entries)
  assert_eq(first.stats(), second.stats())
  for i in 0..<first.stats().node_count {
    assert_eq(first.node_info(i), second.node_info(i))
  }
  entries[0] = @octree.Entry::new(900U, bounds(80.0, 80.0, 80.0, 1.0))
  entries.clear()
  assert_eq(first.query_aabb(root().bounds).length(), 40)
  same_ids(first.query_aabb(root().bounds), second.query_aabb(root().bounds))
}

///|
test "large translated root midpoint does not overflow" {
  let cube = @octree.Cube::new(point(1.2e308, 1.2e308, 1.2e308), 1.0e307)
  let entries = Array::makei(20, fn(i) {
    let p = point(1.11e308 + i.to_double() * 8.0e305, 1.2e308, 1.2e308)
    @octree.Entry::new(i.reinterpret_as_uint(), try! @octree.Aabb::new(p, p))
  })
  let tree = @octree.StaticObjectIndex::build(
    entries,
    root=cube,
    max_objects=20,
    max_nodes=200,
    split_threshold=1,
  )
  assert_true(tree.stats().depth > 0)
  for e in entries {
    same_ids(tree.query_aabb(e.bounds), [e.id])
  }
}
