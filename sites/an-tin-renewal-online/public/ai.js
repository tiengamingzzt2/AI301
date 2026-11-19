function aiPanel(task) {
  const isClean = task === 'clean_review';
  const isBusiness = task === 'business_analysis';
  const saved = isClean ? state.aiCleanReview : isBusiness ? state.aiBusinessAnalysis : state.aiInsights?.[reportScope];
  const title = isClean ? 'AI nhận xét bản làm sạch' : isBusiness ? 'AI phân tích theo yêu cầu của bạn' : 'AI nhận xét phân tích';
  const description = isClean ? 'Xem cảnh báo và mẫu dữ liệu để gợi ý những điểm cần đối chiếu.' : isBusiness ? 'Dựa vào lĩnh vực, mục tiêu và những cột dữ liệu hiện có; nêu rõ các giới hạn.' : 'Tóm tắt số liệu và đề xuất hành động từ phạm vi báo cáo đang chọn.';
  return `<section class="ai-panel" aria-label="${title}"><div class="ai-panel-heading"><div><h3>${title}</h3><p>${description}</p></div><button type="button" class="btn btn-light" data-ai-task="${task}">✦ Tạo nhận xét AI</button></div><div class="ai-panel-result" data-ai-result="${task}" aria-live="polite">${saved ? aiResultMarkup(saved) : '<p>Chọn “Tạo nhận xét AI” để gửi tóm tắt hiện tại tới Gemini. Người duyệt cần xác nhận trước khi áp dụng.</p>'}</div></section>`;
}

