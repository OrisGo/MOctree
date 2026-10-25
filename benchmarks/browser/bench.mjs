import { createLinear } from '../../adapters/linear/client.mjs';
import { createPrototype } from '../../adapters/prototype/client.mjs';
import { dataset, workload, scan, verify, summary, SEED } from './data.mjs';
import { acceptance } from './acceptance.mjs';

const paths={
  linear:'/_build/wasm/release/build/adapters/linear/linear.wasm',
  scalar:'/_build/wasm/release/build/adapters/prototype/prototype.wasm',
  gc:'/_build/wasm-gc/release/build/adapters/prototype/prototype.wasm',
};
const bytes={};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const query=(client,j)=>client.query(j.kind,j.coordinates,j.ranges,j.outputCapacity);
let sink=0;
function consume(r) { sink=(sink+r.reports[0].totalHits+(r.ids[0]||0))>>>0; }
const factories={
  linear:()=>createLinear(bytes.linear),scalar:()=>createPrototype(bytes.scalar),gc:()=>createPrototype(bytes.gc),
  scan:async()=>{
    let data;
    return {build(config){data={...config,ids:config.ids.slice(),bounds:config.bounds.slice()};},
      query(kind,coordinates,ranges,outputCapacity){return scan(data,{kind,coordinates,ranges,outputCapacity,batchSize:ranges.length/2});},
      release(){data=undefined;}};
  },
};

function clockResolution() {
  let previous=performance.now(), best=Infinity;
  for(let i=0;i<10000;i++) {const t=performance.now();if(t>previous)best=Math.min(best,t-previous);previous=t;}
  return Number.isFinite(best)?best:null;
}

export async function runBenchmarks({samples=100,warmups=20,sizes=[1000,10000,100000],buildSamples=5}={},progress=()=>{}) {
  if(!Number.isInteger(samples)||samples<10||samples>1000||!Number.isInteger(warmups)||warmups<0||warmups>1000)
    throw new Error('invalid measurement counts');
  if(!Number.isInteger(buildSamples)||buildSamples<1||buildSamples>20||!Array.isArray(sizes)||!sizes.length||
    sizes.some(n=>!Number.isInteger(n)||n<1||n>100000))throw new Error('invalid build samples or sizes');
  const result={schema:1,seed:SEED,startedAt:new Date().toISOString(),
    environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,
      deviceMemoryGiB:navigator.deviceMemory??null,crossOriginIsolated,clockResolutionMs:clockResolution()},
    options:{samples,warmups,sizes,buildSamples,batchSize:8,capacityPerQuery:64},startup:[],acceptance:{},builds:[],rows:[]};
  const initial=dataset(1000), firstJob=workload('selective');
  // No profiler or resource instrumentation is enabled during these measurements.
  for(const name of Object.keys(paths)) {
    progress(`初始化 ${name}`);
    const t0=performance.now();
    const response=await fetch(paths[name],{cache:'no-store'});
    if(!response.ok)throw new Error(`${paths[name]}: HTTP ${response.status}`);
    bytes[name]=await response.arrayBuffer();
    const t1=performance.now(), client=await factories[name](), t2=performance.now();
    client.build(initial);const t3=performance.now();consume(query(client,firstJob));const t4=performance.now();
    result.startup.push({backend:name,fetchMs:t1-t0,instantiateMs:t2-t1,buildMs:t3-t2,firstQueryMs:t4-t3,totalMs:t4-t0});
    client.release();
    result.acceptance[name]=await acceptance(factories[name],name==='linear');
  }
  for(const count of sizes) for(const distribution of ['uniform','cluster','overlap']) {
    const data=dataset(count,distribution), clients={};
    try {
      for(const name of Object.keys(factories)) {
        const times=[];
        for(let i=0;i<buildSamples;i++) {
          const c=await factories[name]();
          const start=performance.now();c.build(data);times.push(performance.now()-start);
          if(i===buildSamples-1)clients[name]=c;else c.release();
        }
        result.builds.push({count,distribution,backend:name,ms:summary(times),rawMs:times});
      }
      for(const scenario of ['selective','ray','broad']) {
        progress(`${count.toLocaleString()} / ${distribution} / ${scenario}`);
        const job=workload(scenario), oracle=scan(data,job,true);
        const names=Object.keys(clients), raw=Object.fromEntries(names.map(n=>[n,[]]));
        const stats={};
        for(const name of names) {
          const r=query(clients[name],job);verify(r,oracle,job);
          stats[name]=r.reports.reduce((s,r)=>({visitedNodes:s.visitedNodes+r.visitedNodes,
            testedObjects:s.testedObjects+r.testedObjects,totalHits:s.totalHits+r.totalHits,written:s.written+r.written,
            truncated:s.truncated+(r.status===1?1:0)}),{visitedNodes:0,testedObjects:0,totalHits:0,written:0,truncated:0});
        }
        // Rotate backend order on each round. One sample is one public batch call.
        for(let round=-warmups;round<samples;round++) {
          for(let k=0;k<names.length;k++) {
            const name=names[((round+warmups)+k)%names.length];
            const t=performance.now(), r=query(clients[name],job), elapsed=performance.now()-t;
            consume(r);
            if(round>=0)raw[name].push(elapsed);
          }
          if(round%10===0)await pause();
        }
        for(const name of names) result.rows.push({count,distribution,scenario,backend:name,
          batchMs:summary(raw[name]),rawMs:raw[name],...stats[name]});
        await pause();
      }
    } finally {for(const c of Object.values(clients))c.release();}
  }
  result.checksum=sink;result.finishedAt=new Date().toISOString();
  return result;
}

