import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'CHECKSUMS.json'),'utf8'));
for(const [name,digest] of Object.entries(manifest)){
 const target=path.resolve(root,name);assert(target.startsWith(root+path.sep));
 assert.equal(createHash('sha256').update(await readFile(target)).digest('hex'),digest,'Changed release file: '+name);
}
assert.deepEqual(await readFile(path.join(root,'SITE_NETLIFY/index.html')),await readFile(path.join(root,'SITE_NETLIFY/giao-vien/index.html')));
for(const name of ['SQL','netlify'])assert.equal(await stat(path.join(root,'SITE_NETLIFY',name)).then(()=>true,()=>false),false,'Private source under publish');
const fn=await import('../netlify/functions/teacher-accounts.mjs');assert.equal(typeof fn.handler,'function');
console.log('PASS release checksums, portal mirror, private/public layout and Function import: '+Object.keys(manifest).length+' files');
