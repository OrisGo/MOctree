import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cpus,totalmem,platform,release} from 'node:os';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {serve,root} from './server.mjs';
import {launch} from './cdp.mjs';
const quick=process.argv.includes('--quick'),record=process.argv.includes('--record'),phase=process.argv.includes('--reverse-order')?1:0;
if(quick&&record)throw Error('quick is not a full record');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSha256={};
async function manifest(dir){for(const d of (await readdir(join(root,dir),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(d.name.startsWith('.')||d.name==='_build')continue;
  const p=dir+'/'+d.name;if(d.isDirectory())await manifest(p);else if(/\.(mbt|mbti|mod|pkg)$/.test(p))sourceSha256[p]=hash(await readFile(join(root,p)));
}}
for(const p of ['objects','geom','benchmarks/pointbridge','benchmarks/walkzzz'])await manifest(p);
sourceSha256['moon.mod']=hash(await readFile(join(root,'moon.mod')));
for(const p of ['points-client.mjs','points-data.mjs','points.mjs','points.html','points-run.mjs','data.mjs','layout-data.mjs','layout-schedule.mjs','server.mjs','cdp.mjs'])sourceSha256['benchmarks/browser/'+p]=hash(await readFile(join(root,'benchmarks/browser',p)));
const output=join(root,'_build/browser-results');await mkdir(output,{recursive:true});
const modules={};for(const [name,path] of Object.entries({moctree:'_build/wasm/release/build/benchmarks/pointbridge/pointbridge.wasm',walkzzz:'benchmarks/walkzzz/_build/wasm/release/build/walkzzz-benchmark.wasm'})){
  const b=await readFile(join(root,path));modules[name]={bytes:b.length,gzip9Bytes:gzipSync(b,{level:9}).length,sha256:hash(b)};await copyFile(join(root,path),join(output,`points-${name}.wasm`));
}
const coreManifest=sourceSha256;const dependency={};
async function dep(dir,prefix=''){for(const d of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(d.name.startsWith('.')||d.name==='_build')continue;const p=join(dir,d.name),k=prefix+d.name;if(d.isDirectory())await dep(p,k+'/');else if(/\.(mbt|mbti|mod|pkg)$/.test(k))dependency[k]=hash(await readFile(p));}}
await dep(join(root,'benchmarks/walkzzz/.mooncakes/walkzzz/moon-geometry'));
const {server,url}=await serve();let browser;
try{
  browser=await launch(url+'/benchmarks/browser/points.html');
  const timer=setInterval(()=>browser.evaluate('document.querySelector("#status").textContent').then(console.log).catch(()=>{}),15000);
  let result;try{result=await browser.evaluate(`window.octreeBench.start(${JSON.stringify({quick,phase})})`);}finally{clearInterval(timer);}
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
  result.host={cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),os:`${platform()} ${release()}`,chrome:await browser.send('Browser.getVersion'),node:process.version,moon:execFileSync('moon',['version'],{encoding:'utf8'}).trim(),gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),gitDirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),buildMode:'release stripped'};
  result.sourceSha256=coreManifest;result.modules=modules;result.dependency={name:'walkzzz/moon-geometry',version:'0.251.0',sourceSha256:dependency};
  const ui=await browser.evaluate('({status:document.querySelector("#status").textContent,result:JSON.parse(document.querySelector("#result").textContent)})');
  if(ui.status!=='完成'||ui.result.rows!==result.rows.length)throw Error('visible page result');result.uiPassed=true;
  await writeFile(join(output,'points.json'),JSON.stringify(result)+'\n');
  if(record)for(const size of result.options.sizes){const part={...result,archiveSize:size,rows:result.rows.filter(r=>r.count===size),builds:result.builds.filter(r=>r.count===size),resources:result.resources.filter(r=>r.count===size)};await writeFile(join(root,'benchmarks/results',result.startedAt.replace(/[:.]/g,'-')+`-points-${size}-chrome.json`),JSON.stringify(part)+'\n',{flag:'wx'});}
  console.log(`PASS ${result.rows.length} point rows, UI and coordinate multiset checks`);
}finally{
  try{await browser?.close();}
  finally{await new Promise(r=>server.close(r));}
}
