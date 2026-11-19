import {copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await copyFile(path.resolve(root,'../agent-ai.mjs'),path.join(root,'agent-ai.mjs'));
console.log('Đã đồng bộ mã AI; không sao chép khóa API.');
