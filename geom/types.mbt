///|
/// Immutable three-dimensional coordinates. Geometry constructors validate finiteness.
pub struct Vec3 {
  x : Double
  y : Double
  z : Double
} derive(Debug, Eq)

///|
pub fn Vec3::new(x : Double, y : Double, z : Double) -> Vec3 {
  { x, y, z, }
}

///|
pub fn Vec3::origin() -> Vec3 {
  { x: 0.0, y: 0.0, z: 0.0, }
}

///|
pub(all) suberror GeometryError {
  NonFinite(String)
  InvertedBounds
  InvalidRoot
  ZeroDirection
  InvalidInterval
} derive(Debug, Eq)

///|
fn finite(x : Double) -> Bool {
  x >= -@double.max_value && x <= @double.max_value
}

///|
fn Vec3::finite(self : Vec3) -> Bool {
  finite(self.x) && finite(self.y) && finite(self.z)
}

///|
/// Validated, closed AABB. Touching counts as intersection; zero extent is legal.
pub struct Aabb {
  min : Vec3
  max : Vec3
} derive(Debug, Eq)

///|
pub fn Aabb::new(min : Vec3, max : Vec3) -> Aabb raise GeometryError {
  guard min.finite() && max.finite() else { raise NonFinite("aabb") }
  guard min.x <= max.x && min.y <= max.y && min.z <= max.z else {
    raise InvertedBounds
  }
  { min, max, }
}

///|
/// A fixed root specified by center and positive half extent.
pub struct Cube {
  center : Vec3
  half_extent : Double
  bounds : Aabb
} derive(Debug, Eq)

///|
pub fn Cube::new(
  center : Vec3,
  half_extent : Double,
) -> Cube raise GeometryError {
  guard center.finite() && finite(half_extent) && half_extent > 0.0 else {
    raise InvalidRoot
  }
  let lo = Vec3::new(
    center.x - half_extent,
    center.y - half_extent,
    center.z - half_extent,
  )
  let hi = Vec3::new(
    center.x + half_extent,
    center.y + half_extent,
    center.z + half_extent,
  )
  guard lo.finite() && hi.finite() && lo.x < hi.x && lo.y < hi.y && lo.z < hi.z else {
    raise InvalidRoot
  }
  { center, half_extent, bounds: { min: lo, max: hi, }, }
}

///|
/// Ray positions are origin + t * direction, for the finite closed parameter interval.
/// Direction need not be normalized; only a unit direction makes t a distance.
pub struct Ray {
  origin : Vec3
  direction : Vec3
  t_min : Double
  t_max : Double
} derive(Debug, Eq)

///|
pub fn Ray::new(
  origin : Vec3,
  direction : Vec3,
  t_min~ : Double,
  t_max~ : Double,
) -> Ray raise GeometryError {
  guard origin.finite() && direction.finite() else { raise NonFinite("ray") }
  guard direction.x != 0.0 || direction.y != 0.0 || direction.z != 0.0 else {
    raise ZeroDirection
  }
  guard finite(t_min) && finite(t_max) && t_min >= 0.0 && t_min <= t_max else {
    raise InvalidInterval
  }
  { origin, direction, t_min, t_max, }
}

///|
pub extend Vec3 with @debug.Debug::{to_repr}

///|
pub extend Vec3 with Eq::{equal, not_equal}

///|
pub extend GeometryError with @debug.Debug::{to_repr}

///|
pub extend GeometryError with Eq::{equal, not_equal}

///|
pub extend Aabb with @debug.Debug::{to_repr}

///|
pub extend Aabb with Eq::{equal, not_equal}

///|
pub extend Cube with @debug.Debug::{to_repr}

///|
pub extend Cube with Eq::{equal, not_equal}

///|
pub extend Ray with @debug.Debug::{to_repr}

///|
pub extend Ray with Eq::{equal, not_equal}
