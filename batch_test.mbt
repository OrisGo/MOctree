///|
test "batch preserves per-query geometry errors and independent output ranges" {
  let tree = build([
    @octree.Entry::new(1U, bounds(0.0, 0.0, 0.0, 0.0)),
    @octree.Entry::new(2U, bounds(1.0, 0.0, 0.0, 0.0)),
  ])
  let invalid = try
    @octree.Aabb::new(point(1.0, 0.0, 0.0), point(0.0, 0.0, 0.0))
  catch {
    error => Err(error)
  } noraise {
    value => Ok(value)
  }
  let queries = [
    @octree.BatchQuery::new(Ok(root().bounds), offset=5, capacity=1),
    @octree.BatchQuery::new(invalid, offset=2, capacity=2),
    @octree.BatchQuery::new(Ok(root().bounds), offset=0, capacity=2),
    @octree.BatchQuery::new(Ok(root().bounds), offset=1, capacity=0),
    @octree.BatchQuery::new(
      Ok(bounds(200.0, 0.0, 0.0, 0.0)),
      offset=7,
      capacity=0,
    ),
  ]
  let output = FixedArray::make(7, 999U)
  let workspace = tree.workspace()
  for _ in 0..<2 {
    let reports = tree.query_aabb_batch_into(queries, output, workspace)
    assert_eq(reports.length(), queries.length())
    assert_eq(reports[1], Err(@octree.GeometryError::InvertedBounds))
    let truncated = reports[0].unwrap()
    assert_eq(truncated.total_hits, 2)
    assert_eq(truncated.written, 1)
    assert_eq(truncated.completeness, @octree.Completeness::Truncated)
    let exact = reports[2].unwrap()
    assert_eq(exact.written, 2)
    assert_eq(exact.completeness, @octree.Completeness::Complete)
    same_ids([output[0], output[1]], [1U, 2U])
    assert_eq(reports[3].unwrap().total_hits, 2)
    assert_eq(reports[3].unwrap().written, 0)
    assert_eq(reports[4].unwrap().completeness, @octree.Completeness::Complete)
    for i in [2, 3, 4, 6] {
      assert_eq(output[i], 999U)
    }
  }
  let ray_error = try
    @octree.Ray::new(
      point(0.0, 0.0, 0.0),
      point(0.0, 0.0, 0.0),
      t_min=0.0,
      t_max=1.0,
    )
  catch {
    error => Err(error)
  } noraise {
    value => Ok(value)
  }
  let ray = @octree.Ray::new(
    point(0.0, 0.0, 0.0),
    point(1.0, 0.0, 0.0),
    t_min=0.0,
    t_max=1.0,
  )
  let reports = tree.query_ray_candidates_batch_into(
    [
      @octree.BatchQuery::new(ray_error, offset=2, capacity=1),
      @octree.BatchQuery::new(Ok(ray), offset=0, capacity=2),
    ],
    output,
    workspace,
  )
  assert_eq(reports[0], Err(@octree.GeometryError::ZeroDirection))
  assert_eq(reports[1].unwrap().written, 2)
  assert_eq(output[2], 999U)
}

