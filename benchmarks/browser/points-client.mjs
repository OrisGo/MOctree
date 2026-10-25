// Benchmark-only synchronous ABI; finite validated workloads, no public API promise.
export async function createPoints(bytes, mode=0) {
  let api, source, points, packed;
  const {instance}=await WebAssembly.instantiate(bytes,{points:{
    input(slot,p,n){if(slot!==0||source.length!==n)throw Error('input mismatch');new Float64Array(api.memory.buffer,p>>>0,n).set(source);},
    output(p,n){points=new Float64Array(api.memory.buffer,p>>>0,n).slice();},
    reports(p,n){packed=new Int32Array(api.memory.buffer,p>>>0,n).slice();},
  }});
  api=instance.exports;
  return {
    build(data){source=data;try{const status=api.point_build(mode,data.length/3);if(status)throw Error(`build rejected: ${status}`);}finally{source=null;}},
    query(coordinates,capacity){
      source=coordinates;points=packed=undefined;
      try{api.point_query(coordinates.length/6,capacity);}finally{source=null;}
      if(points?.length!==coordinates.length/6*capacity*3||packed?.length!==coordinates.length/6*4)throw Error('output mismatch');
      return {points,reports:Array.from({length:packed.length/4},(_,i)=>({total:packed[i*4],written:packed[i*4+1],visited:packed[i*4+2]<0?null:packed[i*4+2],tested:packed[i*4+3]<0?null:packed[i*4+3]}))};
    },
    memoryBytes(){return api.memory.buffer.byteLength;},
    release(){api.point_release();},
  };
}
