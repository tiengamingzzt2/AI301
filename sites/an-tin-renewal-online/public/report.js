let reportScope = 'all';

function reportDate(value) {
  const match=String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
  return date.toISOString().slice(0,10)===match[0]?date:null;
}
function reportDaysUntil(value,now=new Date()) {
  const date=reportDate(value);
  if(!date)return null;
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.round((date.getTime()-today)/86400000);
}
function reportBucket(days) {
  return days==null?'Chưa rõ hạn':days<0?'Quá hạn':days<=30?'Trong 30 ngày':days<=60?'31–60 ngày':days<=90?'61–90 ngày':'Trên 90 ngày';
}
function reportPercent(part,total) { return total?`${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(part/total*100)}%`:'—'; }
function reportAction(row) {
  const group=reviewGroup(row);
  return group==='blocked'?'Xử lý ticket trước khi chốt gia hạn':group==='verify'?'Bổ sung dữ liệu và xác minh giá':group==='upgrade'?'Tư vấn khả năng nâng gói':'Liên hệ gia hạn gói hiện tại';
}

function reportModel(scope = reportScope) {
  const all = state.analysis?.rows || [];
  const rows = scope === 'approved' ? all.filter(row => reviewState.approved.has(reviewKey(row))) : all;
  const counts = Object.fromEntries(Object.keys(reviewGroups).map(key => [key, 0]));
  rows.forEach(row => counts[reviewGroup(row)]++);
  const priced = rows.filter(row => Number.isFinite(row.renewal_value));
  const adoption = rows.map(row => chartNumber(row.adoption_rate)).filter(value => value != null);
  const totalValue = priced.reduce((sum, row) => sum + row.renewal_value, 0);
  const approved = rows.filter(row => reviewState.approved.has(reviewKey(row))).length;
  const today=new Date();
  const deadlines=Object.fromEntries(['Quá hạn','Trong 30 ngày','31–60 ngày','61–90 ngày','Trên 90 ngày','Chưa rõ hạn'].map(label=>[label,{label,count:0,value:0,priced:0}]));
  rows.forEach(row=>{const bucket=deadlines[reportBucket(reportDaysUntil(row.expiration_date,today))];bucket.count++;if(Number.isFinite(row.renewal_value)){bucket.value+=row.renewal_value;bucket.priced++;}});
  const plans=new Map();
  rows.forEach(row=>{const label=String(row.plan || 'Chưa có gói').trim() || 'Chưa có gói';const item=plans.get(label)||{label,count:0,value:0,priced:0};item.count++;if(Number.isFinite(row.renewal_value)){item.value+=row.renewal_value;item.priced++;}plans.set(label,item);});
  const sortedPlans=[...plans.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'vi'));
  const planRows=sortedPlans.slice(0,10);
  if(sortedPlans.length>10)planRows.push(sortedPlans.slice(10).reduce((rest,item)=>({label:'Các gói khác',count:rest.count+item.count,value:rest.value+item.value,priced:rest.priced+item.priced}),{label:'Các gói khác',count:0,value:0,priced:0}));
  const missing={price:rows.length-priced.length,adoption:rows.length-adoption.length,tickets:rows.filter(row=>chartNumber(row.open_tickets)==null).length};
  const ticketRows=rows.filter(row=>chartNumber(row.open_tickets)>0);
  const attentionPricedRows=rows.filter(row=>['blocked','verify'].includes(reviewGroup(row))&&Number.isFinite(row.renewal_value));
  const attentionValue=attentionPricedRows.reduce((sum,row)=>sum+row.renewal_value,0);
  const priorityRows=[...rows].sort((a,b)=>{
    const ad=reportDaysUntil(a.expiration_date,today),bd=reportDaysUntil(b.expiration_date,today);
    return (ad??Infinity)-(bd??Infinity)||(['blocked','verify','upgrade','renew'].indexOf(reviewGroup(a))-['blocked','verify','upgrade','renew'].indexOf(reviewGroup(b)));
  }).slice(0,10);
  const sourceFiles=state.detectedFiles || state.clean?.detectedFiles || [];
  const cleaning=state.clean?.cleaningSummary || null;
  const source = scope === 'approved' ? 'analysis:approved' : 'analysis:all';
  const base = { source, metric:'count', value:'', grain:'value', title:'' };
  const charts = [
    { ...base, type:'pie', group:'__proposal', title:'Cơ cấu đề xuất' },
    { ...base, type:'bar', group:'__adoption_band', title:'Phân bố mức sử dụng' },
    { ...base, type:'line', group:'expiration_date', grain:'month', title:'Số hợp đồng hết hạn theo tháng' },
    { ...base, type:'bar', group:'expiration_date', grain:'month', metric:'sum', value:'renewal_value', title:'Giá trị có căn cứ theo tháng hết hạn' }
  ];
  const proposals = [
    counts.blocked && `Ưu tiên xử lý ticket đang mở cho ${fmtNum(counts.blocked)} hồ sơ chặn upsell trước khi đề xuất nâng gói.`,
    counts.verify && `Bổ sung hoặc xác minh dữ liệu nghiệp vụ cho ${fmtNum(counts.verify)} hồ sơ trước khi chốt giá và phương án gia hạn.`,
    counts.upgrade && `Rà soát nhu cầu nâng gói của ${fmtNum(counts.upgrade)} hồ sơ có mức sử dụng cao và không có ticket mở.`,
    counts.renew && `Chuẩn bị liên hệ gia hạn gói hiện tại cho ${fmtNum(counts.renew)} hồ sơ theo ngày liên hệ đã tính.`,
    priced.length < rows.length && `${fmtNum(rows.length - priced.length)} hồ sơ chưa có giá trị gia hạn đủ căn cứ; cần bổ sung giá trước khi tính tổng đầy đủ.`
  ].filter(Boolean);
  const extraCharts = chartState.saved.filter(config => {
    const result=aggregateChart(config);
    return !result.error && result.series.length;
  });
  return { rows, counts, priced, adoption, totalValue, approved, deadlines:Object.values(deadlines),planRows,missing,ticketRows,attentionValue,attentionPricedRows,priorityRows,sourceFiles,cleaning,charts,extraCharts,proposals,scope,today,leadDays:state.leadDays,adoptionThreshold:state.adoptionThreshold };
}