///|
test "batch preflight is atomic for invalid late ranges overlap and workspace" {
  let tree = build([@octree.Entry::new(7U, bounds(0.0, 0.0, 0.0, 0.0))])
  let output = FixedArray::make(8, 999U)
  for range in [(-1, 0), (9, 0), (0, -1), (7, 2), (1, 2147483647)] {
    let queries = [
      @octree.BatchQuery::new(Ok(root().bounds), offset=0, capacity=1),
      @octree.BatchQuery::new(
        Ok(root().bounds),
        offset=range.0,
        capacity=range.1,
      ),
    ]
    assert_true(
      try {
        ignore(tree.query_aabb_batch_into(queries, output, tree.workspace()))
        false
      } catch {
        @octree.BatchError::InvalidOutputRange(position=1) => true
        _ => false
      },
    )
  }
  // Include nested, duplicate and unsorted overlaps, even for invalid geometry.
  for pair in [(2, 2), (0, 4), (3, 3)] {
    assert_true(
      try {
        ignore(
          tree.query_aabb_batch_into(
            [
              @octree.BatchQuery::new(
                Ok(root().bounds),
                offset=pair.0,
                capacity=pair.1,
              ),
              @octree.BatchQuery::new(
                Err(@octree.GeometryError::InvertedBounds),
                offset=1,
                capacity=4,
              ),
            ],
            output,
            tree.workspace(),
          ),
        )
        false
      } catch {
        @octree.BatchError::OverlappingOutputRanges(..) => true
        _ => false
      },
    )
  }
  assert_true(
    try {
      ignore(
        tree.query_aabb_batch_into(
          [@octree.BatchQuery::new(Ok(root().bounds), offset=0, capacity=8)],
          output,
          @octree.Workspace::new(0),
        ),
      )
      false
    } catch {
      @octree.BatchError::InsufficientWorkspace(required=1, available=0) => true
      _ => false
    },
  )
  for x in output {
    assert_eq(x, 999U)
  }
  assert_eq(
    tree.query_aabb_batch_into([], output, @octree.Workspace::new(0)).length(),
    0,
  )
  assert_eq(
    tree
    .query_ray_candidates_batch_into([], output, @octree.Workspace::new(0))
    .length(),
    0,
  )
  let empty = build([])
  let reports = empty.query_aabb_batch_into(
    [@octree.BatchQuery::new(Ok(root().bounds), offset=8, capacity=0)],
    output,
    empty.workspace(),
  )
  assert_eq(reports[0].unwrap().total_hits, 0)
  assert_eq(reports[0].unwrap().completeness, @octree.Completeness::Complete)
}

///|
test "batch differential eight distributions three budgets with reused workspace" {
  for kind in 0..<8 {
    let entries = dataset(kind)
    for budget in [1, 16, 4096] {
      let tree = build(entries, max_nodes=budget, threshold=4)
      let workspace = tree.workspace()
      let boxes = Array::makei(24, i => {
        if i == 0 {
          root().bounds
        } else {
          entries[i].bounds
        }
      })
      let rays = Array::makei(24, i => {
        try! @octree.Ray::new(
          point(-128.0, entries[i].bounds.min.y, entries[i].bounds.min.z),
          point(1.0, 0.0, 0.0),
          t_min=0.0,
          t_max=256.0,
        )
      })
      for capacity in [0, 3, 160] {
        let output = FixedArray::make(24 * 162, 999U)
        let box_reports = tree.query_aabb_batch_into(
          Array::makei(24, i => {
            @octree.BatchQuery::new(Ok(boxes[i]), offset=i * 162 + 1, capacity~)
          }),
          output,
          workspace,
        )
        for i in 0..<24 {
          let expected = @octree.scan_aabb(entries, boxes[i])
          let report = box_reports[i].unwrap()
          assert_eq(report.total_hits, expected.length())
          assert_eq(
            report.written,
            if expected.length() < capacity {
              expected.length()
            } else {
              capacity
            },
          )
          for j in 0..<report.written {
            assert_true(expected.contains(output[i * 162 + 1 + j]))
          }
          if capacity == 160 {
            same_ids(
              Array::makei(report.written, j => output[i * 162 + 1 + j]),
              expected,
            )
          }
          for j in report.written..<161 {
            assert_eq(output[i * 162 + 1 + j], 999U)
          }
          assert_eq(output[i * 162], 999U)
        }
        let ray_reports = tree.query_ray_candidates_batch_into(
          Array::makei(24, i => {
            @octree.BatchQuery::new(Ok(rays[i]), offset=i * 162 + 1, capacity~)
          }),
          output,
          workspace,
        )
        for i in 0..<24 {
          let expected = @octree.scan_ray_candidates(entries, rays[i])
          let report = ray_reports[i].unwrap()
          let single_output = FixedArray::make(capacity, 0U)
          assert_eq(
            report,
            tree.query_ray_candidates_into(rays[i], single_output, workspace),
          )
          assert_eq(report.total_hits, expected.length())
          for j in 0..<report.written {
            assert_true(expected.contains(output[i * 162 + 1 + j]))
          }
          if capacity == 160 {
            same_ids(
              Array::makei(report.written, j => output[i * 162 + 1 + j]),
              expected,
            )
          }
        }
      }
    }
  }
}
