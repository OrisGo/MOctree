// Experimental scalar transport; no MoonBit runtime layout assumptions.
const int32 = (value, name) => {
  if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff)
    throw new RangeError(`${name} must be a nonnegative Int32`);
};
const vector = (value, length, name) => {
  if (!(value instanceof Float64Array) || value.length !== length ||
      shared(value.buffer))
    throw new TypeError(`${name} must be a non-shared Float64Array(${length})`);
};
const shared = (buffer) => typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer;
const check = (code) => {
  if (code !== 0) throw new Error(`prototype status ${code}`);
};

export async function createPrototype(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const api = instance.exports;
  // MoonBit libraries may expose an explicit initialization entry point.
  if (typeof api._start === 'function') api._start();
  let released = false;
  const live = () => { if (released) throw new Error('prototype released'); };
  return {
    build({ ids, bounds, root, maxObjects, maxNodes }) {
      live();
      if (!(ids instanceof Uint32Array) || shared(ids.buffer))
        throw new TypeError('ids must be a non-shared Uint32Array');
      int32(ids.length, 'object count');
      vector(bounds, ids.length * 6, 'bounds');
      vector(root, 4, 'root');
      int32(maxObjects, 'maxObjects');
      int32(maxNodes, 'maxNodes');
      api.begin_objects();
      for (let i = 0; i < ids.length; i++)
        check(api.add_object(ids[i], ...bounds.subarray(i * 6, i * 6 + 6)));
      check(api.build_index(...root, maxObjects, maxNodes));
    },
    query(kind, coordinates, ranges, outputCapacity) {
      live();
      if (kind !== 'aabb' && kind !== 'ray') throw new TypeError('unknown query kind');
      if (!(ranges instanceof Int32Array) || ranges.length % 2 !== 0 ||
          shared(ranges.buffer)) throw new TypeError('invalid ranges');
      const count = ranges.length / 2;
      int32(count, 'query count');
      vector(coordinates, count * (kind === 'aabb' ? 6 : 8), 'coordinates');
      int32(outputCapacity, 'outputCapacity');
      check(api.begin_queries(outputCapacity));
      const stride = kind === 'aabb' ? 6 : 8;
      for (let i = 0; i < count; i++) {
        const args = [...coordinates.subarray(i * stride, (i + 1) * stride), ranges[i * 2], ranges[i * 2 + 1]];
        if (kind === 'aabb') api.add_aabb(...args);
        else api.add_ray(...args);
      }
      check(api.execute(kind === 'aabb' ? 0 : 1));
      const ids = new Uint32Array(outputCapacity);
      const reports = [];
      for (let i = 0; i < count; i++) {
        const status = api.report(i, 0);
        if (status >= 10) { reports.push({ error: status }); continue; }
        const written = api.report(i, 1);
        reports.push({ status, written, totalHits: api.report(i, 2),
          visitedNodes: api.report(i, 3), testedObjects: api.report(i, 4) });
        for (let j = 0; j < written; j++) {
          const offset = ranges[i * 2] + j;
          ids[offset] = api.result_id(offset) >>> 0;
        }
      }
      return { ids, reports };
    },
    release() { if (!released) api.release(); released = true; },
  };
}
