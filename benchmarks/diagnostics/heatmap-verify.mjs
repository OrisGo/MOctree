// Verify the newly rendered page independently of historical profiler source hashes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {serve} from '../browser/server.mjs';
import {launch} from '../browser/cdp.mjs';

const {server,url}=await serve();let browser;
try{
  browser=await launch(url+'/_build/browser-results/heatmap.html');
  const result=await browser.evaluate(`(()=>{
    const $=id=>document.getElementById(id),change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change'));};
    if(window.octreeBench.records!==12)throw Error('source count');
    let cells=0,batches=0;
    for(const domain of ['aabb','points']){
      change('domain',domain);
      for(const peer of domain==='aabb'?['strtree']:['octree','loose'])for(const round of ['1','2'])for(const dist of domain==='aabb'?['uniform','cluster','overlap']:['uniform','cluster','duplicates']){
        change('peer',peer);change('round',round);change('distribution',dist);
        for(const metric of ['p50','p95','p99','tested','visited','hits','written']){
          change('metric',metric);
          for(const button of document.querySelectorAll('#matrix button')){
            button.click();const detail=JSON.parse($('detail').textContent);
            if(detail.domain!==domain||detail.round!==+round||detail.peer.backend!==peer)throw Error('cell identity');
            // These fixed archives use v1 AABB (20 warmups) and point schedules starting at zero.
            // Do not reuse the renderer's sampleBatches mapping as the oracle.
            for(const row of [detail.moctree,detail.peer]){
              if(row.perBatch.length!==8)throw Error('batch count');
              for(let batch=0;batch<8;batch++){
                const xs=row.rawMs.filter((_,i)=>(i+(domain==='aabb'?20:0))%8===batch).sort((a,b)=>a-b);
                const actual=row.perBatch[batch].latency;
                if(actual.samples!==xs.length)throw Error('sample count');
                for(const [key,fraction] of [['p50',.5],['p95',.95],['p99',.99]])if(actual[key]!==xs[Math.ceil(xs.length*fraction)-1])throw Error('batch quantile mismatch: '+detail.source+' '+batch+' '+key);
                batches++;
              }
            }
            if(detail.peer.perBatch.some(x=>x.tested!==null))throw Error('missing peer statistics');
            cells++;
          }
        }
      }
    }
    change('domain','aabb');change('distribution','cluster');change('round','1');change('metric','p50');
    const row=[...document.querySelectorAll('#matrix tr')].find(r=>r.firstElementChild.textContent==='selection-medium');
    row.querySelectorAll('button')[6].click();const detail=JSON.parse($('detail').textContent);
    if(detail.n!==100000||detail.moctree.perBatch[0].hits!==155170||Math.abs(detail.moctree.perBatch[0].latency.p50-4.37)>1e-6)throw Error('high-hit regression');
    if(detail.moctree.perBatch[4].hits!==0||Math.abs(detail.moctree.perBatch[4].latency.p50-.01)>1e-6)throw Error('empty regression');
    return {cells,batches};
  })()`);
  assert.equal(result.cells,5670);assert.equal(result.batches,90720);
  const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile('_build/browser-results/heatmap-fixed.png',Buffer.from(shot.data,'base64'));
  if(browser.errors.length)throw Error(JSON.stringify(browser.errors));
  console.log(`PASS: ${result.cells} heatmap cells, ${result.batches} batch quantiles, high-hit/empty regression`);
}finally{try{await browser?.close();}finally{await new Promise(resolve=>server.close(resolve));}}
