///|
test "closed boxes: face edge corner and zero extent" {
  let b = bounds(0.0, 0.0, 0.0, 1.0)
  assert_true(b.intersects(bounds(1.0, 0.0, 0.0, 1.0)))
  assert_true(b.intersects(bounds(1.0, 1.0, 0.0, 1.0)))
  assert_true(b.intersects(bounds(1.0, 1.0, 1.0, 0.0)))
  assert_false(b.intersects(bounds(1.000001, 1.0, 1.0, 0.0)))
  assert_true(b.contains(bounds(0.5, 0.5, 0.5, 0.0)))
}

///|
test "invalid coordinates inverted bounds and invalid roots" {
  for value in [@double.not_a_number, @double.infinity, @double.neg_infinity] {
    let rejected = try {
      ignore(@octree.Aabb::new(point(value, 0.0, 0.0), point(1.0, 1.0, 1.0)))
      false
    } catch {
      @octree.GeometryError::NonFinite(_) => true
      _ => false
    }
    assert_true(rejected)
  }
  assert_true(
    try {
      ignore(@octree.Aabb::new(point(1.0, 0.0, 0.0), point(0.0, 1.0, 1.0)))
      false
    } catch {
      @octree.GeometryError::InvertedBounds => true
      _ => false
    },
  )
  for extent in [0.0, -1.0, @double.infinity, @double.not_a_number] {
    assert_true(
      try {
        ignore(@octree.Cube::new(point(0.0, 0.0, 0.0), extent))
        false
      } catch {
        @octree.GeometryError::InvalidRoot => true
        _ => false
      },
    )
  }
  // Finite inputs can overflow or round both root faces to the same coordinate.
  for extent in [@double.max_value, 1.0] {
    assert_true(
      try {
        ignore(@octree.Cube::new(point(@double.max_value, 0.0, 0.0), extent))
        false
      } catch {
        @octree.GeometryError::InvalidRoot => true
        _ => false
      },
    )
  }
}

///|
test "ray closed interval parallel axes signed zero and nonunit direction" {
  let b = bounds(1.0, 1.0, 1.0, 1.0)
  let ray = @octree.Ray::new(
    point(0.0, 1.0, 1.0),
    point(2.0, -0.0, 0.0),
    t_min=0.5,
    t_max=0.5,
  )
  assert_true(ray.intersects(b))
  let short = @octree.Ray::new(
    point(0.0, 1.0, 1.0),
    point(2.0, 0.0, 0.0),
    t_min=0.0,
    t_max=0.49,
  )
  assert_false(short.intersects(b))
  let parallel = @octree.Ray::new(
    point(0.0, 0.0, 1.0),
    point(2.0, 0.0, 0.0),
    t_min=0.0,
    t_max=2.0,
  )
  assert_false(parallel.intersects(b))
  let negative = @octree.Ray::new(
    point(3.0, 2.0, 2.0),
    point(-2.0, 0.0, 0.0),
    t_min=0.5,
    t_max=0.5,
  )
  assert_true(negative.intersects(b))
  let inside = @octree.Ray::new(
    point(1.5, 1.5, 1.5),
    point(1.0, 0.0, 0.0),
    t_min=0.0,
    t_max=0.0,
  )
  assert_true(inside.intersects(b))
}

///|
test "ray invalid inputs are errors not empty results" {
  assert_true(
    try {
      ignore(
        @octree.Ray::new(
          point(0.0, 0.0, 0.0),
          point(0.0, -0.0, 0.0),
          t_min=0.0,
          t_max=1.0,
        ),
      )
      false
    } catch {
      @octree.GeometryError::ZeroDirection => true
      _ => false
    },
  )
  for
    interval in [
      (-1.0, 1.0),
      (2.0, 1.0),
      (0.0, @double.infinity),
      (@double.not_a_number, 1.0),
    ] {
    let (lo, hi) = interval
    assert_true(
      try {
        ignore(
          @octree.Ray::new(
            point(0.0, 0.0, 0.0),
            point(1.0, 0.0, 0.0),
            t_min=lo,
            t_max=hi,
          ),
        )
        false
      } catch {
        @octree.GeometryError::InvalidInterval => true
        _ => false
      },
    )
  }
  assert_true(
    try {
      ignore(
        @octree.Ray::new(
          point(0.0, 0.0, 0.0),
          point(@double.infinity, 0.0, 0.0),
          t_min=0.0,
          t_max=1.0,
        ),
      )
      false
    } catch {
      @octree.GeometryError::NonFinite(_) => true
      _ => false
    },
  )
}

///|
test "ray subtraction overflow with finite intersection parameter" {
  let ray = @octree.Ray::new(
    point(-1.0e308, 0.0, 0.0),
    point(1.0e308, 0.0, 0.0),
    t_min=2.0,
    t_max=2.0,
  )
  let b = @octree.Aabb::new(
    point(1.0e308, -1.0, -1.0),
    point(1.1e308, 1.0, 1.0),
  )
  assert_true(ray.intersects(b))
  let before = @octree.Ray::new(ray.origin, ray.direction, t_min=0.0, t_max=1.9)
  assert_false(before.intersects(b))
  let tiny = @octree.Ray::new(
    point(0.0, 0.0, 0.0),
    point(5.0e-324, 0.0, 0.0),
    t_min=0.0,
    t_max=1.0,
  )
  assert_false(tiny.intersects(bounds(1.0, 0.0, 0.0, 0.0)))
}
