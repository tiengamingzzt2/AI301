function reportResultWithoutFilenames(result,files){
  const clean=value=>files.reduce((text,file)=>text.split(file.name).join('dữ liệu'),String(value||''));
  return {...result,summary:clean(result.summary),items:(result.items||[]).map(clean),limitations:(result.limitations||[]).map(clean)};
}
function genericReportModel(){
  const session=state.businessAnalysis;
  const source=selectedAnalysisFiles();
  const files=source.map(file=>({name:file.name,headers:file.headers,rows:file.rows,totalRows:file.rows.length,numericColumns:businessNumericSummaries(file),textColumns:businessTextSummaries(file)}));
  return {generic:true,files,aggregates:businessAggregates(source,session.input.businessContext?.goal).slice(0,8),totalRows:files.reduce((count,file)=>count+file.totalRows,0),context:session.input.businessContext,result:reportResultWithoutFilenames(session.result,source),aiUsed:session.aiUsed,generatedAt:session.generatedAt};
}

function genericReportBars(items,max,label){
  if(!items.length)return '<p class="report-empty">Chưa có cột phù hợp để vẽ biểu đồ này.</p>';
  return `<div class="generic-report-bars">${items.map(item=>`<div class="generic-report-bar"><span>${esc(item.name)}</span><div><i style="width:${max>0?Math.max(2,Math.min(100,item.value/max*100)):0}%"></i></div><b>${esc(label(item.value))}</b></div>`).join('')}</div>`;
}

function genericNumericDistributions(files,goal=''){
  const goalKey=businessColumnKey(goal);
  return files.flatMap(file=>file.numericColumns.map(column=>{
    const values=file.rows.map(row=>businessAmount(row[column.name])).filter(value=>value!==null);
    if(!values.length)return null;
    const min=column.min,max=column.max,total=values.reduce((sum,value)=>sum+value,0);
    const bins=Array.from({length:min===max?1:5},(_,index)=>({name:min===max?fmtNum(min):`${fmtNum(Math.round(min+(max-min)*index/5))}–${fmtNum(Math.round(min+(max-min)*(index+1)/5))}`,value:0}));
    for(const value of values)bins[Math.min(bins.length-1,Math.floor((value-min)/(max-min||1)*bins.length))].value++;
    const key=businessColumnKey(column.name);
    return {file:file.name,name:column.name,count:values.length,total,average:total/values.length,min,max,bins,priority:goalKey.includes(key)||(/doanh_thu|revenue/.test(goalKey)&&/doanh_thu|revenue|sales/.test(key))?1:0};
  }).filter(Boolean)).sort((a,b)=>b.priority-a.priority).slice(0,3);
}

function genericDashboardChart(items,type='column'){
  const data=items.slice(0,8),colors=['#04345a','#dc0011','#6297bc','#b39bce','#e5ad66','#65a5af','#839654','#ae8f78'];
  const max=Math.max(...data.map(d=>Math.abs(d.value)),1),total=data.reduce((n,d)=>n+d.value,0);
  if(type==='donut' && total>0 && data.every(d=>d.value>=0)){
    let offset=0;
    return `<div class="dashboard-donut"><svg viewBox="0 0 240 200" role="img" aria-label="Tỷ trọng theo nhóm"><circle cx="120" cy="100" r="66" fill="none" stroke="#dce7e1" stroke-width="28"/>${data.map((d,i)=>{const percent=d.value/total*100,segment=`<circle cx="120" cy="100" r="66" fill="none" stroke="${colors[i]}" stroke-width="28" pathLength="100" stroke-dasharray="${percent} ${100-percent}" stroke-dashoffset="${-offset}" transform="rotate(-90 120 100)"><title>${esc(d.name)}: ${esc(fmtNum(d.value))} (${percent.toFixed(1)}%)</title></circle>`;offset+=percent;return segment;}).join('')}<text x="120" y="103" text-anchor="middle" fill="currentColor" font-size="16">${fmtNum(total)}</text></svg><div>${data.map((d,i)=>`<p><i style="background:${colors[i]}"></i>${esc(d.name)} <b>${(d.value/total*100).toFixed(1)}%</b></p>`).join('')}</div></div>`;
  }
  return `<svg class="dashboard-column" viewBox="0 0 600 250" role="img" aria-label="So sánh giá trị theo nhóm"><line x1="25" x2="580" y1="205" y2="205" stroke="currentColor" opacity=".2"/>${data.map((d,i)=>{const width=540/data.length,x=35+i*width,h=Math.abs(d.value)/max*150;return `<rect x="${x}" y="${205-h}" width="${width*.65}" height="${h}" rx="7" fill="${colors[i]}"><title>${esc(d.name)}: ${esc(fmtNum(d.value))}</title></rect><text x="${x+width*.32}" y="${195-h}" text-anchor="middle" fill="currentColor" font-size="12">${esc(fmtNum(d.value))}</text><text x="${x+width*.32}" y="230" text-anchor="middle" fill="currentColor" font-size="11">${esc(String(d.name).slice(0,15))}</text>`;}).join('')}</svg>`;
}

