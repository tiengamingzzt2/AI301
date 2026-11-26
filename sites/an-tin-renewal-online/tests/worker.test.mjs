import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import worker,{relayAi} from '../dist/server/index.js';

const origin='https://an-tin.test';
const file=(csv,name='test.csv')=>({name,data:Buffer.from(csv).toString('base64')});
const full=file('customer_id,contract_id,expiration_date,licensed_users,active_users,open_tickets,price\nKH001,HD001,2026-12-31,10,9,0,12000000\nKH002,HD002,2027-01-10,10,5,1,6000000');
async function post(route,body){return worker.fetch(new Request(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));}

test('AI relay keeps its shared token on the server and accepts a regional response',async()=>{
  const body={task:'business_analysis',input:{businessContext:{industry:'Bán lẻ'}}};
  const result=await relayAi(body,{AI_RELAY_URL:'https://relay.test/api/ai',AI_RELAY_TOKEN:'test-token'},async(url,options)=>{
    assert.equal(String(url),'https://relay.test/api/ai');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.deepEqual(JSON.parse(options.body),body);
    return Response.json({summary:'Đã phân tích',items:[],limitations:[]});
  });
  assert.equal(result.summary,'Đã phân tích');
  assert.equal((await (await worker.fetch(new Request(origin+'/ai.js'))).text()).includes('test-token'),false);
});

test('online page serves its scripts, stylesheet and honest online processing labels',async()=>{
  const response=await worker.fetch(new Request(origin+'/'));assert.equal(response.status,200);
  const html=await response.text();assert.ok(html.includes('Online workspace'));assert.ok(!html.includes('localhost'));assert.ok(html.includes('Không lưu file trên máy chủ'));
  for(const [,url] of html.matchAll(/(?:src|href)="(\/(?:[^"#]+\.(?:js|css)))"/g)){
    const asset=await worker.fetch(new Request(origin+url));assert.equal(asset.status,200,url);assert.ok((await asset.text()).length>0,url);
  }
});

test('online CSV cleaning and analysis preserve the existing support guardrail',async()=>{
  const clean=await post('/api/run',{stage:'clean',files:[full]});assert.equal(clean.status,200);
  const result=await clean.json();assert.equal(result.blocked,false);assert.equal(result.rows.length,2);assert.equal(result.inputQuality.readyCount,2);
  const analysis=await (await post('/api/run',{stage:'analyze',files:[full],adoptionThreshold:70})).json();
  assert.equal(analysis.rows[0].recommendation,'Xem xét nâng gói');assert.equal(analysis.rows[1].status,'Chặn upsell');assert.equal(analysis.summary.total,2);
});

test('downloaded XLSX template round-trips through the bundled decompressor and parser',async()=>{
  const response=await worker.fetch(new Request(origin+'/templates/mau_du_lieu_gia_han.xlsx'));assert.equal(response.status,200);assert.ok(response.headers.get('Content-Type').includes('spreadsheetml'));
  const bytes=Buffer.from(await response.arrayBuffer());
  const result=await (await post('/api/run',{stage:'clean',files:[{name:'template.xlsx',data:bytes.toString('base64')}]})).json();
  assert.equal(result.blocked,false);assert.equal(result.rows.length,6);assert.equal(result.inputQuality.readyCount,4);assert.equal(result.inputQuality.limitedCount,2);
});

test('missing analytical fields offer an explicit partial path online',async()=>{
  const missing=file('customer_id,expiration_date\nKH001,2026-12-31\nKH002,2027-01-10');
  for(const stage of ['clean','analyze']){
    const result=await (await post('/api/run',{stage,files:[missing]})).json();assert.equal(result.blocked,true);assert.equal(result.remediation.action,'partial_or_reload');
    const partial=await (await post('/api/run',{stage,files:[missing],allowPartial:true})).json();assert.equal(partial.blocked,false);assert.equal(partial.partialAnalysis,true);
    if(stage==='analyze'){assert.equal(partial.rows[0].adoption_rate,null);assert.equal(partial.rows[0].renewal_value,null);assert.equal(partial.rows[0].status,'Cần xác minh');}
  }
  const structural=file('customer_id,expiration_date\n,2026-12-31\n,2027-01-10');
  const blocked=await (await post('/api/run',{stage:'analyze',files:[structural],allowPartial:true})).json();assert.equal(blocked.blocked,true);assert.equal(blocked.remediation.action,'reload');
});

test('a small missing required cell can be opened for review and is not silently invented',async()=>{
  const missing=file('customer_id,expiration_date,licensed_users,active_users,open_tickets,price\nKH001,,10,8,0,100\nKH002,2026-12-31,10,8,0,100');
  const result=await (await post('/api/run',{stage:'clean',files:[missing]})).json();assert.equal(result.blocked,true);assert.equal(result.remediation.action,'repair');
  const draft=await post('/api/repair',{mode:'auto',files:[missing]});assert.equal(draft.status,200);assert.equal((await draft.json()).files[0].rows[0].expiration_date,'');
});

test('malformed JSON, excessive body size, unknown routes and invalid methods fail safely',async()=>{
  const broken=await worker.fetch(new Request(origin+'/api/run',{method:'POST',body:'{broken'}));assert.equal(broken.status,400);assert.equal((await broken.json()).remediation.action,'reload');
  const huge=await worker.fetch(new Request(origin+'/api/run',{method:'POST',headers:{'Content-Length':String(31*1024*1024)},body:'{}'}));assert.equal(huge.status,400);
  assert.equal((await worker.fetch(new Request(origin+'/api/run'))).status,405);
  assert.equal((await post('/api/other',{})).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/server.js'))).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/.env'))).status,404);
});

test('AI route requires server-side configuration and never serves a key as an asset',async()=>{
  const response=await post('/api/ai',{task:'analysis_insights',input:{total:2}});
  assert.equal(response.status,503);
  assert.match((await response.json()).message,/Chưa cấu hình khóa Gemini/);
  assert.equal((await worker.fetch(new Request(origin+'/.gemini-key'))).status,404);
});

test('datasets do not carry into a subsequent visitor request',async()=>{
  await post('/api/run',{stage:'clean',files:[full]});
  const result=await (await post('/api/run',{stage:'clean',files:[]})).json();assert.equal(result.blocked,true);assert.equal(result.inputQuality.contractCount,0);
});

test('bundle contains no native Node imports or local filesystem dependency',async()=>{
  const source=await fs.readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
  assert.ok(!/\b(?:import|require)\s*(?:\(|[\w{*].*?from\s*)["']node:/.test(source));
  assert.ok(!source.includes('C:/Users/ADMIN'));assert.ok(!source.includes('D:/BTVN'));
});
