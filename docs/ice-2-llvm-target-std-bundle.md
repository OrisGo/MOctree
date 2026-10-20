<!--
  Thank you for finding an Internal Compiler Error!

  If possible, please try to find a minimal reproducing example, so that it
  could be simpler for us to pinpoint the issue.
-->

`moon build --target llvm` ICEs on **every** package, even an empty one. The
cause is a name mismatch between the target and the prebuilt standard-library
bundle shipped with the toolchain: the native bundle directory is named
`native`, but `moonc` is handed `-std-path ...\lib\core\_build\llvm\release\bundle`.

Evidence from the installed toolchain:

```
lib\core\_build\                                       -> [js, wasm, native, wasm-gc, ...]   (no "llvm")
lib\core\_build\native\release\bundle\prelude\prelude.mi   exists = true
lib\core\_build\native\release\bundle\abort\abort.mi       exists = true
lib\core\_build\llvm\release\bundle\prelude\prelude.mi     exists = false
lib\core\_build\llvm\release\bundle\abort\abort.mi         exists = false
```

`moonc` therefore fails to open the first `.mi` under `-std-path` and aborts
with an uncaught `Sys_error`, which is reported as an ICE.

### Reproducing steps

1. Any MoonBit project containing a `main.mbt` (the body does not matter).
2. Run `moon build --target llvm` (also reproduces with `moon check --target llvm`
   and `moon run --target llvm`).

### Expected behaviour

- `--target llvm` should resolve to `_build\native\release\bundle` (or the
  toolchain should also ship an `llvm` bundle directory / alias).
- If the std bundle for the requested target is not installed, emit a clear
  diagnostic such as *"std bundle for target `llvm` is not installed; use
  `--target native` or build core first"* instead of an ICE.

### Code

- Target: native/llvm

```moonbit
fn main {
  println("hello")
}
```

### Environment

- OS: Windows
- OS distribution and/or version: Windows 11 24H2, build **10.0.26100.9441**
- CPU Architecture: x86_64

<!--
  `moon version --all` could not be executed in the environment where this was
  found (the harness does not allow spawning processes), so the versions below
  were read directly from the toolchain files and the build log.
-->

```
moonc version:            v0.10.14+7d59c7ec9
moonbitlang/core:         0.10.14+7d59c7ec9   (lib/core/moon.mod)
toolchain bundle version: 0.10.14+7d59c7ec9   (.openseek-moonbit-bundle-version)
toolchain root:           ...\toolchains\moonbit\windows-x64
bin:                      moon.exe, moonc.exe, moonfmt.exe, moonrun.exe, moon-ide.exe, ...
```

### Error output

