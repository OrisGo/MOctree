import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createLinear } from '../../adapters/linear/client.mjs';
import { dataset, workload, scan, verify, summary, SEED } from '../browser/data.mjs';
import { validate } from '../browser/compare.mjs';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath) throw Error('usage: node run.mjs BEFORE.wasm AFTER.wasm OUTPUT.json');
const names = ['before', 'after'];
const bytes = { before: readFileSync(beforePath), after: readFileSync(afterPath) };
const hash = value => createHash('sha256').update(value).digest('hex');
const call = (c, j) => c.query(j.kind, j.coordinates, j.ranges, j.outputCapacity);
let checksum = 0;
const consume = r => { checksum = (checksum + r.reports.reduce((s, x) => s + x.totalHits, 0) + (r.ids[0] || 0)) >>> 0; };
const result = {
  schema: 'aabb-subtree-v1', startedAt: new Date().toISOString(), seed: SEED,
  environment: { node: process.version, v8: process.versions.v8, platform: platform(), release: release(),
    cpu: cpus()[0].model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(),
    moon: execFileSync('moon', ['version'], { encoding: 'utf8' }).trim() },
  options: { sizes: [1000, 10000, 100000], samples: 100, warmups: 20, buildSamples: 9, batchSize: 8 },
  modules: Object.fromEntries(names.map(n => [n, { bytes: bytes[n].length, sha256: hash(bytes[n]) }])),
  sources: Object.fromEntries(['benchmarks/subtree/run.mjs', 'benchmarks/browser/data.mjs',
    'benchmarks/browser/compare.mjs', 'adapters/linear/client.mjs', 'objects/query.mbt',
    'objects/build.mbt', 'objects/types.mbt'].map(p => [p, hash(readFileSync(new URL('../../' + p, import.meta.url)))])),
  acceptance: {}, builds: [], rows: [], resources: [],
};
for (const name of names) result.acceptance[name] = await validate(() => createLinear(bytes[name]));
for (const count of result.options.sizes) for (const distribution of ['uniform', 'cluster', 'overlap']) {
  const data = dataset(count, distribution), clients = {}, times = { before: [], after: [] };
  try {
    for (let round = 0; round < result.options.buildSamples; round++) for (let k = 0; k < 2; k++) {
      const name = names[(round + k) % 2], c = await createLinear(bytes[name]);
      const t = performance.now(); c.build(data); times[name].push(performance.now() - t);
      if (round === result.options.buildSamples - 1) clients[name] = c; else c.release();
    }
    for (const name of names) result.builds.push({ count, distribution, backend: name, ms: summary(times[name]), rawMs: times[name] });
    for (const scenario of ['selective', 'subtree', 'broad']) for (const mode of ['count', 'cap64', 'all']) {
      const job = workload(scenario, 8, mode === 'count' ? 0 : mode === 'cap64' ? 64 : count);
      // Exact root octants contain whole child subtrees while the root still needs testing.
      if (scenario === 'subtree') for (let i = 0; i < 8; i++) job.coordinates.set([
        i & 1 ? 0 : -100, i & 2 ? 0 : -100, i & 4 ? 0 : -100,
        i & 1 ? 100 : 0, i & 2 ? 100 : 0, i & 4 ? 100 : 0,
      ], i * 6);
      const oracle = scan(data, job, true), raw = { before: [], after: [] }, stats = {};
      for (const name of names) {
        const r = call(clients[name], job); verify(r, oracle, job);
        stats[name] = Object.fromEntries(['totalHits', 'written', 'visitedNodes', 'testedObjects'].map(key =>
          [key, r.reports.reduce((s, x) => s + x[key], 0)]));
      }
      for (let round = -20; round < 100; round++) for (let k = 0; k < 2; k++) {
        const name = names[(round + 20 + k) % 2], t = performance.now();
        const r = call(clients[name], job), elapsed = performance.now() - t;
        consume(r); if (round >= 0) raw[name].push(elapsed);
      }
      for (const name of names) result.rows.push({ count, distribution, scenario, mode, backend: name,
        batchMs: summary(raw[name]), rawMs: raw[name], ...stats[name] });
    }
  } finally { for (const c of Object.values(clients)) c.release(); }
  console.log(`verified and measured ${count} ${distribution}`);
}
// Fresh instances, outside timing. Capture only exported memory, never runtime object headers.
for (const count of result.options.sizes) for (const distribution of ['uniform', 'cluster', 'overlap']) for (const name of names) {
  let memory, c;
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async (...args) => {
    const r = await instantiate(...args); memory = (r.instance || r).exports.memory; return r;
  };
  try { c = await createLinear(bytes[name]); } finally { WebAssembly.instantiate = instantiate; }
  try {
    const data = dataset(count, distribution), r = { count, distribution, backend: name, initBytes: memory.buffer.byteLength };
    c.build(data); r.buildBytes = memory.buffer.byteLength;
    for (const mode of ['count', 'cap64', 'all']) {
      const job = workload('broad', 8, mode === 'count' ? 0 : mode === 'cap64' ? 64 : count);
      for (let i = 0; i < 20; i++) consume(call(c, job));
      r[mode + 'Bytes'] = memory.buffer.byteLength;
    }
    c.release(); r.releaseBytes = memory.buffer.byteLength; result.resources.push(r);
  } finally { c.release(); }
}
result.checksum = checksum; result.finishedAt = new Date().toISOString();
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
