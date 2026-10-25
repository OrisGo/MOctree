import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {sampleBatches} from './sample-batches.mjs';
import {summary} from '../browser/data.mjs';

const row={scenario:'ray',perBatch:Array(8).fill({}),rawMs:Array(16).fill(0)};
const legacy={schema:'contiguous-layout-v1',options:{samples:16,warmups:20}};
assert.deepEqual(sampleBatches(legacy,row),[4,5,6,7,0,1,2,3,4,5,6,7,0,1,2,3]);
assert.deepEqual(sampleBatches({...legacy,options:{samples:16,warmups:0}},row),[0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7]);
const schedule=row.rawMs.map((_,i)=>({batch:i%8}));
for(const schema of ['contiguous-layout-v2','walkzzz-points-v1']){
  // A nonzero warmup remainder must not offset an explicit recorded schedule.
  const record={...legacy,schema,schedules:schema==='contiguous-layout-v2'?{ray:schedule}:schedule};
  assert.deepEqual(sampleBatches(record,row),schedule.map(x=>x.batch));
  assert.throws(()=>sampleBatches({...record,schedules:undefined},row),/schedule/);
}
assert.throws(()=>sampleBatches({...legacy,schema:'unknown'},row),/unsupported/);
assert.throws(()=>sampleBatches({...legacy,options:{samples:16,warmups:-1}},row),/warmup/);
assert.throws(()=>sampleBatches(legacy,{...row,rawMs:[0]}),/count/);
assert.throws(()=>sampleBatches({...legacy,schema:'walkzzz-points-v1',schedules:schedule.map(()=>({batch:8}))},row),/batch/);

let rows=0;
for(const file of await readdir('benchmarks/results')){
  if(!/-(layout|ray-order|points)-\d+-chrome\.json$/.test(file))continue;
  const record=JSON.parse(await readFile('benchmarks/results/'+file));
  for(const r of record.rows){
    const batches=sampleBatches(record,r);
    const offset=record.schema==='contiguous-layout-v1'?record.options.warmups:0;
    assert.deepEqual(batches,r.rawMs.map((_,i)=>(i+offset)%8));
    const sizes=Array.from({length:8},(_,b)=>batches.filter(i=>i===b).length);
    assert.equal(sizes.reduce((a,b)=>a+b,0),r.rawMs.length);
    assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
    rows++;
  }
}
const record=JSON.parse(await readFile('benchmarks/results/2026-10-25T13-15-43-500Z-layout-100000-chrome.json'));
const measured=record.rows.find(r=>r.backend==='after'&&r.distribution==='cluster'&&r.scenario==='selection-medium'&&r.mode==='count');
const batches=sampleBatches(record,measured);
const latency=b=>summary(measured.rawMs.filter((_,i)=>batches[i]===b)).p50;
assert.equal(measured.perBatch[0].totalHits,155170);
assert.equal(measured.perBatch[4].totalHits,0);
assert.ok(Math.abs(latency(0)-4.37)<1e-6);
assert.ok(Math.abs(latency(4)-0.01)<1e-6);
console.log(`PASS: three schemas, rejected invalid provenance, ${rows} archived rows, high-hit/empty-batch regression`);
