import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runAiTask,allowAiRequest} from '../agent-ai.mjs';

test('Gemini request uses a server-side key and returns bounded structured review',async()=>{
  let sent;
  const fetchMock=async(url,options)=>{
    sent={url,options};
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Cần rà soát giá',items:['Kiểm tra 2 hồ sơ thiếu giá'],limitations:['Không tự điền giá']})}]}}]})};
  };
  const result=await runAiTask({task:'analysis_insights',input:{total:3,missing:{price:2}}},'test-secret',fetchMock);
  assert.equal(result.summary,'Cần rà soát giá');
  assert.equal(sent.options.headers['x-goog-api-key'],'test-secret');
  assert.ok(!sent.url.includes('test-secret'));
  assert.match(JSON.parse(sent.options.body).contents[0].parts[0].text,/Không tự tạo số liệu/);
});

test('email output is validated and unknown tasks are rejected before network',async()=>{
  const fetchMock=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"subject":"Gia hạn","body":"Kính gửi quý khách"}'}]}}]})});
  const email=await runAiTask({task:'rewrite_email',input:{row:{customer_id:'KH01'}}},'key',fetchMock);
  assert.equal(email.subject,'Gia hạn');
  await assert.rejects(runAiTask({task:'other',input:{}},'key',fetchMock),/không hợp lệ/);
  await assert.rejects(runAiTask({task:'clean_review',input:{huge:'x'.repeat(20000)}},'key',fetchMock),/quá dài/);
});

test('AI endpoint has a per-visitor request ceiling',()=>{
  for(let n=0;n<6;n++)assert.equal(allowAiRequest('test-visitor-unique'),true);
  assert.equal(allowAiRequest('test-visitor-unique'),false);
});

test('unsupported server location is explained without exposing upstream details',async()=>{
  const fetchMock=async()=>({ok:false,status:400,json:async()=>({error:{message:'User location is not supported for the API use.'}})});
  await assert.rejects(runAiTask({task:'clean_review',input:{}},'key',fetchMock),/Máy chủ online hiện ở vị trí/);
});

test('business analysis receives the supplied industry and goal as context',async()=>{
  let prompt='';
  const fetchMock=async(_url,options)=>{prompt=JSON.parse(options.body).contents[0].parts[0].text;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"summary":"Dữ liệu mới chỉ là mẫu","items":["Kiểm tra cột doanh thu"],"limitations":["Thiếu dữ liệu toàn kỳ"]}'}]}}]})};};
  const result=await runAiTask({task:'business_analysis',input:{businessContext:{industry:'Bán lẻ',businessType:'B2C',goal:'Xem doanh thu theo vùng'},files:[{totalRows:10,columns:[{name:'vung',filled:10}]}]}},'key',fetchMock);
  assert.match(prompt,/Bán lẻ/);assert.match(prompt,/Xem doanh thu theo vùng/);
  assert.match(prompt,/không suy rộng từ mẫu/);
  assert.equal(result.limitations[0],'Thiếu dữ liệu toàn kỳ');
});
