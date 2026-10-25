import { createLinear } from '../../adapters/linear/client.mjs';
import { dataset, workload, scan, verify, summary, SEED } from './data.mjs';

export const paths={octree:'/_build/wasm/release/build/adapters/linear/linear.wasm',
  strtree:'/benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'};
export const labels={octree:'MOctree · wasm',strtree:'MoonSTRtree 0.2.2 · wasm',scan:'JS 扫描'};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export const call=(c,j)=>c.query(j.kind,j.coordinates,j.ranges,j.outputCapacity);
let sink=0;
const consume=r=>{sink=(sink+r.reports.reduce((s,r)=>s+r.totalHits,0)+(r.ids[0]||0))>>>0;};
export function factories(bytes) {
  return {octree:()=>createLinear(bytes.octree),strtree:()=>createLinear(bytes.strtree),scan:async()=>{
    let data;
    return {build(c){data={...c,ids:c.ids.slice(),bounds:c.bounds.slice()};},
      query(kind,coordinates,ranges,outputCapacity){return scan(data,{kind,coordinates,ranges,outputCapacity,batchSize:ranges.length/2});},
      release(){data=undefined;}};
  }};
}

// Shared-domain tests, deliberately not MOctree's richer invalid-input contract.
export async function validate(factory) {
  const c=await factory(), other=await factory();let checks=0;
  const check=(data,job)=>{verify(call(c,job),scan(data,job,true),job);checks++;};
  try {
    const data={ids:new Uint32Array([0,0xffffffff,9,42]),
      bounds:new Float64Array([0,0,0,0,0,0, 1,1,1,2,2,2, -2,-2,-2,-1,-1,-1, -1,0,0,1,0,0]),
      root:new Float64Array([0,0,0,100]),maxObjects:4,maxNodes:64};
    c.build(data);other.build(data);
    for(const capacity of [0,1,4,7]) {
      const job=workload('broad',8,capacity);
      job.coordinates.set([2,2,2,2,2,2],6); // touching corner
      job.coordinates.set([0,0,0,0,0,0],12); // degenerate point/line
      job.coordinates.set([-1000,-1000,-1000,-999,-999,-999],18); // outside root
      job.coordinates.set([-1,-1,-1,1,1,1],24); // split planes
      check(data,job);
    }
    const original=call(c,workload('broad',1,4)), saved=original.ids.slice();
    const source={...data,ids:data.ids.slice(),bounds:data.bounds.slice()};
    c.build(source);source.ids.fill(17);source.bounds.fill(50);check(data,workload('broad',1,4));
    for(const distribution of ['uniform','cluster','overlap']) {
      const d=dataset(257,distribution);c.build(d);
      for(const scenario of ['selective','broad'])for(const cap of [0,3,257])check(d,workload(scenario,8,cap));
      const randomJob=workload('selective',32,257);
      for(let i=0;i<32;i++){
        const x=(i*37%180)-90,y=(i*53%180)-90,z=(i*71%180)-90;
        randomJob.coordinates.set([x,y,z,x+15,y+20,z+25],i*6);
      }
      check(d,randomJob);
    }
    const empty=dataset(0);c.build(empty);check(empty,workload('broad',1,4));check(empty,workload('broad',0,0));
    if(!original.ids.every((v,i)=>v===saved[i]))throw Error('output lifetime');checks++;
    verify(call(other,workload('broad',1,4)),scan(data,workload('broad',1,4),true),workload('broad',1,4));checks++;
    return {checks,status:'passed'};
  } finally {c.release();other.release();}
}

