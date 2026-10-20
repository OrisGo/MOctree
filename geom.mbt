///|
/// A point in 3D space, stored as IEEE-754 double precision.
pub struct Vec3 {
  x : Double
  y : Double
  z : Double
}

///|
pub fn Vec3::new(x : Double, y : Double, z : Double) -> Vec3 {
  { x, y, z, }
}

///|
pub fn Vec3::origin() -> Vec3 {
  { x: 0.0, y: 0.0, z: 0.0, }
}