```
Oops, the compiler has encountered an unexpected situation.
This is a bug in the compiler.

A bug report containing the error description and relevant code would be
greatly appreciated. You can submit the bug report here:

  https://github.com/moonbitlang/moonbit-docs/issues/new?template=ice.md

Error: Sys_error("C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\lib\\core\\_build\\llvm\\release\\bundle\\abort\\abort.mi: No such file or directory")

Compiler args: "C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\bin\\moonc.exe" build-package -error-format json "C:\\Users\\18134\\AppData\\Local\\Temp\\openseek-jobs-.19892.ca62631e\\snippet-01a13688-e075-77c5-bd14-3b8d24826a02\\build\\snippet.mbtx" -ignore-import-declaration -w -a+partial_match@partial_match+multiline_string_escape@multiline_string_escape+invalid_inline_wasm@invalid_inline_wasm+unannotated_ffi@unannotated_ffi -o "C:\\Users\\18134\\AppData\\Local\\Temp\\openseek-jobs-.19892.ca62631e\\snippet-01a13688-e075-77c5-bd14-3b8d24826a02\\build\\_build\\snippet.mbtx\\llvm\\debug\\build\\single\\single.core" -pkg moon/test/single -pkg-type executable -std-path "C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\lib\\core\\_build\\llvm\\release\\bundle" -i "...\\_build\\llvm\\release\\bundle\\abort\\abort.mi:abort" -i "...\\argparse\\argparse.mi:argparse" -i "...\\array\\array.mi:array" -i "...\\encoding/ascii\\ascii.mi:ascii" -i "...\\encoding/base64\\base64.mi:base64" -i "...\\bench\\bench.mi:bench" -i "...\\bigint\\bigint.mi:bigint" -i "...\\bool\\bool.mi:bool" -i "...\\buffer\\buffer.mi:buffer" -i "...\\builtin\\builtin.mi:builtin" -i "...\\byte\\byte.mi:byte" -i "...\\bytes\\bytes.mi:bytes" -i "...\\char\\char.mi:char" -i "...\\cmp\\cmp.mi:cmp" -i "...\\coverage\\coverage.mi:coverage" -i "...\\debug\\debug.mi:debug" -i "...\\deque\\deque.mi:deque" -i "...\\diff\\diff.mi:diff" -i "...\\double\\double.mi:double" -i "...\\env\\env.mi:env" -i "...\\error\\error.mi:error" -i "...\\float\\float.mi:float" -i "...\\hashmap\\hashmap.mi:hashmap" -i "...\\hashset\\hashset.mi:hashset" -i "...\\encoding/hex\\hex.mi:hex" -i "...\\immut/hashmap\\hashmap.mi:immut/hashmap" -i "...\\immut/hashset\\hashset.mi:immut/hashset" -i "...\\immut/priority_queue\\priority_queue.mi:immut/priority_queue" -i "...\\immut/sorted_map\\sorted_map.mi:immut/sorted_map" -i "...\\immut/sorted_set\\sorted_set.mi:immut/sorted_set" -i "...\\immut/vector\\vector.mi:immut/vector" -i "...\\immut/vector_map\\vector_map.mi:immut/vector_map" -i "...\\int\\int.mi:int" -i "...\\int16\\int16.mi:int16" -i "...\\int64\\int64.mi:int64" -i "...\\json\\json.mi:json" -i "...\\lazy\\lazy.mi:lazy" -i "...\\lazy_list\\lazy_list.mi:lazy_list" -i "...\\lexbuf\\lexbuf.mi:lexbuf" -i "...\\list\\list.mi:list" -i "...\\math\\math.mi:math" -i "...\\option\\option.mi:option" -i "...\\encoding/percent\\percent.mi:percent" -i "...\\prelude\\prelude.mi:prelude" -i "...\\priority_queue\\priority_queue.mi:priority_queue" -i "...\\queue\\queue.mi:queue" -i "...\\quickcheck\\quickcheck.mi:quickcheck" -i "...\\random\\random.mi:random" -i "...\\range\\range.mi:range" -i "...\\ref\\ref.mi:ref" -i "...\\result\\result.mi:result" -i "...\\set\\set.mi:set" -i "...\\quickcheck/shrink\\shrink.mi:shrink" -i "...\\sorted_map\\sorted_map.mi:sorted_map" -i "...\\sorted_set\\sorted_set.mi:sorted_set" -i "...\\quickcheck/splitmix\\splitmix.mi:splitmix" -i "...\\strconv\\strconv.mi:strconv" -i "...\\string\\string.mi:string" -i "...\\test\\test.mi:test" -i "...\\tuple\\tuple.mi:tuple" -i "...\\uint\\uint.mi:uint" -i "...\\uint16\\uint16.mi:uint16" -i "...\\uint64\\uint64.mi:uint64" -i "...\\unit\\unit.mi:unit" -i "...\\encoding/utf16\\utf16.mi:utf16" -i "...\\encoding/utf8\\utf8.mi:utf8" -i "...\\v128\\v128.mi:v128" -pkg-sources "moon/test/single:C:\\Users\\18134\\AppData\\Local\\Temp\\openseek-jobs-.19892.ca62631e\\snippet-01a13688-e075-77c5-bd14-3b8d24826a02\\build" -target llvm -g -O0 -workspace-path "C:\\Users\\18134\\AppData\\Local\\Temp\\openseek-jobs-.19892.ca62631e\\snippet-01a13688-e075-77c5-bd14-3b8d24826a02\\build" -all-pkgs "C:\\Users\\18134\\AppData\\Local\\Temp\\openseek-jobs-.19892.ca62631e\\snippet-01a13688-e075-77c5-bd14-3b8d24826a02\\build\\_build\\snippet.mbtx\\llvm\\debug\\build\\all_pkgs.json"

moonc version: v0.10.14+7d59c7ec9
```

<!--
  Note: the `-i "..."` paths above are abbreviated for readability; every one of
  them begins with
    C:\Users\18134\AppData\Local\SeekMoon\toolchains\moonbit\windows-x64\lib\core\_build\llvm\release\bundle\
  i.e. they all point into the bundle directory that does not exist. The full,
  unabbreviated command line is available on request.
-->

### Additional data point (same root cause)

When the built package depends on `moonbitlang/async`, the first missing file
varies with the build order; the same ICE is then reported for e.g.

```
Error: Sys_error("C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\lib\\core\\_build\\llvm\\release\\bundle\\prelude\\prelude.mi: No such file or directory")
Error: Sys_error("C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\lib\\core\\_build\\llvm\\release\\bundle\\deque\\deque.mi: No such file or directory")
Error: Sys_error("C:\\Users\\18134\\AppData\\Local\\SeekMoon\\toolchains\\moonbit\\windows-x64\\lib\\core\\_build\\llvm\\release\\bundle\\prelude\\prelude.mi: No such file or directory")
```

All of them carry `moonc version: v0.10.14+7d59c7ec9` and the identical
`-std-path ...\lib\core\_build\llvm\release\bundle` argument.