function aiResultMarkup(result) {
  return `<p><b>${esc(result.summary)}</b></p>${result.items?.length ? `<ul>${result.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}${result.limitations?.length ? `<p class="ai-limitations">Giới hạn cần kiểm tra: ${result.limitations.map(esc).join(' · ')}</p>` : ''}`;
}

async function aiRequest(task, input) {
  const response = await fetch('/api/ai', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,input})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'AI chưa xử lý được. Hãy thử lại.');
  return result;
}

function aiCleanInput() {
  const clean = state.clean || {};
  const sample = (clean.rows || []).slice(0,5).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !(state.excludedFields || []).includes(key) && ['customer_id','contract_id','plan','expiration_date','licensed_users','active_users','open_tickets','price','adoption_rate'].includes(key))));
  return {businessContext:state.businessContext,summary:clean.cleaningSummary,quality:clean.inputQuality,warnings:(clean.warnings || []).slice(0,8),sample,reviewerFeedback:state.drafts.clean || ''};
}

function businessColumnKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function businessAmount(value){
  let text=String(value??'').trim().replace(/\s|[₫$]/g,'').replace(/(?:vnd|vnđ|đồng|đ)$/i,'');
  if(!/^-?\d[\d.,]*$/.test(text))return null;
  const lastDot=text.lastIndexOf('.'),lastComma=text.lastIndexOf(',');
  if(lastDot>=0 && lastComma>=0)text=lastDot>lastComma?text.replace(/,/g,''):text.replace(/\./g,'').replace(',','.');
  else if(/^[\d-]{1,3}([.,]\d{3})+$/.test(text))text=text.replace(/[.,]/g,'');
  else text=text.replace(',','.');
  const number=Number(text);return Number.isFinite(number)?number:null;
}
function businessNumericSummaries(file){
  return file.headers.slice(0,12).filter(name=>!/id|(^|_)ma($|_)|date|ngay|phone|dien_thoai/.test(businessColumnKey(name))).map(name=>{
    const raw=file.rows.map(row=>String(row[name]??'').trim()).filter(Boolean);
    const numbers=raw.map(businessAmount).filter(value=>value!==null);
    if(!numbers.length || numbers.length/raw.length<0.8)return null;
    const stats=numbers.reduce((result,value)=>({sum:result.sum+value,min:Math.min(result.min,value),max:Math.max(result.max,value)}),{sum:0,min:Infinity,max:-Infinity});
    return {name,count:numbers.length,min:stats.min,max:stats.max,average:Math.round(stats.sum/numbers.length*100)/100};
  }).filter(Boolean).slice(0,4);
}
function businessTextSummaries(file){
  const excluded=/(^|_)(id|ma|code|email|phone|dien_thoai|address|dia_chi|date|ngay|time|thoi_gian)($|_)/;
  const personalName=/(customer|khach_hang|khach|company|cong_ty).*(name|ten)|(name|ten).*(customer|khach_hang|khach|company|cong_ty)/;
  const stopWords=new Set(['và','của','cho','với','được','trong','các','một','những','theo','này','đang','cần','không','hàng','sản','phẩm','dịch','vụ','the','and','for','from','with','this']);
  return file.headers.filter(name=>{const key=businessColumnKey(name);return !excluded.test(key)&&!personalName.test(key);}).map(name=>{
    const values=file.rows.map(row=>String(row[name]??'').trim()).filter(Boolean);
    if(!values.length || values.filter(value=>businessAmount(value)!==null).length/values.length>=.8)return null;
    const counts=new Map();
    for(const value of values)counts.set(value,(counts.get(value)||0)+1);
    const categories=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([value,count])=>({value:value.slice(0,100),count}));
    const words=new Map();
    if(counts.size>20)for(const value of values)for(const word of value.toLocaleLowerCase('vi').match(/[\p{L}]{3,}/gu)||[])if(!stopWords.has(word))words.set(word,(words.get(word)||0)+1);
    const keywords=[...words].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([word,count])=>({word,count}));
    return {name,total:values.length,distinct:counts.size,categories,keywords,examples:counts.size>20?[...counts.keys()].slice(0,3).map(value=>value.slice(0,140)):[]};
  }).filter(Boolean).sort((a,b)=>a.distinct/a.total-b.distinct/b.total).slice(0,6);
}
function businessAggregates(files){
  const groupNames=new Set(['nganh_hang','nhom_hang','danh_muc','danh_muc_san_pham','loai_san_pham','product_category','category','product_type','san_pham','product']);
  const revenueNames=new Set(['doanh_thu','doanh_thu_thuan','revenue','net_revenue','sales_revenue','sales_amount','total_sales','thanh_tien','tong_tien','total_amount']);
  return files.map(file=>{
    const groupField=file.headers.find(header=>groupNames.has(businessColumnKey(header)));
    const revenueField=file.headers.find(header=>revenueNames.has(businessColumnKey(header)));
    if(!groupField || !revenueField)return null;
    const groups=new Map();let validRows=0,totalRevenue=0;
    for(const row of file.rows){
      const group=String(row[groupField]??'').trim(),amount=businessAmount(row[revenueField]);
      if(!group || amount===null)continue;
      groups.set(group,(groups.get(group)||0)+amount);validRows++;totalRevenue+=amount;
    }
    if(!validRows)return null;
    return {file:file.name,groupField,revenueField,totalRows:file.rows.length,validRows,totalRevenue:Math.round(totalRevenue*100)/100,totalGroups:groups.size,topGroups:[...groups].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,revenue])=>({name,revenue:Math.round(revenue*100)/100}))};
  }).filter(Boolean);
}
function aiBusinessInput() {
  const source=(state.clean?.cleanedFiles || []).slice(0,3);
  const files=source.map(file=>({name:file.name,kind:file.kind,totalRows:file.rows.length,columns:file.headers.slice(0,12).map(name=>({name,filled:file.rows.reduce((n,row)=>n+(row[name]!=null && String(row[name]).trim()!==''?1:0),0)})),numericColumns:businessNumericSummaries(file),textColumns:businessTextSummaries(file),sample:file.rows.slice(0,3).map(row=>Object.fromEntries(file.headers.slice(0,12).map(name=>[name,String(row[name]??'').slice(0,80)])))}));
  return {businessContext:state.businessContext,files,aggregates:businessAggregates(source),quality:state.clean?.inputQuality,partialAnalysis:state.clean?.partialAnalysis};
}

function businessDataFallback(input,error){
  const aggregate=input.aggregates[0];
  const fileCount=input.files.length,rowCount=input.files.reduce((n,file)=>n+file.totalRows,0);
  const limitations=[`AI chưa tạo nhận xét vì ${error.message}`, 'Đây là thống kê trực tiếp từ tệp, chưa phải kết luận AI theo toàn bộ mục tiêu kinh doanh.'];
  if(!aggregate){
    const numeric=input.files.flatMap(file=>file.numericColumns.map(column=>({file:file.name,...column}))).slice(0,4);
    const text=input.files.flatMap(file=>file.textColumns.map(column=>({file:file.name,...column}))).slice(0,3);
    const items=text.map(column=>`${column.file} · ${column.name}: ${column.keywords.length?`từ khóa thường gặp ${column.keywords.slice(0,4).map(item=>`${item.word} (${fmtNum(item.count)})`).join(', ')}`:column.categories.slice(0,3).map(item=>`${item.value} (${fmtNum(item.count)})`).join(', ')}.`);
    items.push(...numeric.slice(0,Math.max(0,4-items.length)).map(column=>`${column.file} · ${column.name}: trung bình ${fmtNum(column.average)}, thấp nhất ${fmtNum(column.min)}, cao nhất ${fmtNum(column.max)}.`));
    if(!items.length)items.push('Chưa có cột nội dung hoặc cột số có thể tổng hợp. Hãy kiểm tra lại tệp nguồn.');
    if(/doanh thu|bán chạy|ban chay|revenue/i.test(input.businessContext?.goal||''))limitations.push('Chưa có cặp cột ngành hàng/danh mục và doanh thu/thành tiền hợp lệ trong cùng tệp để xếp hạng.');
    return {summary:`Đã phân tích ${fmtNum(rowCount)} dòng từ ${fileCount} tệp theo nội dung các cột hiện có.`,items,limitations};
  }
  const top=aggregate.topGroups[0];
  const items=[`Dẫn đầu: ${top.name} — ${fmtNum(top.revenue)} theo cột “${aggregate.revenueField}”.`, ...aggregate.topGroups.slice(1,4).map(group=>`${group.name}: ${fmtNum(group.revenue)}.`)];
  if(aggregate.validRows<aggregate.totalRows)limitations.push(`Chỉ ${fmtNum(aggregate.validRows)}/${fmtNum(aggregate.totalRows)} dòng có đủ “${aggregate.groupField}” và “${aggregate.revenueField}”.`);
  return {summary:`Tổng hợp ${fmtNum(aggregate.validRows)} dòng trong “${aggregate.file}”: ${fmtNum(aggregate.totalGroups)} nhóm, tổng ${fmtNum(aggregate.totalRevenue)} theo cột “${aggregate.revenueField}”.`,items,limitations};
}

function aiAnalysisInput() {
  const model = reportModel();
  return {businessContext:state.businessContext,scope:reportScope,total:model.rows.length,approved:model.approved,groups:model.counts,priced:model.priced.length,valueWithEvidence:model.priced.length?model.totalValue:null,missing:model.missing,ticketsOpen:model.ticketRows.length,deadlines:model.deadlines,plans:model.planRows,leadDays:model.leadDays,adoptionThreshold:model.adoptionThreshold,reviewerFeedback:state.drafts.analysis || ''};
}

stageEl.addEventListener('input', event=>{
  const field=event.target.dataset?.businessField;
  if(!['industry','businessType','goal'].includes(field))return;
  state.businessContext[field]=String(event.target.value || '').slice(0,field==='goal'?1000:120);
  state.aiCleanReview=null;state.aiBusinessAnalysis=null;state.businessAnalysis=null;state.aiInsights=null;
  stageEl.querySelectorAll('[data-ai-result]').forEach(node=>{node.textContent='Bối cảnh đã thay đổi. Hãy tạo lại nhận xét AI.';});
  const businessResult=stageEl.querySelector('#businessAnalysisResult');
  if(businessResult)businessResult.textContent='Bối cảnh đã thay đổi. Bấm “Chạy phân tích” để cập nhật kết quả.';
});
stageEl.addEventListener('change', event=>{
  const field=event.target.dataset?.businessField;
  if(field==='businessType')state.businessContext.businessType=event.target.value;
});

async function runBusinessAnalysisFromContext(){
  const button=stageEl.querySelector('#runBusinessAnalysis');
  if(!button || button.disabled || state.processing || state.uploading)return;
  let output=stageEl.querySelector('#businessAnalysisResult');
  button.disabled=true;button.textContent='Agent đang xử lý…';
  output.textContent='Đang đọc dữ liệu và chuẩn bị phân tích theo yêu cầu…';
  try{
    if(state.cleanEditBackup)throw new Error('Hãy lưu và kiểm tra lại các ô đã sửa trước khi phân tích.');
    if(!state.clean || state.clean.blocked){
      if(state.clean?.remediation?.action==='partial_or_reload')state.allowPartial=true;
      else if(state.clean?.blocked)throw new Error('Tệp còn lỗi ở khóa chính hoặc ngày hết hạn. Hãy sửa và tải lại trước khi phân tích.');
      await runClean();
      if(!state.clean || state.clean.blocked)throw new Error('Dữ liệu chưa qua kiểm tra. Hãy xem lỗi tệp phía trên.');
    }
    output=stageEl.querySelector('#businessAnalysisResult');
    const currentButton=stageEl.querySelector('#runBusinessAnalysis');
    if(currentButton){currentButton.disabled=true;currentButton.textContent='Agent đang phân tích…';}
    output.textContent='Đang phân tích dữ liệu theo lĩnh vực và mục tiêu của bạn…';
    const context=JSON.stringify(state.businessContext);
    const input=aiBusinessInput();
    let result,aiUsed=true;
    try{result=await aiRequest('business_analysis',input);}
    catch(error){result=businessDataFallback(input,error);aiUsed=false;}
    if(context!==JSON.stringify(state.businessContext))throw new Error('Bạn đã thay đổi yêu cầu trong lúc chạy. Hãy bấm chạy lại để cập nhật kết quả.');
    state.aiBusinessAnalysis=result;
    output.innerHTML=aiResultMarkup(result);
    pushAudit(aiUsed?'gemini':'data_summary',aiUsed?'Đã phân tích dữ liệu theo bối cảnh kinh doanh':'Đã hiển thị thống kê dữ liệu khi AI không khả dụng');
    if(state.clean.canAnalyze===false){state.businessAnalysis={result,input,aiUsed,generatedAt:new Date().toISOString()};setStep(3);}
  }catch(error){
    const visible=stageEl.querySelector('#businessAnalysisResult');
    if(visible)visible.textContent=error.message;
  }finally{
    const currentButton=stageEl.querySelector('#runBusinessAnalysis');
    if(currentButton){currentButton.disabled=false;currentButton.textContent='✦ Chạy phân tích với dữ liệu đã cung cấp →';}
  }
}
stageEl.addEventListener('click',event=>{
  if(event.target.closest('#runBusinessAnalysis'))runBusinessAnalysisFromContext();
});

stageEl.addEventListener('click', async event => {
  const button = event.target.closest('[data-ai-task]');
  if (!button || button.disabled) return;
  const task = button.dataset.aiTask;
  const requestedScope = reportScope;
  const output = button.closest('.ai-panel').querySelector('[data-ai-result]');
  button.disabled = true; button.textContent = 'Gemini đang xử lý…';
  output.textContent = 'Đang tạo nhận xét từ dữ liệu hiện tại…';
  try {
    const result = await aiRequest(task, task === 'clean_review' ? aiCleanInput() : task === 'business_analysis' ? aiBusinessInput() : aiAnalysisInput());
    if (task === 'clean_review') state.aiCleanReview = result;
    else if(task==='business_analysis')state.aiBusinessAnalysis=result;
    else { state.aiInsights ||= {}; state.aiInsights[requestedScope] = result; }
    output.innerHTML = aiResultMarkup(result);
    pushAudit('gemini', task === 'clean_review' ? 'Đã nhận xét chất lượng dữ liệu làm sạch' : task === 'business_analysis' ? 'Đã phân tích dữ liệu theo bối cảnh kinh doanh' : `Đã nhận xét phân tích · ${requestedScope === 'approved' ? 'hồ sơ đã duyệt' : 'toàn bộ hồ sơ'}`);
  } catch (error) { output.textContent = error.message; }
  finally { button.disabled = false; button.textContent = '✦ Tạo nhận xét AI'; }
});
