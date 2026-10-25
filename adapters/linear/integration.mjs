import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLinear, OctreeError } from './client.mjs';
import { createPrototype } from '../prototype/client.mjs';

const mode = process.argv[2] || 'debug';
assert.ok(['debug', 'release'].includes(mode));
const moduleBytes = (target, name) => readFile(new URL(
  `../../_build/${target}/${mode}/build/adapters/${name}/${name}.wasm`, import.meta.url));
const bytes = await moduleBytes('wasm', 'linear');
const prototypeBytes = await moduleBytes('wasm', 'prototype');
const gcBytes = await moduleBytes('wasm-gc', 'prototype');
const f64 = a => new Float64Array(a);
const i32 = a => new Int32Array(a);
const all = [-10, -10, -10, 10, 10, 10];
const config = {
  ids: new Uint32Array([0, 0xffffffff, 3]),
  bounds: f64([0,0,0,0,0,0, 1,1,1,2,2,2, -2,-2,-2,-1,-1,-1]),
  root: f64([0,0,0,10]), maxObjects: 3, maxNodes: 64,
};
const client = await createLinear(bytes);
const checkError = (fn, code, details) => assert.throws(fn, e => {
  assert.ok(e instanceof OctreeError);
  assert.equal(e.code, code);
  if (details) assert.deepEqual(e.details, details);
  return true;
});
const query = (q = all, range = [0,3], cap = 3) => client.query('aabb', f64(q), i32(range), cap);
checkError(() => query(), 'IndexNotBuilt');
client.build(config);
const saved = query([...all, ...all, 1,0,0,0,0,0], [0,3,3,1,4,1], 5);
assert.deepEqual([...saved.ids.slice(0,3)].sort((a,b) => a-b), [0,3,0xffffffff]);
assert.equal(saved.reports[0].status, 0);
assert.equal(saved.reports[1].status, 1);
assert.equal(saved.reports[1].totalHits, 3);
assert.deepEqual(saved.reports[2], { error: { code: 'InvertedBounds', status: 11 } });
const snapshot = structuredClone(saved);
checkError(() => query([...all,...all], [0,3,2,1]), 'OverlappingOutputRanges', { first: 0, second: 1 });
for (const range of [[-1,1], [0,-1], [1,0x7fffffff], [4,0]])
  checkError(() => query(all, range), 'InvalidOutputRange', { position: 0 });
checkError(() => query([1,0,0,0,0,0,...all], [0,2,1,1]), 'OverlappingOutputRanges');
assert.equal(query(all, [0,0], 0).reports[0].totalHits, 3);
assert.equal(query(all, [0,0], 0).reports[0].status, 1);
assert.equal(query([10,10,10,11,11,11], [0,0], 0).reports[0].status, 0);
assert.deepEqual(query([], [], 0), { ids: new Uint32Array(), reports: [] });
assert.equal(query([2,2,2,2,2,2], [0,1], 1).ids[0], 0xffffffff);
// Gaps, unsorted adjacent ranges, and zero capacity inside another range.
const gaps = query([...all, ...all, ...all], [4,3,1,3,2,0], 8);
assert.equal(gaps.reports[2].totalHits, 3);
assert.equal(gaps.ids[0], 0);
assert.equal(gaps.ids[7], 0);
checkError(() => client.build({ ...config, ids: new Uint32Array([0,0,3]) }), 'DuplicateId', { position: 1, id: 0 });
checkError(() => client.build({ ...config, ids: new Uint32Array([0xffffffff,0xffffffff,3]) }), 'DuplicateId', { position: 1, id: 0xffffffff });
checkError(() => client.build({ ...config, maxObjects: 2 }), 'ObjectCapacityExceeded', { limit: 2, actual: 3 });
checkError(() => client.build({ ...config, maxNodes: 0 }), 'InvalidConfig', { field: 'max_nodes' });
checkError(() => client.build({ ...config, root: f64([0,0,0,0.5]) }), 'OutsideRoot', { position: 1, id: 0xffffffff });
checkError(() => client.build({ ...config, root: f64([0,0,0,NaN]) }), 'InvalidRoot', { source: 'root' });
checkError(() => client.build({ ...config, bounds: f64([NaN,...config.bounds.slice(1)]) }), 'NonFinite',
  { source: 'object', position: 0, id: 0, domain: 'aabb' });
