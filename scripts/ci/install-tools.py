"""Install verified CI tools into a NEW directory, never the user's ~/.moon."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile

if platform.system() != "Linux" or platform.machine() != "x86_64":
    raise SystemExit("CI installer supports Linux x86_64 only")
destination = Path(sys.argv[1]).resolve()
destination.mkdir(parents=True, exist_ok=False)
manifest = json.loads(Path(__file__).with_name("tools.json").read_text())
moon_home = destination / "moon"
bin_dir = destination / "bin"
moon_home.mkdir()
bin_dir.mkdir()
with tempfile.TemporaryDirectory(prefix="moctree-tools-") as scratch:
    for name, spec in manifest.items():
        archive = Path(scratch) / (name + ".tar.gz")
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                        "--retry", "3", spec["url"], "-o", str(archive)], check=True)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != spec["sha256"]:
            raise SystemExit(f"SHA-256 mismatch: {name}")
        target = moon_home if name == "moon" else moon_home / "lib" if name == "core" else Path(scratch) / name
        target.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive) as tar:
            tar.extractall(target, filter="data")
        if name in ("prek", "actionlint"):
            candidates = [p for p in target.rglob(name) if p.is_file()]
            if len(candidates) != 1:
                raise SystemExit(f"Ambiguous executable: {name}")
            shutil.copy2(candidates[0], bin_dir / name)
            (bin_dir / name).chmod(0o755)
moon_bin = moon_home / "bin"
for executable in moon_bin.rglob("*"):
    if executable.is_file():
        executable.chmod(executable.stat().st_mode | 0o111)
env = {**os.environ, "MOON_HOME": str(moon_home), "PATH": f"{moon_bin}:{bin_dir}:{os.environ['PATH']}"}
for target in ("wasm", "wasm-gc", "js"):
    subprocess.run([str(moon_bin / "moon"), "-C", str(moon_home / "lib/core"),
                    "bundle", "--target", target, "--warn-list", "-a"], env=env, check=True)
subprocess.run([str(moon_bin / "moon"), "--version"], env=env, check=True)
for name in ("prek", "actionlint"):
    subprocess.run([str(bin_dir / name), "--version"], check=True)
if os.environ.get("GITHUB_PATH"):
    with open(os.environ["GITHUB_PATH"], "a") as stream:
        stream.write(f"{moon_bin}\n{bin_dir}\n")
if os.environ.get("GITHUB_ENV"):
    with open(os.environ["GITHUB_ENV"], "a") as stream:
        stream.write(f"MOON_HOME={moon_home}\n")
print(f"Installed tools: {destination}")
