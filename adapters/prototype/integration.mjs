import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPrototype } from './client.mjs';

const f64 = (x) => new Float64Array(x);
const ranges = (x) => new Int32Array(x);
const all = [-10, -10, -10, 10, 10, 10];
const config = { ids: new Uint32Array([0, 0xffffffff, 3]),
  bounds: f64([0,0,0,0,0,0, 1,1,1,2,2,2, -2,-2,-2,-1,-1,-1]),
  root: f64([0,0,0,10]), maxObjects: 3, maxNodes: 64 };
const snapshots = [];
for (const target of ['wasm', 'wasm-gc']) {
  const bytes = await readFile(new URL(`../../_build/${target}/debug/build/adapters/prototype/prototype.wasm`, import.meta.url));
  const client = await createPrototype(bytes);
  assert.throws(() => client.query('aabb', f64(all), ranges([0,3]), 3), /status 4/);
  client.build(config);
  let result = client.query('aabb', f64([...all, ...all, 1,0,0,0,0,0]), ranges([0,3,3,1,4,1]), 5);
  assert.deepEqual([...result.ids.slice(0,3)].sort((a,b)=>a-b), [0,3,0xffffffff]);
  assert.equal(result.reports[0].status, 0);
  assert.equal(result.reports[1].status, 1);
  assert.equal(result.reports[1].totalHits, 3);
  assert.deepEqual(result.reports[2], {error:11});
  snapshots.push(result);
  const saved = result.ids.slice();
  assert.throws(() => client.query('aabb', f64([...all,...all]), ranges([0,3,2,1]), 3), /status 6/);
  assert.throws(() => client.query('aabb', f64(all), ranges([1,2147483647]), 3), /status 5/);
  assert.throws(() => client.query('aabb', f64(all), ranges([-1,1]), 3), /status 5/);
  result = client.query('ray', f64([-10,0,0,1,0,0,0,20, 0,0,0,0,0,0,0,1]), ranges([0,3,3,0]), 3);
  assert.equal(result.reports[0].totalHits, 1);
  assert.equal(result.ids[0], 0);
  assert.deepEqual(result.reports[1], {error:13});
  const errors = client.query('ray', f64([
    0,0,0,1,0,0,-1,1, 0,0,0,NaN,0,0,0,1,
  ]), ranges([0,0,0,0]), 0);
  assert.deepEqual(errors.reports, [{error:14},{error:10}]);
  assert.equal(client.query('aabb', f64([2,2,2,2,2,2]), ranges([0,1]), 1).ids[0], 0xffffffff);
  assert.throws(() => client.build({...config, ids:new Uint32Array([0,0,3])}), /status 2/);
  assert.throws(() => client.build({...config, maxObjects:2}), /status 2/);
  assert.throws(() => client.build({...config, root:f64([0,0,0,0.5])}), /status 2/);
  assert.throws(() => client.build({...config, bounds:f64([NaN,...config.bounds.slice(1)])}), /status 1/);
  assert.equal(client.query('aabb',f64(all),ranges([0,0]),0).reports[0].totalHits,3);
  assert.deepEqual(client.query('aabb',f64([]),ranges([]),0).reports,[]);
  const source = config.bounds.slice();
  client.build({...config,bounds:source}); source.fill(500);
  assert.equal(client.query('aabb',f64(all),ranges([0,3]),3).reports[0].totalHits,3);
  // Independent JS AABB oracle over deterministic pseudo-random point boxes.
  const ids = new Uint32Array(80).map((_,i)=>i);
  const bounds = f64(Array.from({length:80},(_,i)=> {
    const p = [(i*17%19)-9,(i*13%17)-8,(i*7%13)-6]; return [...p,...p];
  }).flat());
  client.build({...config,ids,bounds,maxObjects:80});
  for (let x=-10;x<10;x++) {
    const q=[x,-10,-10,x+3,10,10];
    const expected=[...ids].filter(i=>bounds[i*6]<=q[3] && bounds[i*6+3]>=q[0]);
    const r=client.query('aabb',f64(q),ranges([0,80]),80);
    assert.deepEqual([...r.ids.slice(0,r.reports[0].written)].sort((a,b)=>a-b),expected);
  }
  const independent = await createPrototype(bytes);
  independent.build(config);
  client.release(); client.release();
  assert.equal(independent.query('aabb',f64(all),ranges([0,0]),0).reports[0].totalHits,3);
  independent.release();
  assert.throws(()=>client.query('aabb',f64(all),ranges([0,3]),3),/released/);
  assert.deepEqual(snapshots.at(-1).ids,saved);
  const empty=await createPrototype(bytes);
  empty.build({...config,ids:new Uint32Array(),bounds:f64([]),maxObjects:0});
  assert.equal(empty.query('aabb',f64(all),ranges([0,0]),0).reports[0].totalHits,0);
  empty.release();
  console.log(`${target}: prototype integration passed (${bytes.length} module bytes)`);
}
assert.deepEqual(snapshots[0],snapshots[1]);
