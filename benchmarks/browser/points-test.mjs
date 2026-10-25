import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {factories} from './points.mjs';
import {acceptPoints} from './points-data.mjs';
const mode=process.argv[2]||'release';
const m=await readFile(`_build/wasm/${mode}/build/benchmarks/pointbridge/pointbridge.wasm`),w=await readFile(`benchmarks/walkzzz/_build/wasm/${mode}/build/walkzzz-benchmark.wasm`);
const f=factories({moctree:m,octree:w,loose:w}),result={mode,acceptance:{},outsideRoot:{}};
for(const [name,create] of Object.entries(f)){
  result.acceptance[name]=await acceptPoints(create);
  const c=await create();try{
    try{c.build(new Float64Array([500,0,0]));result.outsideRoot[name]={accepted:true,query:c.query(new Float64Array([499,-1,-1,501,1,1]),1).reports[0]};}
    catch(error){result.outsideRoot[name]={accepted:false,message:error.message};}
  }finally{c.release();}
}
await mkdir('_build/browser-results',{recursive:true});
await writeFile(`_build/browser-results/points-${mode}-tests.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
