import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cpus,totalmem,platform,release} from 'node:os';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {serve,root} from './server.mjs';
import {launch} from './cdp.mjs';
const quick=process.argv.includes('--quick'),record=process.argv.includes('--record');
if(quick&&record)throw Error('--record requires full matrix');
const rayOnly=process.argv.includes('--ray-only'),orderPhase=process.argv.includes('--reverse-order')?1:0;
const options=quick?{samples:20,warmups:5,sizes:[1000],buildSamples:2,rayOnly,orderPhase}:rayOnly?{samples:128,warmups:32,rayOnly,orderPhase}:{orderPhase};
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceSha256={};
for(const path of ['benchmarks/browser/layout.mjs','benchmarks/browser/layout-schedule.mjs','benchmarks/browser/layout-data.mjs','benchmarks/browser/compare.mjs','benchmarks/browser/layout.html','benchmarks/browser/layout-run.mjs',
  'objects/build.mbt','objects/query.mbt','objects/types.mbt',
  'benchmarks/browser/data.mjs','benchmarks/browser/cdp.mjs','benchmarks/browser/server.mjs',
  'benchmarks/strtree/moon.mod','benchmarks/strtree/moon.pkg','benchmarks/strtree/bridge.mbt','benchmarks/strtree/transport.mbt','adapters/linear/client.mjs'])
  sourceSha256[path]=hash(await readFile(join(root,path)));
const dependencyFiles=[];
async function walk(dir,prefix=''){
  for(const d of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(d.name.startsWith('.')||d.name==='_build')continue;
    const path=join(dir,d.name),key=prefix+d.name;
    if(d.isDirectory())await walk(path,key+'/');
    else if(/\.(mbt|mbti|mod|pkg)$/.test(d.name))dependencyFiles.push([key,hash(await readFile(path))]);
  }
}
await walk(join(root,'benchmarks/strtree/.mooncakes/LING71671/moon_strtree'));
const modules={};
for(const [name,path] of Object.entries({before:'_build/browser-results/layout-before.wasm',after:'_build/wasm/release/build/adapters/linear/linear.wasm',strtree:'benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'})){
  const b=await readFile(join(root,path));modules[name]={bytes:b.length,gzip9Bytes:gzipSync(b,{level:9}).length,sha256:hash(b)};
}
const output=join(root,'_build/browser-results');await mkdir(output,{recursive:true});
const {server,url}=await serve();let browser;
try {
  browser=await launch(url+'/benchmarks/browser/layout.html');
  const progress=setInterval(()=>{browser.evaluate('document.querySelector("#status").textContent').then(console.log).catch(()=>{});},15000);
  let result;
  try{result=await browser.evaluate(`window.octreeBench.start(${JSON.stringify(options)})`);}
  finally{clearInterval(progress);}
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
  const command=(cmd,args)=>execFileSync(cmd,args,{cwd:root,encoding:'utf8'}).trim();
  result.host={cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),os:`${platform()} ${release()}`,
    chrome:await browser.send('Browser.getVersion'),chromeArguments:browser.args.map(s=>s.startsWith('--user-data-dir')?'--user-data-dir=<temporary>':s),
    moon:command('moon',['--version']),node:process.version,gitHead:command('git',['rev-parse','HEAD']),gitDirty:!!command('git',['status','--porcelain']),buildMode:'release stripped'};
  result.baselineCommit='2b9bb52';
  const baselineFiles=command('git',['ls-tree','-r','--name-only','2b9bb52']).split('\n').filter(p=>/^(objects|geom|adapters\/linear)\/.*\.(mbt|pkg)$/.test(p)||p==='moon.mod');
  result.baselineSourceSha256=Object.fromEntries(baselineFiles.map(p=>[p,hash(execFileSync('git',['show',`2b9bb52:${p}`],{cwd:root}))]));
  for(const p of baselineFiles)sourceSha256[p]=hash(await readFile(join(root,p)));
  result.modules=modules;result.sourceSha256=sourceSha256;
  result.dependency={name:'LING71671/moon_strtree',version:'0.2.2',sourceFiles:dependencyFiles,sourceManifestSha256:hash(JSON.stringify(dependencyFiles))};
  await writeFile(join(output,'layout.json'),JSON.stringify(result,null,2)+'\n');
  if(record){
    const dir=join(root,'benchmarks/results');await mkdir(dir,{recursive:true});
    for(const size of result.options.sizes){
      const part={...result,archiveSize:size,rows:result.rows.filter(r=>r.count===size),builds:result.builds.filter(r=>r.count===size),resources:result.resources.filter(r=>r.count===size)};
      await writeFile(join(dir,result.startedAt.replace(/[:.]/g,'-')+`-${rayOnly?'ray-order':'layout'}-${size}-chrome.json`),JSON.stringify(part)+'\n',{flag:'wx'});
    }
  }
  console.log(`PASS ${result.rows.length} rows: ${output}/layout.json`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
