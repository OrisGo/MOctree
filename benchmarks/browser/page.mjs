import * as bench from './bench.mjs';
const $=s=>document.querySelector(s);
let latest;
const label={linear:'wasm 块传输',scalar:'wasm 标量',gc:'wasm-gc 标量',scan:'JS 暴力扫描'};
const fmt=x=>x.toFixed(3);
function showRows() {
  const tbody=$('#rows');tbody.replaceChildren();
  for(const r of latest.rows.filter(r=>r.distribution===$('#distribution').value&&r.scenario===$('#scenario').value)) {
    const tr=document.createElement('tr');
    for(const value of [`${r.count.toLocaleString()} · ${label[r.backend]}`,fmt(r.batchMs.p50),fmt(r.batchMs.p95),fmt(r.batchMs.p99),r.testedObjects.toLocaleString(),`${r.totalHits.toLocaleString()} / ${r.written.toLocaleString()}`]) {
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    tbody.append(tr);
  }
}
export function display(result) {
  latest=result;$('#results').hidden=false;$('#download').disabled=false;
  $('#cards').replaceChildren();
  for(const [value,title] of [[Object.values(result.acceptance).reduce((s,r)=>s+r.checks,0),'浏览器契约断言通过'],[result.rows.length,'性能测量组合'],[result.options.samples,'每组合采样数']]) {
    const card=document.createElement('div');card.className='card';
    const strong=document.createElement('strong');strong.textContent=value;card.append(strong,document.createTextNode(title));$('#cards').append(card);
  }
  const resource=result.resources;
  $('#resources').textContent=resource
    ? `线性内存容量：初始化 ${(resource.init.linearCapacityBytes/1048576).toFixed(2)} MiB，构建后 ${(resource.build.linearCapacityBytes/1048576).toFixed(2)} MiB，100 批查询后 ${(resource.query.linearCapacityBytes/1048576).toFixed(2)} MiB。完整快照与测量边界见 JSON 和验收文档。`
    : '交互计时不启用资源探针；自动验收脚本另行采集资源快照。';
  $('#status').textContent=`完成 · ${result.finishedAt} · ${result.environment.userAgent}`;
  showRows();
}
async function start(options) {
  $('#run').disabled=true;$('#saved').disabled=true;$('#error').textContent='';
  try {const result=await bench.runBenchmarks(options,s=>$('#status').textContent=s);display(result);return result;}
  catch(e){$('#error').textContent=e.stack||String(e);$('#status').textContent='失败';throw e;}
  finally{$('#run').disabled=false;$('#saved').disabled=false;}
}
async function saved() {
  try {
    const r=await fetch('/_build/browser-results/results.json',{cache:'no-store'});
    if(!r.ok)throw new Error('尚无已保存结果，请先运行自动验收脚本。');
    display(await r.json());$('#flame').src='/_build/browser-results/query.svg';$('#flame').hidden=false;
  } catch(e){$('#error').textContent=e.message;}
}
$('#run').onclick=()=>start().catch(()=>{});$('#saved').onclick=saved;
$('#distribution').onchange=showRows;$('#scenario').onchange=showRows;
$('#download').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='moctree-browser-results.json';a.click();URL.revokeObjectURL(url);
};
window.octreeBench={start,display,...bench};
if(new URLSearchParams(location.search).has('saved'))await saved();
