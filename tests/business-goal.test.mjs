import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({stageEl:{addEventListener(){}},fmtNum:value=>String(value),esc:value=>String(value)});
await vm.runInContext(await fs.readFile(new URL('../public/ai.js',import.meta.url),'utf8'),context);
await vm.runInContext(await fs.readFile(new URL('../public/report-generic.js',import.meta.url),'utf8'),context);

test('separate report requests compute different metrics and disclose unavailable dimensions',()=>{
  const file={name:'sales.csv',headers:['Vùng','Kênh','Doanh thu','Chi phí'],rows:[
    {'Vùng':'Bắc','Kênh':'Online','Doanh thu':'100','Chi phí':'70'},
    {'Vùng':'Nam','Kênh':'Shop','Doanh thu':'300','Chi phí':'90'},
    {'Vùng':'Bắc','Kênh':'Shop','Doanh thu':'200','Chi phí':'80'}
  ]};
  const results=context.businessRequestedResults([file],'Top 1 doanh thu theo vùng; Chi phí trung bình theo kênh; Doanh thu theo ngành hàng');
  assert.equal(results.length,3);
  assert.equal(results[0].calculations[0].topGroups.length,1);
  assert.equal(results[0].calculations[0].topGroups[0].value,300);
  assert.equal(results[1].calculations[0].metricField,'Chi phí');
  assert.equal(results[1].calculations[0].aggregation,'average');
  assert.equal(results[1].calculations[0].topGroups[0].value,85);
  assert.equal(results[2].status,'limited');
});

test('revenue by region uses every valid row and ignores unrelated numbers',()=>{
  const file={name:'sales.csv',headers:['Khu vực','Doanh thu','Giá bán','Mã đơn hàng'],rows:[
    {'Khu vực':'Miền Bắc','Doanh thu':'1.000.000','Giá bán':'50.000','Mã đơn hàng':'HD1'},
    {'Khu vực':'Miền Nam','Doanh thu':'2.000.000','Giá bán':'60.000','Mã đơn hàng':'HD2'},
    {'Khu vực':'Miền Bắc','Doanh thu':'3.000.000','Giá bán':'70.000','Mã đơn hàng':'HD3'},
    {'Khu vực':'Miền Nam','Doanh thu':'','Giá bán':'80.000','Mã đơn hàng':'HD4'}
  ]};
  const [result]=context.businessAggregates([file],'Tính doanh thu theo khu vực');
  assert.equal(result.groupField,'Khu vực');
  assert.equal(result.metricField,'Doanh thu');
  assert.equal(result.validRows,3);
  assert.equal(result.totalValue,6000000);
  assert.deepEqual(Array.from(result.topGroups,group=>[group.name,group.value]),[['Miền Bắc',4000000],['Miền Nam',2000000]]);
  const html=context.genericReportContent({files:[{...file,totalRows:4,textColumns:context.businessTextSummaries(file),numericColumns:context.businessNumericSummaries(file)}],aggregates:[result],totalRows:4,context:{goal:'Tính doanh thu theo khu vực'},result:{summary:'Miền Bắc dẫn đầu.',items:[],limitations:[]},aiUsed:true,generatedAt:'2026-11-18T00:00:00.000Z'});
  assert.match(html,/Tổng Doanh thu theo Khu vực/);
  assert.match(html,/Miền Bắc/);
  assert.doesNotMatch(html,/sales\.csv/);
  const cleaned=context.reportResultWithoutFilenames({summary:'Theo sales.csv',items:['sales.csv có doanh thu'],limitations:[]},[file]);
  assert.doesNotMatch(cleaned.summary,/sales\.csv/);
});

test('a missing revenue column does not turn unit price into revenue',()=>{
  const file={name:'sales.csv',headers:['Khu vực','Giá bán'],rows:[{'Khu vực':'Miền Bắc','Giá bán':'50000'}]};
  assert.equal(context.businessAggregates([file],'Tính doanh thu theo khu vực').length,0);
});

test('one revenue column is ranked independently by region, channel, term and returns',()=>{
  const file={name:'sales.csv',headers:['Vùng','Kênh bán','Kỳ hạn','Trả hàng','Doanh thu (VND)'],rows:[
    {'Vùng':'Bắc','Kênh bán':'Online','Kỳ hạn':'30 ngày','Trả hàng':'Không','Doanh thu (VND)':'1.000.000'},
    {'Vùng':'Nam','Kênh bán':'Cửa hàng','Kỳ hạn':'60 ngày','Trả hàng':'Có','Doanh thu (VND)':'2.000.000'},
    {'Vùng':'Bắc','Kênh bán':'Online','Kỳ hạn':'30 ngày','Trả hàng':'Không','Doanh thu (VND)':'3.000.000'},
    {'Vùng':'Nam','Kênh bán':'Online','Kỳ hạn':'60 ngày','Trả hàng':'Không','Doanh thu (VND)':'4.000.000'}
  ]};
  const results=context.businessAggregates([file],'Phân tích doanh thu theo vùng, kênh và kỳ hạn');
  assert.equal(results[0].groupField,'Vùng');
  assert.deepEqual(new Set(Array.from(results,item=>item.groupField)),new Set(['Vùng','Kênh bán','Kỳ hạn','Trả hàng']));
  assert.ok(results.every(item=>item.metricField==='Doanh thu (VND)' && item.totalValue===10000000));
  assert.deepEqual(Array.from(results.find(item=>item.groupField==='Kênh bán').topGroups,item=>[item.name,item.value]),[['Online',8000000],['Cửa hàng',2000000]]);
  assert.deepEqual(Array.from(results.find(item=>item.groupField==='Trả hàng').topGroups,item=>[item.name,item.value]),[['Không',8000000],['Có',2000000]]);
});

test('a numeric-only file renders a value distribution instead of a missing-group warning',()=>{
  const file={name:'doanh-thu.csv',headers:['Doanh thu (VND)'],rows:[{'Doanh thu (VND)':'10000000'},{'Doanh thu (VND)':'12000000'},{'Doanh thu (VND)':'16000000'}]};
  const modelFile={...file,totalRows:3,numericColumns:context.businessNumericSummaries(file),textColumns:[]};
  const html=context.genericReportContent({files:[modelFile],aggregates:[],totalRows:3,context:{goal:'Phân tích doanh thu'},result:{summary:'Doanh thu dao động theo dữ liệu.',items:[],limitations:[]},aiUsed:true,generatedAt:'2026-11-18T00:00:00.000Z'});
  assert.match(html,/Phân bố Doanh thu \(VND\)/);
  assert.match(html,/Biểu đồ từ dữ liệu/);
  assert.match(html,/Xem chỉ số số học/);
  assert.doesNotMatch(html,/Chưa tìm thấy cặp cột nhóm|Độ đầy đủ của cột/);
});
