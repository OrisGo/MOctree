import {createLinear} from '../../adapters/linear/client.mjs';
import {createPoints} from './points-client.mjs';
import {dataset,scan,verify} from './data.mjs';
import {jobs} from './layout-data.mjs';
import {pointData,pointJobs,pointOracle,verifyPoints} from './points-data.mjs';
let client,sequence,data,config,sink=0;
export async function prepare(c){
  client?.release();config=c;
  const bytes=await(await fetch(`/_build/browser-results/diagnostic-${c.backend}.wasm`)).arrayBuffer();
  client=c.domain==='aabb'?await createLinear(bytes):await createPoints(bytes,c.backend==='loose'?1:0);
  data=c.domain==='aabb'?dataset(c.count,c.distribution):pointData(c.count,c.distribution);
  client.build(data);
  const capacity=c.mode==='all'?c.count:c.mode==='cap64'?64:0;
  sequence=c.domain==='aabb'?jobs(c.scenario==='build'?'selection-small':c.scenario,capacity):pointJobs(c.scenario==='build'?'viewport-small':c.scenario);
  const stats=[];
  for(const j of sequence){
    if(c.domain==='aabb'){const r=client.query(j.kind,j.coordinates,j.ranges,j.outputCapacity);verify(r,scan(data,j,true),j);stats.push(r.reports);}
    else{const r=client.query(j,capacity);verifyPoints(r,pointOracle(data,j),capacity);stats.push(r.reports);}
  }
  work(c.scenario==='build'?2:24);
  document.querySelector('#status').textContent=`已验证 ${c.id} / ${c.backend}`;
  return {stats,coordinates:sequence.map(j=>Array.from(c.domain==='aabb'?j.coordinates:j)),memoryCapacity:client.memoryBytes?.()??null};
}
export function work(iterations){
  const capacity=config.mode==='all'?config.count:config.mode==='cap64'?64:0;
  for(let i=0;i<iterations;i++){
    if(config.scenario==='build'){client.build(data);sink=(sink+1)>>>0;}
    else{const j=sequence[i%8],r=config.domain==='aabb'?client.query(j.kind,j.coordinates,j.ranges,j.outputCapacity):client.query(j,capacity);
      sink=(sink+r.reports.reduce((s,x)=>s+(x.totalHits??x.total),0))>>>0;
    }
  }
  return {iterations,checksum:sink};
}
export function finish(){client?.release();client=null;}