assert.equal(query().reports[0].totalHits, 3);
assert.deepEqual(saved, snapshot);

// Offset views must copy only their selected data, and inputs are snapshots.
const idsBacking = new Uint32Array([99, ...config.ids, 100]);
const boundsBacking = f64([123, ...config.bounds, 456]);
client.build({ ...config, ids: idsBacking.subarray(1,4), bounds: boundsBacking.subarray(1,19) });
idsBacking.fill(9); boundsBacking.fill(99);
assert.deepEqual(query().ids, saved.ids.slice(0,3));
const rays = client.query('ray', f64([
  -10,0,0,1,-0,0,0,20, 0,0,0,0,0,0,0,1,
  0,0,0,1,0,0,-1,1, 0,0,0,NaN,0,0,0,1,
]), i32([0,3,3,0,3,0,3,0]), 3);
assert.equal(rays.reports[0].totalHits, 1);
assert.equal(rays.ids[0], 0);
assert.deepEqual(rays.reports.slice(1), [
  { error: { code: 'ZeroDirection', status: 13 } },
  { error: { code: 'InvalidInterval', status: 14 } },
  { error: { code: 'NonFinite', status: 10, domain: 'ray' } },
]);
assert.deepEqual(query([Infinity,0,0,Infinity,0,0],[0,0],0).reports,
  [{ error: { code: 'NonFinite', status: 10, domain: 'aabb' } }]);
assert.equal(client.query('ray', f64([0,0,0,1,0,0,0,Infinity]), i32([0,0]), 0)
  .reports[0].error.code, 'InvalidInterval');

// JS validation, budgets and reentrancy happen before touching module state.
assert.throws(() => client.build({ ...config, ids: [1,2,3] }), TypeError);
assert.throws(() => client.build({ ...config, bounds: f64([]) }), RangeError);
assert.throws(() => client.build({ ...config, maxObjects: 0x80000000 }), RangeError);
assert.throws(() => client.query('point', f64([]), i32([]), 0), TypeError);
assert.throws(() => client.query('aabb', f64(all), i32([0]), 0), RangeError);
assert.throws(() => client.query('aabb', f64([]), i32([0,0]), 0), RangeError);
assert.throws(() => query(all, [0,0], 0x7fffffff), RangeError);
const detached = f64(all);
structuredClone(detached.buffer, { transfer: [detached.buffer] });
assert.throws(() => client.query('aabb', detached, i32([0,0]), 0), TypeError);
assert.throws(() => client.query('aabb', new Float64Array(new SharedArrayBuffer(48)), i32([0,0]), 0), TypeError);
assert.throws(() => client.query('aabb', new Float64Array(new ArrayBuffer(48, { maxByteLength: 96 })), i32([0,0]), 0), TypeError);
client.build({ ...config, get ids() {
  assert.throws(() => client.release(), /reentrant/);
  assert.throws(() => query(), /reentrant/);
  return config.ids;
} });
const limited = await createLinear(bytes, { maxTransferBytes: 32 });
assert.throws(() => limited.build(config), /maxTransferBytes/);
limited.build({ ...config, ids: new Uint32Array(), bounds: f64([]), maxObjects: 0 });
assert.throws(() => limited.query('aabb', f64(all), i32([0,0]), 0), /maxTransferBytes/);
limited.release();
const exactBudget = await createLinear(bytes, { maxTransferBytes: 32 + 3 * 52 });
exactBudget.build(config);
assert.equal(exactBudget.query('aabb', f64(all), i32([0,3]), 3).reports[0].totalHits, 3);
exactBudget.release();
await assert.rejects(createLinear(prototypeBytes), /ABI/);
await assert.rejects(createLinear(gcBytes), /ABI/);
await assert.rejects(createLinear(bytes, { maxTransferBytes: -1 }), RangeError);

