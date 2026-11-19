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
function businessNumericSummaries(file,goal=''){
  const goalKey=businessColumnKey(goal);
  return file.headers.filter(name=>!/(^|_)(id|ma|code|date|ngay|phone|dien_thoai)($|_)/.test(businessColumnKey(name))).map(name=>{
    const raw=file.rows.map(row=>String(row[name]??'').trim()).filter(Boolean);
    const numbers=raw.map(businessAmount).filter(value=>value!==null);
    if(!numbers.length || numbers.length/raw.length<0.8)return null;
    const stats=numbers.reduce((result,value)=>({sum:result.sum+value,min:Math.min(result.min,value),max:Math.max(result.max,value)}),{sum:0,min:Infinity,max:-Infinity});
    return {name,count:numbers.length,min:stats.min,max:stats.max,average:Math.round(stats.sum/numbers.length*100)/100};
  }).filter(Boolean).sort((a,b)=>Number(goalKey.includes(businessColumnKey(b.name)))-Number(goalKey.includes(businessColumnKey(a.name)))).slice(0,8);
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
  }).filter(Boolean).sort((a,b)=>a.distinct/a.total-b.distinct/b.total).slice(0,8);
}
function businessAggregates(files,goal=''){
  const goalKey=businessColumnKey(goal);
  const concepts={
    region:['khu_vuc','vung','vung_mien','mien','region','area','location','dia_ban','tinh','tinh_thanh','thanh_pho','city'],
    category:['nganh_hang','nhom_hang','danh_muc','loai_san_pham','product_category','category','product_type'],
    product:['san_pham','product','mat_hang','item'],
    channel:['kenh','kenh_ban','channel'],
    term:['thoi_han','ky_han','han_thanh_toan','tra_han','payment_term','term'],
    return:['tra_hang','hang_tra','returned','return_status','hoan_tra'],
    status:['trang_thai','status'],
    revenue:['doanh_thu','doanh_thu_thuan','revenue','net_revenue','sales_revenue','sales_amount','total_sales','thanh_tien','tong_tien','total_amount','net_sales_vnd','sales_vnd'],
    profit:['loi_nhuan','profit','gross_profit','net_profit'],
    quantity:['so_luong','quantity','units_sold','units','qty'],
    cost:['chi_phi','gia_von','cost','expense','spend'],
    score:['diem','diem_hai_long','muc_do_hai_long','score','rating','satisfaction'],
    rate:['ty_le','ti_le','rate','percentage','percent']
  };
  const hasTerm=(text,term)=>text===term || text.startsWith(`${term}_`) || text.endsWith(`_${term}`) || text.includes(`_${term}_`);
  const requested=names=>Object.entries(names).find(([,aliases])=>aliases.some(alias=>hasTerm(goalKey,alias)))?.[0];
  const measures=['revenue','profit','quantity','cost','score','rate'];
  const groupConcept=requested(Object.fromEntries(Object.entries(concepts).filter(([key])=>!measures.includes(key))));
  const measureConcept=requested(Object.fromEntries(Object.entries(concepts).filter(([key])=>measures.includes(key))));
  const score=(header,concept)=>{
    const key=businessColumnKey(header);
    if(key.length>2 && hasTerm(goalKey,key))return 100;
    if(concept && concepts[concept].some(alias=>key===alias || key.startsWith(`${alias}_`) || key.endsWith(`_${alias}`)))return 80;
    return 0;
  };
  return files.map(file=>{
    const numeric=file.headers.filter(header=>{
      const values=file.rows.map(row=>String(row[header]??'').trim()).filter(Boolean);
      const numericCount=values.filter(value=>businessAmount(value)!==null).length;
      return numericCount>0 && (numericCount/values.length>=.8 || score(header,measureConcept||'revenue')>=80) && !/(^|_)(id|ma|code|date|ngay|phone)($|_)/.test(businessColumnKey(header));
    });
    const text=file.headers.filter(header=>!numeric.includes(header) && !/(^|_)(id|ma|code|email|phone|date|ngay)($|_)/.test(businessColumnKey(header)));
    const metricField=numeric.sort((a,b)=>score(b,measureConcept||'revenue')-score(a,measureConcept||'revenue'))[0];
    if(!metricField)return [];
    if(measureConcept && score(metricField,measureConcept)===0)return null;
    const dimensionConcepts=['region','channel','term','return','category','product','status'];
    const candidates=[...text,...numeric.filter(header=>[...concepts.return,...concepts.term].some(alias=>businessColumnKey(header)===alias))];
    const groupFields=candidates.map(header=>{
      const values=file.rows.map(row=>String(row[header]??'').trim()).filter(Boolean);
      const distinct=new Set(values).size;
      const key=businessColumnKey(header);
      const known=dimensionConcepts.some(concept=>concepts[concept].some(alias=>key===alias||key.startsWith(`${alias}_`)||key.endsWith(`_${alias}`)));
      const personal=/(customer|khach_hang|khach|company|cong_ty).*(name|ten)|(name|ten).*(customer|khach_hang|khach|company|cong_ty)/.test(key);
      const aliases=dimensionConcepts.flatMap(concept=>concepts[concept]).filter(alias=>key===alias||key.startsWith(`${alias}_`)||key.endsWith(`_${alias}`));
      const positions=[key,...aliases].map(alias=>goalKey.indexOf(alias)).filter(position=>position>=0);
      return {header,distinct,goalPosition:positions.length?Math.min(...positions):Infinity,priority:score(header,groupConcept)+(known?20:0),eligible:header!==metricField&&!personal&&values.length>0&&distinct>=2&&distinct<=Math.min(30,Math.max(2,Math.floor(file.rows.length*.75)))};
    }).filter(item=>item.eligible).sort((a,b)=>a.goalPosition-b.goalPosition||b.priority-a.priority||a.distinct-b.distinct).slice(0,5);
    const aggregation=/(trung_binh|binh_quan|average|avg)/.test(goalKey)?'average':'sum';
    const round=value=>Math.round(value*100)/100;
    return groupFields.map(({header:groupField,goalPosition})=>{
      const groups=new Map();let validRows=0,totalValue=0;
      for(const row of file.rows){
        const group=String(row[groupField]??'').trim(),amount=businessAmount(row[metricField]);
        if(!group || amount===null)continue;
        const current=groups.get(group)||{sum:0,count:0};current.sum+=amount;current.count++;groups.set(group,current);validRows++;totalValue+=amount;
      }
      if(!validRows)return null;
      return {file:file.name,groupField,metricField,goalMatched:Number.isFinite(goalPosition),aggregation,totalRows:file.rows.length,validRows,totalValue:round(aggregation==='average'?totalValue/validRows:totalValue),totalGroups:groups.size,topGroups:[...groups].map(([name,value])=>({name,value:round(aggregation==='average'?value.sum/value.count:value.sum),count:value.count})).sort((a,b)=>/(thap_nhat|it_nhat|nho_nhat|bottom)/.test(goalKey)?a.value-b.value:b.value-a.value).slice(0,12)};
    }).filter(Boolean);
  }).flat().filter(Boolean);
}
function aiBusinessInput() {
  const source=state.clean?.cleanedFiles || [];
  const goal=state.businessContext?.goal || '';
  const files=source.slice(0,6).map(file=>({name:file.name,kind:file.kind,totalRows:file.rows.length,columns:file.headers.slice(0,16).map(name=>({name,filled:file.rows.reduce((n,row)=>n+(row[name]!=null && String(row[name]).trim()!==''?1:0),0)})),numericColumns:businessNumericSummaries(file,goal).slice(0,6),textColumns:businessTextSummaries(file).slice(0,6),sample:file.rows.slice(0,2).map(row=>Object.fromEntries(file.headers.slice(0,12).map(name=>[name,String(row[name]??'').slice(0,80)])))}));
  const requestedResults=businessRequestedResults(source,goal);
  return {businessContext:state.businessContext,requestedResults,files,aggregates:businessAggregates(source,goal).slice(0,12),quality:state.clean?.inputQuality,partialAnalysis:state.clean?.partialAnalysis};
}

