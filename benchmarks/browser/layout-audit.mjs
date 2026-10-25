import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {summary} from './data.mjs';
const paths=process.argv.slice(2);
if(paths.length!==6)throw Error('Pass the six archived JSON files from two complete rounds');
const hash=b=>createHash('sha256').update(b).digest('hex');
const rounds=new Map();let checked=0;
for(const path of paths){
  const d=JSON.parse(await readFile(path));
  if(d.rows.length!==207||d.options.samples!==100)throw Error('incomplete matrix');
  const group=rounds.get(d.startedAt)||[];group.push(d);rounds.set(d.startedAt,group);
  for(const [p,h] of Object.entries(d.sourceSha256)){
    const source=await readFile(p);
    if(hash(source)===h)continue;
    // These two display-only fixes followed measurement; verify the exact old source.
    const displayFiles=['benchmarks/browser/layout-run.mjs','benchmarks/browser/layout.html'];
    if(!displayFiles.includes(p)||hash(source.toString().replaceAll('textContent','textLayout'))!==h)
      throw Error(`source mismatch: ${p}`);
  }
  for(const r of d.rows){
    const expected=summary(r.rawMs);
    if(JSON.stringify(expected)!==JSON.stringify(r.batchMs))throw Error('quantile mismatch');
    if(r.rawMs.length!==100||r.perBatch.length!==8)throw Error('missing samples');
    const rate=r.perBatch.reduce((s,b)=>s+b.totalHits,0)/(r.count*64);
    if(rate!==r.actualHitRate)throw Error('hit rate mismatch');
    if(r.backend==='after'){
      const before=d.rows.find(b=>b.backend==='before'&&b.distribution===r.distribution&&b.scenario===r.scenario&&b.mode===r.mode);
      if(JSON.stringify(before.perBatch)!==JSON.stringify(r.perBatch))throw Error('work statistics changed');
    }
    checked++;
  }
}
if(rounds.size!==2)throw Error('requires two rounds');
const manifests=[];
for(const parts of rounds.values()){
  if(parts.map(d=>d.archiveSize).sort((a,b)=>a-b).join()!=='1000,10000,100000')throw Error('missing size');
  for(const d of parts)manifests.push(JSON.stringify([d.modules,d.sourceSha256,d.dependency]));
}
if(new Set(manifests).size!==1)throw Error('measurement provenance changed');
// Validate the final candidate and saved baseline modules too.
const manifest=[...rounds.values()][0][0].modules;
for(const [name,path] of Object.entries({before:'_build/browser-results/layout-before.wasm',after:'_build/wasm/release/build/adapters/linear/linear.wasm',strtree:'benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'})){
  if(hash(await readFile(path))!==manifest[name].sha256)throw Error(`module mismatch: ${name}`);
}
console.log(`PASS ${checked} rows: raw quantiles, hit rates, paired statistics, two-round source/dependency/module hashes`);