let profileState;
export async function prepareProfile() {
  const response=await fetch('/_build/profile/wasm/release/build/adapters/linear/linear.wasm',{cache:'no-store'});
  if(!response.ok)throw new Error('build the --no-strip profiling module first');
  const client=await createLinear(await response.arrayBuffer());
  const data=dataset(100000,'uniform'), job=workload('ray');
  client.build(data);
  for(let i=0;i<100;i++)consume(query(client,job));
  profileState={client,data,job,broadJob:workload('broad')};
}
export function profileWork(phase, durationMs=1500) {
  if(!profileState)throw new Error('profile not prepared');
  const {client,data}=profileState;
  const job=phase==='query-broad'?profileState.broadJob:profileState.job;
  const until=performance.now()+durationMs;let iterations=0;
  do {
    if(phase==='build')client.build(data);else consume(query(client,job));
    iterations++;
  } while(performance.now()<until);
  return {phase,iterations,checksum:sink,count:100000,distribution:'uniform',
    scenario:phase==='build'?'rebuild':job.name,batchSize:job.batchSize,capacityPerQuery:job.capacity};
}
export function closeProfile(){profileState?.client.release();profileState=undefined;}

let resources;
export async function resourceInit(count=100000) {
  // Resource-only probe captures the public memory export at instantiation.
  // It is never installed during latency tests and does not inspect heap layout.
  let memory;
  const instantiate=WebAssembly.instantiate;
  WebAssembly.instantiate=async(...args)=>{
    const r=await instantiate(...args);memory=(r.instance||r).exports.memory;return r;
  };
  try {
    const client=await createLinear(bytes.linear);
    resources={client,memory,data:dataset(count),job:workload('selective')};
    return {linearCapacityBytes:memory.buffer.byteLength,inputBytes:32+count*52};
  } finally {WebAssembly.instantiate=instantiate;}
}
export function resourceStep(phase) {
  if(phase==='build')resources.client.build(resources.data);
  if(phase==='query')for(let i=0;i<100;i++)resources.output=query(resources.client,resources.job);
  const result={linearCapacityBytes:resources.memory.buffer.byteLength,
    outputIdBytes:resources.output?.ids.byteLength||0};
  if(phase==='release'){resources.client.release();resources=undefined;}
  return result;
}
