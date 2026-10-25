import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {summary} from './data.mjs';
import {pointJobs} from './points-data.mjs';
import {measurementStep} from './layout-schedule.mjs';
const files=process.argv.slice(2);
if(files.length!==6)throw Error('pass six parts from two full rounds');
const hash=b=>createHash('sha256').update(b).digest('hex'),rounds=new Map();let provenance,workloads,rows=0;
for(const file of files){
  const r=JSON.parse(await readFile(file));
  if(r.schema!=='walkzzz-points-v1'||r.rows.length!==108||r.options.samples!==96||!r.uiPassed)throw Error('incomplete run');
  const part=rounds.get(r.startedAt)||[];part.push(r.archiveSize);rounds.set(r.startedAt,part);
  const source=JSON.stringify([r.modules,r.sourceSha256,r.dependency]);if(provenance&&source!==provenance)throw Error('provenance mismatch');provenance=source;
  const coordinates=JSON.stringify(r.workloads);if(workloads&&coordinates!==workloads)throw Error('Chrome query coordinates changed');workloads=coordinates;
  for(const [p,h] of Object.entries(r.sourceSha256))if(hash(await readFile(p))!==h)throw Error('source '+p);
  for(const [p,h] of Object.entries(r.dependency.sourceSha256))if(hash(await readFile('benchmarks/walkzzz/.mooncakes/walkzzz/moon-geometry/'+p))!==h)throw Error('dependency '+p);
  const seen=Array.from({length:8},()=>Object.fromEntries(['moctree','octree','loose'].map(n=>[n,[0,0,0]])));
  r.schedules.forEach((s,i)=>{if(JSON.stringify(s)!==JSON.stringify(measurementStep(i,8,['moctree','octree','loose'],r.options.phase)))throw Error('schedule');s.backends.forEach((n,j)=>seen[s.batch][n][j]++);});
  for(const b of seen)for(const p of Object.values(b))if(p.some(n=>n!==4))throw Error('unbalanced');
  // Node and Chrome may differ by a few ulps in sin/cos. Archived Chrome
  // coordinates are authoritative; this checks reconstruction within 1e-12.
  for(const [s,q] of Object.entries(r.workloads)){
    const expected=pointJobs(s);
    if(q.length!==expected.length||q.some((batch,i)=>batch.length!==expected[i].length||batch.some((x,j)=>Math.abs(x-expected[i][j])>1e-12)))throw Error('workload mismatch');
  }
  for(const x of r.rows){
    if(x.count!==r.archiveSize||x.rawMs.length!==96||JSON.stringify(summary(x.rawMs))!==JSON.stringify(x.batchMs))throw Error('quantiles');
    const b=r.rows.find(y=>y.backend==='moctree'&&y.distribution===x.distribution&&y.scenario===x.scenario&&y.mode===x.mode);
    if(JSON.stringify(x.perBatch.map(a=>a.map(v=>[v.total,v.written])))!==JSON.stringify(b.perBatch.map(a=>a.map(v=>[v.total,v.written]))))throw Error('counts mismatch');
    rows++;
  }
}
if(rounds.size!==2)throw Error('two rounds required');
for(const parts of rounds.values())if(parts.sort((a,b)=>a-b).join()!=='1000,10000,100000')throw Error('missing sizes');
const modules=JSON.parse(provenance)[0];
for(const [n,p] of Object.entries({moctree:'_build/wasm/release/build/benchmarks/pointbridge/pointbridge.wasm',walkzzz:'benchmarks/walkzzz/_build/wasm/release/build/walkzzz-benchmark.wasm'}))if(hash(await readFile(p))!==modules[n].sha256)throw Error('module mismatch');
console.log(`PASS ${rows} rows: source/dependency/module hashes, quantiles, paired counts, query coordinates, balanced schedules`);
