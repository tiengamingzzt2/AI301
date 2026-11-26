import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.resolve(process.argv[2] || path.join(project,'../..'));
const server=await fs.readFile(path.join(local,'server.js'),'utf8');
const start=server.indexOf('const textRepairs =');
const end=server.indexOf('async function handleRequest(');
if(start<0 || end<start)throw new Error('Không nhận diện được phần xử lý của server.js; chưa đồng bộ.');
const schema=(await fs.readFile(path.join(local,'public/input-schema.js'),'utf8')).replace(/if\(typeof module[^\n]*(?:\r?\n)?$/,'');
const core=server.slice(start,end).replaceAll('zlib.inflateRawSync(data)','Buffer.from(inflateSync(data))');
if(/\b(?:fs|http|zlib)\./.test(core))throw new Error('Phần xử lý còn phụ thuộc API Node chưa được chuyển đổi.');
await fs.mkdir(path.join(project,'worker'),{recursive:true});
await fs.writeFile(path.join(project,'worker/engine.js'),`// Generated from the local Agent by scripts/sync-local.mjs.\nimport {Buffer} from 'buffer';\nimport {inflateSync} from 'fflate';\nconst path={extname:name=>String(name).match(/\\.[^./\\\\]+$/)?.[0] || ''};\n${schema}\n${core}\nexport {analyze,prepareRepair};\n`);
async function copyPublic(relative=''){
  const dir=path.join(local,'public',relative);
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const child=path.join(relative,entry.name);
    if(entry.isDirectory()){await copyPublic(child);continue;}
    if(!entry.isFile() || !/\.(?:html|js|css|xlsx|svg|png|jpe?g|webp|woff2?)$/i.test(entry.name))continue;
    const target=path.join(project,'public',child);await fs.mkdir(path.dirname(target),{recursive:true});
    if(/\.(?:html|js)$/i.test(entry.name)){
      let text=await fs.readFile(path.join(local,'public',child),'utf8');
      text=text.replaceAll('Xử lý tại localhost','Xử lý online').replaceAll('Local workspace','Online workspace')
        .replaceAll('Dữ liệu xử lý an toàn tại localhost','File được gửi lên máy chủ để xử lý · Không lưu file trên máy chủ')
        .replaceAll('Hãy kiểm tra kết nối với localhost.','Hãy kiểm tra kết nối mạng và thử lại.');
      await fs.writeFile(target,text);
    }else await fs.copyFile(path.join(local,'public',child),target);
  }
}
await copyPublic();
await fs.copyFile(path.join(local,'agent-ai.mjs'),path.join(project,'worker/agent-ai.mjs'));
console.log('Synced Agent logic and public assets; no uploaded datasets or local history included.');
