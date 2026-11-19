import {timingSafeEqual} from 'node:crypto';
import {runAiTask} from '../agent-ai.mjs';

const LIMIT=22000;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers});}
function sameToken(actual,expected){
  const left=Buffer.from(String(actual||'')),right=Buffer.from(String(expected||''));
  return left.length===right.length && left.length>0 && timingSafeEqual(left,right);
}

export async function handleAi(request,env=process.env,runTask=runAiTask){
  if(request.method!=='POST')return reply({message:'Hãy dùng POST.'},405);
  if(!sameToken(request.headers.get('Authorization')?.replace(/^Bearer\s+/i,''),env.AI_RELAY_TOKEN))return reply({message:'Không được phép.'},401);
  if(!env.GEMINI_API_KEY)return reply({message:'Máy chủ AI chưa có khóa Gemini.'},503);
  if(Number(request.headers.get('Content-Length'))>LIMIT)return reply({message:'Yêu cầu AI quá dài.'},413);
  let body;
  try{
    const raw=await request.text();
    if(Buffer.byteLength(raw)>LIMIT)return reply({message:'Yêu cầu AI quá dài.'},413);
    body=JSON.parse(raw);
    if(!body || typeof body!=='object' || Array.isArray(body))throw new Error();
  }catch{return reply({message:'Dữ liệu AI không hợp lệ.'},400);}
  try{return reply(await runTask(body,env.GEMINI_API_KEY));}
  catch(error){return reply({message:error.message},error.message.includes('không hợp lệ')||error.message.includes('quá dài')||error.message.includes('Thiếu hồ sơ')?400:503);}
}

export default {fetch(request){return handleAi(request);}};
