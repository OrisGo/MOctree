import {runComparison,labels} from './compare.mjs';
const $=s=>document.querySelector(s);let latest;
const cells=(tr,values)=>{for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}};
function rows(){
  $('#rows').replaceChildren();
  for(const r of latest.rows.filter(r=>r.distribution===$('#distribution').value&&r.scenario===$('#scenario').value&&r.mode===$('#mode').value)){
    const tr=document.createElement('tr');cells(tr,[`${r.count.toLocaleString()} · ${labels[r.backend]}`,...['p50','p95','p99'].map(k=>r.batchMs[k].toFixed(3)),`${r.totalHits.toLocaleString()} / ${r.written.toLocaleString()}`]);$('#rows').append(tr);
  }
  const table=document.createElement('table'),head=document.createElement('tr');cells(head,['构建对象数 / 后端','构建 p50（ms）']);table.append(head);
  for(const r of latest.builds.filter(r=>r.distribution===$('#distribution').value)){
    const tr=document.createElement('tr');cells(tr,[`${r.count.toLocaleString()} · ${labels[r.backend]}`,r.ms.p50.toFixed(3)]);table.append(tr);
  }
  $('#builds').replaceChildren(table);
}
export function display(result){
  latest=result;$('#results').hidden=false;$('#download').disabled=false;
  $('#status').textContent=`完成 · ${result.finishedAt}`;
  $('#summary').textContent=`${Object.values(result.acceptance).reduce((s,r)=>s+r.checks,0)} 项校验通过 · ${result.rows.length} 组测量 · 每组 ${result.options.samples} 次采样`;
  $('#resources').textContent=Object.entries(result.resources).map(([n,r])=>`${labels[n]}：10 万均匀对象构建后 ${(r.buildBytes/1048576).toFixed(2)} MiB，依次进行计数、限量、全部输出后 ${(r.allBytes/1048576).toFixed(2)} MiB。`).join(' ');
  rows();
}
async function start(options){
  $('#run').disabled=$('#saved').disabled=true;$('#error').textContent='';
  try{const r=await runComparison(options,s=>$('#status').textContent=s);display(r);return r;}
  catch(e){$('#error').textContent=e.stack||String(e);throw e;}
  finally{$('#run').disabled=$('#saved').disabled=false;}
}
async function saved(){try{const r=await fetch('/_build/browser-results/comparison.json',{cache:'no-store'});if(!r.ok)throw Error('请先运行 compare-run.mjs 生成结果');display(await r.json());}catch(e){$('#error').textContent=e.message;}}
$('#run').onclick=()=>start().catch(()=>{});$('#saved').onclick=saved;
for(const id of ['distribution','scenario','mode'])$('#'+id).onchange=rows;
$('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='strtree-comparison.json';a.click();URL.revokeObjectURL(url);};
window.octreeBench={start,display};
if(new URLSearchParams(location.search).has('saved'))await saved();
