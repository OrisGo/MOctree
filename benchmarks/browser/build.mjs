import { execFileSync } from 'node:child_process';
import { root } from './server.mjs';
for(const args of [
  ['build','adapters/linear','--target','wasm','--release'],
  ['build','adapters/prototype','--target','wasm','--release'],
  ['build','adapters/prototype','--target','wasm-gc','--release'],
  ['--target-dir','_build/profile','build','adapters/linear','--target','wasm','--release','--no-strip'],
  ['-C','benchmarks/profile','build','--target','js','--release'],
  ['-C','benchmarks/strtree','build','--target','wasm','--release'],
])execFileSync('moon',args,{cwd:root,stdio:'inherit'});
