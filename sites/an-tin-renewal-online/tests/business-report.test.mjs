import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {runAiTask} from '../worker/agent-ai.mjs';

const context=vm.createContext({stageEl:{addEventListener(){}},fmtNum:value=>String(value),esc:value=>String(value)});
await vm.runInContext(await fs.readFile(new URL('../public/ai.js',import.meta.url),'utf8'),context);
await vm.runInContext(await fs.readFile(new URL('../public/report-generic.js',import.meta.url),'utf8'),context);

test('text analysis counts actual categories and ignores customer identifiers',()=>{
  const file={headers:['customer_id','Ngành hàng','Trạng thái'],rows:[
    {customer_id:'KH001','Ngành hàng':'Thời trang','Trạng thái':'Đang bán'},
    {customer_id:'KH002','Ngành hàng':'Gia dụng','Trạng thái':'Đang bán'},
    {customer_id:'KH003','Ngành hàng':'Thời trang','Trạng thái':'Tạm dừng'}
  ]};
  const profiles=context.businessTextSummaries(file);
  assert.equal(profiles.some(item=>item.name==='customer_id'),false);
  assert.equal(profiles.find(item=>item.name==='Ngành hàng').categories[0].count,2);
  const fallback=context.businessDataFallback({files:[{name:'test.csv',totalRows:3,textColumns:profiles,numericColumns:[]}],aggregates:[],businessContext:{goal:'Phân tích ngành hàng'}},new Error('AI tạm gián đoạn'));
  assert.match(fallback.items.join(' '),/Thời trang \(2\)/);
});

test('partial report leads with business findings and categorical charts',()=>{
  const file={name:'test.csv',headers:['Ngành hàng'],rows:[{'Ngành hàng':'Thời trang'},{'Ngành hàng':'Gia dụng'}],totalRows:2,textColumns:[{name:'Ngành hàng',total:2,distinct:2,categories:[{value:'Thời trang',count:1},{value:'Gia dụng',count:1}],keywords:[],examples:[]}],numericColumns:[]};
  const html=context.genericReportContent({files:[file],aggregates:[],totalRows:2,context:{industry:'Bán lẻ',businessType:'B2C',goal:'Xem nhóm hàng'},result:{summary:'Thời trang và gia dụng đều xuất hiện.',items:['So sánh nhu cầu hai nhóm.'],limitations:[]},aiUsed:true,generatedAt:'2026-11-18T00:00:00.000Z'});
  assert.match(html,/Thời trang và gia dụng đều xuất hiện/);
  assert.match(html,/Phân tích cột chữ/);
  assert.doesNotMatch(html,/Độ đầy đủ của cột|Nguồn và chất lượng dữ liệu/);
});

test('AI prompt prioritizes text content over missing-field diagnostics',async()=>{
  let prompt='';
  await runAiTask({task:'business_analysis',input:{businessContext:{goal:'So sánh ngành hàng'},files:[{textColumns:[{name:'Ngành hàng',categories:[{value:'Thời trang',count:2}]}]}]}},'fake-key',async(_url,options)=>{
    prompt=JSON.parse(options.body).contents[0].parts[0].text;
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'Thời trang xuất hiện nhiều nhất.',items:['Xem nhu cầu thời trang.'],limitations:[]})}]}}]});
  });
  assert.match(prompt,/Ưu tiên phân tích cột chữ/);
  assert.match(prompt,/Thời trang/);
  assert.match(prompt,/Không liệt kê số cột, độ đầy đủ/);
});