function insightNumber(value){
  const abs=Math.abs(value),unit=abs>=1e9?1e9:abs>=1e6?1e6:abs>=1e3?1e3:1;
  return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:unit===1?2:1}).format(value/unit)+(unit===1e9?' tỷ':unit===1e6?' tr':unit===1e3?' nghìn':'');
}
function insightPlot(items,type){
  if(type==='donut')return genericDashboardChart(items,'donut');
  const low=Math.min(0,...items.map(d=>d.value)),high=Math.max(0,...items.map(d=>d.value)),range=high-low||1;
  const times=type==='line'?items.map(item=>Date.parse(item.name)):[];
  const y=value=>190-(value-low)/range*145,x=index=>60+(times.length>1&&times.at(-1)>times[0]?(times[index]-times[0])/(times.at(-1)-times[0]):index/Math.max(1,items.length-1))*480;
  const guides=[low,(low+high)/2,high].map(value=>`<line x1="55" x2="575" y1="${y(value)}" y2="${y(value)}" stroke="currentColor" opacity=".1"/><text x="48" y="${y(value)+4}" text-anchor="end" fill="currentColor" opacity=".65" font-size="11">${esc(insightNumber(value))}</text>`).join('');
  const labels=items.map((d,i)=>i===0||i===items.length-1||i%Math.max(1,Math.ceil(items.length/5))===0?`<text x="${type==='line'?x(i):65+(i+.5)*500/items.length}" y="217" text-anchor="middle" fill="currentColor" font-size="11" opacity=".8">${esc(d.name.slice(0,13))}</text>`:'').join('');
  const graphic=type==='line'?`<polyline points="${items.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ')}" fill="none" stroke="#558eb8" stroke-width="3" stroke-linejoin="round"/>${items.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.value)}" r="4.5" fill="${i===items.length-1?'#dc0011':'#558eb8'}" stroke="var(--night-raised,#fff)" stroke-width="2"><title>${esc(d.name)}: ${fmtNum(d.value)}</title></circle>`).join('')}`:items.map((d,i)=>{const width=500/items.length,cx=65+(i+.5)*width;return `<rect x="${cx-width*.3}" y="${Math.min(y(d.value),y(0))}" width="${width*.6}" height="${Math.abs(y(d.value)-y(0))}" rx="5" fill="${d.value<0?'#dc0011':'#558eb8'}"><title>${esc(d.name)}: ${fmtNum(d.value)}</title></rect><text x="${cx}" y="${d.value>=0?y(d.value)-9:y(d.value)+17}" text-anchor="middle" font-size="12" fill="currentColor">${esc(insightNumber(d.value))}</text>`;}).join('');
  return `<svg class="insight-svg" viewBox="0 0 620 235" role="img" aria-label="${type==='line'?'Xu hướng theo thời gian':'Phân bố giá trị'}">${guides}${graphic}${labels}</svg>`;
}
function insightChartCards(model){
  const grouped=model.aggregates.slice(0,4).map(item=>{
    let data=item.topGroups.map(group=>({...group})),type='column',note=`${fmtNum(item.validRows)} dòng hợp lệ · ${fmtNum(item.totalGroups)} nhóm`;
    const file=model.files.find(file=>file.name===item.file);
    const dates=data.length>1&&data.every(group=>/^\d{4}-\d{2}(-\d{2})?$/.test(group.name));
    if(dates&&file){
      const groups=new Map();for(const row of file.rows){const name=String(row[item.groupField]??'').trim(),value=businessAmount(row[item.metricField]);if(!/^\d{4}-\d{2}(-\d{2})?$/.test(name)||value===null)continue;const old=groups.get(name)||{sum:0,count:0};old.sum+=value;old.count++;groups.set(name,old);}
      data=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([name,group])=>({name,value:item.aggregation==='average'?group.sum/group.count:group.sum}));
      if(data.length>36){data=data.slice(-36);note+=' · 36 mốc gần nhất';}type='line';
    }else if(item.aggregation!=='average'&&item.totalGroups<=5&&data.every(d=>d.value>=0)&&data.some(d=>d.value>0))type='donut';
    else{data=data.slice(0,8);if(item.totalGroups>data.length)note+=` · Hiện ${data.length} nhóm dẫn đầu`;}
    const top=[...data].sort((a,b)=>b.value-a.value)[0];
    return `<article class="report-chart insight-card"><div class="insight-top"><span>${type==='line'?'XU HƯỚNG':type==='donut'?'TỶ TRỌNG':'SO SÁNH'}</span><span>${item.aggregation==='average'?'Trung bình':'Tổng hợp'}</span></div><h3>${esc(item.metricField)} theo ${esc(item.groupField)}</h3><div class="insight-highlight"><strong title="${fmtNum(item.totalValue)}">${insightNumber(item.totalValue)}</strong><span>${type==='line'?'Trên toàn bộ kỳ dữ liệu':`${esc(top?.name||'—')} dẫn đầu · ${insightNumber(top?.value||0)}`}</span></div>${insightPlot(data,type)}<p class="report-footnote">${note} · Di chuột để xem số chính xác</p></article>`;
  }).join('');
  const distributions=genericNumericDistributions(model.files,model.context.goal).slice(0,model.aggregates.length?1:2).map(plot=>`<article class="report-chart insight-card"><div class="insight-top"><span>PHÂN BỐ</span><span>${fmtNum(plot.count)} dòng</span></div><h3>Phân bố ${esc(plot.name)}</h3><div class="insight-highlight"><strong>${insightNumber(plot.average)}</strong><span>Giá trị trung bình · trục dọc là số dòng</span></div>${insightPlot(plot.bins,'column')}<p class="report-footnote">Thấp nhất ${fmtNum(plot.min)} · Cao nhất ${fmtNum(plot.max)}</p></article>`).join('');
  return grouped+distributions;
}

function genericReportContent(model,exportMode=false){
  const {files,aggregates,totalRows,context,result,aiUsed,generatedAt}=model;
  const requests=businessRequestedResults(files,context.goal);
  const requestedSection=requests.length?`<section class="report-section requested-report"><div class="request-heading"><span class="eyebrow">PHÂN TÍCH RIÊNG</span><h3>Yêu cầu báo cáo của bạn</h3><p>Kết quả theo mục tiêu đã nhập · ${aiUsed?'Có diễn giải AI':'Tính trực tiếp từ dữ liệu'}</p></div>${requests.map(request=>`<article class="request-result"><h4>${esc(request.question)}</h4><p class="report-footnote">${esc(request.explanation)}</p>${request.calculations.map(item=>`<h4>${esc(item.metricField)} theo ${esc(item.groupField)}</h4>${item.formula?`<p class="calculation-formula"><b>Công thức:</b> ${esc(item.formula)}<br>${esc(item.method)} ${fmtNum(item.skippedRows||0)} dòng không dùng trong phép tính.</p>`:''}${insightPlot(item.topGroups,'column')}<div class="report-table-wrap"><table class="report-table"><thead><tr><th>Nhóm</th><th>Kết quả</th><th>Dòng tính</th></tr></thead><tbody>${item.topGroups.map(group=>`<tr><td>${esc(group.name)}</td><td>${fmtNum(group.value)}</td><td>${fmtNum(group.count)}</td></tr>`).join('')}</tbody></table></div><p class="report-footnote">${fmtNum(item.validRows)} dòng hợp lệ</p>`).join('')}</article>`).join('')}<div class="request-conclusion"><h4>Nhận định theo yêu cầu</h4><p>${esc(result.summary)}</p><ul>${(result.items||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div></section>`:'';
  const main=aggregates[0],ranked=main?.topGroups || [];
  const textColumns=files.flatMap(file=>file.textColumns.map(column=>({file:file.name,...column})));
  const chartColumn=textColumns.find(column=>column.distinct>1 && column.distinct<=20) || textColumns[0];
  const numeric=files.flatMap(file=>file.numericColumns.map(column=>({file:file.name,...column}))).slice(0,8);
  const numericPlots=genericNumericDistributions(files,context.goal);
  const textBars=column=>column?.keywords.length?column.keywords.map(item=>({name:item.word,value:item.count})):column?.categories.map(item=>({name:item.value,value:item.count}))||[];
  const insightCharts=insightChartCards(model)||(!model.aggregates.length&&chartColumn?`<article class="report-chart"><h3>Phân bố ${esc(chartColumn.name)}</h3>${genericReportBars(textBars(chartColumn),textBars(chartColumn)[0]?.value||0,fmtNum)}</article>`:'');
  const appendix=files.slice(0,5).map(file=>`<details ${exportMode?'open':''}><summary>Dữ liệu · ${fmtNum(Math.min(file.totalRows,50))}/${fmtNum(file.totalRows)} dòng xem trước</summary><div class="report-table-wrap"><table class="report-table"><thead><tr>${file.headers.slice(0,12).map(name=>`<th>${esc(name)}</th>`).join('')}</tr></thead><tbody>${file.rows.slice(0,50).map(row=>`<tr>${file.headers.slice(0,12).map(name=>`<td>${esc(row[name]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`).join('');
  return `<div class="report-heading"><div><span class="eyebrow">AN TÍN · DATA INTELLIGENCE</span><h2>Báo cáo phân tích dữ liệu</h2><p>Ngày lập: ${esc(new Date(generatedAt).toLocaleString('vi-VN'))} · ${fmtNum(files.length)} tệp đã làm sạch</p></div><span class="report-state">${aiUsed?'Có nhận xét AI':'Thống kê từ dữ liệu'}</span></div>
  <section class="report-section"><h3>01 · Kết quả nổi bật</h3><p class="report-lead">${esc(result.summary)}</p>${context.goal?`<p><b>Mục tiêu:</b> ${esc(context.goal)}</p>`:''}<div class="report-kpis"><div><b>${main?fmtNum(main.totalValue):numericPlots[0]?fmtNum(Math.round(numericPlots[0].total)):'—'}</b><span>${main?`${main.aggregation==='average'?'Trung bình':'Tổng'} ${esc(main.metricField)}`:numericPlots[0]?`Tổng ${esc(numericPlots[0].name)}`:'Chỉ số chính'}</span></div><div><b>${main?fmtNum(main.topGroups[0]?.value):numericPlots[0]?fmtNum(Math.round(numericPlots[0].average)):'—'}</b><span>${main?`Dẫn đầu: ${esc(main.topGroups[0]?.name||'—')}`:numericPlots[0]?`Trung bình ${esc(numericPlots[0].name)}`:'Nhóm dẫn đầu'}</span></div><div><b>${fmtNum(aggregates.length)}</b><span>Góc nhìn theo nhóm</span></div><div><b>${fmtNum(totalRows)}</b><span>Dòng dữ liệu được xem xét</span></div></div></section>
  ${requestedSection}
  <section class="report-section"><h3>02 · Biểu đồ từ dữ liệu</h3><div class="report-charts">${insightCharts||'<p class="report-empty">Chưa có giá trị số hoặc nhóm để vẽ biểu đồ.</p>'}</div></section>
  <section class="report-section"><h3>03 · Xếp hạng và số liệu</h3>${aggregates.length?`<p class="report-footnote">Mỗi bảng là một góc nhìn độc lập trên cùng dữ liệu.</p>${aggregates.map(item=>`<details class="report-panel" ${exportMode?'open':''}><summary><b>${item.aggregation==='average'?'Trung bình':'Tổng'} ${esc(item.metricField)} theo ${esc(item.groupField)}</b> · ${fmtNum(item.totalGroups)} nhóm</summary><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Nhóm</th><th>Giá trị</th><th>Số dòng</th></tr></thead><tbody>${item.topGroups.map(group=>`<tr><td>${esc(group.name)}</td><td>${fmtNum(group.value)}</td><td>${fmtNum(group.count)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`:''}${numeric.length?`<details class="report-panel" ${exportMode?'open':''}><summary><b>Xem chỉ số số học</b> · trung bình, thấp nhất và cao nhất</summary><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Cột dữ liệu</th><th>Số dòng</th><th>Trung bình</th><th>Thấp nhất</th><th>Cao nhất</th></tr></thead><tbody>${numeric.map(item=>`<tr><td>${esc(item.name)}</td><td>${fmtNum(item.count)}</td><td>${fmtNum(item.average)}</td><td>${fmtNum(item.min)}</td><td>${fmtNum(item.max)}</td></tr>`).join('')}</tbody></table></div></details>`:''}${textColumns.length?`<details class="report-panel" ${exportMode?'open':''}><summary><b>Xem phân bố nội dung cột chữ</b></summary>${textColumns.slice(0,6).map(column=>`<p><b>${esc(column.name)}:</b> ${column.categories.slice(0,4).map(item=>`${esc(item.value)} (${fmtNum(item.count)})`).join(' · ')}</p>`).join('')}</details>`:''}</section>
  <section class="report-section"><h3>04 · Nhận xét và đề xuất</h3>${result.items?.length?`<ol class="report-proposals">${result.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ol>`:''}${result.limitations?.length?`<h4>Giới hạn cần kiểm tra</h4><ul class="report-proposals">${result.limitations.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}<p class="report-footnote">${aiUsed?'Nhận xét AI cần người dùng kiểm tra lại với tệp nguồn.':'Nhận xét trên được tổng hợp bằng quy tắc từ dữ liệu; Gemini chưa tạo nội dung cho lượt này.'}</p></section>
  <section class="report-section report-appendix"><h3>05 · Xem dữ liệu nguồn</h3><p class="report-footnote">Bản xem trước thu gọn; Excel chứa mọi dòng và cột đã làm sạch.</p>${appendix}</section>`;
}

function genericReportDocument(model){
  const styles=`.insight-svg{width:100%;height:auto;color:#173950}.insight-top{display:flex;justify-content:space-between;font-size:10px;color:#526d80;margin-bottom:10px}.insight-highlight{display:flex;gap:15px;align-items:center;margin-bottom:14px}.insight-highlight strong{font-size:26px}.insight-highlight span{font-size:12px}.dashboard-column{width:100%;height:auto}.dashboard-donut{display:flex;align-items:center;gap:12px}.dashboard-donut svg{width:50%}.dashboard-donut i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}body{font:13px/1.6 Arial,sans-serif;color:#263c32;background:#e9f0ea;margin:0;padding:28px}main{max-width:1150px;margin:auto;background:#fff;border:1px solid #bfd4c5;border-radius:18px;padding:30px}.report-heading{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #dbe3d2;padding-bottom:18px}.eyebrow{font-size:10px;letter-spacing:2px;color:#718664}.report-heading h2{font-size:27px;margin:8px 0}.report-state{background:#e5f0e7;border-radius:20px;padding:7px 12px;white-space:nowrap}.report-section{margin:25px 0}.report-section>h3{font-size:17px}.report-lead,.report-panel{padding:14px;background:#f0f7f1;border-radius:11px}.report-kpis,.report-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.report-kpis>div,.report-chart{padding:14px;border:1px solid #dbe3d2;border-radius:11px}.report-kpis b{display:block;font-size:21px}.report-kpis span,.report-footnote,.report-empty{font-size:11px;color:#52664e}.report-panel{margin:10px 0}.report-panel summary{cursor:pointer;font-size:13px}.report-panel[open] summary{margin-bottom:12px}.report-table-wrap{overflow:auto}.report-table{width:100%;border-collapse:collapse;font-size:11px}.report-table th,.report-table td{padding:8px;border-bottom:1px solid #dbe3d2;text-align:left;vertical-align:top}.report-table th{background:#e5f0e7}.report-proposals{padding-left:22px}.report-appendix details{margin:10px 0}.generic-report-bar{display:grid;grid-template-columns:minmax(80px,1fr) 2fr auto;align-items:center;gap:9px;margin:8px 0}.generic-report-bar>div{height:11px;border-radius:8px;background:#dbe7db}.generic-report-bar i{display:block;height:100%;border-radius:8px;background:#497d5e}.generic-report-bar b{font-size:11px}@media(max-width:700px){body{padding:8px}main{padding:16px}.report-heading{display:block}.report-kpis,.report-charts{grid-template-columns:1fr}}@media print{body{padding:0;background:#fff}main{border:0;padding:0}.report-section,.report-chart{break-inside:avoid}}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo phân tích dữ liệu · An Tín</title><style>${styles}</style></head><body><main>${genericReportContent(model,true)}</main></body></html>`;
}

function genericReportExcelSheets(model){
  const {files,aggregates,totalRows,context,result,aiUsed,generatedAt}=model;
  const requestedRows=[['Yêu cầu','Trạng thái','Cột chỉ số','Phép tính','Công thức','Nhóm','Kết quả','Dòng hợp lệ'],...businessRequestedResults(files,context.goal).flatMap(request=>request.calculations.length?request.calculations.flatMap(item=>item.topGroups.map(group=>[request.question,request.status,item.metricField,item.aggregation,item.formula||'',group.name,group.value,group.count])):[[request.question,request.status,request.explanation]])];
  const overview=[['BÁO CÁO PHÂN TÍCH DỮ LIỆU · AN TÍN'],['Ngày lập',new Date(generatedAt).toLocaleString('vi-VN')],['Lĩnh vực',context.industry||'Chưa cung cấp'],['Mô hình',context.businessType||'Chưa cung cấp'],['Mục tiêu',context.goal||'Chưa cung cấp'],['Dòng dữ liệu',totalRows],['Tệp nguồn',files.length],['Nguồn nhận xét',aiUsed?'Gemini':'Thống kê trực tiếp từ dữ liệu'],[],['TÓM TẮT'],[result.summary],[],['NHẬN XÉT / ĐỀ XUẤT'],...(result.items||[]).map(item=>[item]),[],['GIỚI HẠN'],...(result.limitations||[]).map(item=>[item])];
  const rankings=[['Cột nhóm','Cột chỉ số','Phép tính','Nhóm','Giá trị','Dòng trong nhóm','Dòng đã tính'],...aggregates.flatMap(item=>item.topGroups.map(group=>[item.groupField,item.metricField,item.aggregation,group.name,group.value,group.count,item.validRows]))];
  const textGroups=[['Cột chữ','Giá trị','Số dòng','Số giá trị khác nhau'],...files.flatMap(file=>file.textColumns.flatMap(column=>column.categories.map(item=>[column.name,item.value,item.count,column.distinct])))];
  const numeric=[['Cột số','Dòng có số','Trung bình','Thấp nhất','Cao nhất'],...files.flatMap(file=>file.numericColumns.map(item=>[item.name,item.count,item.average,item.min,item.max]))];
  return [{name:'Tong quan',rows:overview,options:{titleRows:[0]}},{name:'Yeu cau rieng',rows:requestedRows,options:{headerRow:0}},{name:'Xep hang',rows:rankings,options:{headerRow:0}},{name:'Nhom cot chu',rows:textGroups,options:{headerRow:0}},{name:'Cot so',rows:numeric,options:{headerRow:0}},...files.map((file,index)=>({name:`Du lieu ${index+1}`,rows:[file.headers,...file.rows.map(row=>file.headers.map(name=>row[name]??''))],options:{headerRow:0}}))];
}

function renderGenericAnalysisReport(finalReview=false){
  const model=genericReportModel();
  const session=state.businessAnalysis;
  stageEl.innerHTML=`${stageTitle('SAU PHÂN TÍCH · BÁO CÁO','Báo cáo phân tích dữ liệu','Tổng hợp nội dung các cột chữ, biểu đồ, chỉ số hiện có và đề xuất theo mục tiêu.')}
    <div class="report-toolbar"><span>${fmtNum(model.totalRows)} dòng · ${fmtNum(model.files.length)} tệp</span><div class="report-export-actions"><button id="reviewGenericReport" class="btn btn-primary">${finalReview?session.approvedAt?"✓ Đã duyệt":"✓ Duyệt báo cáo":"Chuyển bước 4 · Duyệt báo cáo →"}</button><button id="downloadReport" class="btn btn-light" ${finalReview && session.approvedAt?'':'disabled'}>↓ Xuất HTML</button><button id="downloadReportXlsx" class="btn btn-primary" ${finalReview && session.approvedAt?'':'disabled'}>↓ Xuất Excel</button></div></div>
    <div class="analysis-report">${genericReportContent(model)}</div><div class="stage-footer"><button id="backGenericAnalysis" class="btn btn-quiet">← Về kết quả phân tích</button></div>`;
  document.querySelector('#reviewGenericReport').onclick=()=>{if(finalReview){session.approvedAt=new Date().toISOString();pushAudit('report','Đã duyệt báo cáo');renderGenericAnalysisReport(true);}else{session.reviewRequested=true;setStep(4);}};
  document.querySelector('#downloadReport').onclick=()=>{if(!finalReview || !session.approvedAt)return;download(genericReportDocument(genericReportModel()),'an-tin-bao-cao-du-lieu.html','text/html;charset=utf-8');pushAudit('report','Đã xuất báo cáo phân tích dữ liệu HTML');};
  document.querySelector('#downloadReportXlsx').onclick=()=>{if(!finalReview || !session.approvedAt)return;download(buildReportXlsx(genericReportModel()),'an-tin-bao-cao-du-lieu.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');pushAudit('report','Đã xuất báo cáo phân tích dữ liệu Excel');};
  document.querySelector('#backGenericAnalysis').onclick=()=>setStep(3);
  updateDashboard();
}
