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

test('visual cards choose share and chronological trend without changing values or drawing false zero bars',()=>{
  const file={name:'sample.csv',headers:['Chu kỳ','Bắt đầu','Doanh thu'],rows:[
    {'Chu kỳ':'Năm','Bắt đầu':'2026-03-01','Doanh thu':'100'},
    {'Chu kỳ':'Tháng','Bắt đầu':'2026-01-01','Doanh thu':'200'},
    {'Chu kỳ':'Năm','Bắt đầu':'2026-02-01','Doanh thu':'300'}
  ]};
  file.rows=[...file.rows,...file.rows.map(row=>({...row}))];
  const model={files:[{...file,numericColumns:context.businessNumericSummaries(file)}],aggregates:context.businessAggregates([file]),context:{goal:''}};
  const html=context.insightChartCards(model);
  assert.match(html,/TỶ TRỌNG/);assert.match(html,/XU HƯỚNG/);assert.match(html,/PHÂN BỐ/);
  assert.match(html,/2026-01-01: 400/);assert.match(html,/2026-03-01: 200/);
  const line=html.slice(html.indexOf('XU HƯỚNG'));
  assert.ok(line.indexOf('2026-01-01: 400')<line.indexOf('2026-03-01: 200'));
  assert.match(context.insightPlot([{name:'Empty',value:0},{name:'Actual',value:5}],'column'),/height="0"/);
  assert.doesNotMatch(html,/sample\.csv/);
});

test('profit per square metre uses paired sums and excludes invalid area without inventing values',()=>{
  const file={name:'stores.csv',headers:['Cửa hàng','Lợi nhuận (VND)','Diện tích (m2)'],rows:[
    {'Cửa hàng':'A','Lợi nhuận (VND)':'100','Diện tích (m2)':'10'},
    {'Cửa hàng':'A','Lợi nhuận (VND)':'300','Diện tích (m2)':'90'},
    {'Cửa hàng':'A','Lợi nhuận (VND)':'1000','Diện tích (m2)':'0'},
    {'Cửa hàng':'B','Lợi nhuận (VND)':'','Diện tích (m2)':'10'},
    {'Cửa hàng':'B','Lợi nhuận (VND)':'-40','Diện tích (m2)':'20'}
  ]};
  const [request]=context.businessRequestedResults([file],'Tính lợi nhuận trên từng m² theo cửa hàng');
  assert.equal(request.status,'calculated');
  const result=request.calculations[0];
  assert.equal(result.topGroups.find(g=>g.name==='A').value,4);
  assert.equal(result.topGroups.find(g=>g.name==='B').value,-2);
  assert.equal(result.validRows,3);assert.equal(result.skippedRows,2);assert.equal(result.totalValue,3);
  assert.match(result.formula,/Diện tích/);
  const missing={...file,headers:['Cửa hàng','Lợi nhuận (VND)']};
  assert.equal(context.businessRequestedResults([missing],'Lợi nhuận/m2 theo cửa hàng')[0].status,'limited');
});

test('business math supports differences, products, weighted margins, counts, min and max',()=>{
  const file={name:'data.csv',headers:['Vùng','Doanh thu','Tổng chi phí','Giá','Số lượng'],rows:[
    {'Vùng':'Bắc','Doanh thu':'100','Tổng chi phí':'60','Giá':'20','Số lượng':'5'},
    {'Vùng':'Bắc','Doanh thu':'300','Tổng chi phí':'240','Giá':'30','Số lượng':'10'},
    {'Vùng':'Nam','Doanh thu':'200','Tổng chi phí':'100','Giá':'40','Số lượng':'5'}
  ]};
  const calc=q=>context.businessRequestedResults([file],q)[0].calculations[0];
  assert.equal(calc('Biên lợi nhuận theo vùng').topGroups.find(g=>g.name==='Bắc').value,25);
  assert.equal(calc('Doanh thu - Tổng chi phí theo vùng').totalValue,200);
  assert.equal(calc('Giá * Số lượng theo vùng').totalValue,600);
  assert.equal(calc('Đếm dòng theo vùng').totalValue,3);
  assert.equal(calc('Doanh thu nhỏ nhất theo vùng').totalValue,100);
  assert.equal(calc('Doanh thu lớn nhất theo vùng').totalValue,300);
  assert.equal(calc('Trung bình Doanh thu').totalValue,200);
});
