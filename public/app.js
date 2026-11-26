const stageEl = document.querySelector('#stage');
const state = { step: 1, lastWorkflowStep: 1, tablePage: 0, datasets: {}, drafts: {}, detectedFiles: [], processing: false, uploading: false, cleanFileIndex: -1, clean: null, analysis: null, businessAnalysis: null, feedback: '', audit: [], leadDays: 45, adoptionThreshold: 70, allowPartial: false, analysisMode:'generic', businessContext: {industry:'',businessType:'',goal:''} };
const categories = [
  { id: 'contracts', title: 'Hợp đồng', detail: 'Mã khách hàng, mã hợp đồng, gói và ngày hết hạn', required: true, icon: '▤' },
  { id: 'usage', title: 'Nhật ký sử dụng', detail: 'Mã khách hàng, người dùng hoạt động và ngày đối chiếu', icon: '◷' },
  { id: 'support', title: 'Yêu cầu hỗ trợ', detail: 'Mã khách hàng, số ticket mở hoặc trạng thái', icon: '◉' },
  { id: 'policies', title: 'Gói & chính sách', detail: 'Mã khách hàng, giá và điều kiện ưu đãi', icon: '◇' }
];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function setStep(n) {
  const previous=state.step;
  state.step=n; if(Number.isInteger(n))state.lastWorkflowStep=n;
  state.tablePage=0;render();
  if(previous!==n && typeof animateWorkspaceTransition==='function')animateWorkspaceTransition(previous,n);
}
function stepAvailability(step) {
  if (state.processing || state.uploading) return { enabled:false, reason:'Agent đang xử lý dữ liệu. Vui lòng đợi hoàn tất.' };
  if (step===1) return { enabled:true, reason:'Mở khu vực tải và quản lý tệp.' };
  if (step===2) return state.clean && !state.clean.blocked && (state.clean.rows?.length || state.clean.cleanedFiles?.length)
    ? { enabled:true, reason:'Xem lại dữ liệu đã chuẩn hóa.' } : { enabled:false, reason:'Tải tệp và hoàn tất kiểm tra, làm sạch dữ liệu trước.' };
  if(step===4 && state.businessAnalysis)return {enabled:!!state.businessAnalysis.reviewRequested,reason:'Chuyển báo cáo sang duyệt trước khi xuất.'};
  if(step===3 && state.businessAnalysis)return {enabled:true,reason:'Xem kết quả phân tích từ dữ liệu đã tải lên.'};
  if (!state.analysis || state.analysis.blocked || !state.analysis.rows?.length) return { enabled:false, reason:'Duyệt dữ liệu và chạy phân tích để mở bước này.' };
  if (step===3) return { enabled:true, reason:'Xem đề xuất và chọn hồ sơ để kiểm duyệt.' };
  if (step===4 && !state.businessAnalysis) {
    const savedScope = state.analysis.rows.some(row=>reviewState.finalKeys?.has(reviewKey(row)) || reviewState.approved.has(reviewKey(row)));
    const newSelection = reviewState.view==='pending' && selectedReviewRows().length>0;
    return savedScope || newSelection ? { enabled:true, reason:'Mở lượt duyệt cuối; các hồ sơ mới chọn sẽ được chuyển sang bước này.' } : { enabled:false, reason:'Chọn hồ sơ ở bước Phân tích rồi bấm Duyệt kết quả.' };
  }
  return { enabled:false, reason:'Bước không hợp lệ.' };
}
function saveStepDraft() {
  const field = ({2:'cleanFeedback',3:'analysisFeedback',4:'finalFeedback',report:'reportFeedback'})[state.step];
  const name = ({2:'clean',3:'analysis',4:'final',report:'analysis'})[state.step];
  const input = field ? document.getElementById(field) : null;
  if (input && typeof input.value==='string') state.drafts[name]=input.value;
  if (state.step===3 || state.step==='report') {
    const lead=document.querySelector('#leadDays'), threshold=document.querySelector('#threshold');
    if (lead && threshold) state.drafts.analysisParams={leadDays:lead.value,threshold:threshold.value};
  }
}
function navigateStep(step) {
  step=Number(step);
  const access=stepAvailability(step);
  if (!access.enabled) return false;
  if (state.step===step) return true;
  saveStepDraft();
  if (step===4) {
    const selected=reviewState.view==='pending' ? selectedReviewRows() : [];
    if (selected.length && (!reviewState.finalKeys || selected.some(row=>!reviewState.finalKeys.has(reviewKey(row))))) { transferReviewSelection(); return true; }
    const pending=state.analysis.rows.some(row=>reviewState.finalKeys?.has(reviewKey(row)) && !reviewState.approved.has(reviewKey(row)));
    if (!pending && reviewState.approved.size) reviewState.view='approved';
  }
  setStep(step);
  return true;
}
function dashboardSnapshot() {
  const clean = state.clean, cleanRows = clean?.blocked ? [] : clean?.rows || [];
  const analyzed = state.analysis?.rows || [];
  const reviewing = [3,4].includes(state.step) && !!state.analysis;
  const approvedCount = analyzed.filter(row=>reviewState.approved.has(reviewKey(row))).length;
  const files = queuedFiles().length;
  const generic = !cleanRows.length && clean?.cleanedFiles?.length && !clean.blocked;
  const warningRows = new Set((clean?.warnings || []).map(w=>w.row ?? w.customer_id));

  // Xác định trạng thái hoàn tất thực tế của từng bước
  const isStep1Done = Boolean(clean && !clean.blocked && (files > 0 || cleanRows.length || clean?.cleanedFiles?.length) && state.step > 1);
  const isStep2Done = Boolean((state.analysis && !state.analysis.blocked && analyzed.length > 0 || state.businessAnalysis) && state.step >= 3);
  const isStep3Done = Boolean(state.businessAnalysis?.reviewRequested || (state.analysis && !state.analysis.blocked && (state.step === 4 || (reviewState.approved.size > 0 && state.step >= 3))));
  const isStep4Done = Boolean(state.businessAnalysis?.approvedAt || (state.analysis && approvedCount > 0 && approvedCount >= analyzed.length));

  const content = {
    overviewTotalLabel: generic ? 'Dòng dữ liệu đã làm sạch' : 'Hồ sơ đã chuẩn hóa',
    overviewTotal: generic ? fmtNum(clean.cleaningSummary.totalRows) : clean && !clean.blocked ? fmtNum(cleanRows.length) : '—',
    overviewTotalNote: clean && !clean.blocked ? `${fmtNum(files)} tệp trong phiên · dữ liệu đã chuẩn hóa` : 'Bắt đầu bằng cách nạp dữ liệu',
    overviewReviewLabel: 'Cần xác minh', overviewReview: clean && !clean.blocked ? fmtNum(clean.inputQuality?.limitedCount ?? warningRows.size) : '—',
    overviewReviewNote: clean && !clean.blocked ? 'Hồ sơ còn thiếu dữ liệu nghiệp vụ' : 'Chưa có kết quả kiểm tra',
    overviewValueLabel: 'Giá trị gia hạn có căn cứ', overviewValue: '—', overviewValueNote: 'Hiển thị sau bước phân tích',
    workspaceStatus: ({1:'Sẵn sàng nhận dữ liệu',2:'Đang chờ duyệt dữ liệu',3:'Đã hoàn tất phân tích',4:'Đang chờ duyệt cuối',audit:'Lịch sử thực thi',dashboard:'Biểu đồ từ dữ liệu trong phiên',report:'Báo cáo từ kết quả phân tích'})[state.step],
    workspaceTitle: state.step === 'dashboard' ? 'Dashboard dữ liệu' : state.step === 'report' ? 'Báo cáo phân tích' : state.step === 'audit' ? 'Nhật ký Agent' : 'Quy trình làm việc',
    stepCount1: files ? (isStep1Done ? `✓ ${fmtNum(files)} tệp` : `${fmtNum(files)} tệp`) : '—',
    stepCount2: clean?.blocked ? 'Cần sửa' : clean ? (isStep2Done ? '✓ Đã duyệt' : `👤 Cần duyệt (${fmtNum(generic ? clean.cleaningSummary.totalRows : cleanRows.length)})`) : '—',
    stepCount3: state.businessAnalysis ? '✓ Đã phân tích' : analyzed.length ? (isStep3Done ? '✓ Đã chuyển' : `${fmtNum(analyzed.length-approvedCount)} chờ`) : '—',
    stepCount4: state.businessAnalysis ? (isStep4Done ? '✓ Đã duyệt' : state.businessAnalysis.reviewRequested ? 'Cần duyệt' : '—') : analyzed.length ? (isStep4Done ? '✓ Hoàn tất' : approvedCount > 0 ? `${fmtNum(approvedCount)}/${fmtNum(analyzed.length)} duyệt` : `👤 Cần duyệt (${fmtNum(analyzed.length)})`) : '—'
  };
  if (state.step === 1 && clean?.blocked) {
    const readCount = (state.detectedFiles || []).reduce((sum,file)=>sum+file.rows,0);
    content.overviewTotalLabel = 'Dòng dữ liệu đã đọc'; content.overviewTotal = readCount ? fmtNum(readCount) : '—';
    content.overviewTotalNote = `${fmtNum(files)} tệp đang giữ · chờ sửa dữ liệu`;
    content.overviewReviewLabel = 'Lỗi cần sửa'; content.overviewReview = fmtNum(clean.errorCount ?? clean.errors?.length ?? 0);
    content.overviewReviewNote = 'Cần sửa trước khi chuyển bước'; content.workspaceStatus = 'Đang chờ sửa dữ liệu';
  }
  if([3,'report'].includes(state.step) && state.businessAnalysis){
    content.overviewTotalLabel='Dòng đã phân tích';content.overviewTotal=fmtNum(state.businessAnalysis.input.files.reduce((sum,file)=>sum+file.totalRows,0));
    content.overviewTotalNote=`${fmtNum(state.businessAnalysis.input.files.length)} tệp đã kiểm tra`;
    content.overviewReviewLabel='Nhóm đã phân tích';content.overviewReview=fmtNum(state.businessAnalysis.input.aggregates.reduce((sum,item)=>sum+item.totalGroups,0));
    content.overviewReviewNote='Theo cột nhóm và chỉ số khớp mục tiêu';
    content.overviewValueLabel='Chỉ số từ dữ liệu';content.overviewValue=state.businessAnalysis.input.aggregates.length?fmtNum(state.businessAnalysis.input.aggregates[0].totalValue):'—';
    content.overviewValueNote='Đơn vị theo cột trong tệp gốc';content.workspaceStatus=state.step==='report'?'Báo cáo phân tích dữ liệu':'Đã hoàn tất phân tích dữ liệu';
  }
  if (reviewing || (state.step === 'audit' && state.analysis)) {
    const base = reviewing ? reviewBaseRows() : analyzed;
    const scope = reviewing ? reviewFilteredRows() : analyzed;
    const priced = scope.filter(row=>Number.isFinite(row.renewal_value));
    const verifying = scope.filter(row=>reviewGroup(row)==='verify').length;
    const blocked = scope.filter(row=>reviewGroup(row)==='blocked').length;
    const approvedView = reviewing && reviewState.view==='approved';
    const label = !reviewing ? 'Hợp đồng trong phiên' : approvedView ? 'Hồ sơ đã duyệt' : state.step===4 ? 'Hồ sơ chờ duyệt cuối' : 'Hồ sơ chờ duyệt';
    content.overviewTotalLabel = label; content.overviewTotal = fmtNum(scope.length);
    content.overviewTotalNote = scope.length !== base.length ? `Đang lọc ${fmtNum(scope.length)} / ${fmtNum(base.length)} hồ sơ · ${fmtNum(analyzed.length)} hồ sơ trong phiên` : `${fmtNum(base.length)} hồ sơ ${approvedView?'đã duyệt':reviewing?'đang chờ':'trong phiên'} · ${fmtNum(analyzed.length)} hồ sơ toàn phiên`;
    content.overviewReview = fmtNum(verifying); content.overviewReviewNote = `${fmtNum(blocked)} hồ sơ chặn upsell trong nhóm đang xem`;
    content.overviewValueLabel = approvedView ? 'Giá trị đã duyệt có căn cứ' : reviewing ? 'Giá trị chờ duyệt có căn cứ' : 'Giá trị gia hạn có căn cứ';
    content.overviewValue = !priced.length && scope.length ? 'Chưa đủ căn cứ' : money(priced.reduce((sum,row)=>sum+row.renewal_value,0));
    content.overviewValueNote = `${fmtNum(priced.length)} / ${fmtNum(scope.length)} hồ sơ đang xem có giá đủ căn cứ tính`;
    content.reviewContextTotal = `${fmtNum(scope.length)} ${label.toLowerCase()}${scope.length!==base.length?' (đang lọc)':''}`;
    content.reviewContextValue = `Giá trị có căn cứ: ${content.overviewValue} · ${fmtNum(priced.length)} hồ sơ có giá`;
    content.workspaceStatus = approvedView ? `Đã duyệt ${fmtNum(approvedCount)} / ${fmtNum(analyzed.length)} hồ sơ` : state.step===4 ? `Còn ${fmtNum(base.length)} hồ sơ trong lượt duyệt cuối` : state.step===3 ? `Còn ${fmtNum(base.length)} hồ sơ chờ duyệt` : 'Lịch sử thực thi';
  }
  if (state.step === 'report' && analyzed.length) {
    const report = reportModel();
    content.overviewTotalLabel = 'Hồ sơ trong báo cáo';
    content.overviewTotal = fmtNum(report.rows.length);
    content.overviewTotalNote = report.scope === 'approved' ? 'Phạm vi hồ sơ đã duyệt' : 'Toàn bộ kết quả phân tích';
    content.overviewReviewLabel = 'Cần xác minh';
    content.overviewReview = fmtNum(report.counts.verify);
    content.overviewReviewNote = `${fmtNum(report.counts.blocked)} hồ sơ chặn upsell`;
    content.overviewValueLabel = 'Giá trị có căn cứ';
    content.overviewValue = money(report.totalValue);
    content.overviewValueNote = `${fmtNum(report.priced.length)} / ${fmtNum(report.rows.length)} hồ sơ có giá`;
  }
  const progress = analyzed.length ? approvedCount / analyzed.length * 100 : 0;
  if(state.step==='dashboard' && typeof chartWorkspaceStats==='function') Object.assign(content,chartWorkspaceStats());
  content.valueProgressLabel = analyzed.length ? `Tiến độ duyệt: ${fmtNum(approvedCount)} / ${fmtNum(analyzed.length)} hồ sơ (${Math.round(progress)}%)` : 'Tiến độ duyệt xuất hiện sau bước phân tích';
  return { content, progress, approvedCount, total: analyzed.length, isStep1Done, isStep2Done, isStep3Done, isStep4Done };
}
function updateDashboard() {
  const {content,progress,approvedCount,total,isStep1Done,isStep2Done,isStep3Done,isStep4Done} = dashboardSnapshot();
  Object.entries(content).forEach(([id,value])=>{ const el=document.getElementById(id); if (el && el.textContent!==String(value)) el.textContent=value; });
  document.querySelector('#valueProgress').style.width = `${progress}%`;
  const track=document.querySelector('#overviewProgress');
  if (track) { track.setAttribute('aria-valuenow',approvedCount); track.setAttribute('aria-valuemax',total || 1); track.setAttribute('aria-valuetext',content.valueProgressLabel); }
  if(track) track.hidden=['dashboard','report'].includes(state.step);
  const progressLabel=document.querySelector('#valueProgressLabel');if(progressLabel)progressLabel.hidden=['dashboard','report'].includes(state.step);
  document.querySelector('#steps').hidden = false;

  const stepDoneMap = {
    1: isStep1Done,
    2: isStep2Done,
    3: isStep3Done,
    4: isStep4Done
  };

  document.querySelectorAll('.step').forEach(el => {
    const x = Number(el.dataset.step), access = stepAvailability(x);
    const isDone = Boolean(stepDoneMap[x]);
    const isHitl = (x === 2 || x === 4); // Chốt chặn con người (HITL)

    el.classList.toggle('active', x === state.step);
    el.classList.toggle('done', isDone);
    el.classList.toggle('hitl-step', isHitl);

    const isPendingHitl = isHitl && !isDone && access.enabled;
    el.classList.toggle('pending-hitl', isPendingHitl);

    const numEl = el.querySelector('.step-num');
    if (numEl) {
      if (isDone) {
        numEl.innerHTML = '<span class="step-check-icon">✓</span>';
        numEl.title = `Bước 0${x}: Đã hoàn tất`;
      } else {
        numEl.textContent = `0${x}`;
        numEl.title = isHitl ? `Bước 0${x}: Chốt chặn con người (HITL) - Cần kiểm tra và phê duyệt` : `Bước 0${x}`;
      }
    }

    el.disabled = !access.enabled;
    el.title = isHitl && !isDone && access.enabled ? `Chốt chặn con người: ${access.reason}` : access.reason;
    if (x === state.step) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
  document.querySelectorAll('.main-nav .nav-item').forEach(el => el.classList.toggle('active', el.hash === (state.step === 'audit' ? '#audit' : state.step==='dashboard' ? '#dashboard' : '#workflow')));
  if (typeof updateWorkspaceChrome==='function') updateWorkspaceChrome();
}
function fileToBase64(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); }); }
function kindLabel(kind) { return categories.find(c => c.id === kind)?.title || 'Dữ liệu dạng bảng'; }
function queuedFiles() { return Object.values(state.datasets).flat(); }
function refreshUploadBusy() {
  const busy = state.processing || state.uploading;
  for (const id of ['file-upload', 'browseUpload', 'startClean', 'clearUploads']) { const el = document.getElementById(id); if (el) el.disabled = busy; }
  const zone = document.querySelector('#uploadZone'); if (zone) zone.classList.toggle('is-processing', busy);
  const status = document.querySelector('#uploadStatus');
  if (status) status.textContent = state.processing ? 'Agent đang nhận diện và làm sạch dữ liệu…' : state.uploading ? 'Đang đọc tệp…' : 'Tự nhận diện nội dung · Không cần chọn nhóm dữ liệu';
  updateDashboard();
}
async function queueUploadFiles(incoming, replace = false) {
  if (state.processing || state.uploading || !incoming.length) return;
  const error = document.querySelector('#upload-error');
  const invalid = [...incoming].find(file => !/\.(csv|xlsx)$/i.test(file.name));
  if (invalid) { error.innerHTML = `<div class="alert error">${esc(invalid.name)}: hãy dùng tệp CSV hoặc XLSX.</div>`; return; }
  const names = new Set([...incoming].map(f => f.name));
  const retained = replace ? [] : queuedFiles().filter(f => !names.has(f.name));
  const bytes = retained.reduce((n, f) => n + f.data.length * .75, 0) + [...incoming].reduce((n, f) => n + f.size, 0);
  if (bytes > 20 * 1024 * 1024) { error.innerHTML = '<div class="alert error">Tổng dung lượng tối đa 20 MB. Hãy chia nhỏ hoặc bớt tệp.</div>'; return; }
  state.uploading = true; refreshUploadBusy();
  try {
    const files = await Promise.all([...incoming].map(async file => ({ name: file.name, data: await fileToBase64(file) })));
    const merged = new Map([...retained, ...files].map(f => [f.name, f]));
    state.datasets = { auto: [...merged.values()] }; state.detectedFiles = []; state.clean = null; state.analysis = null; state.businessAnalysis=null; state.allowPartial = false;state.analysisMode='generic';
    await runClean();
  } catch (e) { error.innerHTML = `<div class="alert error">Không đọc được tệp: ${esc(e.message)}</div>`; }
  finally { state.uploading = false; refreshUploadBusy(); }
}
function inputs() { return { leadDays: state.leadDays, adoptionThreshold: state.adoptionThreshold, feedback: state.feedback, excludedFields: state.excludedFields || [], allowPartial: state.allowPartial,analysisMode:state.analysisMode }; }
async function agentRun(stage) {
  const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, datasets: state.datasets, ...inputs() }) });
  return await res.json();
}
function pushAudit(kind, detail) { state.audit.unshift({ time: new Date().toLocaleString('vi-VN'), kind, detail }); try { localStorage.setItem('renewal-agent-audit', JSON.stringify(state.audit)); } catch {} }
try { state.audit = JSON.parse(localStorage.getItem('renewal-agent-audit') || '[]'); } catch { state.audit = []; }
function fmtNum(n) { return n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n); }
function money(n) { return n == null ? 'Chưa đủ căn cứ' : new Intl.NumberFormat('vi-VN').format(n) + ' ₫'; }
function stageTitle(kicker, title, desc, tag = '') { return `<div class="stage-title"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2><p>${desc}</p></div>${tag ? `<span class="stage-label">${tag}</span>` : ''}</div>`; }
function needsBusinessContext() {
  const clean=state.clean;
  return state.step===2 && !!clean && !clean.blocked && queuedFiles().length>0;
}
function blockedInputPreview(){
  if(!state.clean?.blocked)return '';
  const previews=state.clean.previewFiles||[];
  return '<section class="blocked-preview"><h3>Dữ liệu chưa đạt kiểm tra</h3><p>Chỉnh các ô cần sửa rồi lưu và kiểm tra lại. Chỉ chuyển bước khi dữ liệu đạt yêu cầu.</p>'+previews.map(file=>{
    const matrix=file.matrix||[],width=Math.max(0,...matrix.map(row=>row.length));
    if(!width)return '<p>Bảng '+esc(file.index)+': Không có nội dung đọc được. Hãy chọn lại file gốc.</p>';
    const field=(row,col,value)=>'<input data-blocked-cell data-file="'+(file.index-1)+'" data-row="'+row+'" data-column="'+col+'" aria-label="Bảng '+file.index+', dòng '+(row+1)+', cột '+(col+1)+'" value="'+esc(value??'')+'" placeholder="'+(row===0?'Chưa có tên cột':'Trống')+'" '+(row===0&&!String(value||'').trim()?'aria-invalid="true"':'')+'>';
    return '<article><div class="blocked-grid-toolbar"><strong>Bảng '+file.index+' · Dữ liệu gốc</strong><span>Chưa dùng để phân tích</span></div><div class="table-wrap"><table class="data-table blocked-grid"><thead><tr>'+Array.from({length:width},(_,col)=>'<th>'+field(0,col,matrix[0]?.[col])+'</th>').join('')+'</tr></thead><tbody>'+matrix.slice(1).map((row,i)=>'<tr>'+Array.from({length:width},(_,col)=>'<td>'+field(i+1,col,row[col])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="microcopy">Hiển thị '+Math.max(0,matrix.length-1)+' dòng đầu · tối đa 20 dòng và 12 cột. Các dòng ngoài bản xem trước được giữ nguyên khi lưu.</p></article>';
  }).join('')+'<div class="blocked-grid-actions"><span id="blockedEditStatus" role="status">Sửa dữ liệu nhỏ tại đây; nếu thiếu trên diện rộng, hãy bổ sung file gốc.</span><button id="saveBlockedEdits" class="btn btn-primary" disabled>Lưu & kiểm tra lại</button></div></section>';
}
function businessContextForm() {
  const context=state.businessContext;
  const hasFiles=queuedFiles().length>0;
  return `<section class="business-context" aria-label="Bối cảnh kinh doanh"><h3>Phân tích theo yêu cầu của bạn</h3><p>Nhập từng yêu cầu ở một dòng hoặc ngăn bằng dấu chấm phẩy. Kết quả riêng sẽ xuất hiện trong mục Yêu cầu báo cáo của bạn, kèm phép tính và nguồn dữ liệu.</p><div class="business-context-grid"><label>Lĩnh vực kinh doanh<input data-business-field="industry" maxlength="120" placeholder="VD: Bán lẻ, SaaS, bất động sản…" value="${esc(context.industry)}"></label><label>Mô hình kinh doanh<select data-business-field="businessType"><option value="" ${!context.businessType?'selected':''}>Chọn nếu phù hợp</option><option value="B2B" ${context.businessType==='B2B'?'selected':''}>B2B</option><option value="B2C" ${context.businessType==='B2C'?'selected':''}>B2C</option><option value="Khác" ${context.businessType==='Khác'?'selected':''}>Khác</option></select></label></div><label>Mục tiêu / yêu cầu phân tích<textarea data-business-field="goal" maxlength="1000" rows="3" placeholder="Mỗi dòng một yêu cầu. VD: Top 5 doanh thu theo vùng; Chi phí trung bình theo kênh…">${esc(context.goal)}</textarea></label><div class="business-context-actions" ${state.step===2?'hidden':''}><button type="button" class="btn btn-primary" id="runBusinessAnalysis" ${hasFiles?'':'disabled'}>✦ Chạy phân tích với dữ liệu đã cung cấp →</button><span>${hasFiles?'Dùng các tệp đang giữ trong phiên.':'Tải lên ít nhất một tệp CSV hoặc XLSX để bắt đầu.'}</span></div><div class="ai-panel-result business-context-result" id="businessAnalysisResult" role="status" aria-live="polite">${state.aiBusinessAnalysis?aiResultMarkup(state.aiBusinessAnalysis):''}</div></section>`;
}
function errorBox(errors = [], errorCount = errors.length, remediation = state.clean?.remediation) {
  const e = errors[0];
  const reload = remediation?.action === 'reload',partial=remediation?.action==='partial_or_reload';
  const canRepair = !reload && !partial && Object.values(state.datasets).some(files => files.length);
  return `<div class="alert error" role="alert"><b>${reload?'Cần sửa tệp để phân tích gia hạn; bạn vẫn có thể phân tích các cột hiện có.':partial?'Thiếu dữ liệu phân tích — chọn cách tiếp tục.':`Phát hiện ${fmtNum(errorCount)} lỗi — cần sửa tệp trước khi tiếp tục.`}</b>${reload||partial?`<p>${esc(remediation.reason)}</p>${remediation.issues?.length?`<ul>${remediation.issues.slice(0,6).map(issue=>`<li>${esc(issue.file)} · ${esc(issue.field)}: ${fmtNum(issue.count)}${issue.total?` / ${fmtNum(issue.total)} hồ sơ`:''} thiếu hoặc sai.</li>`).join('')}</ul>`:''}`:''}${e ? `<p style="margin:6px 0 0"><b>Ví dụ:</b> ${esc(e.file)}${e.row !== '-' ? ` · dòng ${esc(e.row)}` : ''} · ${esc(e.field)}: ${esc(e.message)}</p>` : ''}${reload||partial?`<div class="error-actions"><button type="button" id="reuploadFiles" class="btn ${partial?'btn-light':'btn-primary'}">↑ Chọn lại tệp đã bổ sung</button><a class="btn btn-light" href="/templates/mau_du_lieu_gia_han.xlsx" download>↓ Tải file mẫu</a>${partial?'<button type="button" id="continuePartial" class="btn btn-primary">Tiếp tục với dữ liệu hiện có →</button>':''}<span>${partial?'Các chỉ số thiếu sẽ không được tính; người duyệt phải kiểm tra giới hạn trước khi chốt.':'Sửa tệp để dùng luồng gia hạn, hoặc chạy phân tích theo các cột hiện có ở bên dưới.'}</span></div>`:canRepair ? '<div class="error-actions"><button type="button" class="btn btn-light" data-repair-mode="manual">✎ Tự sửa dữ liệu</button><button type="button" class="btn btn-primary" data-repair-mode="auto">✦ Để Agent sửa định dạng</button><span>Tệp đã được giữ lại để chỉnh sửa vài ô; Agent không tự điền thông tin nghiệp vụ còn thiếu.</span></div>' : ''}</div>`;
}
function warningsBox(warnings, title='Cảnh báo cần theo dõi', warningCount=warnings?.length || 0) { return warnings?.length ? `<details class="alert warning warnings-panel"><summary><b>${esc(title)} (${fmtNum(warningCount)})</b><span>Xem chi tiết</span></summary><ul>${warnings.slice(0, 8).map(w => `<li>${esc(w.customer_id || '')}${w.field ? ` · ${esc(w.field)}` : ''}: ${esc(w.message)}</li>`).join('')}${warningCount > 8 ? `<li>… và ${fmtNum(warningCount - 8)} cảnh báo khác.</li>` : ''}</ul><div>Hồ sơ vẫn có thể tiếp tục; giá trị thiếu được giữ là “Chưa có dữ liệu”, không đổi thành 0.</div></details>` : ''; }
function toolsSection(content) { return `<details class="stage-tools-details"><summary>Phản hồi và tham số <small>Mở khi cần xử lý lại</small></summary><div class="tools-origin"><div class="stage-tools">${content}</div></div></details>`; }
function renderUpload() {
  const files = queuedFiles();
  stageEl.innerHTML = `${stageTitle('BƯỚC 01 · ĐẦU VÀO', 'Một nơi cho tất cả dữ liệu', 'Chọn một hoặc nhiều tệp. Agent tự nhận diện nội dung, chuẩn hóa và trả kết quả làm sạch để bạn kiểm duyệt.', 'CSV · XLSX')}
    ${state.clean?.blocked?'':inputGuideTeaser()}
    <div id="upload-error" aria-live="polite"></div>
    ${blockedInputPreview()}
    <div id="uploadZone" class="unified-upload"><div class="drop-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 21V5m0 0-6 6m6-6 6 6M5 21v5a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h3>Kéo thả tệp vào đây</h3><p>Hợp đồng, sử dụng, hỗ trợ hay dữ liệu khác —<br>bạn chỉ cần tải lên, Agent sẽ tự đọc và làm sạch.</p><button type="button" id="browseUpload" class="btn btn-primary">Chọn tệp từ máy <span>↗</span></button><input id="file-upload" type="file" accept=".csv,.xlsx" multiple hidden aria-label="Tải lên một hoặc nhiều tệp CSV hoặc XLSX"><span class="upload-format-note">CSV, XLSX · Chọn nhiều tệp cùng lúc · Tổng tối đa 20 MB</span><div id="uploadStatus" class="upload-agent-status" role="status"></div></div>
    ${files.length ? `<div class="upload-queue"><div class="queue-heading"><b>${files.length} tệp đang giữ trong phiên</b><button id="clearUploads" class="btn btn-quiet">Bỏ tất cả</button></div>${files.slice(0,12).map((file, i) => { const detected = state.detectedFiles.find(f => f.name === file.name); return `<div class="queued-file"><span class="file-type-icon">${/\.xlsx$/i.test(file.name) ? 'XLSX' : 'CSV'}</span><div><strong>${esc(file.name)}</strong><small>${detected ? esc(kindLabel(detected.kind)) : 'Agent sẽ tự nhận diện'}</small></div><button type="button" class="remove-upload" data-remove-upload="${i}" aria-label="Bỏ tệp ${esc(file.name)}" ${state.processing ? 'disabled' : ''}>✕</button></div>`; }).join('')}${files.length > 12 ? `<p class="microcopy">Và ${files.length - 12} tệp khác trong phiên.</p>` : ''}</div>` : ''}
    <div class="upload-process"><span><b>01</b> Nhận diện tệp</span><i>→</i><span><b>02</b> Chuẩn hóa dữ liệu</span><i>→</i><span><b>03</b> Trả bản làm sạch</span></div>
    <div class="stage-footer"><span class="microcopy">Xử lý tại localhost · Tệp gốc được giữ nguyên</span>${files.length ? '<button id="startClean" class="btn btn-light">Chạy lại làm sạch →</button>' : ''}</div>`;
  document.querySelector('#browseUpload').onclick = () => { state.replaceUploads=false; document.querySelector('#file-upload').click(); };
  const reupload = document.querySelector('#reuploadFiles');
  if(reupload)reupload.onclick=()=>{if(state.processing || state.uploading)return;state.replaceUploads=true;const input=document.querySelector('#file-upload');input.value='';input.click();};
  const partial=document.querySelector('#continuePartial');
  if(partial)partial.onclick=()=>{if(state.processing || state.uploading)return;state.allowPartial=true;runClean();};
  document.querySelector('#file-upload').onchange = e => {const replace=state.replaceUploads;state.replaceUploads=false;queueUploadFiles([...e.target.files],replace);};
  const zone = document.querySelector('#uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); if (!state.processing && !state.uploading) zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-dragging'); });
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('is-dragging'); queueUploadFiles([...e.dataTransfer.files]); });
  if (files.length) document.querySelector('#clearUploads').onclick = () => { if (state.processing || state.uploading) return; state.datasets = {}; state.clean = null; state.analysis = null; state.businessAnalysis=null; state.detectedFiles = []; setStep(1); };
  const start = document.querySelector('#startClean'); if (start) start.onclick = () => runClean();
  refreshUploadBusy();
}
async function runClean(feedback = '') {
  if (state.processing) return;
  state.processing = true; refreshUploadBusy();
  const btn = document.querySelector('#startClean') || document.querySelector('#rerunClean');
  if (btn) { btn.disabled = true; btn.textContent = 'Agent đang kiểm tra…'; }
  try {
    state.analysis = null;state.businessAnalysis=null;
    state.aiCleanReview = null; state.aiInsights = null;
    state.aiBusinessAnalysis = null;
    resetReview();
    if(typeof resetChartWorkspace==='function')resetChartWorkspace();
    state.drafts={clean:feedback};
    state.feedback = feedback;
    const result = await agentRun('clean');
    state.detectedFiles = result.detectedFiles || [];
    state.excludedFields = []; state.cleanEditBackup = null;
    state.blockedPatches={}; state.clean = result; showInputNotification(result.notification || (result.blocked?{level:'error',title:'Cần kiểm tra lại dữ liệu',message:result.errors?.[0]?.message||'Không đọc được dữ liệu.'}:null)); (result.log || []).forEach(item => pushAudit(item.skill, `${item.action}: ${item.detail}`));
    pushAudit('data_aggregator', feedback ? `Đã chạy lại kiểm tra dữ liệu theo phản hồi: ${feedback}` : `Đã đọc và kiểm tra ${Object.values(state.datasets).flat().length} tệp`);
    if (result.blocked) { setStep(1); return; }
    state.cleanFileIndex = result.cleanedFiles?.length ? 0 : -1;
    setStep(2);
  } catch (e) { showInputNotification({level:'error',title:'Chưa xử lý được dữ liệu',message:e.message}); }
  finally { state.processing = false; if(state.step===2)renderClean(); refreshUploadBusy(); if (btn) { btn.disabled = false; btn.textContent = feedback ? 'Chạy lại bước chuẩn hóa' : 'Chạy lại làm sạch →'; } }
}
function dataTable(rows, mode) {
  const cleanCols = [['customer_id','Mã khách'],['contract_id','Hợp đồng'],['customer_name','Khách hàng'],['plan','Gói'],['expiration_date','Hết hạn'],['licensed_users','Seat cấp'],['active_users','Active users'],['open_tickets','Ticket mở'],['snapshot_date','Ngày đối chiếu']];
  const resultCols = [['customer_id','Mã khách'],['customer_name','Khách hàng'],['plan','Gói hiện tại'],['expiration_date','Hết hạn'],['outreach_date','Liên hệ từ'],['adoption_rate','Sử dụng'],['open_tickets','Ticket mở'],['recommendation','Đề xuất'],['renewal_value','Giá trị'],['status','Tình trạng']];
  const cols = (mode === 'clean' ? cleanCols : resultCols).filter(([key])=>!(state.excludedFields || []).includes(key));
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  state.tablePage = Math.max(0, Math.min(state.tablePage, pages - 1));
  const start = state.tablePage * 50;
  const pageRows = rows.slice(start, start + 50);
  return `<div class="data-table-shell" data-mode="${mode}"><div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th scope="col">${c[1]}</th>`).join('')}</tr></thead><tbody>${pageRows.map(r=>`<tr>${cols.map(c=>`<td>${c[0]==='renewal_value'?esc(money(r[c[0]])):c[0]==='adoption_rate'?(r[c[0]]==null?'Chưa có dữ liệu':`${r[c[0]]}%`):c[0]==='status'?statusTag(r[c[0]]):esc(r[c[0]] ?? 'Chưa có dữ liệu')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="table-pagination"><span>${rows.length ? fmtNum(start + 1) : 0}–${fmtNum(Math.min(start + 50, rows.length))} / ${fmtNum(rows.length)} hồ sơ</span><div class="pagination-actions"><button class="btn btn-light" data-table-page="${state.tablePage - 1}" ${state.tablePage === 0 ? 'disabled' : ''} aria-label="Trang trước">←</button><button class="btn btn-light" data-table-page="${state.tablePage + 1}" ${state.tablePage >= pages - 1 ? 'disabled' : ''} aria-label="Trang sau">→</button></div></div></div>`;
}
function statusTag(s) { const klass = s === 'Đủ căn cứ sơ bộ' ? 'green' : s === 'Chặn upsell' ? 'red' : 'amber'; return `<span class="tag ${klass}">${esc(s)}</span>`; }
function sourceTable(index) {
  const file = state.clean.cleanedFiles[index];
  const pages = Math.max(1, Math.ceil(file.rows.length / 50)); state.tablePage = Math.max(0, Math.min(state.tablePage, pages - 1));
  const start = state.tablePage * 50;
  const headers = file.headers.filter(h=>!(state.excludedFields || []).includes(h));
  return `<div class="data-table-shell" data-mode="source" data-index="${index}"><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${file.rows.slice(start,start+50).map((row,i) => `<tr>${headers.map(h => `<td><input class="repair-cell clean-inline-cell" data-clean-file="${index}" data-clean-row="${start+i}" data-clean-col="${file.headers.indexOf(h)}" value="${esc(row[h])}" aria-label="Dòng ${start+i+2}, ${esc(h)}" ${state.processing?'disabled':''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="table-pagination"><span>${file.rows.length ? fmtNum(start+1) : 0}–${fmtNum(Math.min(start+50,file.rows.length))} / ${fmtNum(file.rows.length)} dòng</span><div class="pagination-actions"><button class="btn btn-light" data-table-page="${state.tablePage-1}" ${state.tablePage===0?'disabled':''} aria-label="Trang trước">←</button><button class="btn btn-light" data-table-page="${state.tablePage+1}" ${state.tablePage>=pages-1?'disabled':''} aria-label="Trang sau">→</button></div></div></div>`;
}
function downloadCleanedFile() {
  const index = state.cleanFileIndex;
  if (index < 0) { exportCsv(state.clean.rows); return; }
  const file = state.clean.cleanedFiles[index];
  const quote = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const csv = [file.headers.map(quote).join(','), ...file.rows.map(row => file.headers.map(h=>quote(row[h])).join(','))].join('\r\n');
  download('\uFEFF'+csv,file.name.replace(/\.[^.]+$/,'')+'_lam_sach.csv','text/csv;charset=utf-8');
}
function renderClean() {
  const c = state.clean;
  const canAnalyze = c.canAnalyze !== false;
  const files = c.cleanedFiles || [];
  stageEl.innerHTML = `${stageTitle('BƯỚC 02 · KẾT QUẢ LÀM SẠCH', 'Agent đã làm sạch dữ liệu', 'Xem nội dung đã chuẩn hóa, tải bản làm sạch hoặc phản hồi để Agent xử lý lại.', 'Chờ người duyệt')}
    ${c.cleaningSummary ? `<div class="clean-report"><span><b>${fmtNum(c.cleaningSummary.files)}</b> tệp đã nhận diện</span><span><b>${fmtNum(c.cleaningSummary.totalRows)}</b> dòng đã xử lý</span><span><b>${fmtNum(c.cleaningSummary.renamed)}</b> tên cột chuẩn hóa</span><span><b>${fmtNum(c.cleaningSummary.dates)}</b> ô ngày chuẩn hóa</span></div>${c.cleaningSummary.duplicateRows ? `<div class="alert warning">Có ${fmtNum(c.cleaningSummary.duplicateRows)} dòng trùng hoàn toàn. Agent giữ lại để bạn kiểm tra; có thể dùng chức năng sửa dữ liệu để lựa chọn loại trùng.</div>` : ''}` : ''}
    ${!canAnalyze ? '<div class="alert warning">Dữ liệu có thể phân tích. Duyệt bản làm sạch rồi nhập mục tiêu để phân tích các cột hiện có.</div>' : ''}
    ${inputQualityMarkup(c.inputQuality)}
    ${c.partialAnalysis?'<div class="alert warning"><b>Đang phân tích với dữ liệu chưa đầy đủ.</b> Tỷ lệ sử dụng, trạng thái ticket hoặc giá trị gia hạn thiếu sẽ để trống. Hồ sơ thiếu căn cứ cần xác minh trước khi ra quyết định.</div>':''}
    ${needsBusinessContext()?businessContextForm():''}
    ${warningsBox(c.warnings,'Cảnh báo cần theo dõi',c.warningCount)}
    ${cleanFieldControls()}
    ${files.length ? `<div class="clean-file-toolbar"><label>Kết quả đang xem<select id="cleanFileSelect">${c.rows.length ? `<option value="-1" ${state.cleanFileIndex < 0?'selected':''}>Hồ sơ hợp đồng đã ghép (${c.rows.length})</option>` : ''}${files.map((f,i)=>`<option value="${i}" ${state.cleanFileIndex===i?'selected':''}>${esc(f.name)} · ${esc(kindLabel(f.kind))}</option>`).join('')}</select></label><button class="btn btn-light" id="downloadCleaned">↓ Tải CSV đã làm sạch</button></div>` : ''}
    <div id="cleanTableHost">${state.cleanFileIndex>=0 && files.length ? sourceTable(state.cleanFileIndex) : dataTable(c.rows || [], 'clean')}</div>
    ${toolsSection(`<div class="feedback-wrap"><label for="cleanFeedback">Phản hồi về bản làm sạch</label><textarea id="cleanFeedback" class="feedback" placeholder="Mô tả dữ liệu cần kiểm tra lại…">${esc(state.drafts.clean ?? '')}</textarea><small>Chạy lại kiểm tra theo quy tắc; tệp gốc được giữ nguyên.</small></div><button id="rerunClean" data-tools-run class="btn btn-light">↻ Chạy lại chuẩn hóa</button>`)}
    <div class="stage-footer"><button id="backUpload" class="btn btn-quiet">← Bổ sung / đổi tệp</button><div class="result-actions"><button class="btn btn-light" data-repair-mode="manual">✎ Sửa dữ liệu</button><button id="approveClean" class="btn btn-primary" ${!state.cleanEditBackup?'':'disabled title="Lưu và kiểm tra lại các ô đã sửa trước khi phân tích"'}>${canAnalyze?(c.partialAnalysis?'Chấp nhận giới hạn & phân tích':'Dữ liệu đạt'):'Duyệt dữ liệu & phân tích'}　→</button></div></div>`;
  document.querySelector('#backUpload').onclick = () => setStep(1);
  document.querySelector('#rerunClean').onclick = () => runClean(document.querySelector('#cleanFeedback').value.trim());
  document.querySelector('#approveClean').onclick = () => canAnalyze ? runAnalysis() : runBusinessAnalysisFromContext();
  if (files.length) {
    document.querySelector('#downloadCleaned').onclick = downloadCleanedFile;
    document.querySelector('#cleanFileSelect').onchange = e => { state.cleanFileIndex = Number(e.target.value); state.tablePage = 0; document.querySelector('#cleanTableHost').innerHTML = state.cleanFileIndex < 0 ? dataTable(c.rows,'clean') : sourceTable(state.cleanFileIndex); };
  }
}
async function runAnalysis(feedback = '') {
  if (state.processing || state.cleanEditBackup || state.clean?.blocked || state.clean?.canAnalyze === false) return;
  state.processing = true;
  if ([3,4].includes(state.step)) syncReviewActions(); else updateDashboard();
  const lead = Number(document.querySelector('#leadDays')?.value ?? state.drafts.analysisParams?.leadDays ?? state.leadDays); const threshold = Number(document.querySelector('#threshold')?.value ?? state.drafts.analysisParams?.threshold ?? state.adoptionThreshold);
  state.leadDays = lead; state.adoptionThreshold = threshold; state.feedback = feedback;
  const button = document.querySelector('#approveClean') || document.querySelector('#rerunAnalysis'); if (button) { button.disabled = true; button.textContent = 'Agent đang phân tích…'; }
  try {
    const result = await agentRun('analyze'); state.analysis = result;
    state.aiInsights = null;
    if (result.blocked) { state.analysis = null; state.clean = result; setStep(1); return; }
    (result.log || []).forEach(item => pushAudit(item.skill, `${item.action}: ${item.detail}`));
    pushAudit('renewal_pipeline', feedback ? `Đã phân tích lại theo phản hồi: ${feedback}` : 'Đã chạy phân tích gia hạn và kiểm tra quy tắc chính sách');
    resetReview();
    state.drafts={...state.drafts,analysis:feedback,final:'',analysisParams:null};
    setStep(3);
  } catch (e) { stageEl.insertAdjacentHTML('afterbegin', `<div class="alert error">Agent gặp lỗi: ${esc(e.message)}</div>`); }
  finally { state.processing = false; if (button) { button.disabled = false; button.textContent = 'Dữ liệu đạt　→'; } syncReviewActions(); }
}
function renderAnalysis() {
  if(state.businessAnalysis){renderBusinessAnalysis();return;}
  const a = state.analysis;
  stageEl.innerHTML = `${stageTitle('BƯỚC 03 · PHÂN TÍCH', 'Đề xuất gia hạn', 'Agent đã tính ngày liên hệ, mức sử dụng và kiểm tra chốt chặn ticket trước khi đề xuất.', 'Cần duyệt kết quả')}
    ${a.partialAnalysis?'<div class="alert warning"><b>Kết quả phân tích có giới hạn.</b> Hồ sơ thiếu dữ liệu sử dụng, ticket hoặc giá được đánh dấu cần xác minh; không tự suy ra giá trị còn thiếu.</div>':''}
    <div class="review-context"><strong id="reviewContextTotal"></strong><span id="reviewContextValue"></span></div>
    ${aiPanel('analysis_insights')}
    ${warningsBox(a.warnings,'Cần xác minh trước khi chốt',a.warningCount)}${reviewWorkspace()}
    <p class="microcopy" id="reviewExportNotice" role="status"></p>
    ${toolsSection(`<div class="feedback-wrap"><label for="analysisFeedback">Phản hồi hoặc điều chỉnh tham số</label><textarea id="analysisFeedback" class="feedback" placeholder="Mô tả điểm cần điều chỉnh…">${esc(state.drafts.analysis ?? state.feedback)}</textarea></div><div class="parameter-fields"><label for="leadDays">Liên hệ trước hạn</label><input id="leadDays" type="number" min="0" max="365" value="${esc(state.drafts.analysisParams?.leadDays ?? state.leadDays)}"><span class="microcopy">ngày</span><label for="threshold">Ngưỡng adoption upsell</label><input id="threshold" type="number" min="0" max="100" value="${esc(state.drafts.analysisParams?.threshold ?? state.adoptionThreshold)}"><span class="microcopy">%</span></div><p class="microcopy">Chạy lại tạo kết quả mới và cần duyệt lại.</p><button id="rerunAnalysis" data-tools-run class="btn btn-light">↻ Chạy lại phân tích</button>`)}
    <div class="stage-footer"><button id="backClean" class="btn btn-quiet">← Quay lại duyệt dữ liệu</button><div class="result-actions"><button id="openAnalysisReport" class="btn btn-light">▤ Xem báo cáo phân tích</button><button id="reviewOutput" class="btn btn-primary" disabled>Chọn hồ sơ để chuyển duyệt →</button></div></div>`;
  document.querySelector('#backClean').onclick = () => setStep(2);
  document.querySelector('#rerunAnalysis').onclick = () => runAnalysis(document.querySelector('#analysisFeedback').value.trim());
  document.querySelector('#reviewOutput').onclick = transferReviewSelection;
  document.querySelector('#openAnalysisReport').onclick = () => setStep('report');
  syncReviewActions();
}
function renderBusinessAnalysis(){
  const {input}=state.businessAnalysis;
  const result=reportResultWithoutFilenames(state.businessAnalysis.result,state.clean?.cleanedFiles||[]);
  const context=input.businessContext || {};
  const model=genericReportModel();
  const aggregates=model.aggregates || [];
  const charts=insightChartCards(model);
  stageEl.innerHTML=`${stageTitle('BƯỚC 03 · PHÂN TÍCH','Kết quả phân tích dữ liệu','Kết quả dựa trên các tệp đã làm sạch và mục tiêu bạn cung cấp. Các chỉ số thiếu căn cứ được nêu rõ.','Đã phân tích')}
    <div class="review-context"><strong>${fmtNum(input.files.reduce((sum,file)=>sum+file.totalRows,0))} dòng · ${fmtNum(input.files.length)} tệp</strong><span>${context.industry?`Lĩnh vực: ${esc(context.industry)} · `:''}${context.businessType?`${esc(context.businessType)} · `:''}${context.goal?`Mục tiêu: ${esc(context.goal)}`:'Chưa mô tả mục tiêu cụ thể'}</span></div>
    ${charts?`<section class="business-ranking insight-section"><div class="insight-section-heading"><div><h3>Góc nhìn từ dữ liệu</h3><p>Tỷ trọng, xu hướng và phân bố được chọn theo nội dung từng cột.</p></div><span>Biểu đồ từ dữ liệu</span></div><div class="report-charts">${charts}</div></section>`:''}
    <section class="ai-panel"><h3>Kết luận và đề xuất</h3><div class="ai-panel-result">${aiResultMarkup(result)}</div></section>
    ${aggregates.map(item=>`<details class="business-ranking"><summary><b>${item.aggregation==='average'?'Trung bình':'Tổng'} ${esc(item.metricField)} theo ${esc(item.groupField)}</b> · ${fmtNum(item.totalGroups)} nhóm</summary><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Nhóm</th><th scope="col">${item.aggregation==='average'?'Trung bình':'Tổng'} ${esc(item.metricField)}</th><th scope="col">Số dòng</th></tr></thead><tbody>${item.topGroups.map(group=>`<tr><td>${esc(group.name)}</td><td>${fmtNum(group.value)}</td><td>${fmtNum(group.count)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
    <div class="stage-footer"><button id="backClean" class="btn btn-quiet">← Quay lại duyệt dữ liệu</button><div class="result-actions"><button id="editBusinessGoal" class="btn btn-light">Điều chỉnh yêu cầu</button><button id="openGenericReport" class="btn btn-primary">▤ Xem báo cáo phân tích →</button></div></div>`;
  document.querySelector('#backClean').onclick=()=>setStep(2);
  document.querySelector('#editBusinessGoal').onclick=()=>setStep(2);
  document.querySelector('#openGenericReport').onclick=()=>setStep('report');
}
function renderFinal() {
  if(state.businessAnalysis){renderGenericAnalysisReport(true);return;}
  const a = state.analysis;
  const reviewCustomers = new Set(reviewBaseRows().map(row=>row.customer_id));
  stageEl.innerHTML = `${stageTitle('BƯỚC 04 · DUYỆT CUỐI', 'Xem lại trước khi xuất', 'Kiểm tra hồ sơ, các giới hạn dữ liệu và quyết định phiên bản nào được bàn giao.', 'Chưa xuất kết quả')}
    ${a.partialAnalysis?'<div class="alert warning">Bạn đã chọn phân tích với dữ liệu chưa đầy đủ. Hãy kiểm tra từng hồ sơ cần xác minh trước khi duyệt hoặc xuất.</div>':''}
    <div class="alert success" id="finalSelectionSummary" role="status"></div>
    ${warningsBox((a.warnings || []).filter(w=>reviewCustomers.has(w.customer_id)),'Thông tin cần nêu rõ khi bàn giao')}${reviewWorkspace()}
    <p class="microcopy" id="reviewExportNotice" role="status"></p>
    ${toolsSection(`<div class="feedback-wrap"><label for="finalFeedback">Phản hồi cho Agent nếu cần chạy lại</label><textarea id="finalFeedback" class="feedback" placeholder="Ghi điểm chưa đạt…">${esc(state.drafts.final ?? state.feedback)}</textarea><small>Chạy lại tạo phiên bản mới cần duyệt lại.</small></div><button id="rerunFinal" data-tools-run class="btn btn-light">↻ Gửi phản hồi & chạy lại</button>`)}
    <div class="stage-footer"><button id="backAnalysis" class="btn btn-quiet">← Chọn thêm hồ sơ</button><div class="result-actions"><button id="approveSelected" class="btn btn-light" disabled>✓ Duyệt hồ sơ đã chọn</button><button id="exportHtml" class="btn btn-light" disabled>Duyệt & xuất HTML</button><button id="exportCsv" class="btn btn-primary" disabled>✓ Duyệt & xuất CSV</button></div></div><p class="microcopy">Hồ sơ đã duyệt được chuyển sang mục Đã duyệt trong phiên kết quả hiện tại.</p>`;
  document.querySelector('#backAnalysis').onclick = () => { reviewState.view='pending'; reviewState.selected.clear(); reviewState.query=''; reviewState.filter='all'; setStep(3); };
  document.querySelector('#rerunFinal').onclick = () => runAnalysis(document.querySelector('#finalFeedback').value.trim());
  document.querySelector('#exportCsv').onclick = () => exportReviewSelection('csv');
  document.querySelector('#exportHtml').onclick = () => exportReviewSelection('html');
  document.querySelector('#approveSelected').onclick = approveReviewSelection;
  syncReviewActions();
}
function renderAudit() {
  stageEl.innerHTML = `${stageTitle('TRUY VẾT · SKILL LOG', 'Nhật ký Agent', 'Lịch sử các kỹ năng đã chạy và các điểm người duyệt đã xác nhận.', 'Lưu trong trình duyệt')}
    ${state.audit.length ? `<div class="log-list">${state.audit.map(a=>`<div class="log-item"><b>${esc(a.kind)}</b><span>${esc(a.detail)}</span><small>${esc(a.time)}</small></div>`).join('')}</div>` : '<div class="empty-state"><div class="big">◷</div><b>Chưa có lượt chạy nào</b><p>Nhật ký sẽ xuất hiện sau khi Agent đọc dữ liệu.</p></div>'}
    <div class="stage-footer"><button id="backToFlow" class="btn btn-quiet">← Về quy trình</button><button id="clearAudit" class="btn btn-light">Xóa nhật ký</button></div>`;
  document.querySelector('#backToFlow').onclick = () => setStep(state.analysis ? 3 : state.clean ? 2 : 1);
  document.querySelector('#clearAudit').onclick = () => { state.audit = []; localStorage.removeItem('renewal-agent-audit'); renderAudit(); };
}
function render() { updateDashboard(); if(state.step==='dashboard'){renderChartWorkspace();return;} if(state.step==='report'){renderAnalysisReport();return;} if (state.step === 'audit') { renderAudit(); return; } if (state.step === 1) renderUpload(); else if (state.step === 2) renderClean(); else if (state.step === 3) renderAnalysis(); else renderFinal(); }
function exportCsv(rows) {
  const cols = ['customer_id','contract_id','customer_name','plan','expiration_date','outreach_date','licensed_users','active_users','adoption_rate','open_tickets','recommendation','reason','renewal_value','policy_status','status'];
  const csv = [cols.join(','), ...rows.map(r=>cols.map(c=>`"${String(r[c] ?? '').replace(/"/g,'""')}"`).join(','))].join('\r\n'); download('\uFEFF'+csv,'an-tin-de-xuat-gia-han.csv','text/csv;charset=utf-8');
}
function exportHtml(rows) {
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Báo cáo gia hạn An Tín</title><style>body{font:14px Arial;color:#18333a;margin:36px}h1{color:#167f75}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#edf6f3} .note{color:#61777d}</style><h1>Đề xuất gia hạn hợp đồng</h1><p class="note">Tạo bởi An Tín Renewal Agent · ${new Date().toLocaleString('vi-VN')}</p><table><thead><tr><th>Mã khách</th><th>Hợp đồng</th><th>Khách hàng</th><th>Hết hạn</th><th>Ngày liên hệ</th><th>Adoption</th><th>Ticket mở</th><th>Đề xuất</th><th>Căn cứ</th><th>Giá trị</th><th>Tình trạng</th></tr></thead><tbody>${rows.map(r=>`<tr>${[r.customer_id,r.contract_id,r.customer_name,r.expiration_date,r.outreach_date,r.adoption_rate==null?'Chưa có dữ liệu':r.adoption_rate+'%',r.open_tickets??'Chưa có dữ liệu',r.recommendation,r.reason,money(r.renewal_value),r.status].map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="note">Thông tin thiếu được ghi rõ là chưa có dữ liệu. Ưu đãi và quyết định cuối cần người có thẩm quyền xác nhận.</p></html>`;
  download(html,'an-tin-de-xuat-gia-han.html','text/html;charset=utf-8');
}
function download(content, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
document.querySelector('#demoBtn').onclick = () => {
  const enc = s => btoa(unescape(encodeURIComponent(s)));
  state.datasets = {
    contracts: [{name:'hop-dong-mau.csv',data:enc('customer_id,contract_id,customer_name,plan,expiration_date,licensed_users\nKH001,HĐ-001,Công ty Minh An,Pro,2026-12-20,50\nKH002,HĐ-002,Công ty Sao Việt,Basic,2027-01-15,20\nKH003,HĐ-003,Công ty Hướng Dương,Pro,2026-12-05,30\nKH004,HĐ-004,Công ty Đại Phát,Team,2027-02-28,12')}],
    usage: [{name:'su-dung-mau.csv',data:enc('customer_id,active_users,snapshot_date\nKH001,44,2026-11-01\nKH002,5,2026-11-01\nKH003,18,2026-11-01')}],
    support: [{name:'ticket-mau.csv',data:enc('customer_id,open_tickets,status\nKH001,0,Resolved\nKH002,1,Open\nKH003,0,Resolved')}],
    policies: [{name:'chinh-sach-mau.csv',data:enc('customer_id,price,discount\nKH001,12000000,10\nKH002,6000000,0\nKH003,12000000,5')}]
  };
  state.feedback = ''; state.clean = null; state.analysis = null; state.audit = []; pushAudit('demo', 'Đã nạp 4 hồ sơ mẫu, gồm ticket mở và dữ liệu nghiệp vụ thiếu'); state.clean = null; runClean();
};
document.querySelector('.main-nav a[href="#audit"]').onclick = e => { e.preventDefault(); if(state.processing || state.uploading) return; saveStepDraft(); setStep('audit'); };
document.querySelectorAll('a[href="#workflow"]').forEach(link => { link.onclick = e => { e.preventDefault(); if (['audit','dashboard','report'].includes(state.step)) navigateStep(state.lastWorkflowStep); }; });
stageEl.addEventListener('click', e => {
  const remove = e.target.closest('[data-remove-upload]');
  if (remove) {
    if (state.processing || state.uploading) return;
    const files = queuedFiles(); files.splice(Number(remove.dataset.removeUpload),1);
    state.datasets = files.length ? { auto:files } : {}; state.clean = null; state.analysis = null; state.detectedFiles = []; setStep(1);
    if (files.length) runClean(); return;
  }
  const button = e.target.closest('[data-table-page]');
  if (!button || button.disabled) return;
  const table = button.closest('.data-table-shell');
  const mode = table.dataset.mode;
  state.tablePage = Number(button.dataset.tablePage);
  table.outerHTML = mode === 'source' ? sourceTable(Number(table.dataset.index)) : dataTable(mode === 'clean' ? state.clean.rows : state.analysis.rows, mode);
});
document.querySelector('#steps').addEventListener('click',event=>{
  const button=event.target.closest('button[data-step]');
  if (button && !button.disabled) navigateStep(button.dataset.step);
});
render();

// Field selection is separate from source data: hiding never deletes an input column.
function cleanSelectionReady() {
  const c=state.clean;
  return !!c && !c.blocked && !!c.cleanedFiles?.some(file=>file.headers?.length) && !state.cleanEditBackup;
}
function cleanProtectedField(key) { return state.analysisMode!=='generic' && ['customer_id','contract_id','expiration_date'].includes(key); }
function selectedAnalysisFiles(){
  const excluded=new Set(state.excludedFields||[]);
  return (state.clean?.cleanedFiles||[]).map(file=>{
    const headers=file.headers.filter(header=>!excluded.has(header));
    return {...file,headers,rows:file.rows.map(row=>Object.fromEntries(headers.map(header=>[header,row[header]])))};
  }).filter(file=>file.headers.length);
}
function cleanFieldControls() {
  const headers=[...new Set((state.clean?.cleanedFiles || []).flatMap(f=>f.headers))];
  const ready=cleanSelectionReady();
  return `<section class="clean-field-controls" aria-label="Sửa dữ liệu và chọn trường phân tích">
    <div class="clean-edit-actions"><span>Sửa trực tiếp trong ô, sau đó lưu để kiểm tra lại.</span><button class="btn btn-light" id="saveCleanEdits" ${state.cleanEditBackup?'':'disabled'}>Lưu & kiểm tra lại</button><button class="btn btn-quiet" id="cancelCleanEdits" ${state.cleanEditBackup?'':'disabled'}>Hủy sửa</button></div>
    <p id="cleanEditStatus" role="status">${state.cleanEditBackup?'Có thay đổi chưa lưu. Hãy lưu và kiểm tra lại trước khi chọn trường hoặc phân tích.':ready?'Bỏ tích các cột không muốn dùng. Thay đổi có hiệu lực cho lần phân tích tiếp theo.':state.clean?.canAnalyze===false?'Bảng dữ liệu có thể tiếp tục tới phân tích mô tả. Đề xuất gia hạn cần hợp đồng hợp lệ.':'Cần hợp đồng có mã khách và ngày hết hạn hợp lệ trước khi phân tích gia hạn.'}</p>
    <details data-analysis-fields><summary>Cột dùng để phân tích · ${headers.length-(state.excludedFields || []).length}/${headers.length} cột được chọn</summary><p>Bỏ tích cột không muốn phân tích. Cột bị bỏ sẽ không gửi tới AI hoặc xuất trong báo cáo; dữ liệu gốc vẫn được giữ.</p><fieldset ${ready?'':'disabled'}><legend>Chọn cột phân tích</legend>${headers.map(h=>`<label><input type="checkbox" data-clean-field="${esc(h)}" ${(state.excludedFields || []).includes(h)?'':'checked'} ${cleanProtectedField(h)?'disabled':''}> ${esc(inputSchema.fields.find(f=>f.key===h)?.label || h)}${cleanProtectedField(h)?' · bắt buộc':''}</label>`).join('')}</fieldset></details></section>`;
}
function invalidateCleanAnalysis() {
  state.analysis=null;state.businessAnalysis=null; state.aiCleanReview=null; state.aiInsights=null; resetReview();
  if(typeof resetChartWorkspace==='function')resetChartWorkspace();
}
function editCleanCell(input) {
  if(state.processing)return;
  const file=state.clean?.cleanedFiles?.[Number(input.dataset.cleanFile)];
  const key=file?.headers[Number(input.dataset.cleanCol)], row=file?.rows[Number(input.dataset.cleanRow)];
  if(!row || !key || String(row[key] ?? '')===input.value)return;
  if(!state.cleanEditBackup)state.cleanEditBackup=JSON.parse(JSON.stringify(state.clean));
  row[key]=input.value;
  invalidateCleanAnalysis();
  const status=document.querySelector('#cleanEditStatus');
  status.textContent='Có thay đổi chưa lưu. Hãy lưu và kiểm tra lại trước khi chọn trường hoặc phân tích.';
  document.querySelector('#saveCleanEdits').disabled=false;
  document.querySelector('#cancelCleanEdits').disabled=false;
  document.querySelector('#approveClean').disabled=true;
  document.querySelector('.clean-field-controls fieldset').disabled=true;
  updateDashboard();
}
async function saveCleanEdits() {
  if(!state.cleanEditBackup || state.processing)return;
  const datasets={};
  try {
    state.processing=true; updateDashboard(); renderClean();
    for(const file of state.clean.cleanedFiles){
      const quote=v=>'"'+String(v ?? '').replace(/"/g,'""')+'"';
      const csv=[file.headers.map(quote).join(','),...file.rows.map(row=>file.headers.map(h=>quote(row[h])).join(','))].join('\r\n');
      (datasets[file.kind] ||= []).push({name:file.name.replace(/\.[^.]+$/,'')+'_da_sua.csv',data:await fileToBase64(new Blob([csv]))});
    }
    state.datasets=datasets;
    pushAudit('data_repair','Đã lưu chỉnh sửa trực tiếp trên bảng; kiểm tra lại toàn bộ đầu vào.');
    state.processing=false;
    await runClean();
  } catch(error) {
    state.processing=false; renderClean(); updateDashboard();
    document.querySelector('#cleanEditStatus').textContent='Chưa lưu được: '+error.message;
  }
}
stageEl.addEventListener('input',event=>{if(event.target.matches('[data-clean-row]'))editCleanCell(event.target);});
stageEl.addEventListener('change',event=>{
  const field=event.target.dataset?.cleanField;
  if(!field)return;
  if(state.processing || !cleanSelectionReady() || cleanProtectedField(field)){renderClean();return;}
  const excluded=new Set(state.excludedFields || []);
  if(event.target.checked)excluded.delete(field);else excluded.add(field);
  const headers=[...new Set((state.clean.cleanedFiles||[]).flatMap(file=>file.headers))];
  if(headers.every(header=>excluded.has(header))){event.target.checked=true;document.querySelector('#cleanEditStatus').textContent='Cần giữ ít nhất một cột để phân tích.';return;}
  state.excludedFields=[...excluded]; invalidateCleanAnalysis(); saveStepDraft();
  pushAudit('analysis_fields',`${event.target.checked?'Hiện và dùng':'Ẩn và loại khỏi phân tích'} trường ${field}`);
  renderClean();document.querySelector('[data-analysis-fields]').open=true;updateDashboard();
});
stageEl.addEventListener('click',event=>{
  if(event.target.closest('#saveCleanEdits'))saveCleanEdits();
  if(event.target.closest('#cancelCleanEdits') && !state.processing && state.cleanEditBackup){
    state.clean=state.cleanEditBackup; state.cleanEditBackup=null; renderClean(); updateDashboard();
  }
});

let inputNotificationTimer;
function showInputNotification(notice){
 clearTimeout(inputNotificationTimer);
 const host=document.querySelector('#inputNotification');if(!host)return;
 host.hidden=!notice;if(!notice)return;
 host.className='input-notification '+notice.level;
 host.innerHTML=`<div><strong>${esc(notice.title)}</strong><p>${esc(notice.message)}</p></div><button type="button" aria-label="Đóng thông báo">✕</button>`;
 const dismiss=()=>{clearTimeout(inputNotificationTimer);host.hidden=true;};
 host.querySelector('button').onclick=dismiss;
 inputNotificationTimer=setTimeout(dismiss,15000);
}

stageEl.addEventListener('input',event=>{
  const input=event.target;if(!input.matches('[data-blocked-cell]'))return;
  const patch={file:Number(input.dataset.file),row:Number(input.dataset.row),column:Number(input.dataset.column),value:input.value};
  state.blockedPatches ||= {};state.blockedPatches[[patch.file,patch.row,patch.column].join(':')]=patch;
  input.classList.add('cell-edited');stageEl.querySelector('#saveBlockedEdits').disabled=false;
});
stageEl.addEventListener('click',async event=>{
  const button=event.target.closest('#saveBlockedEdits');if(!button||button.disabled||state.processing||state.uploading)return;
  button.disabled=true;state.processing=true;const status=stageEl.querySelector('#blockedEditStatus');status.textContent='Đang lưu thay đổi…';
  try{
    const response=await fetch('/api/correct-input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:queuedFiles(),patches:Object.values(state.blockedPatches||{})})});
    const result=await response.json();if(!response.ok)throw new Error(result.message||'Không lưu được thay đổi.');
    state.datasets={auto:result.files};state.blockedPatches={};state.processing=false;await runClean();
  }catch(error){status.textContent=error.message;button.disabled=false;}
  finally{state.processing=false;}
});

function businessCalculationGuide(){
 const examples=[['Tổng / trung bình','Tổng Doanh thu theo Khu vực'],['Nhỏ nhất / lớn nhất','Doanh thu lớn nhất theo Kênh bán'],['Đếm dòng','Đếm dòng theo Cửa hàng'],['Cộng / trừ','Doanh thu - Tổng chi phí theo Cửa hàng'],['Nhân hai cột','Giá * Số lượng theo Khu vực'],['Chia hai cột','Doanh thu / Diện tích theo Cửa hàng'],['Trên mỗi m²','Lợi nhuận trên m² theo Cửa hàng'],['Phần trăm','Lợi nhuận / Doanh thu (%) theo Khu vực'],['Biên lợi nhuận','Biên lợi nhuận theo Cửa hàng']];
 return '<details class="calculation-guide"><summary>Các phép tính có thể yêu cầu · Xem ví dụ</summary><p>Dùng đúng tên cột trong dữ liệu của bạn. Mỗi dòng một yêu cầu; hệ thống xử lý tối đa 5 yêu cầu mỗi lượt. Dấu +, -, *, / cần cách hai bên.</p><div class="calculation-examples">'+examples.map(([label,example])=>'<article><b>'+esc(label)+'</b><code>'+esc(example)+'</code></article>').join('')+'</div><p>Tỷ lệ được tính bằng tổng tử số / tổng mẫu số trên cùng các dòng hợp lệ. Diện tích phải lớn hơn 0. Nếu diện tích lặp qua nhiều tháng, mẫu số là tổng diện tích của các kỳ được tính; cần đối chiếu phạm vi thời gian. Chưa tự ghép cột từ các file khác nhau.</p></details>';
}
