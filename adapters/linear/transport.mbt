///|
// These borrowed payload pointers are private to the matched wasm/JS adapter.
// No object headers or reference counts are read or changed by the host.
// Like core/env's wasm random_get binding, this uses an unsafe FFI escape hatch.
// Numeric array payloads are verified by integration tests in debug and release;
// this compiler-dependent representation is NOT the public application ABI.
#unsafe_skip_stub_check
#borrow(data)
fn input_f64(slot : Int32, data : FixedArray[Double], length : Int32) -> Unit = "octree_v1" "input_f64"

///|
#unsafe_skip_stub_check
#borrow(data)
fn input_u32(slot : Int32, data : FixedArray[UInt32], length : Int32) -> Unit = "octree_v1" "input_u32"

///|
#unsafe_skip_stub_check
#borrow(data)
fn input_i32(slot : Int32, data : FixedArray[Int32], length : Int32) -> Unit = "octree_v1" "input_i32"

///|
#unsafe_skip_stub_check
#borrow(data)
fn output_u32(data : FixedArray[UInt32], length : Int32) -> Unit = "octree_v1" "output_u32"

///|
#unsafe_skip_stub_check
#borrow(data)
fn output_i32(data : FixedArray[Int32], length : Int32) -> Unit = "octree_v1" "output_i32"

///|
#unsafe_skip_stub_check
#borrow(message)
fn failure(
  code : Int32,
  a : Int32,
  b : Int32,
  message : Bytes,
  length : Int32,
) -> Unit = "octree_v1" "failure"

///|
fn fail(code : Int32, a : Int32, b : Int32, message : String) -> Int32 {
  let bytes = @utf8.encode(message)
  failure(code, a, b, bytes, bytes.length())
  code
}

///|
fn geometry_code(error : @geom.GeometryError) -> Int32 {
  match error {
    @geom.GeometryError::NonFinite(_) => 10
    @geom.GeometryError::InvertedBounds => 11
    @geom.GeometryError::InvalidRoot => 12
    @geom.GeometryError::ZeroDirection => 13
    @geom.GeometryError::InvalidInterval => 14
  }
}

///|
fn geometry_message(error : @geom.GeometryError) -> String {
  match error {
    @geom.GeometryError::NonFinite(domain) => domain
    _ => ""
  }
}

///|
fn vec(data : FixedArray[Double], offset : Int32) -> @geom.Vec3 {
  @geom.Vec3::new(data[offset], data[offset + 1], data[offset + 2])
}
