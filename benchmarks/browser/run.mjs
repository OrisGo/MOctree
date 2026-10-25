import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve, root } from './server.mjs';
import { launch } from './cdp.mjs';
import { fold } from './fold.mjs';

const output=join(root,'_build/browser-results');
await mkdir(output,{recursive:true});
const command=(cmd,args)=>execFileSync(cmd,args,{cwd:root,encoding:'utf8'}).trim();
const sourceSha256={};
for(const path of ['benchmarks/browser/bench.mjs','benchmarks/browser/data.mjs','benchmarks/browser/acceptance.mjs',
  'benchmarks/browser/run.mjs','benchmarks/browser/fold.mjs','benchmarks/profile/render.mbt',
  'adapters/linear/client.mjs','adapters/prototype/client.mjs'])
  sourceSha256[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');
const moduleInfo={};
for(const [name,path] of Object.entries({linear:'wasm/release/build/adapters/linear/linear.wasm',
  scalar:'wasm/release/build/adapters/prototype/prototype.wasm',gc:'wasm-gc/release/build/adapters/prototype/prototype.wasm',
  profile:'profile/wasm/release/build/adapters/linear/linear.wasm'})) {
  const data=await readFile(join(root,'_build',path));
  moduleInfo[name]={bytes:data.length,gzip9Bytes:gzipSync(data,{level:9}).length,sha256:createHash('sha256').update(data).digest('hex')};
}
const flame=await import(pathToFileURL(resolve(root,'benchmarks/profile/_build/js/release/build/octree-profile.js')));
if(flame.version()!=='0.2.0')throw new Error('expected moonflame 0.2.0');
const {server,url}=await serve();let browser;
try {
  browser=await launch(`${url}/benchmarks/browser/index.html`);
  const version=await browser.send('Browser.getVersion');
  console.log(`Browser: ${version.product}; starting unprofiled measurements`);
  const options=process.argv.includes('--quick')?{samples:20,warmups:5,sizes:[1000],buildSamples:2}:{};
  const progress=setInterval(()=>{browser.evaluate('document.querySelector("#status").textContent')
    .then(text=>console.log(`Progress: ${text}`)).catch(()=>{});},15000);
  let result;
  try {result=await browser.evaluate(`window.octreeBench.start(${JSON.stringify(options)})`);}
  finally {clearInterval(progress);}
  result.host={cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),os:`${platform()} ${release()}`,
    chrome:version,chromeArguments:browser.args.map(s=>s.startsWith('--user-data-dir')?'--user-data-dir=<temporary>':s),
    moon:command('moon',['--version']),node:process.version,gitHead:command('git',['rev-parse','HEAD']),
    gitDirty:command('git',['status','--porcelain']).length>0,buildMode:'release (stripped); profiling uses separate release --no-strip artifact'};
  result.modules=moduleInfo;
  result.sourceSha256=sourceSha256;
  console.log(`Measurements passed: ${result.rows.length} rows; sampling resources separately`);
  await browser.send('HeapProfiler.enable');
  const heap=async()=>{await browser.send('HeapProfiler.collectGarbage');return browser.send('Runtime.getHeapUsage');};
  result.resources={description:'Fresh linear instance, 100K uniform objects. CDP heap snapshots after forced GC; memory.buffer is allocated capacity, not live heap. No true peak RSS measurement.',baseline:{heap:await heap()}};
  result.resources.init={...await browser.evaluate('window.octreeBench.resourceInit()'),heap:await heap()};
  for(const phase of ['build','query','release'])result.resources[phase]={...await browser.evaluate(`window.octreeBench.resourceStep('${phase}')`),heap:await heap()};
  await browser.send('HeapProfiler.disable');
  result.profiles={renderer:{package:'gywcs101/moonflame',version:flame.version(),target:'js'}};
  await browser.evaluate('window.octreeBench.prepareProfile()');
  await browser.send('Profiler.enable');
  await browser.send('Profiler.setSamplingInterval',{interval:1000});
  for(const phase of ['build','query','query-broad']) {
    console.log(`Collecting ${phase} CPU samples`);
    await browser.send('Profiler.start');
    const workload=await browser.evaluate(`window.octreeBench.profileWork('${phase}',1500)`);
    const {profile}=await browser.send('Profiler.stop');
    const folded=fold(profile);
    await writeFile(join(output,`${phase}.cpuprofile`),JSON.stringify(profile));
    await writeFile(join(output,`${phase}.folded`),folded.text);
    await writeFile(join(output,`${phase}.svg`),flame.render(folded.text));
    await writeFile(join(output,`${phase}.hotspots.txt`),flame.hotspots(folded.text));
    result.profiles[phase]={...workload,samples:folded.samples,stacks:folded.stacks,unit:folded.unit,requestedIntervalUs:1000};
  }
  await browser.send('Profiler.disable');await browser.evaluate('window.octreeBench.closeProfile()');
  if(browser.errors.length)throw new Error(`Browser exceptions: ${JSON.stringify(browser.errors)}`);
  await writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  await browser.evaluate(`fetch('/_build/browser-results/results.json').then(r=>r.json()).then(window.octreeBench.display)`);
  const {data}=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,'dashboard.png'),Buffer.from(data,'base64'));
  // Verify the generated SVG actually renders and its interaction script runs.
  await browser.send('Page.navigate',{url:`${url}/_build/browser-results/query.svg`});
  await browser.evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(window.FRAMES&&window.orig?.length===window.FRAMES.length){clearInterval(t);resolve(true);}else if(n++>100){clearInterval(t);reject(new Error('SVG script did not initialize'));}},50);})`);
  const svgCheck=await browser.evaluate(`(()=>{
    const frame=[...FRAMES].find(g=>g.getAttribute('data-name').includes('run__query'));
    if(!frame)throw new Error('No named WASM query frame in the sampled profile');
    frame.querySelector('rect').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    if(document.querySelector('#unzoom').classList.contains('hide'))throw new Error('SVG zoom failed');
    window.term='run__query';doSearch();
    const matched=document.querySelector('#matched').textContent;
    if(!matched.includes('100%'))throw new Error('SVG search failed: '+matched);
    resetSearch();document.querySelector('#unzoom').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    if(document.querySelectorAll('#frames > .hide, #frames > .parent').length)throw new Error('SVG reset failed');
    return {rects:document.querySelectorAll('rect').length,scripts:document.querySelectorAll('script').length,zoom:true,search:matched,reset:true};
  })()`);
  result.profiles.svgBrowserCheck=svgCheck;
  const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(output,'flamegraph.png'),Buffer.from(shot.data,'base64'));
  if(browser.errors.length)throw new Error(`Browser exceptions: ${JSON.stringify(browser.errors)}`);
  await writeFile(join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  if(process.argv.includes('--record')) {
    if(process.argv.includes('--quick'))throw new Error('--record requires the full matrix');
    const records=join(root,'benchmarks/results');await mkdir(records,{recursive:true});
    const stamp=result.startedAt.replace(/[:.]/g,'-');
    await writeFile(join(records,`${stamp}-chrome-linux.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  }
  console.log(`PASS: ${output}/results.json`);
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
