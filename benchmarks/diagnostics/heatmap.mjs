import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {summary} from '../browser/data.mjs';
const groups={aabb:['2026-10-25T13-15-43-500Z','2026-10-25T13-18-44-170Z'],points:['2026-10-25T14-02-43-983Z','2026-10-25T14-06-14-389Z']};
const records=[];
for(const [domain,stamps] of Object.entries(groups))for(const [round,stamp] of stamps.entries())for(const size of [1000,10000,100000]){
  const path=`benchmarks/results/${stamp}-${domain==='aabb'?'layout':'points'}-${size}-chrome.json`;
  const bytes=await readFile(path),r=JSON.parse(bytes);
  assert.equal(r.archiveSize,size);
  for(const x of r.rows)assert.deepEqual(summary(x.rawMs),x.batchMs);
  records.push({domain,round:round+1,path,sha256:createHash('sha256').update(bytes).digest('hex'),...r});
}
const template=await readFile('benchmarks/diagnostics/heatmap.html','utf8');
await mkdir('_build/browser-results',{recursive:true});
await writeFile('_build/browser-results/heatmap.html',template.replace('/*DATA*/',JSON.stringify(records).replaceAll('<','\\u003c')));
console.log(`PASS: ${records.length} source files, ${records.reduce((n,r)=>n+r.rows.length,0)} row quantiles; heatmap.html generated with embedded raw samples`);