function reportChart(config) {
  const result = aggregateChart(config);
  return `<article class="report-chart"><h3>${esc(result.title || config.title)}</h3>${result.error || !result.series.length ? `<p class="report-empty">${esc(result.error || 'Chưa có dữ liệu phù hợp để vẽ.')}</p>` : `<div class="chart-svg">${chartSvg(config, result)}</div><div class="report-chart-values">${result.series.map(item => `<span><i></i>${esc(item.label)}: <b>${fmtNum(item.value)}</b></span>`).join('')}</div>`}${result.note ? `<p class="report-footnote">${esc(result.note)}</p>` : ''}</article>`;
}

function reportContent(model,exportMode=false) {
  const {rows,counts,priced,adoption,totalValue,approved,deadlines,planRows,missing,ticketRows,attentionValue,attentionPricedRows,priorityRows,sourceFiles,cleaning,charts,extraCharts,proposals,scope,today,leadDays,adoptionThreshold}=model;
  const avg=adoption.length?`${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(adoption.reduce((sum,n)=>sum+n,0)/adoption.length)}%`:'Chưa có dữ liệu';
  const soon=deadlines[0].count+deadlines[1].count;
  const value=priced.length?money(totalValue):'Chưa đủ căn cứ';
  const portfolioNote=scope==='approved'?'Chỉ tính hồ sơ đã được duyệt trong phiên.':'Kết quả phân tích toàn phiên, gồm hồ sơ đang chờ duyệt.';
  const fullRows=rows.slice(0,200).map(row=>`<tr><td>${esc(row.customer_id)}</td><td>${esc(row.contract_id || '—')}</td><td>${esc(row.customer_name || 'Chưa có dữ liệu')}</td><td>${esc(row.plan || '—')}</td><td>${esc(row.expiration_date || '—')}</td><td>${esc(row.outreach_date || '—')}</td><td>${esc(reviewGroups[reviewGroup(row)]?.label || row.recommendation || '—')}</td><td>${esc(money(row.renewal_value))}</td><td>${esc(row.reason || '—')}</td></tr>`).join('');
  return `<div class="report-heading"><div><span class="eyebrow">AN TÍN · RENEWAL INTELLIGENCE</span><h2>Báo cáo tổng quan gia hạn</h2><p>Ngày lập: ${esc(today.toLocaleString('vi-VN'))} · Phạm vi: ${scope==='approved'?'Hồ sơ đã duyệt':'Toàn bộ kết quả phân tích'}</p></div><span class="report-state">${scope==='approved'?'Đã duyệt':'Bản phân tích · cần người duyệt chốt'}</span></div>
  <section class="report-section" aria-label="Tóm tắt điều hành"><h3>01 · Tóm tắt điều hành</h3><p class="report-lead">${fmtNum(rows.length)} hợp đồng trong phạm vi báo cáo; ${fmtNum(soon)} hợp đồng đã quá hạn hoặc hết hạn trong 30 ngày. ${fmtNum(counts.blocked)} hồ sơ cần xử lý ticket trước khi xem xét upsell và ${fmtNum(counts.verify)} hồ sơ còn thiếu căn cứ nghiệp vụ. ${portfolioNote}</p><div class="report-kpis"><div><b>${fmtNum(rows.length)}</b><span>Hợp đồng phân tích</span></div><div><b>${value}</b><span>Giá trị có căn cứ · ${fmtNum(priced.length)}/${fmtNum(rows.length)} hồ sơ</span></div><div><b>${fmtNum(soon)}</b><span>Quá hạn hoặc ≤30 ngày</span></div><div><b>${fmtNum(ticketRows.length)}</b><span>Hồ sơ có ticket mở</span></div><div><b>${avg}</b><span>Sử dụng trung bình · ${fmtNum(adoption.length)} hồ sơ có dữ liệu</span></div><div><b>${fmtNum(approved)}</b><span>Hồ sơ đã duyệt trong phạm vi</span></div></div><p class="report-footnote">Giá trị có căn cứ là tổng giá trị gia hạn tính được từ dữ liệu hiện có; đây chưa phải doanh thu dự báo hay số tiền đã ký.</p></section>
  <section class="report-section" aria-label="Nguồn và chất lượng dữ liệu"><h3>02 · Nguồn và chất lượng dữ liệu</h3><div class="report-two-col"><div class="report-panel"><h4>Độ phủ dữ liệu để ra quyết định</h4><table class="report-table"><thead><tr><th>Trường</th><th>Có dữ liệu</th><th>Thiếu</th></tr></thead><tbody><tr><td>Giá trị gia hạn</td><td>${fmtNum(priced.length)}/${fmtNum(rows.length)} (${reportPercent(priced.length,rows.length)})</td><td>${fmtNum(missing.price)}</td></tr><tr><td>Mức sử dụng</td><td>${fmtNum(adoption.length)}/${fmtNum(rows.length)} (${reportPercent(adoption.length,rows.length)})</td><td>${fmtNum(missing.adoption)}</td></tr><tr><td>Tình trạng ticket</td><td>${fmtNum(rows.length-missing.tickets)}/${fmtNum(rows.length)} (${reportPercent(rows.length-missing.tickets,rows.length)})</td><td>${fmtNum(missing.tickets)}</td></tr></tbody></table></div><div class="report-panel"><h4>Thông tin xử lý</h4><p>${sourceFiles.length?`${fmtNum(sourceFiles.length)} tệp nguồn đã nhận diện`:'Nguồn tệp được giữ trong phiên làm việc'}${cleaning?`; ${fmtNum(cleaning.totalRows)} dòng đã xử lý, ${fmtNum(cleaning.renamed)} tên cột và ${fmtNum(cleaning.dates)} ô ngày được chuẩn hóa.`:'.'}</p><p>Quy tắc phân tích: liên hệ trước hạn ${fmtNum(leadDays)} ngày; ngưỡng xem xét nâng gói ${fmtNum(adoptionThreshold)}% sử dụng, chỉ khi không có ticket mở.</p>${sourceFiles.length?`<ul class="report-source-list">${sourceFiles.slice(0,10).map(file=>`<li>${esc(file.name)} · ${fmtNum(file.rows)} dòng · ${esc(kindLabel(file.kind))}</li>`).join('')}${sourceFiles.length>10?`<li>Và ${fmtNum(sourceFiles.length-10)} tệp khác.</li>`:''}</ul>`:''}</div></div><p class="report-footnote">Dữ liệu thiếu không được tự điền bằng 0. Những hồ sơ chưa có giá, mức sử dụng hoặc trạng thái ticket cần được rà soát trước quyết định cuối.</p></section>
  <section class="report-section" aria-label="Biểu đồ phân tích"><h3>03 · Biểu đồ phân tích</h3><div class="report-charts">${charts.map(reportChart).join('')}</div>${extraCharts.length?`<h4 class="report-extra-title">Biểu đồ tùy chỉnh từ Dashboard</h4><p class="report-footnote">Mỗi biểu đồ dùng nguồn dữ liệu đã chọn khi tạo trên Dashboard.</p><div class="report-charts">${extraCharts.map(reportChart).join('')}</div>`:''}<p class="report-footnote">Biểu đồ giá trị chỉ dùng hồ sơ có giá trị gia hạn đủ căn cứ; biểu đồ số hợp đồng dùng toàn bộ hồ sơ có ngày hết hạn hợp lệ trong phạm vi.</p></section>
  <section class="report-section" aria-label="Cơ cấu hợp đồng"><h3>04 · Cơ cấu hợp đồng và thời hạn</h3><div class="report-two-col"><div class="report-panel"><h4>Theo thời điểm hết hạn (tính đến ngày lập báo cáo)</h4><table class="report-table"><thead><tr><th>Nhóm</th><th>Hợp đồng</th><th>Giá trị có căn cứ</th></tr></thead><tbody>${deadlines.map(item=>`<tr><td>${esc(item.label)}</td><td>${fmtNum(item.count)}</td><td>${item.priced?money(item.value):'—'}</td></tr>`).join('')}</tbody></table></div><div class="report-panel"><h4>Theo gói hiện tại</h4><table class="report-table"><thead><tr><th>Gói</th><th>Hợp đồng</th><th>Giá trị có căn cứ</th></tr></thead><tbody>${planRows.map(item=>`<tr><td>${esc(item.label)}</td><td>${fmtNum(item.count)}</td><td>${item.priced?money(item.value):'—'}</td></tr>`).join('')}</tbody></table></div></div></section>
  <section class="report-section" aria-label="Hồ sơ ưu tiên"><h3>05 · Hồ sơ cần hành động trước</h3><p class="report-footnote">Hiển thị tối đa 10 hợp đồng sắp hết hạn nhất. Nhóm chặn upsell và cần xác minh được ưu tiên khi trùng ngày.</p><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Mã khách / Hợp đồng</th><th>Khách hàng</th><th>Hết hạn</th><th>Nhóm đề xuất</th><th>Giá trị</th><th>Hành động</th></tr></thead><tbody>${priorityRows.map(row=>`<tr><td>${esc(row.customer_id)}<small>${esc(row.contract_id || '—')}</small></td><td>${esc(row.customer_name || 'Chưa có dữ liệu')}</td><td>${esc(row.expiration_date || '—')}</td><td>${esc(reviewGroups[reviewGroup(row)]?.label || row.recommendation || '—')}</td><td>${esc(money(row.renewal_value))}</td><td>${esc(reportAction(row))}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="report-section" aria-label="Kết luận và đề xuất"><h3>06 · Kết luận và kiến nghị</h3><p>Trong ${fmtNum(rows.length)} hồ sơ: ${fmtNum(counts.upgrade)} xem xét nâng gói, ${fmtNum(counts.renew)} giữ gói hiện tại, ${fmtNum(counts.blocked)} chặn upsell và ${fmtNum(counts.verify)} cần xác minh.</p><ol class="report-proposals">${proposals.length?proposals.map(item=>`<li>${esc(item)}</li>`).join(''):'<li>Chưa có hồ sơ để đề xuất.</li>'}</ol>${counts.blocked+counts.verify?`<p class="report-attention">Giá trị có căn cứ của nhóm chặn upsell hoặc cần xác minh: ${attentionPricedRows.length?money(attentionValue):'Chưa đủ căn cứ'} (${fmtNum(attentionPricedRows.length)} hồ sơ có giá). Đây là giá trị cần rà soát, không phải doanh thu mất đi.</p>`:''}<p class="report-footnote">Đề xuất được suy ra từ quy tắc phân tích của phiên hiện tại. Giá trị thiếu được giữ là “Chưa có dữ liệu”. Ưu đãi, chính sách giá và quyết định gia hạn cuối cùng cần người có thẩm quyền xác nhận.</p></section>
  <section class="report-section report-appendix" aria-label="Phụ lục hồ sơ"><details ${exportMode?'open':''}><summary>07 · Phụ lục: ${fmtNum(Math.min(rows.length,200))}/${fmtNum(rows.length)} hồ sơ trong phạm vi báo cáo</summary><div class="report-table-wrap"><table class="report-table"><thead><tr><th>Mã khách</th><th>Hợp đồng</th><th>Khách hàng</th><th>Gói</th><th>Hết hạn</th><th>Liên hệ</th><th>Đề xuất</th><th>Giá trị</th><th>Căn cứ</th></tr></thead><tbody>${fullRows}</tbody></table></div>${rows.length>200?'<p class="report-footnote">Phụ lục giới hạn 200 hồ sơ đầu để báo cáo dễ xem. Xuất CSV ở bước duyệt để xem chi tiết toàn bộ.</p>':''}</details></section>`;
}

function reportDocument(model) {
  const aiNarrative=state.aiInsights?.[model.scope];
  const aiSection=aiNarrative?`<section class="report-section"><h3>Nhận xét bổ sung từ Gemini</h3><p>${esc(aiNarrative.summary)}</p><ol class="report-proposals">${aiNarrative.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ol><p class="report-footnote">Nội dung do AI tạo, cần người duyệt xác nhận với dữ liệu nguồn.</p></section>`:'';
  const styles=`body{font:13px/1.55 Arial,sans-serif;color:#263628;background:#f5f6f1;margin:0;padding:30px}main{max-width:1150px;margin:auto;background:#fff;border:1px solid #dbe3d2;border-radius:18px;padding:30px}.report-heading{display:flex;justify-content:space-between;gap:20px;align-items:start;border-bottom:1px solid #dbe3d2;padding-bottom:18px}.eyebrow{font-size:10px;letter-spacing:2px;color:#718664}.report-heading h2{font-size:27px;margin:8px 0}.report-heading p{color:#667660;margin:0}.report-state{background:#eaf0e4;border-radius:20px;padding:7px 12px;white-space:nowrap}.report-section{margin:25px 0}.report-section>h3{font-size:17px;margin:0 0 15px}.report-lead{padding:14px;background:#eef4e9;border-radius:10px;line-height:1.7}.report-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.report-kpis>div,.report-panel{padding:14px;background:#f5f8f2;border:1px solid #dbe3d2;border-radius:11px}.report-kpis b{display:block;font-size:20px;overflow-wrap:anywhere}.report-kpis span,.report-panel p,.report-source-list{font-size:11px;color:#52664e}.report-two-col,.report-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.report-panel h4,.report-chart h3{font-size:13px;margin:0 0 9px}.report-chart{border:1px solid #dbe3d2;border-radius:11px;padding:13px;break-inside:avoid}.report-chart svg{width:100%;height:auto}.report-chart-values{display:flex;flex-wrap:wrap;gap:5px 11px;font-size:10px}.report-chart-values i{display:none}.report-table-wrap{overflow:auto}.report-table{border-collapse:collapse;width:100%;font-size:10px}.report-table th,.report-table td{border-bottom:1px solid #dbe3d2;text-align:left;vertical-align:top;padding:8px}.report-table th{background:#eef4e9}.report-table td small{display:block;color:#667660}.report-source-list{padding-left:18px}.report-proposals{padding-left:22px}.report-proposals li{margin-bottom:8px}.report-footnote,.report-empty{color:#65735f;font-size:11px}.report-attention{background:#f8f1e2;border-left:3px solid #b48d50;padding:10px 13px}.report-appendix summary{font-weight:bold;font-size:15px}.report-appendix .report-table-wrap{margin-top:10px}@media(max-width:700px){body{padding:8px}main{padding:16px}.report-kpis,.report-two-col,.report-charts{grid-template-columns:1fr}.report-heading{display:block}}@media print{body{background:white;padding:0}main{border:0;padding:0}.report-chart,.report-panel{break-inside:avoid}.report-section{break-inside:avoid}.report-appendix{break-inside:auto}}`;
  const paletteStyles=`body{background:#e9f0ea;color:#263c32}main{border-color:#bfd4c5}.report-lead{background:#e1efe5;color:#28513c}.report-kpis>div,.report-panel{background:#f0f7f1;border-color:#cddfd1}.report-table th{background:#e5f0e7;color:#29523d}.report-chart{border-color:#cddfd1}.report-section>h3,.report-panel h4,.report-appendix summary{color:#2a5b43}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo cáo tổng quan gia hạn · An Tín</title><style>${styles}${paletteStyles}</style></head><body><main>${reportContent(model,true)}${aiSection}</main></body></html>`;
}

function renderAnalysisReport() {
  if(state.businessAnalysis){renderGenericAnalysisReport();return;}
  if (!state.analysis?.rows?.length) { navigateStep(1); return; }
  const approvedCount=state.analysis.rows.filter(row=>reviewState.approved.has(reviewKey(row))).length;
  if(reportScope==='approved' && !approvedCount)reportScope='all';
  const model=reportModel();
  stageEl.innerHTML=`${stageTitle('SAU PHÂN TÍCH · BÁO CÁO','Báo cáo phân tích','Tổng hợp số liệu, biểu đồ và đề xuất từ kết quả phân tích trong phiên.')}
  <div class="report-toolbar"><label for="reportScope">Phạm vi báo cáo</label><select id="reportScope"><option value="all" ${reportScope==='all'?'selected':''}>Toàn bộ ${fmtNum(state.analysis.rows.length)} hồ sơ</option><option value="approved" ${reportScope==='approved'?'selected':''} ${approvedCount?'':'disabled'}>${fmtNum(approvedCount)} hồ sơ đã duyệt</option></select><button id="openReportCharts" class="btn btn-light">◷ Tùy chỉnh biểu đồ</button><button id="jumpReportFeedback" class="btn btn-light">⚙ Phản hồi / tham số</button><div class="report-export-actions"><button id="downloadReport" class="btn btn-light">↓ Xuất HTML</button><button id="downloadReportXlsx" class="btn btn-primary">↓ Xuất Excel</button></div></div>
  ${aiPanel('analysis_insights')}
  <div class="analysis-report">${reportContent(model)}</div>
  <section class="report-feedback" id="reportFeedbackPanel" aria-labelledby="reportFeedbackTitle"><div class="report-feedback-heading"><div><h3 id="reportFeedbackTitle">Phản hồi / tham số</h3><p>Ghi điều cần thay đổi rồi chạy lại phân tích. Kết quả mới sẽ cần duyệt lại.</p></div></div><div class="tools-origin"><div class="stage-tools"><div class="feedback-wrap"><label for="reportFeedback">Phản hồi cho Agent</label><textarea id="reportFeedback" class="feedback" placeholder="Mô tả điểm cần điều chỉnh trong kết quả phân tích…">${esc(state.drafts.analysis ?? state.feedback)}</textarea></div><div class="parameter-fields"><label for="leadDays">Liên hệ trước hạn</label><input id="leadDays" type="number" min="0" max="365" value="${esc(state.drafts.analysisParams?.leadDays ?? state.leadDays)}"><span class="microcopy">ngày</span><label for="threshold">Ngưỡng adoption upsell</label><input id="threshold" type="number" min="0" max="100" value="${esc(state.drafts.analysisParams?.threshold ?? state.adoptionThreshold)}"><span class="microcopy">%</span></div><button id="rerunAnalysis" data-tools-run class="btn btn-light">↻ Gửi phản hồi & chạy lại phân tích</button></div></div></section>`;
  document.querySelector('#reportScope').onchange=event=>{saveStepDraft();reportScope=event.target.value;renderAnalysisReport();};
  document.querySelector('#openReportCharts').onclick=()=>{saveStepDraft();setStep('dashboard');};
  document.querySelector('#jumpReportFeedback').onclick=()=>document.querySelector('#reportFeedbackPanel').scrollIntoView({behavior:'smooth',block:'start'});
  document.querySelector('#downloadReport').onclick=()=>{download(reportDocument(reportModel()),`an-tin-bao-cao-phan-tich-${reportScope}.html`,'text/html;charset=utf-8');pushAudit('report','Đã tạo báo cáo phân tích '+(reportScope==='approved'?'hồ sơ đã duyệt':'toàn bộ hồ sơ'));};
  document.querySelector('#downloadReportXlsx').onclick=()=>{const bytes=buildReportXlsx(reportModel());download(bytes,`an-tin-bao-cao-phan-tich-${reportScope}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');pushAudit('report','Đã xuất báo cáo Excel '+(reportScope==='approved'?'hồ sơ đã duyệt':'toàn bộ hồ sơ'));};
  document.querySelector('#rerunAnalysis').onclick=()=>runAnalysis(document.querySelector('#reportFeedback').value.trim());
  updateDashboard();
}
