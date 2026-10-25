import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){
  if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(file.endsWith('.md'))for(const [,raw] of readFileSync(file,'utf8').matchAll(/\]\(([^)]+)\)/g)){
    if(/^(?:[a-z]+:|#|\/)/i.test(raw))continue;
    const link=raw.split('#')[0];
    if(link&&!existsSync(resolve(dirname(file),decodeURIComponent(link))))throw Error(`Broken local link in ${file}: ${raw}`);
  }
}
console.log('Tracked JS syntax and local Markdown link targets passed');
