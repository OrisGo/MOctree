///|
#export_name("version")
pub fn version() -> String {
  @moonflame.version()
}

///|
#export_name("render")
pub fn render(text : String) -> String {
  let parsed = @moonflame.parse_folded(text)
  guard parsed.skipped_lines == 0 && !parsed.samples.is_empty() else {
    abort("invalid or empty folded profile")
  }
  let tree = try! @moonflame.aggregate(parsed.samples, max_depth=64)
  let layout = try! @moonflame.layout(tree, 1380.0, @moonflame.FRAME_HEIGHT)
  try! @moonflame.render_svg(layout, unit=@moonflame.Count)
}

///|
#export_name("hotspots")
pub fn hotspots(text : String) -> String {
  let parsed = @moonflame.parse_folded(text)
  guard parsed.skipped_lines == 0 && !parsed.samples.is_empty() else {
    abort("invalid or empty folded profile")
  }
  let tree = try! @moonflame.aggregate(parsed.samples, max_depth=64)
  let top = try! @moonflame.top_hotspots(tree, 20)
  @moonflame.render_hotspots(top, tree.total, @moonflame.Count)
}
