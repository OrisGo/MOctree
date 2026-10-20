///|
pub fn Aabb::intersects(self : Aabb, other : Aabb) -> Bool {
  self.min.x <= other.max.x &&
  other.min.x <= self.max.x &&
  self.min.y <= other.max.y &&
  other.min.y <= self.max.y &&
  self.min.z <= other.max.z &&
  other.min.z <= self.max.z
}

///|
pub fn Aabb::contains(self : Aabb, other : Aabb) -> Bool {
  self.min.x <= other.min.x &&
  other.max.x <= self.max.x &&
  self.min.y <= other.min.y &&
  other.max.y <= self.max.y &&
  self.min.z <= other.min.z &&
  other.max.z <= self.max.z
}

///|
// When subtraction overflows, halve its operands first. This path only handles
// large opposite-sign operands, so halving cannot discard a small difference.
fn parameter(bound : Double, origin : Double, direction : Double) -> Double {
  let delta = bound - origin
  if finite(delta) {
    delta / direction
  } else {
    (bound * 0.5 - origin * 0.5) / direction * 2.0
  }
}

///|
pub fn Ray::intersects(self : Ray, bounds : Aabb) -> Bool {
  let mut near = self.t_min
  let mut far = self.t_max
  for axis in 0..<3 {
    let (origin, direction, lo, hi) = match axis {
      0 => (self.origin.x, self.direction.x, bounds.min.x, bounds.max.x)
      1 => (self.origin.y, self.direction.y, bounds.min.y, bounds.max.y)
      _ => (self.origin.z, self.direction.z, bounds.min.z, bounds.max.z)
    }
    if direction == 0.0 {
      if origin < lo || origin > hi {
        return false
      }
    } else {
      let a = parameter(lo, origin, direction)
      let b = parameter(hi, origin, direction)
      let (enter, leave) = if a <= b { (a, b) } else { (b, a) }
      if enter > near {
        near = enter
      }
      if leave < far {
        far = leave
      }
      if near > far {
        return false
      }
    }
  }
  true
}
