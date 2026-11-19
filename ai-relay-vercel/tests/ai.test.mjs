import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleAi} from '../api/ai.mjs';

const endpoint='https://relay.test/api/ai';
const env={AI_RELAY_TOKEN:'test-shared-token',GEMINI_API_KEY:'test-gemini-key'};
const request=(token='test-shared-token',body={task:'business_analysis',input:{businessContext:{industry:'Bán lẻ'}}})=>new Request(endpoint,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('relay rejects requests without the shared token or configured Gemini key',async()=>{
  let called=false;
  const task=async()=>{called=true;return {summary:'ok'};};
  assert.equal((await handleAi(request('wrong'),env,task)).status,401);
  assert.equal((await handleAi(request(),{AI_RELAY_TOKEN:env.AI_RELAY_TOKEN},task)).status,503);
  assert.equal(called,false);
});

test('relay forwards a bounded AI task with the server-side key',async()=>{
  const response=await handleAi(request(),env,async(body,key)=>{
    assert.equal(body.task,'business_analysis');assert.equal(body.input.businessContext.industry,'Bán lẻ');assert.equal(key,env.GEMINI_API_KEY);
    return {summary:'Đã phân tích',items:['Kiểm tra doanh thu'],limitations:[]};
  });
  assert.equal(response.status,200);
  assert.equal((await response.json()).summary,'Đã phân tích');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('relay refuses oversized and malformed inputs',async()=>{
  const large=request('test-shared-token',{task:'business_analysis',input:{goal:'x'.repeat(23000)}});
  assert.equal((await handleAi(large,env,async()=>({summary:'wrong'}))).status,413);
  const malformed=new Request(endpoint,{method:'POST',headers:{Authorization:'Bearer test-shared-token'},body:'{'});
  assert.equal((await handleAi(malformed,env,async()=>({summary:'wrong'}))).status,400);
});
