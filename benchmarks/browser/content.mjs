import { validate } from './compare.mjs';
import { createLinear } from '../../adapters/linear/client.mjs';
import { dataset, workload, scan, verify, summary, SEED } from './data.mjs';

export const paths={before:'/_build/browser-results/content-before.wasm',
  after:'/_build/wasm/release/build/adapters/linear/linear.wasm',
  strtree:'/benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export const call=(c,j)=>c.query(j.kind,j.coordinates,j.ranges,j.outputCapacity);
let sink=0;
const consume=r=>{sink=(sink+r.reports.reduce((s,r)=>s+r.totalHits,0)+(r.ids[0]||0))>>>0;};
export function factories(bytes) {
  return Object.fromEntries(Object.entries(bytes).map(([name, data])=>[name,()=>createLinear(data)]));
}

export async function runContent({samples=100,warmups=20,sizes=[1000,10000,100000],buildSamples=5}={},progress=()=>{}) {
  if(!Number.isInteger(samples)||samples<10||samples>1000||!Number.isInteger(warmups)||warmups<0||warmups>1000||
    !Number.isInteger(buildSamples)||buildSamples<1||buildSamples>20||!Array.isArray(sizes)||!sizes.length||
    sizes.some(n=>!Number.isInteger(n)||n<1||n>100000))throw Error('invalid measurement configuration');
  const bytes={};
  for(const [name,path] of Object.entries(paths)){
    const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(`${path}: ${r.status}`);bytes[name]=await r.arrayBuffer();
  }
  const factory=factories(bytes),names=Object.keys(factory);
  const result={schema:'content-bounds-v1',startedAt:new Date().toISOString(),seed:SEED,
    options:{samples,warmups,sizes,buildSamples,batchSize:8,modes:['count','cap64','all']},
    environment:{userAgent:navigator.userAgent,crossOriginIsolated,hardwareConcurrency:navigator.hardwareConcurrency},
    acceptance:{},builds:[],rows:[],resources:[]};
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
      for(const scenario of ['selective','subtree','broad','ray'])for(const mode of ['count','cap64','all']){
        progress(`${count} / ${distribution} / ${scenario} / ${mode}`);
        const activeNames=scenario==='ray'?names.filter(n=>n!=='strtree'):names;
        const job=workload(scenario,8,mode==='count'?0:mode==='cap64'?64:count);
        if(scenario==='subtree')for(let i=0;i<8;i++)job.coordinates.set([
          i&1?0:-100,i&2?0:-100,i&4?0:-100,i&1?100:0,i&2?100:0,i&4?100:0],i*6);
        const oracle=scan(data,job,true);
        const raw=Object.fromEntries(activeNames.map(n=>[n,[]])),stats={};
        for(const name of activeNames){
          const r=call(clients[name],job);verify(r,oracle,job);
          stats[name]={totalHits:r.reports.reduce((s,r)=>s+r.totalHits,0),written:r.reports.reduce((s,r)=>s+r.written,0),
            visitedNodes:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.visitedNodes,0),
            testedObjects:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.testedObjects,0)};
        }
        for(let round=-warmups;round<samples;round++){
          for(let k=0;k<activeNames.length;k++){
            const name=activeNames[(round+warmups+k)%activeNames.length],t=performance.now();
            const r=call(clients[name],job),elapsed=performance.now()-t;consume(r);
            if(round>=0)raw[name].push(elapsed);
          }
          if(round%10===0)await pause();
        }
        for(const name of activeNames)result.rows.push({count,distribution,scenario,mode,backend:name,batchMs:summary(raw[name]),rawMs:raw[name],...stats[name]});
      }
    } finally {for(const c of Object.values(clients))c.release();}
  }
  // Separate allocated-capacity probe, never active during the latency matrix.
  for(const count of sizes)for(const distribution of ['uniform','cluster','overlap'])for(const name of names){
    let memory;const instantiate=WebAssembly.instantiate;let c;
    WebAssembly.instantiate=async(...args)=>{const r=await instantiate(...args);memory=(r.instance||r).exports.memory;return r;};
    try {c=await factory[name]();}finally{WebAssembly.instantiate=instantiate;}
    try {
      const data=dataset(count,distribution),r={count,distribution,backend:name,initBytes:memory.buffer.byteLength};c.build(data);r.buildBytes=memory.buffer.byteLength;
      for(const mode of ['count','cap64','all']){
        const job=workload('broad',8,mode==='count'?0:mode==='cap64'?64:count);
        for(let i=0;i<20;i++)consume(call(c,job));r[mode+'Bytes']=memory.buffer.byteLength;
      }
      result.resources.push(r);
    } finally {c.release();}
  }
  result.checksum=sink;result.finishedAt=new Date().toISOString();return result;
}
