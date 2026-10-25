///|
// Same borrowed numeric payload convention as adapters/linear/transport.mbt.
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
