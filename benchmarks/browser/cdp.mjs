import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function launch(url) {
  const directory=await mkdtemp(join(tmpdir(),'moctree-chrome-'));
  const args=['--headless=new','--remote-debugging-port=0',`--user-data-dir=${directory}`,
    '--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'];
  const child=spawn(process.env.CHROME_BIN||'google-chrome',args,{stdio:['ignore','ignore','pipe']});
  let log='';child.stderr.on('data',chunk=>{log+=chunk;});
  const cleanup=async()=>{
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
    // Only this invocation's mkdtemp profile is removed, never a user profile.
    // Chrome subprocesses can still finish profile writes after the main
    // process exits. Retry transient ENOTEMPTY/EBUSY errors with a bounded
    // backoff; persistent cleanup failures must still fail the run.
    if(child.exitCode!==null||child.signalCode!==null)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  };
  try {
    const endpoint=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Chrome startup timeout: ${log}`)),15000);
      child.on('error',e=>{clearTimeout(timer);reject(e);});
      child.on('exit',()=>{clearTimeout(timer);reject(new Error(`Chrome exited: ${log}`));});
      child.stderr.on('data',()=>{const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
    });
    const origin=`http://${new URL(endpoint).host}`;
    const page=await(await fetch(`${origin}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
    const ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let id=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id){const p=pending.get(message.id);if(!p)return;clearTimeout(p.timer);pending.delete(message.id);
        if(message.error)p.reject(new Error(JSON.stringify(message.error)));else p.resolve(message.result);}
      else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const next=++id,timer=setTimeout(()=>{pending.delete(next);reject(new Error(`CDP timeout: ${method}`));},900000);
      pending.set(next,{resolve,reject,timer});ws.send(JSON.stringify({id:next,method,params}));
    });
    const evaluate=async expression=>{
      const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    // A newly created target may still be navigating and have no execution
    // context. Retry only those navigation races; preserve actual page errors.
    for(let attempt=0;;attempt++) {
      try {
        await evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(window.octreeBench){clearInterval(t);resolve(true);}else if(n++>200){clearInterval(t);reject(new Error('benchmark page did not load'));}},50);})`);
        break;
      } catch(e) {
        if(attempt>=30||!/Cannot find default execution context|Execution context was destroyed|Cannot find context/.test(e.message))throw e;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    }
    return {send,evaluate,errors,args,close:async()=>{ws.close();await cleanup();}};
  } catch(e){await cleanup();throw e;}
}
