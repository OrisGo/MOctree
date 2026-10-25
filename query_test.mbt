///|
test "output capacity exact fill truncation count-only and untouched tail" {
  let entries = Array::makei(10, i => {
    @octree.Entry::new(
      i.reinterpret_as_uint(),
      bounds(i.to_double(), 1.0, 1.0, 0.1),
    )
  })
  let tree = build(entries)
  let workspace = tree.workspace()
  for capacity in [0, 1, 9, 10, 12] {
    let output = FixedArray::make(20, 999U)
    let result = tree.query_aabb_into(
      root().bounds,
      output,
      workspace,
      offset=2,
      capacity~,
    )
    assert_eq(result.total_hits, 10)
    let expected_written = if capacity < 10 { capacity } else { 10 }
    assert_eq(result.written, expected_written)
    assert_eq(
      result.completeness,
      if capacity < 10 {
        @octree.Completeness::Truncated
      } else {
        @octree.Completeness::Complete
      },
    )
    assert_eq(output[0], 999U)
    assert_eq(output[1], 999U)
    for i in (2 + expected_written)..<20 {
      assert_eq(output[i], 999U)
    }
  }
  let empty = tree.query_aabb_into(
    bounds(-120.0, -120.0, -120.0, 1.0),
    FixedArray::make(0, 0U),
    workspace,
  )
  assert_eq(empty.total_hits, 0)
  assert_eq(empty.completeness, @octree.Completeness::Complete)
}

///|
test "invalid output ranges and small workspace never touch output" {
  let tree = build([@octree.Entry::new(1U, bounds(0.0, 0.0, 0.0, 1.0))])
  let output = FixedArray::make(4, 999U)
  for range in [(-1, 1), (5, 0), (0, -1), (2, 3), (1, 2147483647)] {
    let (offset, capacity) = range
    assert_true(
      try {
        ignore(
          tree.query_aabb_into(
            root().bounds,
            output,
            tree.workspace(),
            offset~,
            capacity~,
          ),
        )
        false
      } catch {
        @octree.QueryError::InvalidOutputRange => true
        _ => false
      },
    )
  }
  assert_true(
    try {
      ignore(
        tree.query_aabb_into(root().bounds, output, @octree.Workspace::new(0)),
      )
      false
    } catch {
      @octree.QueryError::InsufficientWorkspace(required=1, available=0) => true
      _ => false
    },
  )
  assert_true(
    try {
      ignore(@octree.Workspace::new(-1))
      false
    } catch {
      @octree.QueryError::InvalidWorkspaceCapacity => true
      _ => false
    },
  )
  for i in 0..<4 {
    assert_eq(output[i], 999U)
  }
  let at_end = tree.query_aabb_into(
    root().bounds,
    output,
    tree.workspace(),
    offset=4,
  )
  assert_eq(at_end.total_hits, 1)
  assert_eq(at_end.written, 0)
}

///|
test "ray buffer and workspace can be reused for different query kinds" {
  let entries = [
    @octree.Entry::new(1U, bounds(1.0, 0.0, 0.0, 1.0)),
    @octree.Entry::new(2U, bounds(4.0, 0.0, 0.0, 1.0)),
    @octree.Entry::new(3U, bounds(2.0, 3.0, 3.0, 1.0)),
  ]
  let tree = build(entries, threshold=1)
  let workspace = tree.workspace()
  let output = FixedArray::make(5, 999U)
  let ray = @octree.Ray::new(
    point(0.0, 0.0, 0.0),
    point(2.0, 0.0, 0.0),
    t_min=0.5,
    t_max=2.0,
  )
  let r = tree.query_ray_candidates_into(
    ray,
    output,
    workspace,
    offset=1,
    capacity=1,
  )
  assert_eq(r.total_hits, 2)
  assert_eq(r.written, 1)
  assert_eq(output[0], 999U)
  assert_eq(output[2], 999U)
  same_ids(tree.query_ray_candidates(ray), [1U, 2U])
  let full = tree.query_aabb_into(root().bounds, output, workspace)
  assert_eq(full.total_hits, 3)
  same_ids(Array::makei(full.written, i => output[i]), [1U, 2U, 3U])
}

