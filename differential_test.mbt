///|
priv struct Generator {
  mut state : Int32
}

///|
fn Generator::next(self : Generator) -> Double {
  // All arithmetic stays in signed 32-bit range, identical on every backend.
  self.state = (self.state * 25173 + 13849) % 65536
  self.state.to_double() / 65536.0
}

///|
fn dataset(kind : Int32) -> Array[@octree.Entry] {
  let rng = Generator::{ state: 173 + kind, }
  Array::makei(160, fn(i) {
    let x = rng.next() * 180.0 - 90.0
    let y = rng.next() * 180.0 - 90.0
    let z = rng.next() * 180.0 - 90.0
    let size = rng.next() * 4.0
    let b = match kind {
      0 => bounds(x, y, z, size) // Uniform.
      1 =>
        bounds(x * 0.01 + 32.0, y * 0.01 + 32.0, z * 0.01 + 32.0, size * 0.01)
      2 =>
        try! @octree.Aabb::new(point(x, y, 0.0), point(x + size, y + size, 0.0))
      3 =>
        try! @octree.Aabb::new(
          point(-100.0, y, z),
          point(100.0, y + 0.001, z + 0.001),
        )
      4 => bounds(-100.0, -100.0, -100.0, 200.0) // All overlap/cross root planes.
      5 => bounds(32.0, 32.0, 32.0, 0.0) // Duplicate positions, unique IDs.
      6 =>
        if i % 3 == 0 {
          bounds(-127.0, -127.0, -127.0, 254.0)
        } else {
          bounds(x, y, z, size)
        }
      _ => bounds(0.0, y, z, 0.0) // Points on a split plane.
    }
    @octree.Entry::new(i.reinterpret_as_uint(), b)
  })
}

///|
test "differential: eight distributions, three budgets, AABB and ray queries" {
  for kind in 0..<8 {
    let entries = dataset(kind)
    for budget in [1, 16, 4096] {
      let tree = build(entries, max_nodes=budget, threshold=4)
      let workspace = tree.workspace()
      let output = FixedArray::make(entries.length() + 2, 777U)
      let rng = Generator::{ state: 900 + kind, }
      for iteration in 0..<96 {
        let x = rng.next() * 300.0 - 150.0
        let y = rng.next() * 300.0 - 150.0
        let z = rng.next() * 300.0 - 150.0
        let b = if iteration == 0 {
          root().bounds
        } else {
          bounds(x, y, z, rng.next() * 160.0)
        }
        let expected = @octree.scan_aabb(entries, b)
        same_ids(tree.query_aabb(b), expected.copy())
        let result = tree.query_aabb_into(
          b,
          output,
          workspace,
          offset=1,
          capacity=160,
        )
        assert_eq(result.total_hits, expected.length())
        assert_eq(result.written, expected.length())
        assert_eq(result.completeness, @octree.Completeness::Complete)
        same_ids(Array::makei(result.written, i => output[1 + i]), expected)
        assert_true(result.visited_nodes <= tree.stats().node_count)
        assert_true(result.tested_objects <= entries.length())
        assert_eq(output[0], 777U)
        assert_eq(output[161], 777U)
        let target = entries[iteration % entries.length()].bounds.min
        let origin = point(x + 400.0, y, z)
        let ray = @octree.Ray::new(
          origin,
          point(target.x - origin.x, target.y - origin.y, target.z - origin.z),
          t_min=0.0,
          t_max=1.5,
        )
        let expected_ray = @octree.scan_ray_candidates(entries, ray)
        same_ids(tree.query_ray_candidates(ray), expected_ray.copy())
        let limited = tree.query_ray_candidates_into(
          ray,
          output,
          workspace,
          capacity=3,
        )
        assert_eq(limited.total_hits, expected_ray.length())
        assert_eq(
          limited.written,
          if expected_ray.length() < 3 {
            expected_ray.length()
          } else {
            3
          },
        )
        for i in 0..<limited.written {
          assert_true(expected_ray.contains(output[i]))
        }
        // Restore the sentinel touched by the deliberately truncated query.
        output[0] = 777U
      }
    }
  }
}

