import {analyze,prepareRepair} from './engine.js';
import {assets} from './assets.js';
import {runAiTask,allowAiRequest} from './agent-ai.mjs';

const MAX_BODY=30*1024*1024;
const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
export async function relayAi(body,env,fetchImpl=fetch){
  const raw=String(env.AI_RELAY_URL||'').trim();
  if(!raw)return runAiTask(body,env.GEMINI_API_KEY);
  const url=new URL(raw);
  if(url.protocol!=='https:' || !env.AI_RELAY_TOKEN)throw new Error('Máy chủ AI chưa được cấu hình đầy đủ.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetchImpl(url,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.AI_RELAY_TOKEN}`},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(payload.message||'Máy chủ AI chưa xử lý được yêu cầu.').slice(0,300));
    return payload;
  }catch(error){if(error.name==='AbortError')throw new Error('Máy chủ AI phản hồi quá lâu. Hãy thử lại.');throw error;}
  finally{clearTimeout(timeout);}
}
async function readJson(request){
  if(Number(request.headers.get('Content-Length'))>MAX_BODY)throw new Error('Dung lượng gửi lên vượt quá 30 MB.');
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Dữ liệu gửi lên không hợp lệ.');
  const decoder=new TextDecoder();let size=0,text='';
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error('Dung lượng gửi lên vượt quá 30 MB.');}text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
    const body=JSON.parse(text);if(!body || typeof body!=='object' || Array.isArray(body))throw new Error();
    return body;
  }catch(error){if(error.message.includes('30 MB'))throw error;throw new Error('Dữ liệu gửi lên không hợp lệ.');}
}

export default {
  async fetch(request,env={}){
    let pathname;try{pathname=decodeURIComponent(new URL(request.url).pathname);}catch{return json({message:'Đường dẫn không hợp lệ.'},400);}
    if(pathname.startsWith('/api/')){
      if(!['/api/run','/api/repair','/api/ai'].includes(pathname))return json({message:'Không tìm thấy API.'},404);
      if(request.method!=='POST')return json({message:'Hãy dùng POST.'},405);
      try{
        const body=await readJson(request);
        if(pathname==='/api/ai'){
          if(!allowAiRequest(request.headers.get('CF-Connecting-IP')||'anonymous'))return json({message:'Đã vượt giới hạn lượt gọi AI. Hãy thử lại sau.'},429);
          return json(await relayAi(body,env));
        }
        if(pathname==='/api/repair')return json(prepareRepair(body));
        return json(analyze(body));
      }catch(error){
        if(pathname==='/api/ai')return json({message:error.message},error.message.includes('không hợp lệ')||error.message.includes('quá dài')||error.message.includes('Thiếu hồ sơ')?400:503);
        if(pathname==='/api/repair')return json({message:error.message},400);
        return json({blocked:true,errorCount:1,errors:[{file:'Tệp tải lên',row:'-',field:'Định dạng',message:error.message}],remediation:{action:'reload',reason:'Không đọc được cấu trúc file. Hãy kiểm tra định dạng, hàng tiêu đề và nội dung file gốc rồi tải lại.',issues:[]},log:[]},400);
      }
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const asset=assets[pathname==='/'?'/index.html':pathname];
    if(!asset)return new Response('Not found',{status:404,headers:baseHeaders});
    const headers={...baseHeaders,'Content-Type':asset.type,'Cache-Control':'no-cache'};
    const data=asset.binary?Uint8Array.from(atob(asset.data),char=>char.charCodeAt(0)):asset.data;
    return new Response(request.method==='HEAD'?null:data,{headers});
  }
};
