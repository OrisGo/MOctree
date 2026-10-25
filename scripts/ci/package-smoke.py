"""Inspect the actual archive and compile consumers only against its extracted files."""
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[2]


def run(*args, cwd=root):
    subprocess.run(args, cwd=cwd, check=True)


manifest = (root / "moon.mod").read_text()
name = re.search(r'^name\s*=\s*"([^"]+)"', manifest, re.M)[1]
version = re.search(r'^version\s*=\s*"([^"]+)"', manifest, re.M)[1]
if name != "orisgo/octree":
    raise SystemExit("Unexpected module name")
run("moon", "package", "--list")
archive = root / "_build/publish" / (name.replace("/", "-") + "-" + version + ".zip")
with zipfile.ZipFile(archive) as bundle, tempfile.TemporaryDirectory(prefix="moctree-package-") as scratch:
    members = set(bundle.namelist())
    required = {"moon.mod", "moon.pkg", "LICENSE", "docs/package-readme.md", "docs/api.md", "api.mbt",
                "pkg.generated.mbti", "geom/moon.pkg", "objects/moon.pkg", "adapters/linear/client.mjs",
                "adapters/linear/bridge.mbt", "adapters/prototype/client.mjs"}
    if missing := required - members:
        raise SystemExit(f"Missing distribution files: {sorted(missing)}")
    for member in members:
        path = PurePosixPath(member)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"Invalid archive path: {member}")
        allowed = (len(path.parts) == 1 and (member.endswith((".mbt", ".mbti")) or member in {"moon.mod", "moon.pkg", "LICENSE"}))
        allowed |= path.parts[0] in {"geom", "objects"} and path.suffix in {".mbt", ".mbti", ".pkg"}
        allowed |= len(path.parts) == 3 and path.parts[:2] in [("adapters", "linear"), ("adapters", "prototype")] and (path.suffix in {".mbt", ".mbti", ".pkg"} or path.name == "client.mjs")
        allowed |= member in {"docs/api.md", "docs/package-readme.md"}
        if not allowed:
            raise SystemExit(f"Unexpected distribution file: {member}")
    work = Path(scratch)
    package = work / "package"
    bundle.extractall(package)
    consumer = work / "consumer"
    consumer.mkdir()
    (consumer / "moon.mod").write_text(f'name = "ci/consumer"\nversion = "0.1.0"\nimport {{ "{name}@{version}", }}\n')
    (consumer / "moon.pkg").write_text('import { "orisgo/octree" @octree, } for "test"\n')
    (consumer / "smoke_test.mbt").write_text('''///|
test "packaged facade and bounded results" {
  let root = @octree.Cube::new(@octree.Vec3::origin(), 10.0)
  let box = @octree.Aabb::new(@octree.Vec3::origin(), @octree.Vec3::new(1.0, 1.0, 1.0))
  let index = @octree.StaticObjectIndex::build(
    [@octree.Entry::new(4294967295U, box)], root~, max_objects=1, max_nodes=1,
  )
  let output = FixedArray::make(1, 0U)
  let r = index.query_aabb_into(box, output, index.workspace())
  assert_eq(r.total_hits, 1)
  assert_eq(output[0], 4294967295U)
  assert_eq(r.completeness, @octree.Completeness::Complete)
  let truncated = index.query_aabb_into(box, output, index.workspace(), capacity=0)
  assert_eq(truncated.total_hits, 1)
  assert_eq(truncated.completeness, @octree.Completeness::Truncated)
}
''')
    run("moon", "work", "init", "package", "consumer", cwd=work)
    for target in ("wasm", "wasm-gc"):
        run("moon", "-C", str(consumer), "test", "--target", target, cwd=work)
    run("moon", "-C", str(package), "build", "adapters/linear", "--target", "wasm", "--release", cwd=work)
    wasm = list(work.rglob("linear.wasm"))
    if len(wasm) != 1:
        raise SystemExit(f"Expected one freshly built linear module, found {len(wasm)}")
    smoke = work / "smoke.mjs"
    smoke.write_text('''import {readFile} from 'node:fs/promises';
import {createLinear} from './package/adapters/linear/client.mjs';
const c=await createLinear(await readFile(process.argv[2]));
try {
  c.build({ids:new Uint32Array([0xffffffff]),bounds:new Float64Array([0,0,0,1,1,1]),root:new Float64Array([0,0,0,10]),maxObjects:1,maxNodes:1});
  const r=c.query('aabb',new Float64Array([1,1,1,1,1,1]),new Int32Array([0,1]),1);
  if(r.ids[0]!==0xffffffff||r.reports[0].totalHits!==1||r.reports[0].status!==0)throw Error('packaged adapter mismatch');
} finally {c.release();}
console.log('Packaged JS/WASM consumer passed');
''')
    run("node", str(smoke), str(wasm[0]), cwd=work)
print(f"Distribution allowlist and isolated consumers passed: {archive}")