///|
test "axis-parallel ray oracle independent of slab division" {
  let entries = dataset(0)
  let tree = build(entries, threshold=1)
  for entry in entries {
    let y = entry.bounds.min.y
    let z = entry.bounds.min.z
    let ray = @octree.Ray::new(
      point(-128.0, y, z),
      point(1.0, 0.0, 0.0),
      t_min=0.0,
      t_max=256.0,
    )
    // Root contains all X extents, so only Y and Z containment matter.
    let expected : Array[UInt32] = []
    for e in entries {
      if e.bounds.min.y <= y &&
        y <= e.bounds.max.y &&
        e.bounds.min.z <= z &&
        z <= e.bounds.max.z {
        expected.push(e.id)
      }
    }
    same_ids(tree.query_ray_candidates(ray), expected)
  }
}

///|
test "extreme scale pruning agrees with scan and preserves all entries" {
  for scale in [1.0e308, 1.0e-300, 5.0e-324] {
    let cube = @octree.Cube::new(point(0.0, 0.0, 0.0), scale)
    let entries = Array::makei(17, fn(i) {
      let x = (i - 8).to_double() / 8.0 * scale
      let p = point(x, x, x)
      @octree.Entry::new(i.reinterpret_as_uint(), try! @octree.Aabb::new(p, p))
    })
    let tree = @octree.StaticObjectIndex::build(
      entries,
      root=cube,
      max_objects=17,
      max_nodes=1000,
      max_depth=64,
      split_threshold=1,
    )
    same_ids(
      tree.query_aabb(cube.bounds),
      @octree.scan_aabb(entries, cube.bounds),
    )
    for entry in entries {
      same_ids(
        tree.query_aabb(entry.bounds),
        @octree.scan_aabb(entries, entry.bounds),
      )
    }
    let ray = @octree.Ray::new(
      point(-scale, -scale, -scale),
      point(scale, scale, scale),
      t_min=0.0,
      t_max=2.0,
    )
    same_ids(
      tree.query_ray_candidates(ray),
      @octree.scan_ray_candidates(entries, ray),
    )
    assert_eq(tree.query_ray_candidates(ray).length(), entries.length())
  }
}

///|
test "fixed octant preorder and sparse mask" {
  let entries = Array::makei(8, i => {
    @octree.Entry::new(
      i.reinterpret_as_uint(),
      bounds(
        if (i & 1) == 0 {
          -32.0
        } else {
          32.0
        },
        if (i & 2) == 0 {
          -32.0
        } else {
          32.0
        },
        if (i & 4) == 0 {
          -32.0
        } else {
          32.0
        },
        0.0,
      ),
    )
  })
  let tree = build(entries, threshold=1)
  let octants : Array[Int32] = []
  tree.visit(tree.workspace(), n => {
    octants.push(n.octant)
    true
  })
  assert_eq(tree.node_info(0).child_mask, 255U)
  assert_eq(octants.length(), 9)
  for i in 0..<8 {
    assert_eq(octants[i + 1], i)
  }
}

///|
test "contained subtrees match scan with zero limited exact and excess capacity" {
  for kind in 0..<8 {
    let entries = dataset(kind)
    for budget in [1, 16, 4096] {
      let tree = build(entries, max_nodes=budget, threshold=4)
      let queries : Array[@octree.Aabb] = []
      tree.visit(tree.workspace(), n => {
        queries.push(n.bounds)
        true
      })
      let workspace = tree.workspace()
      for query in queries {
        let expected = @octree.scan_aabb(entries, query)
        for capacity in [0, 1, 7, expected.length(), entries.length() + 1] {
          let output = FixedArray::make(capacity + 4, 999U)
          let result = tree.query_aabb_into(
            query,
            output,
            workspace,
            offset=2,
            capacity~,
          )
          assert_eq(result.total_hits, expected.length())
          assert_eq(
            result.written,
            if capacity < expected.length() {
              capacity
            } else {
              expected.length()
            },
          )
          assert_eq(
            result.completeness,
            if result.written == expected.length() {
              @octree.Completeness::Complete
            } else {
              @octree.Completeness::Truncated
            },
          )
          let ids = Array::makei(result.written, i => output[2 + i])
          for i in 0..<ids.length() {
            assert_true(expected.contains(ids[i]))
            for j in 0..<i {
              assert_true(ids[i] != ids[j])
            }
          }
          assert_eq(output[0], 999U)
          assert_eq(output[1], 999U)
          for i in (2 + result.written)..<output.length() {
            assert_eq(output[i], 999U)
          }
          if query == root().bounds {
            assert_eq(result.visited_nodes, 1)
            assert_eq(result.tested_objects, 0)
          }
        }
      }
    }
  }
}
