const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const rows=[
  {customer_id:'KH01',contract_id:'HD01',recommendation:'Xem xét nâng gói',adoption_rate:90,open_tickets:0,renewal_value:12000000},
  {customer_id:'KH02',contract_id:'HD02',recommendation:'Giữ gói hiện tại',adoption_rate:40,open_tickets:0,renewal_value:8000000},
  {customer_id:'KH03',contract_id:'HD03',status:'Chặn upsell',adoption_rate:80,open_tickets:2,renewal_value:null},
  {customer_id:'KH04',contract_id:'HD04',status:'Cần xác minh',adoption_rate:null,open_tickets:null,renewal_value:null}
];
const approved=new Set(['KH01','KH02']);
const context=vm.createContext({
  TextEncoder, Uint8Array, DataView,
  state:{analysis:{rows},leadDays:45,adoptionThreshold:70,detectedFiles:[]},reviewState:{approved},
  chartState:{saved:[]},
  reviewGroups:{upgrade:{},renew:{},blocked:{},verify:{}},
  reviewKey:row=>row.customer_id,
  reviewGroup:row=>row.status==='Chặn upsell'?'blocked':row.status==='Cần xác minh'?'verify':row.recommendation==='Xem xét nâng gói'?'upgrade':'renew',
  chartNumber:value=>value==null?null:Number(value),
  fmtNum:value=>new Intl.NumberFormat('vi-VN').format(value),
  money:value=>value==null?'Chưa đủ căn cứ':new Intl.NumberFormat('vi-VN').format(value)+' ₫',
  kindLabel:()=> 'Hợp đồng',
  aggregateChart:config=>({title:config.title,series:[{label:'Nhóm',value:1}],note:''}),
  chartSvg:()=>'<svg></svg>',
  esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/report.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/report-excel.js'),'utf8'),context);

function zipContents(bytes) {
  const data=Buffer.from(bytes), files=new Map();
  for(let offset=0;offset<data.length;) {
    const signature=data.readUInt32LE(offset);
    if(signature!==0x04034b50)break;
    const size=data.readUInt32LE(offset+18),nameLength=data.readUInt16LE(offset+26),extraLength=data.readUInt16LE(offset+28);
    const name=data.subarray(offset+30,offset+30+nameLength).toString('utf8');
    const start=offset+30+nameLength+extraLength;
    files.set(name,data.subarray(start,start+size).toString('utf8'));
    offset=start+size;
  }
  return files;
}

test('report uses only supported values and includes all recommendation groups',()=>{
  const report=vm.runInContext("reportModel('all')",context);
  assert.equal(report.rows.length,4);
  assert.equal(report.priced.length,2);
  assert.equal(report.totalValue,20000000);
  assert.equal(report.adoption.length,3);
  assert.deepEqual(Array.from(report.charts,chart=>chart.type),['pie','bar','line','bar']);
  assert.equal(report.proposals.length,5);
  assert.equal(report.missing.price,2);
  assert.equal(report.missing.adoption,1);
  assert.equal(report.missing.tickets,1);
  assert.equal(report.ticketRows.length,1);
  assert.match(vm.runInContext("reportContent(reportModel('all'))",context),/2\/4 hồ sơ/);
  assert.match(vm.runInContext("reportContent(reportModel('all'))",context),/Chưa đủ căn cứ/);
});

test('approved report excludes pending records and standalone HTML contains charts',()=>{
  const report=vm.runInContext("reportModel('approved')",context);
  assert.equal(report.rows.length,2);
  assert.equal(report.totalValue,20000000);
  assert.equal(report.counts.blocked,0);
  assert.equal(report.counts.verify,0);
  assert.ok(report.charts.every(chart=>chart.source==='analysis:approved'));
  const html=vm.runInContext("reportDocument(reportModel('approved'))",context);
  assert.match(html,/<!doctype html>/);
  assert.equal((html.match(/<svg>/g)||[]).length,4);
  assert.match(html,/Hồ sơ đã duyệt/);
  assert.match(html,/Phụ lục: 2\/2 hồ sơ/);
});

test('saved dashboard charts appear in the report and exported HTML',()=>{
  context.chartState.saved=[{source:'analysis:all',type:'bar',group:'__proposal',metric:'count',title:'Biểu đồ riêng'}];
  const html=vm.runInContext("reportDocument(reportModel('all'))",context);
  assert.match(html,/Biểu đồ tùy chỉnh từ Dashboard/);
  assert.match(html,/Biểu đồ riêng/);
  assert.equal((html.match(/<svg>/g)||[]).length,5);
  context.chartState.saved=[];
});

test('time bands and report content are grounded in data and escaped',()=>{
  assert.equal(vm.runInContext("reportDaysUntil('2026-11-16',new Date('2026-11-16T12:00:00'))",context),0);
  assert.equal(vm.runInContext("reportBucket(reportDaysUntil('2026-11-20',new Date('2026-11-16T12:00:00')))",context),'Trong 30 ngày');
  assert.equal(vm.runInContext("reportDate('2026-02-30')",context),null);
  rows[0].customer_name='<img src=x onerror=alert(1)>';
  const html=vm.runInContext("reportDocument(reportModel('all'))",context);
  assert.ok(!html.includes('<img src=x'));
  assert.match(html,/&lt;img src=x/);
  assert.match(html,/Nguồn và chất lượng dữ liệu/);
  assert.match(html,/Hồ sơ cần hành động trước/);
  rows[0].customer_name='';
});

test('Excel export contains scoped records, numeric values and chart data',()=>{
  const all=Buffer.from(vm.runInContext("buildReportXlsx(reportModel('all'))",context));
  assert.equal(all.readUInt32LE(0),0x04034b50);
  assert.equal(all.readUInt32LE(all.length-22),0x06054b50);
  const files=zipContents(all);
  assert.match(files.get('xl/workbook.xml'),/name="Ho so"/);
  assert.match(files.get('xl/worksheets/sheet1.xml'),/20000000/);
  assert.match(files.get('xl/worksheets/sheet2.xml'),/Cơ cấu đề xuất/);
  assert.match(files.get('xl/worksheets/sheet4.xml'),/KH04/);
  assert.match(files.get('xl/worksheets/sheet4.xml'),/<c r="J2"><v>12000000<\/v><\/c>/);
  const approved=zipContents(vm.runInContext("buildReportXlsx(reportModel('approved'))",context));
  assert.match(approved.get('xl/worksheets/sheet4.xml'),/KH01/);
  assert.doesNotMatch(approved.get('xl/worksheets/sheet4.xml'),/KH03/);
});

test('Excel export keeps user text literal and escapes XML',()=>{
  rows[0].customer_name='=HYPERLINK("bad") & <test>';
  const detail=zipContents(vm.runInContext("buildReportXlsx(reportModel('all'))",context)).get('xl/worksheets/sheet4.xml');
  assert.match(detail,/t="inlineStr"/);
  assert.match(detail,/=HYPERLINK\(&quot;bad&quot;\) &amp; &lt;test&gt;/);
  assert.doesNotMatch(detail,/<f>/);
  rows[0].customer_name='';
});
