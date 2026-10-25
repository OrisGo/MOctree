// Preserve JSON sample content; add the text EOF required by repository hooks.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=process.argv[2];if(!dir)throw Error('pass diagnostics directory');
const hash=b=>createHash('sha256').update(b).digest('hex');
const path=dir+'/summary.json',s=JSON.parse(await readFile(path));
for(const p of s.profiles){const a=p.artifacts.profile,b=await readFile(dir+'/'+a.path);
 if(hash(b)!==a.sha256)throw Error('profile hash mismatch before normalization');
 if(b.at(-1)!==10){a.captureSha256=a.sha256;const text=b.toString()+'\n';await writeFile(dir+'/'+a.path,text);a.sha256=hash(text);}
}
s.finalization={description:'Only append missing EOF newline to cpuprofile JSON; captureSha256 preserves original bytes hash',scriptSha256:hash(await readFile(new URL(import.meta.url)))};
await writeFile(path,JSON.stringify(s)+'\n');console.log('PASS: artifact text EOF normalized, original capture hashes retained');
