import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpus,release,platform} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {serve} from '../browser/server.mjs';
import {launch} from '../browser/cdp.mjs';
import {fold} from '../browser/fold.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),output='_build/browser-results',stamp=new Date().toISOString().replace(/[:.]/g,'-');
const archive=`benchmarks/results/${stamp}-diagnostics`;await mkdir(archive,{recursive:true});
const commands=[['--target-dir','_build/diagnostics','build','adapters/linear','--target','wasm','--release','--no-strip'],['--target-dir','_build/diagnostics','build','benchmarks/pointbridge','--target','wasm','--release','--no-strip'],['-C','benchmarks/strtree','--target-dir','_build/diagnostics','build','--target','wasm','--release','--no-strip'],['-C','benchmarks/walkzzz','--target-dir','_build/diagnostics','build','--target','wasm','--release','--no-strip'],['-C','benchmarks/profile','build','--target','js','--release']];
for(const args of commands)execFileSync('moon',args,{stdio:'inherit'});
const files={moctree:'_build/diagnostics/wasm/release/build/adapters/linear/linear.wasm',strtree:'benchmarks/strtree/_build/diagnostics/wasm/release/build/strtree-benchmark.wasm',points:'_build/diagnostics/wasm/release/build/benchmarks/pointbridge/pointbridge.wasm',octree:'benchmarks/walkzzz/_build/diagnostics/wasm/release/build/walkzzz-benchmark.wasm'};
files.loose=files.octree;await mkdir(output,{recursive:true});const modules={};
for(const [name,path] of Object.entries(files)){const b=await readFile(path);modules[name]={path,bytes:b.length,sha256:hash(b)};await copyFile(path,`${output}/diagnostic-${name}.wasm`);}
const sourceSha256={};async function sources(dir){for(const d of await readdir(dir,{withFileTypes:true})){if(d.name==='_build'||d.name==='.git')continue;const p=dir+'/'+d.name;if(d.isDirectory())await sources(p);else if(/\.(mbt|mbti|mjs|html|mod|pkg)$/.test(p))sourceSha256[p]=hash(await readFile(p));}}
for(const p of ['objects','geom','adapters/linear','benchmarks/pointbridge','benchmarks/walkzzz','benchmarks/strtree','benchmarks/profile','benchmarks/diagnostics','benchmarks/browser'])await sources(p);
sourceSha256['moon.mod']=hash(await readFile('moon.mod'));
const flame=await import(pathToFileURL(resolve('benchmarks/profile/_build/js/release/build/octree-profile.js')));
if(flame.version()!=='0.2.0')throw Error('renderer version');
const specs=[
 ['uniform-small','aabb','uniform','selection-small','count',32768,['moctree','strtree']],
 ['cluster-medium','aabb','cluster','selection-medium','count',1024,['moctree','strtree']],
 ['uniform-local-all','aabb','uniform','selection-small','all',512,['moctree','strtree']],
 ['uniform-broad-all','aabb','uniform','broad','all',128,['moctree','strtree']],
 ['cluster-ray-all','aabb','cluster','ray','all',256,['moctree']],
 ['uniform-build','aabb','uniform','build','count',24,['moctree','strtree']],
 ['duplicates-subtree','points','duplicates','subtree','count',256,['points','octree','loose']],
 ['point-uniform-small','points','uniform','viewport-small','count',32768,['points','octree','loose']],
 ['point-uniform-build','points','uniform','build','count',24,['points','octree','loose']],
];
const result={schema:'diagnostic-profiles-v1',startedAt:new Date().toISOString(),samplingIntervalUs:1000,buildMode:'release --no-strip; diagnostic only, not timing ranking',renderer:'moonflame@0.2.0',modules,sourceSha256,commands,profiles:[],host:{cpu:cpus()[0].model,os:`${platform()} ${release()}`,node:process.version,moon:execFileSync('moon',['version'],{encoding:'utf8'}).trim(),gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}};
function sampleStats(p){const nodes=new Map(p.nodes.map(n=>[n.id,n])),parent=new Map();for(const n of p.nodes)for(const id of n.children||[])parent.set(id,n.id);
const self=new Map(),inclusive=new Map();let unresolved=0;
for(const id of p.samples){const f=nodes.get(id).callFrame;if(f.url.startsWith('wasm:')&&(!f.functionName||/^\$?wasm-function/.test(f.functionName)))unresolved++;self.set(id,(self.get(id)||0)+1);const seen=new Set();let n=id;while(n!==undefined){if(seen.has(n))throw Error('cycle');seen.add(n);inclusive.set(n,(inclusive.get(n)||0)+1);n=parent.get(n);}}
const top=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,count])=>({function:nodes.get(id).callFrame.functionName,url:nodes.get(id).callFrame.url,count,percent:100*count/p.samples.length}));return {samples:p.samples.length,unresolvedWasmLeafSamples:unresolved,self:top(self),inclusive:top(inclusive)};}
for(let round=1;round<=2;round++){
 const {server,url}=await serve();let browser;
 try{browser=await launch(url+'/benchmarks/browser/diagnostic-profile.html');result.host.chrome=await browser.send('Browser.getVersion');await browser.send('Profiler.enable');await browser.send('Profiler.setSamplingInterval',{interval:1000});
 for(const [id,domain,distribution,scenario,mode,iterations,backends] of specs)for(const backend of round===1?backends:[...backends].reverse()){
 const c={id,domain,distribution,scenario,mode,iterations,backend,count:100000};console.log(`round ${round}: ${id} / ${backend}`);
 const validation=await browser.evaluate(`window.octreeBench.prepare(${JSON.stringify(c)})`);
 await browser.send('Profiler.start');const work=await browser.evaluate(`window.octreeBench.work(${iterations})`);const {profile}=await browser.send('Profiler.stop');
 const folded=fold(profile),name=`r${round}-${id}-${backend}`,raw=JSON.stringify(profile),svg=flame.render(folded.text);
 await writeFile(`${archive}/${name}.cpuprofile`,raw);await writeFile(`${archive}/${name}.folded`,folded.text);await writeFile(`${archive}/${name}.svg`,svg);
 result.profiles.push({round,...c,validation,work,durationUs:profile.endTime-profile.startTime,...sampleStats(profile),artifacts:{profile:{path:`${name}.cpuprofile`,sha256:hash(raw)},folded:{path:`${name}.folded`,sha256:hash(folded.text)},svg:{path:`${name}.svg`,sha256:hash(svg)}}});
 await browser.evaluate('window.octreeBench.finish()');
 }
 if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
 }finally{try{await browser?.close();}finally{await new Promise(r=>server.close(r));}}
}
result.finishedAt=new Date().toISOString();await writeFile(`${archive}/summary.json`,JSON.stringify(result)+'\n');console.log(`PASS: ${result.profiles.length} profiles archived in ${archive}`);
