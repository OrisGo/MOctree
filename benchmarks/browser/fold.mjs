// Chrome samples are counted, not converted to exact CPU time. Keeping GC/idle
// samples avoids silently changing the denominator of the rendered profile.
export function fold(profile) {
  if(!profile.samples?.length)throw new Error('CPU profile has no samples');
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])), parents=new Map();
  for(const n of profile.nodes)for(const child of n.children||[]) {
    if(parents.has(child))throw new Error('ambiguous profile parent');
    parents.set(child,n.id);
  }
  const escape=s=>s.replace(/[%\r\n;]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const labels=new Map();
  for(const n of profile.nodes) {
    const f=n.callFrame;
    labels.set(n.id,escape((f.functionName||'(anonymous)')+
      (f.url&&!f.url.startsWith('wasm:')?` [${f.url.split('/').at(-1)}:${f.lineNumber+1}]`:'')));
  }
  const counts=new Map();
  for(const id of profile.samples) {
    const stack=[],seen=new Set();let current=id;
    while(current!==undefined){
      if(!nodes.has(current)||seen.has(current))throw new Error('invalid CPU profile tree');
      seen.add(current);stack.push(labels.get(current));current=parents.get(current);
    }
    const key=stack.reverse().join(';');counts.set(key,(counts.get(key)||0)+1);
  }
  return {text:[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([stack,count])=>`${stack} ${count}`).join('\n')+'\n',
    samples:profile.samples.length,stacks:counts.size,unit:'count'};
}
