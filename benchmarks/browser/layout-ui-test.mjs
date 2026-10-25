import {serve} from './server.mjs';
import {launch} from './cdp.mjs';
const {server,url}=await serve();let browser;
try {
  browser=await launch(url+'/benchmarks/browser/layout.html');
  await browser.evaluate('window.octreeBench.start({samples:10,warmups:0,sizes:[16],buildSamples:1})');
  const rendered=await browser.evaluate(`({status:document.querySelector('#status').textContent,result:JSON.parse(document.querySelector('#result').textContent)})`);
  if(rendered.status!=='完成'||rendered.result.rows!==207||browser.errors.length)throw Error('layout page did not render result');
  console.log('PASS layout page status and visible result');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
