import {random,SEED} from './data.mjs';
import {jobs} from './layout-data.mjs';
export const distributions=['uniform','cluster','duplicates'];
export const scenarios=['viewport-small','selection-medium','subtree','broad'];
export function pointData(n,kind){
  const rand=random(SEED),p=new Float64Array(n*3);
  for(let i=0;i<n;i++)for(let k=0;k<3;k++){
    const x=rand()*180-90;
    p[i*3+k]=kind==='duplicates'?0:kind==='cluster'?x*.05+(i%2?40:-40):x;
  }
  return p;
}
export function pointJobs(scenario){
  const sequence=jobs(scenario,0).map(j=>j.coordinates);
  if(scenario==='subtree')for(const q of sequence)for(let i=0;i<8;i++)q.set([i&1?0:-100,i&2?0:-100,i&4?0:-100,i&1?100:0,i&2?100:0,i&4?100:0],i*6);
  return sequence;
}
const key=(p,i)=>`${p[i]},${p[i+1]},${p[i+2]}`;
export function pointOracle(data,coordinates){
  return Array.from({length:coordinates.length/6},(_,q)=>{
    const p=q*6,multiset=new Map();let total=0;
    for(let i=0;i<data.length;i+=3)if(data[i]>=coordinates[p]&&data[i]<=coordinates[p+3]&&data[i+1]>=coordinates[p+1]&&data[i+1]<=coordinates[p+4]&&data[i+2]>=coordinates[p+2]&&data[i+2]<=coordinates[p+5]){
      const s=key(data,i);multiset.set(s,(multiset.get(s)||0)+1);total++;
    }
    return {total,multiset};
  });
}
export function verifyPoints(actual,oracle,capacity){
  if(actual.reports.length!==oracle.length)throw Error('report count');
  oracle.forEach((e,i)=>{
    const r=actual.reports[i];
    if(r.total!==e.total||r.written!==Math.min(capacity,e.total))throw Error(`counts: ${JSON.stringify(r)} expected ${e.total}`);
    const seen=new Map();
    for(let j=0;j<r.written;j++){
      const s=key(actual.points,(i*capacity+j)*3),n=(seen.get(s)||0)+1;seen.set(s,n);
      if(n>(e.multiset.get(s)||0))throw Error('wrong point or duplicate multiplicity');
    }
    for(let j=r.written;j<capacity;j++)for(let k=0;k<3;k++)if(actual.points[(i*capacity+j)*3+k]!==0)throw Error('unwritten region changed');
  });
}
export async function acceptPoints(factory){
  const c=await factory();let checks=0;
  try{
    const sets=[new Float64Array(),new Float64Array([-100,-100,-100,100,100,100,0,0,0,0,0,0,0,1,-1]),...distributions.map(d=>pointData(257,d)),new Float64Array(Array.from({length:90},(_,i)=>i%3===0?i/3-15:0))];
    for(const data of sets){
      c.build(data);
      const q=new Float64Array([-100,-100,-100,100,100,100, 0,0,0,0,0,0, 100,100,100,100,100,100, 200,200,200,201,201,201, -1,-2,-3,1,2,3]);
      const expected=pointOracle(data,q);
      for(const cap of [0,1,7,data.length/3,data.length/3+1]){verifyPoints(c.query(q,cap),expected,cap);checks++;}
    }
    // Dedicated exact-fill and independent result lifetime checks.
    const data=pointData(32,'uniform'),q=pointJobs('broad')[0];c.build(data);
    const prior=c.query(q,32),saved=prior.points.slice();
    verifyPoints(prior,pointOracle(data,q),32);checks++;
    data.fill(500);c.query(q,1);
    if(!prior.points.every((x,i)=>x===saved[i]))throw Error('result lifetime');
    verifyPoints(c.query(q,32),pointOracle(pointData(32,'uniform'),q),32);checks++;
    return {checks,status:'passed'};
  }finally{c.release();}
}
