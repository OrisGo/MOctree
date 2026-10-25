import {random, SEED, workload} from './data.mjs';

// Synthetic browser-like AABB workloads, not exact picking or frustum culling.
// The path has 64 consecutive frames; selection boxes vary position and extent.
export const parameters = {
  seed: SEED + 17, batches: 8, batchSize: 8,
  path: 'center=(65*sin(t),55*sin(2*t+0.3),60*cos(t)); t=2*pi*frame/64',
  viewportHalfExtents: [6, 28, 75], selectionHalfExtents: [3, 24, 70],
  selectionCenters: 'independent uniform [-80,80), per-axis half extent = scale*(0.7+0.6*random)',
  note: 'size labels are geometric scales, not measured hit-rate classes; identical overlap boxes only permit 0% or 100% per query',
};
export const scenarios = ['viewport-small','viewport-medium','viewport-large',
  'selection-small','selection-medium','selection-large','broad','ray'];
export function jobs(scenario, capacity) {
  const rand=random(parameters.seed);
  return Array.from({length:parameters.batches},(_,batch)=>{
    const job=workload(scenario,8,capacity);
    for(let i=0;i<8;i++) {
      const frame=batch*8+i,t=2*Math.PI*frame/64;
      if(scenario.startsWith('viewport')||scenario.startsWith('selection')) {
        const level=['small','medium','large'].indexOf(scenario.split('-')[1]);
        const moving=scenario.startsWith('viewport');
        const c=moving?[65*Math.sin(t),55*Math.sin(2*t+0.3),60*Math.cos(t)]:Array.from({length:3},()=>160*rand()-80);
        const h=moving?Array(3).fill(parameters.viewportHalfExtents[level]):Array.from({length:3},()=>parameters.selectionHalfExtents[level]*(0.7+0.6*rand()));
        job.coordinates.set([...c.map((v,k)=>v-h[k]),...c.map((v,k)=>v+h[k])],i*6);
      } else if(scenario==='ray') {
        job.coordinates.set([-100,65*Math.sin(t),60*Math.cos(t),1,0.15*Math.sin(t),0,0,200],i*8);
      }
    }
    return job;
  });
}
