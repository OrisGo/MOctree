///|
fn node(bounds : @geom.Aabb, depth : Int32, octant : Int32) -> Node {
  {
    bounds,
    depth,
    octant,
    first_child: 0,
    child_count: 0,
    child_mask: 0U,
    start: 0,
    count: 0,
    subtree_count: 0,
  }
}

///|
// Same-sign subtraction cannot overflow. Opposite-sign operands use a half-sum.
fn midpoint(lo : Double, hi : Double) -> Double {
  if lo < 0.0 && hi > 0.0 {
    lo * 0.5 + hi * 0.5
  } else {
    lo + (hi - lo) * 0.5
  }
}

///|
fn side(lo : Double, hi : Double, mid : Double) -> Int32 {
  if lo >= mid {
    1
  } else if hi <= mid {
    0
  } else {
    -1
  }
}

///|
fn octant(bounds : @geom.Aabb, mid : @geom.Vec3) -> Int32 {
  let x = side(bounds.min.x, bounds.max.x, mid.x)
  let y = side(bounds.min.y, bounds.max.y, mid.y)
  let z = side(bounds.min.z, bounds.max.z, mid.z)
  if x < 0 || y < 0 || z < 0 {
    -1
  } else {
    x + y * 2 + z * 4
  }
}

///|
fn child_bounds(
  bounds : @geom.Aabb,
  mid : @geom.Vec3,
  oct : Int32,
) -> @geom.Aabb {
  let lo = @geom.Vec3::new(
    if (oct & 1) == 0 {
      bounds.min.x
    } else {
      mid.x
    },
    if (oct & 2) == 0 {
      bounds.min.y
    } else {
      mid.y
    },
    if (oct & 4) == 0 {
      bounds.min.z
    } else {
      mid.z
    },
  )
  let hi = @geom.Vec3::new(
    if (oct & 1) == 0 {
      mid.x
    } else {
      bounds.max.x
    },
    if (oct & 2) == 0 {
      mid.y
    } else {
      bounds.max.y
    },
    if (oct & 4) == 0 {
      mid.z
    } else {
      bounds.max.z
    },
  )
  // Midpoint is strictly interior and all inputs were validated.
  try! @geom.Aabb::new(lo, hi)
}

///|
fn split(
  nodes : Array[Node],
  entries : Array[Entry],
  order : Array[Int32],
  index : Int32,
  items : Array[Int32],
  max_nodes : Int32,
  max_depth : Int32,
  threshold : Int32,
) -> Unit {
  let current = nodes[index]
  // DFS appends this entire subtree contiguously, starting at current.start.
  current.subtree_count = items.length()
  let b = current.bounds
  let mid = @geom.Vec3::new(
    midpoint(b.min.x, b.max.x),
    midpoint(b.min.y, b.max.y),
    midpoint(b.min.z, b.max.z),
  )
  if items.length() <= threshold ||
    current.depth >= max_depth ||
    mid.x <= b.min.x ||
    mid.x >= b.max.x ||
    mid.y <= b.min.y ||
    mid.y >= b.max.y ||
    mid.z <= b.min.z ||
    mid.z >= b.max.z {
    current.start = order.length()
    current.count = items.length()
    order.append(items)
    return
  }
  let buckets : Array[Array[Int32]] = Array::makei(8, _ => [])
  let staying : Array[Int32] = []
  for item in items {
    let oct = octant(entries[item].bounds, mid)
    if oct < 0 {
      staying.push(item)
    } else {
      buckets[oct].push(item)
    }
  }
  let needed = buckets.count_if(xs => !xs.is_empty())
  if needed == 0 || needed > max_nodes - nodes.length() {
    current.start = order.length()
    current.count = items.length()
    order.append(items)
    return
  }
  current.start = order.length()
  current.count = staying.length()
  order.append(staying)
  current.first_child = nodes.length()
  current.child_count = needed
  for oct in 0..<8 {
    if !buckets[oct].is_empty() {
      current.child_mask = current.child_mask | (1U << oct)
      nodes.push(node(child_bounds(b, mid, oct), current.depth + 1, oct))
    }
  }
  let mut offset = 0
  for oct in 0..<8 {
    if !buckets[oct].is_empty() {
      split(
        nodes,
        entries,
        order,
        current.first_child + offset,
        buckets[oct],
        max_nodes,
        max_depth,
        threshold,
      )
      offset += 1
    }
  }
}

///|
/// Build atomically from copied snapshots. A node-budget stop never discards entries.
pub fn StaticObjectIndex::build(
  input : ArrayView[Entry],
  root~ : @geom.Cube,
  max_objects~ : Int32,
  max_nodes~ : Int32,
  max_depth~ : Int32 = 16,
  split_threshold~ : Int32 = 16,
) -> StaticObjectIndex raise BuildError {
  guard max_objects >= 0 else { raise InvalidConfig("max_objects") }
  guard max_nodes >= 1 else { raise InvalidConfig("max_nodes") }
  guard max_depth >= 0 && max_depth <= 64 else {
    raise InvalidConfig("max_depth")
  }
  guard split_threshold >= 1 else { raise InvalidConfig("split_threshold") }
  guard input.length() <= max_objects else {
    raise ObjectCapacityExceeded(limit=max_objects, actual=input.length())
  }
  let seen : @hashset.HashSet[UInt32] = @hashset.HashSet([])
  for position, entry in input {
    if seen.contains(entry.id) {
      raise DuplicateId(position~, id=entry.id)
    }
    seen.add(entry.id)
    if !root.bounds.contains(entry.bounds) {
      raise OutsideRoot(position~, id=entry.id)
    }
  }
  let entries = input.to_owned()
  let nodes = [node(root.bounds, 0, -1)]
  let order : Array[Int32] = Array(capacity=input.length())
  split(
    nodes,
    entries,
    order,
    0,
    Array::makei(entries.length(), i => i),
    max_nodes,
    max_depth,
    split_threshold,
  )
  let depth = nodes.fold(init=0, (d, n) => if n.depth > d { n.depth } else { d })
  let summary : IndexStats = {
    object_count: entries.length(),
    node_count: nodes.length(),
    depth,
    max_objects,
    max_nodes,
    max_depth,
    split_threshold,
    object_capacity: entries.capacity(),
    node_capacity: nodes.capacity(),
    order_capacity: order.capacity(),
    workspace_required: 1 + 7 * depth,
  }
  { entries, nodes, order, summary, }
}