function businessRequestedResults(files,goal){
  if(!String(goal||'').trim())return [];
  return String(goal).split(/[\n;]+/).map(s=>s.trim()).filter(Boolean).slice(0,5).map(question=>{
    const key=businessColumnKey(question),ascending=/(thap_nhat|it_nhat|nho_nhat|bottom)/.test(key);
    const limit=Math.min(12,Math.max(1,Number(question.match(/(?:top|đầu|cuối)\s*(\d+)/i)?.[1]||5)));
    const calculations=businessAggregates(files,question).filter(item=>item.goalMatched).slice(0,3).map(item=>({...item,topGroups:[...item.topGroups].sort((a,b)=>ascending?a.value-b.value:b.value-a.value).slice(0,limit)}));
    return {question,status:calculations.length?'calculated':'limited',calculations,explanation:calculations.length?'Tính trên các dòng có giá trị hợp lệ; mỗi góc nhìn dùng cùng nguồn dữ liệu.':'Chưa xác định được cặp cột và phép tính phù hợp. Chỉ số thiếu căn cứ sẽ không được tự tạo.'};
  });
}

function businessDataFallback(input,error){
  const aggregate=input.aggregates[0];
  const fileCount=input.files.length,rowCount=input.files.reduce((n,file)=>n+file.totalRows,0);
  const limitations=['Nhận xét AI tạm thời chưa khả dụng; các số liệu vẫn được tính trực tiếp từ tệp.'];
  if(!aggregate){
    const numeric=input.files.flatMap(file=>file.numericColumns.map(column=>({file:file.name,...column}))).slice(0,4);
    const text=input.files.flatMap(file=>file.textColumns.map(column=>({file:file.name,...column}))).slice(0,3);
    const items=text.map(column=>`${column.name}: ${column.keywords.length?`từ khóa thường gặp ${column.keywords.slice(0,4).map(item=>`${item.word} (${fmtNum(item.count)})`).join(', ')}`:column.categories.slice(0,3).map(item=>`${item.value} (${fmtNum(item.count)})`).join(', ')}.`);
    items.push(...numeric.slice(0,Math.max(0,4-items.length)).map(column=>`${column.name}: trung bình ${fmtNum(column.average)}, thấp nhất ${fmtNum(column.min)}, cao nhất ${fmtNum(column.max)}.`));
    if(!items.length)items.push('Chưa có cột nội dung hoặc cột số có thể tổng hợp. Hãy kiểm tra lại tệp nguồn.');
    if(/doanh thu|bán chạy|ban chay|revenue/i.test(input.businessContext?.goal||''))limitations.push('Chưa có cột phân nhóm phù hợp; báo cáo sẽ hiển thị phân bố và thống kê từ các cột số hiện có.');
    return {summary:`Đã phân tích ${fmtNum(rowCount)} dòng từ ${fileCount} tệp theo nội dung các cột hiện có.`,items,limitations};
  }
  const top=aggregate.topGroups[0];
  const items=input.aggregates.slice(0,4).map(item=>`${item.aggregation==='average'?'Trung bình':'Tổng'} “${item.metricField}” theo “${item.groupField}”: ${item.topGroups.slice(0,3).map(group=>`${group.name} ${fmtNum(group.value)}`).join(' · ')}.`);
  if(aggregate.validRows<aggregate.totalRows)limitations.push(`Chỉ ${fmtNum(aggregate.validRows)}/${fmtNum(aggregate.totalRows)} dòng có cả “${aggregate.groupField}” và “${aggregate.metricField}”.`);
  return {summary:`${aggregate.aggregation==='average'?'Trung bình':'Tổng'} “${aggregate.metricField}” theo “${aggregate.groupField}”: ${fmtNum(aggregate.totalGroups)} nhóm; ${top.name} dẫn đầu với ${fmtNum(top.value)}.`,items,limitations};
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
    state.analysisMode='generic';
    await runClean();
    if(!state.clean || state.clean.blocked)throw new Error('Dữ liệu chưa qua kiểm tra. Hãy xem lỗi tệp phía trên.');
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
    state.businessAnalysis={result,input,aiUsed,generatedAt:new Date().toISOString()};setStep(3);
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