export async function runComparison({samples=100,warmups=20,sizes=[1000,10000,100000],buildSamples=5}={},progress=()=>{}) {
  if(!Number.isInteger(samples)||samples<10||samples>1000||!Number.isInteger(warmups)||warmups<0||warmups>1000||
    !Number.isInteger(buildSamples)||buildSamples<1||buildSamples>20||!Array.isArray(sizes)||!sizes.length||
    sizes.some(n=>!Number.isInteger(n)||n<1||n>100000))throw Error('invalid measurement configuration');
  const bytes={};
  for(const [name,path] of Object.entries(paths)){
    const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(`${path}: ${r.status}`);bytes[name]=await r.arrayBuffer();
  }
  const factory=factories(bytes),names=Object.keys(factory);
  const result={schema:'strtree-comparison-v1',startedAt:new Date().toISOString(),seed:SEED,
    options:{samples,warmups,sizes,buildSamples,batchSize:8,modes:['count','cap64','all']},
    environment:{userAgent:navigator.userAgent,crossOriginIsolated,hardwareConcurrency:navigator.hardwareConcurrency},
    acceptance:{},builds:[],rows:[],resources:{}};
  for(const name of names)result.acceptance[name]=await validate(factory[name]);
  for(const count of sizes)for(const distribution of ['uniform','cluster','overlap']){
    const data=dataset(count,distribution),clients={},times=Object.fromEntries(names.map(n=>[n,[]]));
    try {
      // Independent instances; rotate construction order too. Instantiation is outside timing.
      for(let round=0;round<buildSamples;round++)for(let k=0;k<names.length;k++){
        const name=names[(round+k)%names.length],c=await factory[name]();
        const t=performance.now();c.build(data);times[name].push(performance.now()-t);
        if(round===buildSamples-1)clients[name]=c;else c.release();
      }
      for(const name of names)result.builds.push({count,distribution,backend:name,ms:summary(times[name]),rawMs:times[name]});
      for(const scenario of ['selective','broad'])for(const mode of ['count','cap64','all']){
        progress(`${count} / ${distribution} / ${scenario} / ${mode}`);
        const job=workload(scenario,8,mode==='count'?0:mode==='cap64'?64:count),oracle=scan(data,job,true);
        const raw=Object.fromEntries(names.map(n=>[n,[]])),stats={};
        for(const name of names){
          const r=call(clients[name],job);verify(r,oracle,job);
          stats[name]={totalHits:r.reports.reduce((s,r)=>s+r.totalHits,0),written:r.reports.reduce((s,r)=>s+r.written,0),
            visitedNodes:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.visitedNodes,0),
            testedObjects:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.testedObjects,0)};
        }
        for(let round=-warmups;round<samples;round++){
          for(let k=0;k<names.length;k++){
            const name=names[(round+warmups+k)%names.length],t=performance.now();
            const r=call(clients[name],job),elapsed=performance.now()-t;consume(r);
            if(round>=0)raw[name].push(elapsed);
          }
          if(round%10===0)await pause();
        }
        for(const name of names)result.rows.push({count,distribution,scenario,mode,backend:name,batchMs:summary(raw[name]),rawMs:raw[name],...stats[name]});
      }
    } finally {for(const c of Object.values(clients))c.release();}
  }
  // Separate allocated-capacity probe, never active during the latency matrix.
  for(const name of ['octree','strtree']){
    let memory;const instantiate=WebAssembly.instantiate;let c;
    WebAssembly.instantiate=async(...args)=>{const r=await instantiate(...args);memory=(r.instance||r).exports.memory;return r;};
    try {c=await factory[name]();}finally{WebAssembly.instantiate=instantiate;}
    try {
      const data=dataset(100000),r={initBytes:memory.buffer.byteLength};c.build(data);r.buildBytes=memory.buffer.byteLength;
      for(const mode of ['count','cap64','all']){
        const job=workload('broad',8,mode==='count'?0:mode==='cap64'?64:100000);
        for(let i=0;i<20;i++)consume(call(c,job));r[mode+'Bytes']=memory.buffer.byteLength;
      }
      result.resources[name]=r;
    } finally {c.release();}
  }
  result.checksum=sink;result.finishedAt=new Date().toISOString();return result;
}
