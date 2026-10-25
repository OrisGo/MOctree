import assert from 'node:assert/strict';
import {measurementStep} from './layout-schedule.mjs';
for(const names of [['before','after'],['before','after','strtree']])for(const phase of [0,1]){
  const seen=Array.from({length:8},()=>Object.fromEntries(names.map(n=>[n,Array(names.length).fill(0)])));
  for(let i=0;i<8*names.length*8;i++){
    const step=measurementStep(i,8,names,phase);
    assert.equal(step.batch,i%8);
    assert.equal(new Set(step.backends).size,names.length);
    step.backends.forEach((name,position)=>seen[step.batch][name][position]++);
  }
  for(const batch of seen)for(const counts of Object.values(batch))assert.deepEqual(counts,Array(names.length).fill(8));
}
for(let batch=0;batch<8;batch++)assert.deepEqual(measurementStep(batch,8,['before','after']).backends,measurementStep(batch+8,8,['before','after']).backends.toReversed());
console.log('PASS each batch sees each invocation position equally; ray order reverses every eight batches');
