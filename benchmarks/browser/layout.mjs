import {jobs, scenarios, parameters} from './layout-data.mjs';
import { validate } from './compare.mjs';
import { createLinear } from '../../adapters/linear/client.mjs';
import { dataset, workload, scan, verify, summary, SEED } from './data.mjs';

export const paths={before:'/_build/browser-results/layout-before.wasm',
  after:'/_build/wasm/release/build/adapters/linear/linear.wasm',
  strtree:'/benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
export const call=(c,j)=>c.query(j.kind,j.coordinates,j.ranges,j.outputCapacity);
let sink=0;
const consume=r=>{sink=(sink+r.reports.reduce((s,r)=>s+r.totalHits,0)+(r.ids[0]||0))>>>0;};
export function factories(bytes) {
  return Object.fromEntries(Object.entries(bytes).map(([name, data])=>[name,()=>createLinear(data)]));
}

export async function runLayout({samples=100,warmups=20,sizes=[1000,10000,100000],buildSamples=5}={},progress=()=>{}) {
  if(!Number.isInteger(samples)||samples<10||samples>1000||!Number.isInteger(warmups)||warmups<0||warmups>1000||
    !Number.isInteger(buildSamples)||buildSamples<1||buildSamples>20||!Array.isArray(sizes)||!sizes.length||
    sizes.some(n=>!Number.isInteger(n)||n<1||n>100000))throw Error('invalid measurement configuration');
  const bytes={};
  for(const [name,path] of Object.entries(paths)){
    const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(`${path}: ${r.status}`);bytes[name]=await r.arrayBuffer();
  }
  const factory=factories(bytes),names=Object.keys(factory);
  const result={schema:'contiguous-layout-v1',startedAt:new Date().toISOString(),seed:SEED,
    queryParameters:parameters, workloads:{}, options:{samples,warmups,sizes,buildSamples,batchSize:8,modes:['count','cap64','all']},
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
      for(const scenario of scenarios)for(const mode of ['count','cap64','all']){
        progress(`${count} / ${distribution} / ${scenario} / ${mode}`);
        const activeNames=scenario==='ray'?names.filter(n=>n!=='strtree'):names;
        const sequence=jobs(scenario,mode==='count'?0:mode==='cap64'?64:count);
        result.workloads[scenario]=sequence.map(j=>Array.from(j.coordinates));
        const raw=Object.fromEntries(activeNames.map(n=>[n,[]])),stats={};
        for(const name of activeNames)stats[name]=[];
        for(const job of sequence){
          const oracle=scan(data,job,true);
          for(const name of activeNames){
            const r=call(clients[name],job);verify(r,oracle,job);
            stats[name].push({totalHits:r.reports.reduce((s,r)=>s+r.totalHits,0),written:r.reports.reduce((s,r)=>s+r.written,0),
              hitsPerQuery:r.reports.map(r=>r.totalHits),
              visitedNodes:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.visitedNodes,0),
              testedObjects:name==='strtree'?null:r.reports.reduce((s,r)=>s+r.testedObjects,0)});
          }
        }
        for(let round=-warmups;round<samples;round++){
          for(let k=0;k<activeNames.length;k++){
            const name=activeNames[(round+warmups+k)%activeNames.length],t=performance.now();
            const r=call(clients[name],sequence[(round+warmups)%sequence.length]),elapsed=performance.now()-t;consume(r);
            if(round>=0)raw[name].push(elapsed);
          }
          if(round%10===0)await pause();
        }
        for(const name of activeNames)result.rows.push({count,distribution,scenario,mode,backend:name,batchMs:summary(raw[name]),rawMs:raw[name],perBatch:stats[name],actualHitRate:stats[name].reduce((s,r)=>s+r.totalHits,0)/(count*64),inputBytes:sequence[0].coordinates.byteLength+sequence[0].ranges.byteLength,outputBytes:sequence[0].outputCapacity*4+160});
      }
    } finally {for(const c of Object.values(clients))c.release();}
  }
  // Separate allocated-capacity probe, never active during the latency matrix.
  for(const count of sizes)for(const distribution of ['uniform','cluster','overlap'])for(const name of names){
    let memory;const instantiate=WebAssembly.instantiate;let c;let callbackMs=0;
    WebAssembly.instantiate=async(...args)=>{for(const group of Object.values(args[1]))for(const [key,fn] of Object.entries(group)) {
      if(key.startsWith('input_')||key.startsWith('output_'))group[key]=(...values)=>{
        const t=performance.now();try{return fn(...values);}finally{callbackMs+=performance.now()-t;}
      };
    }
    const r=await instantiate(...args);memory=(r.instance||r).exports.memory;return r;};
    try {c=await factory[name]();}finally{WebAssembly.instantiate=instantiate;}
    try {
      const data=dataset(count,distribution),r={count,distribution,backend:name,initBytes:memory.buffer.byteLength};c.build(data);r.buildBytes=memory.buffer.byteLength;
      for(const mode of ['count','cap64','all']){
        const job=workload('broad',8,mode==='count'?0:mode==='cap64'?64:count);
        const copySamples=[],endToEnd=[];
        for(let i=0;i<20;i++){
          callbackMs=0;const t=performance.now();const response=call(c,job);endToEnd.push(performance.now()-t);
          copySamples.push(callbackMs);consume(response);
        }
        r[mode+'Bytes']=memory.buffer.byteLength;
        r[mode+'TransferProbe']={callbackMs:copySamples,endToEndMs:endToEnd,
          note:'Separate instrumented probe: input/output callbacks include validation and typed-array copying; excludes allocation/staging outside callbacks. Timer overhead included; not subtracted from main timings.'};
      }
      result.resources.push(r);
    } finally {c.release();}
  }
  result.checksum=sink;result.finishedAt=new Date().toISOString();return result;
}