// Independent JS predicates for moderate finite inputs, including exact boundaries.
const aabbHit = (b, q) => [0,1,2].every(k => b[k] <= q[k+3] && b[k+3] >= q[k]);
const rayHit = (b, r) => {
  let lo = r[6], hi = r[7];
  for (let k=0;k<3;k++) {
    if (r[k+3] === 0) { if (r[k] < b[k] || r[k] > b[k+3]) return false; }
    else {
      const a = (b[k]-r[k])/r[k+3], z = (b[k+3]-r[k])/r[k+3];
      lo = Math.max(lo,Math.min(a,z)); hi = Math.min(hi,Math.max(a,z));
      if (lo > hi) return false;
    }
  }
  return true;
};
let seed = 20261025;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed / 2**32; };
const baselines = [await createPrototype(prototypeBytes), await createPrototype(gcBytes)];
for (const distribution of ['random','cluster','plane','thin','giant','overlap','duplicate','point']) {
  const count = 128;
  const boxes = Array.from({length:count}, (_,i) => {
    let lo = Array.from({length:3}, () => random()*12-6);
    let size = Array.from({length:3}, () => random()*2);
    if (distribution === 'cluster') lo = lo.map(x => x*0.1+3);
    if (distribution === 'plane') { lo[2] = 0; size[2] = 0; }
    if (distribution === 'thin') size = [5,0.001,0.001];
    if (distribution === 'giant' && i%3 === 0) return [-9,-9,-9,9,9,9];
    if (distribution === 'overlap') return [-1,-1,-1,1,1,1];
    if (distribution === 'duplicate') return [2,2,2,3,3,3];
    if (distribution === 'point') size = [0,0,0];
    return [...lo,...lo.map((x,k) => Math.min(9,x+size[k]))];
  });
  const ids = new Uint32Array(Array.from({length:count},(_,i) => i === 1 ? 0xffffffff : i));
  for (const maxNodes of [1,9,256]) {
    const build = { ...config, ids, bounds: f64(boxes.flat()), maxObjects: count, maxNodes };
    client.build(build); baselines.forEach(c => c.build(build));
    for (const kind of ['aabb','ray']) {
      const qs = Array.from({length:24}, (_,i) => {
        if (kind === 'aabb') {
          if (i===0) return all;
          if (i===1) return [0,0,0,0,0,0];
          const p = Array.from({length:3}, () => random()*20-10);
          return [...p, ...p.map(x => x+random()*5)];
        }
        if (i===0) return [-10,0,0,1,0,-0,0,20];
        if (i===1) return [0,0,0,1,1,1,0,0];
        return [...Array.from({length:3}, () => random()*20-10),
          ...Array.from({length:3}, () => random()*2-1), 0, 20];
      });
      for (const capacity of [0,3,count]) {
        const ranges = i32(qs.flatMap((_,i) => [i*capacity,capacity]));
        const args = [kind, f64(qs.flat()), ranges, qs.length*capacity];
        const actual = client.query(...args);
        for (const baseline of baselines) assert.deepEqual(actual, baseline.query(...args));
        for (let i=0;i<qs.length;i++) {
          const expected = boxes.flatMap((b,j) => (kind === 'aabb' ? aabbHit(b,qs[i]) : rayHit(b,qs[i])) ? [ids[j]] : []);
          const report = actual.reports[i];
          assert.equal(report.totalHits, expected.length);
          assert.equal(report.written, Math.min(capacity, expected.length));
          assert.equal(report.status, expected.length > capacity ? 1 : 0);
          const found = [...actual.ids.slice(i*capacity,i*capacity+report.written)];
          assert.equal(new Set(found).size, found.length);
          assert.ok(found.every(id => expected.includes(id)));
          if (report.status === 0) assert.deepEqual(found.sort((a,b)=>a-b),expected.sort((a,b)=>a-b));
        }
      }
    }
  }
}
baselines.forEach(c => c.release());
assert.deepEqual(saved, snapshot);
// Exercise the actual wrapper across memory growth as well as the raw harness.
const largeIds = new Uint32Array(100000).map((_,i) => i);
client.build({ ...config, ids: largeIds, bounds: new Float64Array(600000), maxObjects: 100000, maxNodes: 1 });
const large = query(all, [0,100000], 100000);
assert.deepEqual(large.ids,largeIds);
assert.equal(large.reports[0].totalHits,100000);
client.build(config);
assert.equal(query().reports[0].totalHits,3);
assert.deepEqual(large.ids,largeIds);
assert.deepEqual(saved,snapshot);
const independent = await createLinear(bytes);
independent.build(config);
client.release(); client.release();
assert.throws(() => query(), /released/);
assert.throws(() => client.build(config), /released/);
assert.equal(independent.query('aabb', f64(all), i32([0,0]), 0).reports[0].totalHits, 3);
independent.build({ ...config, ids: new Uint32Array(), bounds: f64([]), maxObjects: 0 });
assert.equal(independent.query('aabb', f64(all), i32([0,0]), 0).reports[0].status, 0);
independent.release();

