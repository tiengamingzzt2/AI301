// Browser-side OOXML writer. Strings stay strings, including values beginning with '='.
function reportExcelXml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function reportExcelColumn(index) {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function reportExcelSheet(rows, options = {}) {
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    if (value === null || value === undefined || value === '') return '';
    const ref = reportExcelColumn(columnIndex) + (rowIndex + 1);
    const style = rowIndex === options.headerRow ? ' s="1"' : options.titleRows?.includes(rowIndex) ? ' s="2"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style}><is><t>${reportExcelXml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const lastColumn = reportExcelColumn(rows.reduce((max, row) => Math.max(max, row.length - 1), 0));
  const filter = options.headerRow == null || rows.length <= options.headerRow + 1 ? '' : `<autoFilter ref="A${options.headerRow + 1}:${lastColumn}${rows.length}"/>`;
  const freeze = options.headerRow == null ? '' : `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${options.headerRow + 1}" topLeftCell="A${options.headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="32" customWidth="1"/><col min="3" max="20" width="23" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData>${filter}</worksheet>`;
}

function reportExcelSheets(model) {
  const { rows, counts, priced, adoption, totalValue, approved, deadlines, planRows, missing, ticketRows, priorityRows, proposals, scope, today, leadDays, adoptionThreshold, charts, extraCharts } = model;
  const nearExpiry = deadlines[0].count + deadlines[1].count;
  const adoptionAverage = adoption.length ? adoption.reduce((sum, n) => sum + n, 0) / adoption.length : null;
  const aiNarrative = state.aiInsights?.[scope];
  const summary = [
    ['BÁO CÁO TỔNG QUAN GIA HẠN · AN TÍN'],
    ['Ngày lập', today.toLocaleString('vi-VN')],
    ['Phạm vi', scope === 'approved' ? 'Hồ sơ đã duyệt' : 'Toàn bộ kết quả phân tích'],
    [], ['CHỈ SỐ CHÍNH', 'Giá trị'],
    ['Hợp đồng phân tích', rows.length],
    ['Hồ sơ đã duyệt trong phạm vi', approved],
    ['Giá trị gia hạn có căn cứ (VND)', priced.length ? totalValue : null],
    ['Hồ sơ có giá', priced.length],
    ['Quá hạn hoặc hết hạn trong 30 ngày', nearExpiry],
    ['Hồ sơ có ticket mở', ticketRows.length],
    ['Tỷ lệ sử dụng trung bình (%)', adoptionAverage],
    [], ['CHẤT LƯỢNG DỮ LIỆU', 'Có dữ liệu', 'Thiếu'],
    ['Giá trị gia hạn', priced.length, missing.price],
    ['Mức sử dụng', adoption.length, missing.adoption],
    ['Tình trạng ticket', rows.length - missing.tickets, missing.tickets],
    [], ['NHÓM ĐỀ XUẤT', 'Hợp đồng'],
    ...Object.entries(counts).map(([key, count]) => [reviewGroups[key]?.label || key, count]),
    [], ['THEO THỜI ĐIỂM HẾT HẠN', 'Hợp đồng', 'Giá trị có căn cứ (VND)', 'Hồ sơ có giá'],
    ...deadlines.map(item => [item.label, item.count, item.priced ? item.value : null, item.priced]),
    [], ['THEO GÓI HIỆN TẠI', 'Hợp đồng', 'Giá trị có căn cứ (VND)', 'Hồ sơ có giá'],
    ...planRows.map(item => [item.label, item.count, item.priced ? item.value : null, item.priced]),
    [], ['KIẾN NGHỊ'],
    ...(proposals.length ? proposals.map(item => [item]) : [['Chưa có hồ sơ để đề xuất.']]),
    ...(aiNarrative ? [[], ['NHẬN XÉT BỔ SUNG TỪ GEMINI'], [aiNarrative.summary], ...aiNarrative.items.map(item => [item]), ['Lưu ý', 'Nội dung do AI tạo, cần người duyệt xác nhận với dữ liệu nguồn.']] : []),
    [], ['QUY TẮC PHÂN TÍCH', 'Giá trị'],
    ['Liên hệ trước hạn (ngày)', leadDays],
    ['Ngưỡng xem xét nâng gói (%)', adoptionThreshold],
    ['Lưu ý', 'Giá trị có căn cứ chưa phải doanh thu dự báo hoặc số tiền đã ký. Dữ liệu thiếu được để trống, không tự điền bằng 0.']
  ];
  const detailHeader = ['Mã khách', 'Mã hợp đồng', 'Khách hàng', 'Gói hiện tại', 'Ngày hết hạn', 'Ngày liên hệ', 'Mức sử dụng (%)', 'Ticket mở', 'Nhóm đề xuất', 'Giá trị gia hạn (VND)', 'Hành động đề xuất', 'Căn cứ', 'Trạng thái duyệt'];
  const record = row => [row.customer_id, row.contract_id, row.customer_name, row.plan, row.expiration_date, row.outreach_date, chartNumber(row.adoption_rate), chartNumber(row.open_tickets), reviewGroups[reviewGroup(row)]?.label || row.recommendation, Number.isFinite(row.renewal_value) ? row.renewal_value : null, reportAction(row), row.reason, reviewState.approved.has(reviewKey(row)) ? 'Đã duyệt' : 'Chờ duyệt'];
  const records = [detailHeader, ...rows.map(record)];
  const priorities = [detailHeader, ...priorityRows.map(record)];
  const chartRows = [['Biểu đồ', 'Loại', 'Nhóm', 'Giá trị', 'Đơn vị / phép tính', 'Ghi chú']];
  for (const config of [...charts, ...extraCharts]) {
    const result = aggregateChart(config);
    if (result.error || !result.series.length) {
      chartRows.push([result.title || config.title, config.type, '', '', '', result.error || 'Chưa có dữ liệu phù hợp']);
      continue;
    }
    for (const item of result.series) chartRows.push([result.title, config.type, item.label, item.value, result.valueLabel, result.note]);
  }
  return [
    { name: 'Tong quan', rows: summary, options: { titleRows: [0] } },
    { name: 'Bieu do', rows: chartRows, options: { headerRow: 0 } },
    { name: 'Uu tien', rows: priorities, options: { headerRow: 0 } },
    { name: 'Ho so', rows: records, options: { headerRow: 0 } }
  ];
}

function reportExcelCrc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function reportExcelZip(files) {
  const encoder = new TextEncoder();
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name), data = encoder.encode(content), crc = reportExcelCrc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length), lh = new DataView(localHeader.buffer);
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameBytes.length, true); localHeader.set(nameBytes, 30);
    local.push(localHeader, data);
    const centralHeader = new Uint8Array(46 + nameBytes.length), ch = new DataView(centralHeader.buffer);
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameBytes.length, true); ch.setUint32(42, offset, true); centralHeader.set(nameBytes, 46);
    central.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}

function buildReportXlsx(model) {
  const sheets = model.generic ? genericReportExcelSheets(model) : reportExcelSheets(model);
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${reportExcelXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF204C37"/><sz val="14"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2C6247"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const files = [['[Content_Types].xml', types], ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', workbookRels], ['xl/styles.xml', styles], ...sheets.map((sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, reportExcelSheet(sheet.rows, sheet.options)])];
  return reportExcelZip(files);
}
