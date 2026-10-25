// Rotate within a cycle, then shift the first backend for every complete cycle.
// Thus batch identity never fixes invocation order, even for 2 backends / 8 batches.
export function measurementStep(step, batchCount, names, phase=0) {
  const batch=step%batchCount,cycle=Math.floor(step/batchCount);
  const first=(batch+cycle+phase)%names.length;
  return {batch,backends:names.map((_,k)=>names[(first+k)%names.length])};
}
