const inputGuideDialog=document.querySelector('#inputGuideDialog');
const templateUrl='/templates/mau_du_lieu_gia_han.xlsx';
function inputGuideTeaser(){
  return `<div class="input-guide-teaser"><div><strong>Yêu cầu file</strong><p>Chỉ cần bảng CSV hoặc XLSX có hàng tiêu đề và ít nhất một dòng dữ liệu. Agent phân tích theo các cột thực tế và mục tiêu bạn nhập. Mã khách, hợp đồng và ngày hết hạn chỉ bắt buộc khi bạn chọn phân tích gia hạn.</p></div><div><a class="btn btn-light" href="${templateUrl}" download>↓ Mẫu gia hạn XLSX</a><button type="button" class="btn btn-light" data-input-guide="rules">Quy tắc & các trường hợp</button></div></div>`;
}
function openInputGuide(){
  const levels={required:'Bắt buộc',conditional:'Theo điều kiện',analysis:'Cho phân tích',optional:'Tùy chọn'};
  document.querySelector('#inputGuideContent').innerHTML=`<div class="input-guide-cases"><article><b>Bảng dữ liệu bất kỳ</b><p>CSV/XLSX có tiêu đề và dòng dữ liệu: Agent giữ các cột hiện có, nhận diện số và nhóm để tổng hợp theo mục tiêu. Không cần đổi sang mẫu hợp đồng.</p></article><article><b>Thiếu cột cho mục tiêu</b><p>Agent phân tích phần còn tính được và nêu ngắn gọn giới hạn. Không tự tạo số liệu, không coi ô trống là 0.</p></article><article><b>Phân tích gia hạn</b><p>Nếu muốn tính gia hạn theo từng hợp đồng, cần mã khách và ngày hết hạn hợp lệ; thiếu khóa hoặc trùng hợp đồng sẽ chặn riêng luồng này.</p></article><article><b>Chọn cách phân tích</b><p>Bấm “Chạy phân tích với dữ liệu đã cung cấp” để dùng các cột trong tệp. Với hợp đồng đạt chuẩn, bạn vẫn có thể chọn luồng đề xuất gia hạn.</p></article></div>
  <div class="input-guide-instructions"><b>Mẫu dành riêng cho gia hạn</b><p>Tải mẫu nếu bạn cần đề xuất theo hợp đồng. Điền trang <strong>Du_lieu</strong> đầu tiên và thay các dòng ví dụ bằng dữ liệu của bạn. Với phân tích kinh doanh khác, hãy giữ tên cột và các dòng dữ liệu gốc; không cần dùng mẫu này.</p><p>CSV/XLSX, tối đa 20 MB/lần. Agent chỉ tính những chỉ số có cột và giá trị phù hợp trong tệp.</p></div>
  <details class="input-guide-process"><summary>Chỉ tiêu và trường cho phân tích gia hạn</summary><div class="table-wrap input-schema-table"><table class="data-table"><thead><tr><th>Trường</th><th>Mức yêu cầu</th><th>Định dạng / ví dụ</th><th>Nếu thiếu</th></tr></thead><tbody>${inputSchema.fields.map(f=>`<tr><td><strong>${esc(f.label)}</strong><code>${esc(f.key)}</code></td><td><span class="input-field-level ${f.level}">${levels[f.level]}</span></td><td>${esc(f.format)}<small>Ví dụ: ${esc(f.example)}</small></td><td>${esc(f.missing)}</td></tr>`).join('')}</tbody></table></div></details>
  <details class="input-guide-process"><summary>Agent làm sạch những gì?</summary><ol>${inputSchema.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p>Giữ lại tệp gốc và các dòng trùng để bạn đối chiếu. Trường tùy chọn sai được báo và đưa về trống trong bản làm sạch; không tự sửa thành một số hoặc ngày khác. Dữ liệu chỉ được đưa vào phân tích sau bước người dùng duyệt.</p></details>`;
  inputGuideDialog.showModal();
}
function inputQualityMarkup(quality){
  if(!quality)return '';
  const generic=quality.status==='generic';
  const title=generic?'Đã làm sạch bảng · Sẵn sàng phân tích dữ liệu':quality.status==='ready'?'Đạt điều kiện dữ liệu cho phân tích':'Được tiếp tục, còn thông tin cần bổ sung';
  const missing=(quality.fields || []).filter(f=>f.missing>0);
  return `<section class="input-quality-report ${quality.status}" aria-label="Kết quả kiểm tra đầu vào"><div class="input-quality-heading"><strong>${title}</strong><button class="btn btn-light" data-input-guide="rules">Xem quy tắc</button></div>${generic?'':`<div class="input-quality-counts"><span><b>${fmtNum(quality.contractCount)}</b> hợp đồng hợp lệ về khóa</span><span><b>${fmtNum(quality.readyCount)}</b> đủ dữ liệu sử dụng, ticket & giá</span><span><b>${fmtNum(quality.limitedCount)}</b> còn giới hạn phân tích</span></div>`}
  <p>${generic?'Duyệt bản làm sạch rồi chạy phân tích theo các cột hiện có. Đề xuất gia hạn chỉ có khi bổ sung hợp đồng hợp lệ.':'Mã khách và ngày hết hạn đã qua kiểm tra. Người dùng vẫn cần duyệt bản làm sạch trước khi Agent phân tích.'}</p>
  ${missing.length?`<details><summary>Trường đang thiếu và ảnh hưởng (${missing.length} trường)</summary><ul>${missing.map(f=>{const rule=inputSchema.fields.find(r=>r.key===f.key);return `<li><b>${esc(f.label)}: ${fmtNum(f.missing)} hợp đồng</b><span>${esc(rule?.missing || '')}</span></li>`;}).join('')}</ul></details>`:''}
  ${quality.normalization?.invalidOptional?`<p>${fmtNum(quality.normalization.invalidOptional)} ô tùy chọn sai định dạng đã được đưa về trống trong bản làm sạch. Tệp gốc được giữ để đối chiếu.</p>`:''}</section>`;
}
document.querySelector('#closeInputGuide').onclick=()=>inputGuideDialog.close();
document.querySelector('#stage').addEventListener('click',event=>{
  const button=event.target.closest('[data-input-guide]');if(button?.dataset.inputGuide)openInputGuide();
});
