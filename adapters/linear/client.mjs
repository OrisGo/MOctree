const MAX_BYTES = 0x7fffffff;
const names = new Map([
  [3, 'InvalidProtocol'], [4, 'IndexNotBuilt'], [10, 'NonFinite'],
  [11, 'InvertedBounds'], [12, 'InvalidRoot'], [13, 'ZeroDirection'],
  [14, 'InvalidInterval'], [20, 'InvalidConfig'], [21, 'ObjectCapacityExceeded'],
  [22, 'DuplicateId'], [23, 'OutsideRoot'], [30, 'InvalidOutputRange'],
  [31, 'OverlappingOutputRanges'], [32, 'InsufficientWorkspace'],
]);

export class OctreeError extends Error {
  constructor(code, details = {}, message = '') {
    super(message || names.get(code) || `Unknown adapter status ${code}`);
    this.name = 'OctreeError';
    this.code = names.get(code) || 'UnknownStatus';
    this.status = code;
    this.details = details;
  }
}

function integer(value, name, max = MAX_BYTES) {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new RangeError(`${name} must be an integer in [0, ${max}]`);
}

function array(value, Type, name) {
  if (!(value instanceof Type) || !(value.buffer instanceof ArrayBuffer) ||
      value.buffer.resizable || value.buffer.detached)
    throw new TypeError(`${name} must be a fixed, non-shared ${Type.name}`);
  // Also catches detached buffers on hosts without ArrayBuffer.detached.
  new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function geometryError(status, kind) {
  const error = { code: names.get(status), status };
  if (status === 10) error.domain = kind;
  return error;
}

// TypedArray bulk copies require a little-endian host; fail explicitly otherwise.
const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** Create an independent, synchronous wasm index. See docs/wasm-linear.md. */
export async function createLinear(bytes, { maxTransferBytes = 64 * 1024 * 1024 } = {}) {
  integer(maxTransferBytes, 'maxTransferBytes');
  if (!littleEndian) throw new Error('linear adapter requires a little-endian JS host');
  let api;
  let inputs;
  let ids;
  let packed;
  let error;
  let expectedCount = 0;
  let expectedCapacity = 0;
  let busy = false;
  let closed = false;
  let poisoned = false;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  // Views exist only inside these callbacks. Always fetch the current buffer:
  // MoonBit allocation can grow memory and detach earlier views.
  const view = (Type, pointer, length) => {
    integer(length, 'transport length', Math.floor(MAX_BYTES / Type.BYTES_PER_ELEMENT));
    return new Type(api.memory.buffer, pointer >>> 0, length);
  };
  const receive = (Type, slot, pointer, length) => {
    const source = inputs?.[slot];
    if (!(source instanceof Type) || source.length !== length)
      throw new Error('adapter input protocol mismatch');
    view(Type, pointer, length).set(source);
  };
  const imports = { octree_v1: {
    input_f64: (slot, p, n) => receive(Float64Array, slot, p, n),
    input_u32: (slot, p, n) => receive(Uint32Array, slot, p, n),
    input_i32: (slot, p, n) => receive(Int32Array, slot, p, n),
    output_u32(p, n) {
      if (n !== expectedCapacity || ids) throw new Error('adapter output protocol mismatch');
      ids = view(Uint32Array, p, n).slice();
    },
    output_i32(p, n) {
      if (n !== expectedCount * 5 || packed) throw new Error('adapter report protocol mismatch');
      packed = view(Int32Array, p, n).slice();
    },
    failure(code, a, b, p, n) {
      const message = decoder.decode(view(Uint8Array, p, n));
      let details = {};
      if (code >= 10 && code <= 14) {
        details = a === -1 ? { source: 'root' } : { source: 'object', position: a, id: b >>> 0 };
        if (code === 10) details.domain = message;
      } else if (code === 20) details = { field: message };
      else if (code === 21) details = { limit: a, actual: b };
      else if (code === 22 || code === 23) details = { position: a, id: b >>> 0 };
      else if (code === 30) details = { position: a };
      else if (code === 31) details = { first: a, second: b };
      else if (code === 32) details = { required: a, available: b };
      error = new OctreeError(code, details, message);
    },
  } };
  const result = await WebAssembly.instantiate(bytes, imports);
  api = (result.instance || result).exports;
  if (!(api.memory instanceof WebAssembly.Memory) ||
      typeof api.octree_abi_version !== 'function' || api.octree_abi_version() !== 1 ||
      !['octree_build', 'octree_query', 'octree_release'].every(k => typeof api[k] === 'function'))
    throw new Error('unsupported octree linear ABI (expected version 1)');

  const budget = n => {
    if (!Number.isSafeInteger(n) || n > maxTransferBytes)
      throw new RangeError(`operation exceeds maxTransferBytes (${maxTransferBytes})`);
  };
  const run = fn => {
    if (closed) throw new Error('linear adapter released');
    if (poisoned) throw new Error('linear adapter unusable after runtime failure; create a new instance');
    if (busy) throw new Error('linear adapter is not reentrant');
    busy = true;
    try { return fn(); }
    finally { inputs = ids = packed = error = undefined; busy = false; }
  };
  const execute = (fn, ...args) => {
    let status;
    try { status = fn(...args); }
    catch (cause) { poisoned = true; throw cause; }
    if (status !== 0) {
      if (error?.status === status) throw error;
      poisoned = true;
      throw new Error('adapter status protocol mismatch');
    }
  };
  return {
    build(config) {
      return run(() => {
        const { ids: sourceIds, bounds, root, maxObjects, maxNodes } = config;
        array(sourceIds, Uint32Array, 'ids');
        array(bounds, Float64Array, 'bounds');
        array(root, Float64Array, 'root');
        integer(sourceIds.length, 'object count', Math.floor(MAX_BYTES / 48));
        integer(maxObjects, 'maxObjects');
        integer(maxNodes, 'maxNodes');
        if (bounds.length !== sourceIds.length * 6 || root.length !== 4)
          throw new RangeError('bounds/root length mismatch');
        budget(root.byteLength + sourceIds.byteLength + bounds.byteLength);
        inputs = [root, sourceIds, bounds];
        execute(api.octree_build, sourceIds.length, maxObjects, maxNodes);
      });
    },
    query(kind, coordinates, ranges, outputCapacity) {
      return run(() => {
        if (kind !== 'aabb' && kind !== 'ray') throw new TypeError('unknown query kind');
        array(coordinates, Float64Array, 'coordinates');
        array(ranges, Int32Array, 'ranges');
        const stride = kind === 'aabb' ? 6 : 8;
        const count = ranges.length / 2;
        integer(count, 'query count', Math.floor(MAX_BYTES / (stride * 8)));
        integer(outputCapacity, 'outputCapacity', Math.floor(MAX_BYTES / 4));
        if (coordinates.length !== count * stride) throw new RangeError('coordinates length mismatch');
        budget(coordinates.byteLength + ranges.byteLength + count * 20 + outputCapacity * 4);
        inputs = [coordinates, ranges];
        expectedCount = count;
        expectedCapacity = outputCapacity;
        execute(api.octree_query, kind === 'aabb' ? 0 : 1, count, outputCapacity);
        if (!ids || !packed) { poisoned = true; throw new Error('missing adapter output'); }
        const reports = Array.from({ length: count }, (_, i) => {
          const p = i * 5, status = packed[p];
          if (status >= 10) return { error: geometryError(status, kind) };
          return { status, written: packed[p + 1], totalHits: packed[p + 2],
            visitedNodes: packed[p + 3], testedObjects: packed[p + 4] };
        });
        return { ids, reports };
      });
    },
    release() {
      if (busy) throw new Error('linear adapter is not reentrant');
      if (!closed && !poisoned) api.octree_release();
      closed = true;
      api = undefined;
    },
  };
}
