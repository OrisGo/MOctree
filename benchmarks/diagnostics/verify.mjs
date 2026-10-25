import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serve} from '../browser/server.mjs';
import {launch} from '../browser/cdp.mjs';
import {fold} from '../browser/fold.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const dir=process.argv[2];
if(!dir)throw Error('pass archived diagnostics directory');
const summary=JSON.parse(await readFile(dir+'/summary.json'));
assert.equal(summary.profiles.length,40);
for(const [path,sha] of Object.entries(summary.sourceSha256))assert.equal(hash(await readFile(path)),sha,path);
for(const module of Object.values(summary.modules))assert.equal(hash(await readFile(module.path)),module.sha256);
for(const p of summary.profiles){
  for(const a of Object.values(p.artifacts))assert.equal(hash(await readFile(dir+'/'+a.path)),a.sha256,a.path);
  const raw=JSON.parse(await readFile(dir+'/'+p.artifacts.profile.path));
  assert.equal(raw.samples.length,p.samples);assert.equal(fold(raw).text,await readFile(dir+'/'+p.artifacts.folded.path,'utf8'));
  assert.ok(p.samples>0);assert.equal(p.work.iterations,p.iterations);
  if(p.round===2){const prior=summary.profiles.find(x=>x.round===1&&x.id===p.id&&x.backend===p.backend);assert.deepEqual(p.validation.coordinates,prior.validation.coordinates);assert.deepEqual(p.validation.stats,prior.validation.stats);}
}
const {server,url}=await serve();let browser;
try{
 browser=await launch(url+'/_build/browser-results/heatmap.html');
 const ui=await browser.evaluate(`(()=>{
  const $=id=>document.getElementById(id),change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change'));};
  if(window.octreeBench.records!==12)throw Error('sources');
  let cells=0;
  for(const domain of ['aabb','points']){change('domain',domain);for(const peer of domain==='aabb'?['strtree']:['octree','loose'])for(const round of ['1','2'])for(const dist of domain==='aabb'?['uniform','cluster','overlap']:['uniform','cluster','duplicates']){
    change('peer',peer);change('round',round);change('distribution',dist);
    for(const metric of ['p50','p95','p99','tested','visited','hits','written']){change('metric',metric);for(const b of document.querySelectorAll('#matrix button')){b.click();const d=JSON.parse($('detail').textContent);if(d.domain!==domain||d.round!==+round||d.peer.backend!==peer||d.moctree.perBatch.length!==8)throw Error('cell detail mismatch');if(d.peer.perBatch.some(x=>x.tested!==null))throw Error('unknown peer stats must be null');cells++;}}
  }}
  change('domain','aabb');change('distribution','uniform');change('round','1');change('metric','p50');document.querySelectorAll('#matrix button')[6].click();
  return {cells,rows:document.querySelectorAll('#matrix tr').length};
 })()`);
 assert.equal(ui.cells,5670);
 const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('_build/browser-results/heatmap.png',Buffer.from(shot.data,'base64'));
 if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
 console.log('PASS: profile artifacts, source/module hashes, two-round coordinates/stats, heatmap '+ui.cells+' cell interactions');
}finally{try{await browser?.close();}finally{await new Promise(r=>server.close(r));}}
