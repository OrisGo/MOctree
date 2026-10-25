import {createPoints} from './points-client.mjs';
import {pointData,pointJobs,pointOracle,verifyPoints,acceptPoints,distributions,scenarios} from './points-data.mjs';
import {measurementStep} from './layout-schedule.mjs';
import {summary,SEED} from './data.mjs';
export const paths={moctree:'/_build/browser-results/points-moctree.wasm',octree:'/_build/browser-results/points-walkzzz.wasm',loose:'/_build/browser-results/points-walkzzz.wasm'};
export function factories(bytes){return Object.fromEntries(Object.keys(paths).map(n=>[n,()=>createPoints(bytes[n],n==='loose'?1:0)]));}
let sink=0;
const consume=r=>{sink=(sink+r.reports.reduce((s,x)=>s+x.total,0)+(r.points[0]||0))%1000000007;};
export async function runPoints({quick=false,phase=0}={},progress=()=>{}){
  const options={sizes:quick?[1000]:[1000,10000,100000],samples:quick?24:96,warmups:24,buildSamples:quick?2:5,phase,batchSize:8};
  const bytes={};for(const [n,p] of Object.entries(paths)){const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error(p);bytes[n]=await r.arrayBuffer();}
  const f=factories(bytes),names=Object.keys(f),result={schema:'walkzzz-points-v1',startedAt:new Date().toISOString(),seed:SEED,options,acceptance:{},rows:[],builds:[],resources:[],workloads:{},schedules:[]};
  for(const n of names)result.acceptance[n]=await acceptPoints(f[n]);
  for(const n of options.sizes)for(const distribution of distributions){
    const data=pointData(n,distribution),clients={},builds=Object.fromEntries(names.map(n=>[n,[]]));
    try{
      for(let round=0;round<options.buildSamples;round++)for(let k=0;k<3;k++){
        const name=names[(round+k+phase)%3],c=await f[name](),t=performance.now();c.build(data);builds[name].push(performance.now()-t);
        if(round===options.buildSamples-1)clients[name]=c;else c.release();
      }
      for(const name of names)result.builds.push({count:n,distribution,backend:name,rawMs:builds[name],ms:summary(builds[name])});
      for(const scenario of scenarios){
        const sequence=pointJobs(scenario),oracles=sequence.map(q=>pointOracle(data,q));result.workloads[scenario]=sequence.map(q=>Array.from(q));
        for(const mode of ['count','cap64','all']){
          progress(`${n} / ${distribution} / ${scenario} / ${mode}`);
          const capacity=mode==='count'?0:mode==='cap64'?64:n,raw=Object.fromEntries(names.map(n=>[n,[]])),stats={};
          for(const name of names){stats[name]=[];for(let i=0;i<8;i++){const r=clients[name].query(sequence[i],capacity);verifyPoints(r,oracles[i],capacity);stats[name].push(r.reports);}}
          for(let i=-options.warmups;i<options.samples;i++){
            const step=measurementStep(i<0?i+options.warmups:i,8,names,phase);
            for(const name of step.backends){const t=performance.now(),r=clients[name].query(sequence[step.batch],capacity),ms=performance.now()-t;consume(r);if(i>=0)raw[name].push(ms);}
            if(i%8===0)await new Promise(r=>setTimeout(r,0));
          }
          for(const name of names)result.rows.push({count:n,distribution,scenario,mode,backend:name,rawMs:raw[name],batchMs:summary(raw[name]),perBatch:stats[name]});
        }
      }
    }finally{for(const c of Object.values(clients))c.release();}
  }
  for(const n of options.sizes)for(const distribution of distributions)for(const name of names){
    const c=await f[name]();try{const r={count:n,distribution,backend:name,initBytes:c.memoryBytes()};c.build(pointData(n,distribution));r.buildBytes=c.memoryBytes();
      for(const mode of ['count','cap64','all']){const cap=mode==='count'?0:mode==='cap64'?64:n;for(let i=0;i<20;i++)consume(c.query(pointJobs('broad')[0],cap));r[mode+'Bytes']=c.memoryBytes();}result.resources.push(r);
    }finally{c.release();}
  }
  result.schedules=Array.from({length:options.samples},(_,i)=>measurementStep(i,8,names,phase));
  result.checksum=sink;result.finishedAt=new Date().toISOString();return result;
}
