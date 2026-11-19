import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['api/ai.mjs','agent-ai.mjs','package.json','vercel.json'];
const manifest=files.map(file=>{
  const bytes=fs.readFileSync(path.join(root,file));
  return {file,sha:crypto.createHash('sha1').update(bytes).digest('hex'),size:bytes.length,data:bytes.toString('base64')};
});
process.stdout.write(JSON.stringify(manifest));
