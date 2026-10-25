///|
fn info(id : Int32, node : Node) -> NodeInfo {
  {
    id,
    bounds: node.bounds,
    depth: node.depth,
    octant: node.octant,
    object_count: node.count,
    child_mask: node.child_mask,
  }
}

///|
pub fn StaticObjectIndex::node_info(
  self : StaticObjectIndex,
  id : Int32,
) -> NodeInfo raise QueryError {
  guard id >= 0 && id < self.nodes.length() else { raise InvalidNode }
  info(id, self.nodes[id])
}

///|
/// Read one ID belonging directly to a node, including objects kept at parents.
pub fn StaticObjectIndex::node_object_id(
  self : StaticObjectIndex,
  id : Int32,
  offset : Int32,
) -> UInt32 raise QueryError {
  guard id >= 0 && id < self.nodes.length() else { raise InvalidNode }
  let node = self.nodes[id]
  guard offset >= 0 && offset < node.count else { raise InvalidObjectOffset }
  self.entries[node.start + offset].id
}

///|
/// Preorder traversal in ascending octant order. Return false to stop.
/// The callback may query the index, but must not reuse this active workspace.
pub fn StaticObjectIndex::visit(
  self : StaticObjectIndex,
  workspace : Workspace,
  visitor : (NodeInfo) -> Bool,
) -> Unit raise QueryError {
  guard workspace.capacity() >= self.summary.workspace_required else {
    raise InsufficientWorkspace(
      required=self.summary.workspace_required,
      available=workspace.capacity(),
    )
  }
  workspace.stack[0] = 0
  let mut top = 1
  while top > 0 {
    top -= 1
    let id = workspace.stack[top]
    let node = self.nodes[id]
    if !visitor(info(id, node)) {
      return
    }
    for i = node.child_count - 1; i >= 0; i = i - 1 {
      workspace.stack[top] = node.first_child + i
      top += 1
    }
  }
}
