///|
test "render sampled counts through pinned moonflame" {
  assert_eq(version(), "0.2.0")
  let svg = render("root;query 3\nroot;copy 1\n")
  assert_true(svg.contains("<svg"))
  assert_true(svg.contains("data-name=\"query\""))
  assert_true(svg.contains("<script"))
  let report = hotspots("root;query 3\nroot;copy 1\n")
  assert_true(report.contains("75.0%"))
  assert_true(report.contains("query"))
}
