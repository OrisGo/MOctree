import {readFile} from 'node:fs/promises';
import {factories,validate} from './compare.mjs';
const mode=process.argv[2]||'release';
const bytes={octree:await readFile(`_build/wasm/${mode}/build/adapters/linear/linear.wasm`),
  strtree:await readFile(`benchmarks/strtree/_build/wasm/${mode}/build/strtree-benchmark.wasm`)};
for(const [name,factory] of Object.entries(factories(bytes)))console.log(mode,name,await validate(factory));