// Instrument the private wire protocol. Exercise real memory growth and ensure
// input/output crossings stay constant at 1K, 10K and 100K objects.
let api, inputs, output, reports, failure, calls = [];
const copyIn = Type => (slot,p,n) => {
  calls.push('in');
  assert.equal(inputs[slot].length,n);
  new Type(api.memory.buffer,p>>>0,n).set(inputs[slot]);
};
const { instance } = await WebAssembly.instantiate(bytes, { octree_v1: {
  input_f64: copyIn(Float64Array), input_u32: copyIn(Uint32Array), input_i32: copyIn(Int32Array),
  output_u32(p,n) { calls.push('out'); output = new Uint32Array(api.memory.buffer,p>>>0,n).slice(); },
  output_i32(p,n) { calls.push('out'); reports = new Int32Array(api.memory.buffer,p>>>0,n).slice(); },
  failure(code,a,b,p,n) { calls.push('error'); failure = {code,a,b,message:new TextDecoder().decode(new Uint8Array(api.memory.buffer,p>>>0,n))}; },
} });
api = instance.exports;
assert.equal(api.octree_abi_version(),1);
const originalBuffer = api.memory.buffer;
for (const n of [1000,10000,100000,1]) {
  inputs = [config.root, new Uint32Array(n).map((_,i)=>i), new Float64Array(n*6)];
  calls = [];
  assert.equal(api.octree_build(n,n,1),0);
  assert.deepEqual(calls,['in','in','in']);
  inputs = [f64([...all,...all]), i32([0,n,n,0])];
  calls = [];
  assert.equal(api.octree_query(0,2,n),0);
  assert.deepEqual(calls,['in','in','out','out']);
  assert.deepEqual([...reports.slice(0,3)], [0,n,n]);
  assert.deepEqual([...reports.slice(5,8)], [1,0,n]);
  assert.deepEqual(output, new Uint32Array(n).map((_,i)=>i));
}
assert.notEqual(api.memory.buffer, originalBuffer, 'must actually grow memory');
for (const args of [[2,0,0],[0,-1,0],[0,0,0x7fffffff],[1,0x7fffffff,0]]) {
  calls = []; assert.equal(api.octree_query(...args),3); assert.deepEqual(calls,['error']);
}
calls = []; assert.equal(api.octree_build(0x7fffffff,0,1),3); assert.deepEqual(calls,['error']);
inputs = [config.root];
assert.equal(api.octree_build(0,-1,1),20);
assert.equal(failure.message,'max_objects');
inputs = [f64(all), i32([0,0x7fffffff])];
calls = [];
assert.equal(api.octree_query(0,1,1),30);
assert.deepEqual(calls,['in','in','error']);
assert.equal(failure.a,0);
api.octree_release(); api.octree_release();
calls = []; assert.equal(api.octree_query(0,0,0),4); assert.deepEqual(calls,['error']);
console.log(`${mode}: linear integration passed; differential distributions=8; instrumented sizes=1K/10K/100K; module=${bytes.length} bytes`);
