import {readFile} from 'node:fs/promises';
import {createLinear} from '../../adapters/linear/client.mjs';
import {dataset,scan,verify} from './data.mjs';
import {jobs,scenarios} from './layout-data.mjs';
const clients=await Promise.all(['_build/browser-results/layout-before.wasm','_build/wasm/release/build/adapters/linear/linear.wasm'].map(async p=>createLinear(await readFile(p))));
let checks=0;
try {
  for(const distribution of ['uniform','cluster','overlap'])for(const budget of [1,9,515]) {
    const data=dataset(257,distribution);data.maxNodes=budget;
    for(const c of clients)c.build(data);
    for(const scenario of scenarios)for(const base of jobs(scenario,257)) {
      const oracle=scan(data,base,true);
      // Different exact capacities per query, including nonzero output offsets.
      for(const capacity of [0,1,64,'exact','extra']) {
        const job={...base,ranges:new Int32Array(16)};let offset=1;
        oracle.reports.forEach((r,i)=>{const n=capacity==='exact'?r.totalHits:capacity==='extra'?r.totalHits+1:capacity;job.ranges.set([offset,n],2*i);offset+=n+1;});
        job.outputCapacity=offset;
        const expected=scan(data,job,true);
        const actual=clients.map(c=>c.query(job.kind,job.coordinates,job.ranges,job.outputCapacity));
        for(const r of actual)verify(r,expected,job);
        if(JSON.stringify(actual[0].reports)!==JSON.stringify(actual[1].reports)||actual[0].ids.some((id,i)=>id!==actual[1].ids[i]))throw Error('layout changed traversal results/statistics');
        checks++;
      }
    }
  }
} finally {for(const c of clients)c.release();}
console.log(`PASS ${checks} paired independent-oracle checks (budgets, moving/selection/ray, capacities)`);
