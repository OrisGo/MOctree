import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root=fileURLToPath(new URL('../../',import.meta.url));
export async function serve(port=0) {
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      const path=url.pathname==='/'?'/benchmarks/browser/index.html':decodeURIComponent(url.pathname);
      const allowed=path.startsWith('/benchmarks/browser/')||path.startsWith('/_build/browser-results/')||
        /^\/_build\/(?:profile\/)?(?:wasm|wasm-gc)\/release\/build\/adapters\/(?:linear|prototype)\/(?:linear|prototype)\.wasm$/.test(path)||
        ['/adapters/linear/client.mjs','/adapters/prototype/client.mjs',
          '/benchmarks/strtree/_build/wasm/release/build/strtree-benchmark.wasm'].includes(path);
      if(!allowed||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
      const file=await realpath(resolve(root,`.${path}`));
      if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
      const bytes=await readFile(file);
      res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'text/plain; charset=utf-8',
        'cache-control':'no-store','cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp',
        'cross-origin-resource-policy':'same-origin','x-content-type-options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);
    } catch {res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const {url}=await serve(Number(process.argv[2]||8765));console.log(`${url}/benchmarks/browser/index.html?saved`);
}
