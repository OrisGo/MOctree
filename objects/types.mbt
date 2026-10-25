///|
/// One immutable object snapshot. IDs are unique within an index.
pub struct Entry {
  id : UInt32
  bounds : @geom.Aabb
} derive(Debug, Eq)

///|
pub fn Entry::new(id : UInt32, bounds : @geom.Aabb) -> Entry {
  { id, bounds, }
}

///|
pub(all) suberror BuildError {
  InvalidConfig(String)
  ObjectCapacityExceeded(limit~ : Int32, actual~ : Int32)
  DuplicateId(position~ : Int32, id~ : UInt32)
  OutsideRoot(position~ : Int32, id~ : UInt32)
} derive(Debug, Eq)

///|
pub(all) suberror QueryError {
  InvalidOutputRange
  InsufficientWorkspace(required~ : Int32, available~ : Int32)
  InvalidWorkspaceCapacity
  InvalidNode
  InvalidObjectOffset
} derive(Debug, Eq)

///|
priv struct Node {
  bounds : @geom.Aabb
  depth : Int32
  octant : Int32
  mut first_child : Int32
  mut child_count : Int32
  mut child_mask : UInt32
  mut start : Int32
  mut count : Int32
  mut subtree_count : Int32
}

///|
/// Read-only tree. Private arrays are never returned to callers.
pub struct StaticObjectIndex {
  priv entries : Array[Entry]
  priv nodes : Array[Node]
  priv summary : IndexStats
}

///|
pub struct IndexStats {
  object_count : Int32
  node_count : Int32
  depth : Int32
  max_objects : Int32
  max_nodes : Int32
  max_depth : Int32
  split_threshold : Int32
  object_capacity : Int32
  node_capacity : Int32
  order_capacity : Int32
  workspace_required : Int32
} derive(Debug, Eq)

///|
pub(all) enum Completeness {
  Complete
  Truncated
} derive(Debug, Eq)

///|
pub struct QueryStats {
  written : Int32
  total_hits : Int32
  completeness : Completeness
  visited_nodes : Int32
  tested_objects : Int32
} derive(Debug, Eq)

///|
/// Caller-owned reusable traversal memory. Do not share during an active query.
pub struct Workspace {
  priv stack : FixedArray[Int32]
}

///|
pub fn Workspace::new(capacity : Int32) -> Workspace raise QueryError {
  guard capacity >= 0 else { raise InvalidWorkspaceCapacity }
  { stack: FixedArray::make(capacity, 0), }
}

///|
pub fn Workspace::capacity(self : Workspace) -> Int32 {
  self.stack.length()
}

///|
pub fn StaticObjectIndex::workspace(self : StaticObjectIndex) -> Workspace {
  { stack: FixedArray::make(self.summary.workspace_required, 0), }
}

///|
pub fn StaticObjectIndex::stats(self : StaticObjectIndex) -> IndexStats {
  self.summary
}

///|
/// A read-only value snapshot, not a mutable node reference.
pub struct NodeInfo {
  id : Int32
  bounds : @geom.Aabb
  depth : Int32
  octant : Int32
  object_count : Int32
  child_mask : UInt32
} derive(Debug, Eq)

///|
pub extend Entry with @debug.Debug::{to_repr}

///|
pub extend Entry with Eq::{equal, not_equal}

///|
pub extend BuildError with @debug.Debug::{to_repr}

///|
pub extend BuildError with Eq::{equal, not_equal}

///|
pub extend QueryError with @debug.Debug::{to_repr}

///|
pub extend QueryError with Eq::{equal, not_equal}

///|
pub extend IndexStats with @debug.Debug::{to_repr}

///|
pub extend IndexStats with Eq::{equal, not_equal}

///|
pub extend Completeness with @debug.Debug::{to_repr}

///|
pub extend Completeness with Eq::{equal, not_equal}

///|
pub extend QueryStats with @debug.Debug::{to_repr}

///|
pub extend QueryStats with Eq::{equal, not_equal}

///|
pub extend NodeInfo with @debug.Debug::{to_repr}

///|
pub extend NodeInfo with Eq::{equal, not_equal}
