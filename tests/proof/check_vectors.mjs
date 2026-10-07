import fs from 'node:fs';
import {canonical,digest,verifyPackage} from '../../verifier/verify.js';
const vectors=JSON.parse(fs.readFileSync('contract/hash_vectors.json','utf8'));
for(const v of vectors)if(await digest(v.previous,v.value)!==v.expected)throw new Error('Cross-language hash mismatch: '+canonical(v.value));
console.log(`${vectors.length} Python/browser hash vectors matched.`);
if(process.argv[2]) {
 const cases=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(const c of cases){const result=await verifyPackage(c.package,c.key,c.anchors);if(result.valid!==c.expected)throw new Error(c.name+': '+JSON.stringify(result));}
 console.log(`${cases.length} Python-signed packages verified by browser algorithm.`);
}
