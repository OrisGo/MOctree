export const SEED = 20261025;
export function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

export function dataset(count, distribution = 'uniform') {
  const rand = random(SEED);
  const ids = new Uint32Array(count);
  const bounds = new Float64Array(count * 6);
  for (let i = 0; i < count; i++) {
    ids[i] = i === 1 ? 0xffffffff : i;
    for (let k = 0; k < 3; k++) {
      let lo = rand() * 180 - 90;
      let size = rand() * 2;
      if (distribution === 'cluster') lo = lo * 0.05 + (i % 2 ? 40 : -40);
      if (distribution === 'overlap') { lo = -50; size = 100; }
      bounds[i * 6 + k] = lo;
      bounds[i * 6 + k + 3] = lo + size;
    }
  }
  return { ids, bounds, root: new Float64Array([0, 0, 0, 100]), maxObjects: count, maxNodes: count * 2 + 1 };
}

export function workload(name, batchSize = 8, capacity = 64) {
  const kind = name === 'ray' ? 'ray' : 'aabb';
  const stride = kind === 'ray' ? 8 : 6;
  const coordinates = new Float64Array(batchSize * stride);
  const ranges = new Int32Array(batchSize * 2);
  for (let i = 0; i < batchSize; i++) {
    const c = i % 2 ? 40 : -40;
    const q = name === 'broad' ? [-100,-100,-100,100,100,100] : kind === 'ray'
      ? [-100,c + i / 10,c,1,0,0,0,200]
      : [c-5,c-5,c-5,c+5,c+5,c+5];
    coordinates.set(q, i * stride);
    ranges.set([i * capacity, capacity], i * 2);
  }
  return { kind, coordinates, ranges, outputCapacity: batchSize * capacity, batchSize, capacity, name };
}

// Independent oracle for the bounded, moderate finite benchmark inputs.
// Extreme floating-point validation is covered by the core tests, not this oracle.
export function hit(bounds, p, kind, q, offset) {
  if (kind === 'aabb') {
    for (let k=0;k<3;k++) if (bounds[p+k] > q[offset+k+3] || bounds[p+k+3] < q[offset+k]) return false;
    return true;
  }
  let low=q[offset+6], high=q[offset+7];
  for (let k=0;k<3;k++) {
    const origin=q[offset+k], direction=q[offset+k+3];
    if (direction === 0) { if (origin < bounds[p+k] || origin > bounds[p+k+3]) return false; }
    else {
      const a=(bounds[p+k]-origin)/direction, b=(bounds[p+k+3]-origin)/direction;
      low=Math.max(low,Math.min(a,b)); high=Math.min(high,Math.max(a,b));
      if (low > high) return false;
    }
  }
  return true;
}

export function scan(data, job, complete = false) {
  const { kind, coordinates, ranges, outputCapacity, batchSize } = job;
  const ids = new Uint32Array(outputCapacity);
  const reports = [], hits = [];
  const stride = kind === 'aabb' ? 6 : 8;
  for (let j=0;j<batchSize;j++) {
    let totalHits=0, written=0;
    const matched = complete ? new Set() : null;
    for (let i=0;i<data.ids.length;i++) if (hit(data.bounds,i*6,kind,coordinates,j*stride)) {
      totalHits++;
      if (matched) matched.add(data.ids[i]);
      if (written < ranges[j*2+1]) ids[ranges[j*2]+written++] = data.ids[i];
    }
    reports.push({ status: totalHits > written ? 1 : 0, written, totalHits,
      visitedNodes: 0, testedObjects: data.ids.length });
    if (matched) hits.push(matched);
  }
  return { ids, reports, ...(complete ? { hits } : {}) };
}

export function verify(actual, oracle, job) {
  if (actual.reports.length !== oracle.reports.length) throw new Error('report length mismatch');
  actual.reports.forEach((r,i) => {
    const e = oracle.reports[i];
    for (const key of ['totalHits','written','status']) if (r[key] !== e[key]) throw new Error(`oracle ${key} mismatch`);
    const found = actual.ids.slice(job.ranges[i*2], job.ranges[i*2]+r.written);
    if (new Set(found).size !== found.length || !found.every(id => oracle.hits[i].has(id)))
      throw new Error('oracle ID mismatch');
  });
}

export function summary(samples) {
  const sorted = [...samples].sort((a,b)=>a-b);
  const at = p => sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];
  return { samples: samples.length, min: sorted[0], p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) };
}
