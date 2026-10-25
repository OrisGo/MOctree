import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit'});
const moon=(...args)=>run('moon',args);
const node=(...args)=>run(process.execPath,args);
for(const module of ['benchmarks/profile','benchmarks/strtree'])moon('-C',module,'update');
// Root formatting/check/tests are already run by prek. Nested modules are independent.
for(const [module,target] of [['benchmarks/profile','js'],['benchmarks/strtree','wasm']]){
  moon('-C',module,'fmt','--check');moon('-C',module,'check','--target',target,'--deny-warn');
}
moon('-C','benchmarks/profile','test','--target','js','--deny-warn');
const interfaces=execFileSync('git',['ls-files','*.mbti'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const before=new Map(interfaces.map(p=>[p,readFileSync(p,'utf8')]));
moon('info','--target','wasm');
moon('-C','benchmarks/profile','info','--target','js');moon('-C','benchmarks/strtree','info','--target','wasm');
for(const [path,content] of before)if(readFileSync(path,'utf8')!==content)throw Error(`Generated interface is stale: ${path}`);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--','*.mbti'],{encoding:'utf8'}).trim();
if(untracked)throw Error(`Untracked generated interfaces: ${untracked}`);
for(const mode of ['debug','release']){
  const flags=mode==='release'?['--release']:[];
  moon('build','adapters/linear','--target','wasm',...flags);
  for(const target of ['wasm','wasm-gc'])moon('build','adapters/prototype','--target',target,...flags);
  moon('-C','benchmarks/strtree','build','--target','wasm',...flags);
  node('adapters/linear/integration.mjs',mode);
  node('benchmarks/browser/compare-test.mjs',mode);
}
node('adapters/prototype/integration.mjs');
node('benchmarks/browser/verify.mjs');
