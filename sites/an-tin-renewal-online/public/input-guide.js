const inputGuideDialog=document.querySelector('#inputGuideDialog');
const templateUrl='/templates/mau_du_lieu_gia_han.xlsx';
function inputGuideTeaser(){
  return `<div class="input-guide-teaser"><div><strong>Yêu cầu file</strong><p>Phân tích gia hạn cần mã khách và ngày hết hạn hợp lệ. Nếu thiếu dữ liệu sử dụng, ticket hoặc giá, bạn có thể bổ sung theo mẫu hoặc tiếp tục với các chỉ số hiện có. Agent sẽ nêu rõ phần chưa đủ căn cứ.</p></div><div><a class="btn btn-light" href="${templateUrl}" download>↓ Tải file mẫu XLSX</a><button type="button" class="btn btn-light" data-input-guide="rules">Quy tắc & các trường hợp</button></div></div>`;
}
function openInputGuide(){
  const levels={required:'Bắt buộc',conditional:'Theo điều kiện',analysis:'Cho phân tích',optional:'Tùy chọn'};
  document.querySelector('#inputGuideContent').innerHTML=`<div class="input-guide-cases"><article><b>Đủ dữ liệu</b><p>Khóa hợp lệ, có mức sử dụng, ticket và giá: làm sạch rồi chuyển người duyệt.</p></article><article><b>Thiếu dữ liệu phân tích</b><p>Chọn tải mẫu để bổ sung hoặc tiếp tục với dữ liệu hiện có. Ô thiếu giữ trống; tỷ lệ sử dụng và giá trị gia hạn chỉ tính khi có căn cứ. Ticket chưa rõ không được coi là không có sự cố.</p></article><article><b>Cần sửa khóa nền tảng</b><p>Thiếu hoặc sai mã khách, ngày hết hạn, hoặc trùng khóa hợp đồng sẽ chặn phân tích gia hạn. Hãy sửa trong file gốc rồi tải lại; Agent không tự tạo các khóa này.</p></article><article><b>Tệp dữ liệu khác</b><p>Vẫn làm sạch bảng và có thể yêu cầu AI phân tích theo lĩnh vực/mục tiêu bạn mô tả. Muốn tính đề xuất gia hạn, cần bổ sung hợp đồng hợp lệ.</p></article></div>
  <div class="input-guide-instructions"><b>Cách dùng mẫu</b><p>Tải mẫu, điền trang <strong>Du_lieu</strong> đầu tiên và thay các dòng ví dụ bằng dữ liệu của bạn. Giữ hàng 1 là tên cột; mỗi dòng là một hợp đồng, không gộp ô. Trang <strong>Huong_dan</strong> giải thích các trường. Mã nên nhập kiểu văn bản để giữ số 0 ở đầu.</p><p>CSV/XLSX, tối đa 20 MB/lần. Dùng số đơn giản như 12000000; chiết khấu 10 nghĩa là 10%. Có thể giữ hoặc bỏ các cột tùy chọn chưa có dữ liệu.</p></div>
  <div class="table-wrap input-schema-table"><table class="data-table"><thead><tr><th>Trường</th><th>Mức yêu cầu</th><th>Định dạng / ví dụ</th><th>Nếu thiếu</th></tr></thead><tbody>${inputSchema.fields.map(f=>`<tr><td><strong>${esc(f.label)}</strong><code>${esc(f.key)}</code></td><td><span class="input-field-level ${f.level}">${levels[f.level]}</span></td><td>${esc(f.format)}<small>Ví dụ: ${esc(f.example)}</small></td><td>${esc(f.missing)}</td></tr>`).join('')}</tbody></table></div>
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