///|
test "traversal is read-only preorder, can stop, and accounts for every ID once" {
  let entries = Array::makei(80, i => {
    @octree.Entry::new(
      i.reinterpret_as_uint(),
      bounds((i - 40).to_double(), (i % 5).to_double(), 0.0, 0.01),
    )
  })
  let tree = build(entries, threshold=1)
  let seen_nodes : Array[@octree.NodeInfo] = []
  let ids : Array[UInt32] = []
  tree.visit(tree.workspace(), fn(n) {
    seen_nodes.push(n)
    for i in 0..<n.object_count {
      ids.push(try! tree.node_object_id(n.id, i))
    }
    true
  })
  assert_eq(seen_nodes.length(), tree.stats().node_count)
  assert_eq(seen_nodes[0].id, 0)
  // A preorder depth can increase by at most one; siblings have ascending octants.
  for i in 1..<seen_nodes.length() {
    assert_true(seen_nodes[i].depth <= seen_nodes[i - 1].depth + 1)
  }
  same_ids(ids, Array::makei(80, i => i.reinterpret_as_uint()))
  let mut count = 0
  tree.visit(tree.workspace(), _ => {
    count += 1
    false
  })
  assert_eq(count, 1)
  assert_true(
    try {
      ignore(tree.node_info(-1))
      false
    } catch {
      @octree.QueryError::InvalidNode => true
      _ => false
    },
  )
  assert_true(
    try {
      ignore(tree.node_object_id(0, -1))
      false
    } catch {
      @octree.QueryError::InvalidObjectOffset => true
      _ => false
    },
  )
  assert_true(
    try {
      tree.visit(@octree.Workspace::new(0), _ => true)
      false
    } catch {
      @octree.QueryError::InsufficientWorkspace(..) => true
      _ => false
    },
  )
}

///|
test "query statistics distinguish pruning tests hits and writes" {
  let tree = build(
    [
      @octree.Entry::new(10U, bounds(-10.0, 0.0, 0.0, 1.0)),
      @octree.Entry::new(20U, bounds(10.0, 0.0, 0.0, 1.0)),
    ],
    max_nodes=1,
  )
  let output = FixedArray::make(1, 999U)
  let all = tree.query_aabb_into(root().bounds, output, tree.workspace())
  assert_eq(all.visited_nodes, 1)
  assert_eq(all.tested_objects, 0)
  assert_eq(all.total_hits, 2)
  assert_eq(all.written, 1)
  let outside = tree.query_aabb_into(
    bounds(200.0, 0.0, 0.0, 1.0),
    output,
    tree.workspace(),
  )
  assert_eq(outside.visited_nodes, 1)
  assert_eq(outside.tested_objects, 0)
  assert_eq(outside.total_hits, 0)
  assert_eq(outside.written, 0)
}

///|
test "contained child skips descendants but still tests parent and touching sibling" {
  let entries = [
    @octree.Entry::new(0U, bounds(-1.0, -1.0, -1.0, 2.0)),
    @octree.Entry::new(1U, bounds(-64.0, -64.0, -64.0, 1.0)),
    @octree.Entry::new(2U, bounds(-32.0, -32.0, -32.0, 1.0)),
    @octree.Entry::new(3U, bounds(32.0, 32.0, 32.0, 1.0)),
    @octree.Entry::new(4U, bounds(64.0, 64.0, 64.0, 1.0)),
  ]
  let tree = build(entries)
  let query = bounds(-128.0, -128.0, -128.0, 128.0)
  for capacity in [0, 1, 3, 5] {
    let output = FixedArray::make(capacity, 999U)
    let stats = tree.query_aabb_into(query, output, tree.workspace())
    assert_eq(stats.total_hits, @octree.scan_aabb(entries, query).length())
    assert_eq(stats.total_hits, 3)
    assert_eq(stats.visited_nodes, 3)
    assert_eq(stats.tested_objects, 3)
  }
}
