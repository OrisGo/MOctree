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
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceSha256={};
for(const path of ['benchmarks/browser/compare.mjs','benchmarks/browser/compare-page.mjs','benchmarks/browser/compare-run.mjs',
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
for(const [name,path] of Object.entries({octree:'_build/wasm/release/build/adapters/linear/linear.wasm',strtree:'benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'})){
  const b=await readFile(join(root,path));modules[name]={bytes:b.length,gzip9Bytes:gzipSync(b,{level:9}).length,sha256:hash(b)};
}
const output=join(root,'_build/browser-results');await mkdir(output,{recursive:true});
const {server,url}=await serve();let browser;
try {
  browser=await launch(url+'/benchmarks/browser/comparison.html');
  const progress=setInterval(()=>{browser.evaluate('document.querySelector("#status").textContent').then(console.log).catch(()=>{});},15000);
  let result;
  try{result=await browser.evaluate(`window.octreeBench.start(${quick?JSON.stringify({samples:20,warmups:5,sizes:[1000],buildSamples:2}):'{}'})`);}
  finally{clearInterval(progress);}
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
  const command=(cmd,args)=>execFileSync(cmd,args,{cwd:root,encoding:'utf8'}).trim();
  result.host={cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),os:`${platform()} ${release()}`,
    chrome:await browser.send('Browser.getVersion'),chromeArguments:browser.args.map(s=>s.startsWith('--user-data-dir')?'--user-data-dir=<temporary>':s),
    moon:command('moon',['--version']),node:process.version,gitHead:command('git',['rev-parse','HEAD']),gitDirty:!!command('git',['status','--porcelain']),buildMode:'release stripped'};
  result.modules=modules;result.sourceSha256=sourceSha256;
  result.dependency={name:'LING71671/moon_strtree',version:'0.2.2',sourceFiles:dependencyFiles,sourceManifestSha256:hash(JSON.stringify(dependencyFiles))};
  await writeFile(join(output,'comparison.json'),JSON.stringify(result,null,2)+'\n');
  // Exercise UI filters against real result rows and verify rendering has no exceptions.
  const ui=await browser.evaluate(`(()=>{for(const id of ['distribution','scenario','mode']){const el=document.querySelector('#'+id);el.value=id==='distribution'?'overlap':id==='scenario'?'broad':'all';el.dispatchEvent(new Event('change'));}return {rows:document.querySelectorAll('#rows tr').length,text:document.querySelector('#rows').textContent};})()`);
  if(ui.rows!==result.options.sizes.length*3||!ui.text.includes('MoonSTRtree'))throw Error('comparison UI filter failed');
  result.uiChecks={filters:true,visibleRows:ui.rows};
  await browser.evaluate(`document.querySelector('#distribution').value='uniform';document.querySelector('#scenario').value='selective';document.querySelector('#mode').value='cap64';document.querySelector('#mode').dispatchEvent(new Event('change'))`);
  const {data}=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,'comparison.png'),Buffer.from(data,'base64'));
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
  await writeFile(join(output,'comparison.json'),JSON.stringify(result,null,2)+'\n');
  if(record){const dir=join(root,'benchmarks/results');await mkdir(dir,{recursive:true});await writeFile(join(dir,result.startedAt.replace(/[:.]/g,'-')+'-strtree-chrome.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
  console.log(`PASS ${result.rows.length} rows: ${output}/comparison.json`);
}finally{
  try{await browser?.close();}
  finally{await new Promise(resolve=>server.close(resolve));}
}
