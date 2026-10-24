// Run only after reviewing intentional changes to existing release files.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),file=path.join(root,'CHECKSUMS.json');
const manifest=JSON.parse(await readFile(file,'utf8'));
for(const name of Object.keys(manifest)){
 const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Path outside release');
 manifest[name]=createHash('sha256').update(await readFile(target)).digest('hex');
}
await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
console.log('Updated checksums for reviewed existing release files; now run node scripts/verify-release.mjs');
