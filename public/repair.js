const repairDialog = document.querySelector('#repairDialog');
const repairContent = document.querySelector('#repairContent');
let repairRequestId = 0;
const repairLabels = {
  customer_id: 'Mã khách hàng', contract_id: 'Mã hợp đồng', customer_name: 'Tên khách hàng',
  expiration_date: 'Ngày hết hạn', plan: 'Gói dịch vụ', licensed_users: 'Tài khoản được cấp',
  active_users: 'Người dùng hoạt động', snapshot_date: 'Ngày đối chiếu', open_tickets: 'Ticket đang mở',
  status: 'Trạng thái', price: 'Giá', discount: 'Chiết khấu'
};

function repairMessage(message) {
  document.querySelector('#repairMessage').innerHTML = `<div class="alert error" role="alert">${esc(message)}</div>`;
}

async function openRepair(mode) {
  if(state.processing || state.uploading)return;
  if(mode==='manual' && state.clean && !state.clean.blocked && state.clean.cleanedFiles?.length){
    const generic=state.analysisMode==='generic';
    const files=state.clean.cleanedFiles.map(file=>({name:file.name,kind:generic?'generic':file.kind,headers:[...file.headers],rows:file.rows.map(row=>({...row})),mapping:generic?{}:Object.fromEntries(Object.keys(repairLabels).map(field=>[field,file.headers.includes(field)?field:'']))}));
    state.repair={files,fields:generic?[]:Object.keys(repairLabels),report:{renamed:0,dates:0,exactDuplicates:0},mode:'manual',fileIndex:Math.max(0,state.cleanFileIndex),page:0,query:'',searchField:'',dropExact:false,edits:0,busy:false};
    document.querySelector('#repairTitle').textContent='Sửa dữ liệu';
    renderRepair();repairDialog.showModal();
    return;
  }
  if(state.clean?.blocked && state.clean.remediation?.action==='reload'){setStep(1);return;}
  const requestId = ++repairRequestId;
  repairContent.innerHTML = '<p class="repair-loading" role="status">Đang đọc dữ liệu để chuẩn bị bản sửa…</p>';
  document.querySelector('#repairTitle').textContent = mode === 'auto' ? 'Agent chuẩn hóa định dạng' : 'Tự sửa dữ liệu';
  repairDialog.showModal();
  try {
    const res = await fetch('/api/repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, datasets: state.datasets,analysisMode:state.analysisMode }) });
    const result = await res.json();
    if (requestId !== repairRequestId || !repairDialog.open) return;
    if (!res.ok) throw new Error(result.message || 'Không đọc được tệp.');
    state.repair = { ...result, fileIndex: 0, page: 0,query:'',searchField:'', dropExact: false, edits: 0, busy: false };
    if (repairDialog.open) renderRepair();
  } catch (error) {
    if (requestId !== repairRequestId || !repairDialog.open) return;
    repairContent.innerHTML = `<div class="alert error">${esc(error.message)}<br>Nếu tệp không đọc được, hãy đóng cửa sổ và chọn lại tệp CSV/XLSX.</div>`;
  }
}

function repairFile() { return state.repair.files[state.repair.fileIndex]; }
function repairFilteredRows(file){
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  const query=normalize(state.repair.query).trim(),fields=state.repair.searchField?[state.repair.searchField]:file.headers;
  return file.rows.map((row,index)=>({row,index})).filter(item=>!query||fields.some(field=>normalize(item.row[field]).includes(query)));
}

function repairTable(file) {
  const filtered=repairFilteredRows(file);
  state.repair.page=Math.max(0,Math.min(state.repair.page,Math.max(0,Math.ceil(filtered.length/20)-1)));
  const start = state.repair.page * 20;
  return `<div class="table-wrap repair-table"><table class="data-table"><thead><tr><th scope="col">Dòng gốc</th>${file.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${filtered.slice(start, start + 20).map(({row,index}) => `<tr><th scope="row">${index + 2}</th>${file.headers.map((h, col) => {
    const missing = (file.mapping.customer_id === h || file.mapping.expiration_date === h) && !String(row[h] ?? '').trim();
    return `<td><input class="repair-cell ${missing ? 'missing-cell' : ''}" data-cell-row="${index}" data-cell-col="${col}" value="${esc(row[h] ?? '')}" aria-label="Dòng ${index + 2}, ${esc(h)}" ${missing ? 'aria-invalid="true"' : ''}></td>`;
  }).join('')}</tr>`).join('')||`<tr><td colspan="${file.headers.length+1}">Không tìm thấy dữ liệu phù hợp. Thử từ khóa khác hoặc xóa tìm kiếm.</td></tr>`}</tbody></table></div>
  <div class="table-pagination"><span>${filtered.length?fmtNum(start+1):0}–${fmtNum(Math.min(start+20,filtered.length))} / ${fmtNum(filtered.length)} dòng phù hợp · Tổng ${fmtNum(file.rows.length)} dòng</span><div class="pagination-actions"><button class="btn btn-light" data-repair-page="${state.repair.page - 1}" ${start === 0 ? 'disabled' : ''} aria-label="Trang dữ liệu trước">←</button><button class="btn btn-light" data-repair-page="${state.repair.page + 1}" ${start + 20 >= filtered.length ? 'disabled' : ''} aria-label="Trang dữ liệu sau">→</button></div></div>`;
}

function renderRepair() {
  const r = state.repair, file = repairFile();
  const fields = r.fields;
  repairContent.innerHTML = `<div id="repairMessage"></div>
    <div class="alert ${r.mode === 'auto' ? 'success' : 'warning'}">${r.mode === 'auto'
      ? `<b>Bản chuẩn hóa để xem trước:</b> ${fmtNum(r.report.renamed)} tên cột và ${fmtNum(r.report.dates)} ô ngày đã được chuẩn hóa. Các cột chưa nhận diện được vẫn được giữ lại.`
      : '<b>Tìm và sửa dữ liệu trực tiếp trong bảng.</b> Thay đổi được giữ trong bản nháp đến khi bạn áp dụng.'}
      <div>Chỉ nhập giá trị đã đối chiếu. Dữ liệu sẽ được kiểm tra lại sau khi áp dụng.</div></div>
    <div class="repair-toolbar"><label>Tệp đang sửa<select id="repairFileSelect">${r.files.map((f, i) => `<option value="${i}" ${i === r.fileIndex ? 'selected' : ''}>${esc(categories.find(c => c.id === f.kind)?.title || f.kind)} · ${esc(f.name)} (${fmtNum(f.rows.length)} dòng)</option>`).join('')}</select></label><span class="repair-draft-tag">Bản nháp · Chưa áp dụng</span></div>
    ${fields.length?`<details class="repair-mapping"><summary>Ghép cột nguồn với trường dữ liệu</summary><div class="mapping-grid">${fields.map(field => {
      const required = file.kind === 'contracts' && ['customer_id', 'expiration_date'].includes(field);
      return `<label>${esc(repairLabels[field] || field)} ${required ? '<span class="mapping-required">*</span>' : ''}<select data-mapping="${field}" class="${required && !file.mapping[field] ? 'missing-cell' : ''}"><option value="">Chưa có / không ghép</option>${file.headers.map(h => `<option value="${esc(h)}" ${file.mapping[field] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}<option value="__add_column__">＋ Tạo cột trống để nhập</option></select><small>${field}</small></label>`;
    }).join('')}</div></details>`:''}
    <div class="repair-search"><label>Tìm dữ liệu cần sửa<input type="search" id="repairSearch" placeholder="Nhập mã, tên hoặc giá trị cần tìm…" value="${esc(r.query||'')}" autocomplete="off"></label><label>Tìm trong cột<select id="repairSearchField"><option value="">Tất cả các cột</option>${file.headers.map(h=>`<option value="${esc(h)}" ${r.searchField===h?'selected':''}>${esc(h)}</option>`).join('')}</select></label><button type="button" id="clearRepairSearch" class="btn btn-light">Xóa tìm kiếm</button></div><div class="repair-table-title"><b>Dữ liệu có thể chỉnh sửa</b><label>Đi tới dòng <input type="number" id="repairJump" min="2" max="${file.rows.length + 1}" value="${r.page * 20 + 2}" aria-label="Đi tới dòng dữ liệu"></label></div>
    <div id="repairTableHost">${repairTable(file)}</div>
    <label class="dedup-option"><input type="checkbox" id="repairDedup" ${r.dropExact ? 'checked' : ''}> Loại bản ghi hợp đồng trùng hoàn toàn khi áp dụng. Bản ghi cùng mã nhưng khác nội dung vẫn được giữ để kiểm tra.</label>
    ${r.report.exactDuplicates ? `<p class="microcopy">Phát hiện ban đầu: ${fmtNum(r.report.exactDuplicates)} bản ghi hợp đồng trùng hoàn toàn. Chưa xóa bản ghi nào.</p>` : ''}
    <div class="repair-footer"><button class="btn btn-light" id="downloadRepair">Tải CSV bản đang sửa</button><div class="result-actions"><button class="btn btn-quiet" id="cancelRepair">Hủy bản sửa</button><button class="btn btn-primary" id="applyRepair">Áp dụng bản sửa & kiểm tra lại →</button></div></div>
    <p class="repair-footnote">Tệp gốc trên máy được giữ nguyên. Bản sửa được chuyển thành CSV và kiểm tra lại trước khi chuyển bước.</p>`;
}

function projectRepairFile(file) {
  const pairs = Object.entries(file.mapping).filter(([, h]) => h);
  const sources = pairs.map(([, h]) => h);
  if (new Set(sources).size !== sources.length) throw new Error(`${file.name}: một cột nguồn đang được ghép vào nhiều trường. Hãy chọn lại các cột.`);
  if (file.kind === 'contracts' && (!file.mapping.customer_id || !file.mapping.expiration_date)) throw new Error(`${file.name}: hãy ghép cột Mã khách hàng và Ngày hết hạn, hoặc tạo cột trống để nhập bổ sung.`);
  for (const h of file.headers) {
    if (sources.includes(h)) continue;
    let target = h; while (pairs.some(([f]) => f === target)) target += '_original';
    pairs.push([target, h]);
  }
  let rows = file.rows.map(row => Object.fromEntries(pairs.map(([field, h]) => [field, String(row[h] ?? '').trim()])));
  let removed = 0;
  if (state.repair.dropExact && file.kind === 'contracts') {
    const seen = new Set();
    rows = rows.filter(row => { const signature = JSON.stringify(Object.values(row)); if (seen.has(signature)) { removed++; return false; } seen.add(signature); return true; });
  }
  const headers = pairs.map(([field]) => field);
  const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(quote).join(','), ...rows.map(row => headers.map(h => quote(row[h])).join(','))].join('\r\n');
  return { csv, removed, name: file.name.replace(/(?:_da_sua)?\.[^.]+$/, '') + '_da_sua.csv' };
}

async function applyRepair() {
  if (state.repair.busy) return;
  const button = document.querySelector('#applyRepair');
  const controls = [...repairContent.querySelectorAll('button,input,select')].map(control => [control, control.disabled]);
  state.repair.busy = true; button.disabled = true; button.textContent = 'Đang chuẩn bị bản sửa…';
  repairContent.querySelectorAll('button,input,select').forEach(control => { control.disabled = true; });
  try {
    const datasets = {}; let removed = 0;
    const projectedFiles = state.repair.files.map(file => ({ ...projectRepairFile(file), kind: file.kind === 'generic' && file.mapping.expiration_date ? 'contracts' : file.kind }));
    for (const projected of projectedFiles) {
      removed += projected.removed;
      const data = await fileToBase64(new Blob([projected.csv], { type: 'text/csv;charset=utf-8' }));
      (datasets[projected.kind] ||= []).push({ name: projected.name, data });
    }
    state.datasets = datasets;
    pushAudit('data_repair', `${state.repair.mode === 'auto' ? 'Agent chuẩn hóa' : 'Người dùng chỉnh sửa'}: ${state.repair.files.length} tệp; ${state.repair.edits} chỉnh sửa; loại ${removed} bản ghi trùng hoàn toàn theo lựa chọn. Bắt đầu kiểm tra lại.`);
    repairDialog.close();
    await runClean();
  } catch (error) { repairMessage(error.message); }
  finally { state.repair.busy = false; controls.forEach(([control, disabled]) => { control.disabled = disabled; }); button.textContent = 'Áp dụng bản sửa & kiểm tra lại →'; }
}

document.querySelector('#closeRepair').onclick = () => { if (!state.repair?.busy) repairDialog.close(); };
repairDialog.addEventListener('cancel', e => { if (state.repair?.busy) e.preventDefault(); });
repairDialog.addEventListener('close', () => { repairRequestId++; });
stageEl.addEventListener('click', e => { const button = e.target.closest('[data-repair-mode]'); if (button) openRepair(button.dataset.repairMode); });
repairContent.addEventListener('input', e => {
  if(e.target.id==='repairSearch'){
    state.repair.query=e.target.value;state.repair.page=0;
    document.querySelector('#repairTableHost').innerHTML=repairTable(repairFile());
    return;
  }
  if (e.target.matches('[data-cell-row]')) {
    const file = repairFile(); file.rows[Number(e.target.dataset.cellRow)][file.headers[Number(e.target.dataset.cellCol)]] = e.target.value;
    state.repair.edits++;
    e.target.classList.remove('missing-cell'); e.target.removeAttribute('aria-invalid');
  }
});
repairContent.addEventListener('change', e => {
  const r = state.repair;
  if(e.target.id==='repairSearchField'){r.searchField=e.target.value;r.page=0;document.querySelector('#repairTableHost').innerHTML=repairTable(repairFile());}
  else if (e.target.id === 'repairFileSelect') { r.fileIndex = Number(e.target.value); r.page = 0; r.query='';r.searchField='';renderRepair(); }
  else if (e.target.matches('[data-mapping]')) {
    const file = repairFile(), field = e.target.dataset.mapping;
    if (e.target.value === '__add_column__') {
      if (!file.headers.includes(field)) file.headers.push(field);
      file.mapping[field] = field;
    } else file.mapping[field] = e.target.value;
    r.edits++; renderRepair();
  } else if (e.target.id === 'repairDedup') r.dropExact = e.target.checked;
  else if (e.target.id === 'repairJump') {
    r.query='';r.searchField='';
    const line = Math.max(2, Math.min(repairFile().rows.length + 1, Number(e.target.value) || 2));
    r.page = Math.floor((line - 2) / 20); renderRepair();
  }
});
repairContent.addEventListener('click', e => {
  if(e.target.closest('#clearRepairSearch')){
    state.repair.query='';state.repair.searchField='';state.repair.page=0;
    document.querySelector('#repairSearch').value='';document.querySelector('#repairSearchField').value='';
    document.querySelector('#repairTableHost').innerHTML=repairTable(repairFile());
    document.querySelector('#repairSearch').focus();return;
  }
  const page = e.target.closest('[data-repair-page]');
  if (page && !page.disabled) { state.repair.page = Number(page.dataset.repairPage); renderRepair(); }
  else if (e.target.closest('#cancelRepair')) repairDialog.close();
  else if (e.target.closest('#applyRepair')) applyRepair();
  else if (e.target.closest('#downloadRepair')) {
    try { const projected = projectRepairFile(repairFile()); download('\uFEFF' + projected.csv, projected.name, 'text/csv;charset=utf-8'); }
    catch (error) { repairMessage(error.message); }
  }
});
