export async function acceptance(factory, detailed = false) {
  let checks = 0;
  const ok = (condition, label) => { if (!condition) throw new Error(`acceptance: ${label}`); checks++; };
  const rejects = (fn, label, code) => {
    let error;
    try { fn(); } catch (e) { error=e; }
    ok(!!error, label);
    if (detailed && code) ok(error.code === code, `${label} details`);
    return error;
  };
  const client=await factory(), other=await factory();
  const config={ ids:new Uint32Array([0,0xffffffff,3]),
    bounds:new Float64Array([0,0,0,0,0,0, 1,1,1,2,2,2, -2,-2,-2,-1,-1,-1]),
    root:new Float64Array([0,0,0,10]), maxObjects:3,maxNodes:64 };
  const all=[-10,-10,-10,10,10,10];
  const query=(coords=all,ranges=[0,3],cap=3) => client.query('aabb',new Float64Array(coords),new Int32Array(ranges),cap);
  try {
    rejects(()=>query(),'unbuilt','IndexNotBuilt');
    client.build(config); other.build(config);
    let r=query();
    ok(r.reports[0].written===3 && r.reports[0].status===0,'exact fill');
    ok([...r.ids].sort((a,b)=>a-b).join(',')==='0,3,4294967295','uint32 ids');
    const saved=r.ids.slice();
    const mixed=query([...all,1,0,0,0,0,0],[0,1,1,1],2);
    ok(mixed.reports[0].status===1 && mixed.reports[0].totalHits===3,'truncation');
    ok(detailed ? mixed.reports[1].error.code==='InvertedBounds' : mixed.reports[1].error===11,'per-query error');
    const err=rejects(()=>client.build({...config,ids:new Uint32Array([0,0,3])}),'duplicate','DuplicateId');
    if(detailed) ok(err.details.position===1 && err.details.id===0,'duplicate position');
    rejects(()=>client.build({...config,root:new Float64Array([0,0,0,.5])}),'root outside','OutsideRoot');
    rejects(()=>client.build({...config,bounds:new Float64Array([NaN,...config.bounds.slice(1)])}),'nonfinite','NonFinite');
    ok(query().reports[0].totalHits===3,'failed rebuild preserves index');
    rejects(()=>query([...all,...all],[0,2,1,2]),'overlap','OverlappingOutputRanges');
    rejects(()=>query(all,[1,0x7fffffff]),'overflow','InvalidOutputRange');
    ok(query(all,[0,0],0).reports[0].totalHits===3,'count only');
    ok(query([],[],0).reports.length===0,'empty batch');
    ok(query([2,2,2,2,2,2],[0,1],1).ids[0]===0xffffffff,'tangent');
    const ray=client.query('ray',new Float64Array([-10,0,0,1,-0,0,0,20,0,0,0,0,0,0,0,1]),new Int32Array([0,3,3,0]),3);
    ok(ray.reports[0].totalHits===1 && ray.ids[0]===0,'ray');
    ok(detailed ? ray.reports[1].error.code==='ZeroDirection' : ray.reports[1].error===13,'invalid ray');
    const source=config.bounds.slice();
    client.build({...config,bounds:source}); source.fill(99);
    ok(query().reports[0].totalHits===3,'input snapshot');
    client.build({...config,ids:new Uint32Array(),bounds:new Float64Array(),maxObjects:0});
    ok(query().reports[0].totalHits===0,'empty index');
    client.release();client.release();
    rejects(()=>query(),'released');
    ok(r.ids.every((v,i)=>v===saved[i]),'output lifetime');
    ok(other.query('aabb',new Float64Array(all),new Int32Array([0,0]),0).reports[0].totalHits===3,'instance isolation');
    return {checks,status:'passed'};
  } finally {client.release();other.release();}
}
