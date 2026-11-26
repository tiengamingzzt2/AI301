import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'};
const assets=Object.create(null);
async function walk(dir,relative=''){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const route=relative+'/'+entry.name,target=path.join(dir,entry.name);
    if(entry.isDirectory()){await walk(target,route);continue;}
    if(!entry.isFile())continue;
    const ext=path.extname(entry.name),type=types[ext];if(!type)continue;
    const binary=!['.html','.js','.css','.svg'].includes(ext);
    const bytes=await fs.readFile(target);assets[route]={type,binary,data:bytes.toString(binary?'base64':'utf8')};
  }
}
await walk(path.join(root,'public'));
if(!assets['/index.html'] || !assets['/templates/mau_du_lieu_gia_han.xlsx'])throw new Error('Thiếu giao diện hoặc file mẫu.');
await fs.writeFile(path.join(root,'worker/assets.js'),'// Generated static assets.\nexport const assets='+JSON.stringify(assets)+';\n');
await fs.mkdir(path.join(root,'dist/server'),{recursive:true});
await fs.mkdir(path.join(root,'dist/.openai'),{recursive:true});
await build({entryPoints:[path.join(root,'worker/index.js')],outfile:path.join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log(`Built online Agent with ${Object.keys(assets).length} static assets.`);
