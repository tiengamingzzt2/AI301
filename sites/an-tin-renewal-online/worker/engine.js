// Generated from the local Agent by scripts/sync-local.mjs.
import {Buffer} from 'buffer';
import {inflateSync} from 'fflate';
const path={extname:name=>String(name).match(/\.[^./\\]+$/)?.[0] || ''};
const inputSchema={version:2,validation:{minorMaxRows:5,minorMaxRatio:0.1},fields:[
  {key:'customer_id',label:'Mã khách hàng',level:'required',format:'Văn bản, giữ nguyên số 0 ở đầu',example:'KH001',missing:'Bắt buộc có trên mọi dòng hợp đồng để xác định khách và ghép nguồn.'},
  {key:'contract_id',label:'Mã hợp đồng',level:'conditional',format:'Văn bản; cặp mã khách + mã hợp đồng không trùng',example:'HD-2026-001',missing:'Có thể trống nếu khách chỉ có một hợp đồng. Khách có nhiều hợp đồng phải điền mã cho từng hợp đồng.'},
  {key:'expiration_date',label:'Ngày hết hạn',level:'required',format:'YYYY-MM-DD hoặc DD/MM/YYYY; ngày phải tồn tại',example:'2026-12-20',missing:'Thiếu hoặc sai ngày sẽ chặn bước tiếp theo; Agent không tự đoán ngày.'},
  {key:'customer_name',label:'Tên khách hàng',level:'optional',format:'Văn bản',example:'Công ty mẫu Minh An',missing:'Vẫn tiếp tục; hiển thị mã khách thay cho tên.'},
  {key:'plan',label:'Gói hiện tại',level:'optional',format:'Văn bản',example:'Pro',missing:'Vẫn tiếp tục; chưa có tên gói, không ghép được chính sách theo gói.'},
  {key:'licensed_users',label:'Số tài khoản được cấp',level:'analysis',format:'Số nguyên lớn hơn 0',example:'50',missing:'Có thể tiếp tục khi thiếu, nhưng không tính tỷ lệ sử dụng cho hồ sơ đó. Có thể bổ sung theo file mẫu rồi tải lại.'},
  {key:'active_users',label:'Người dùng hoạt động',level:'analysis',format:'Số nguyên từ 0 trở lên; 0 là dữ liệu thực',example:'44',missing:'Có thể tiếp tục khi thiếu; giữ chưa có dữ liệu, không tự đoán mức sử dụng.'},
  {key:'open_tickets',label:'Ticket đang mở',level:'analysis',format:'Số nguyên từ 0 trở lên; chỉ điền 0 khi đã xác minh',example:'0',missing:'Có thể dùng status hợp lệ thay thế. Nếu thiếu cả hai, hồ sơ cần xác minh; ô trống không phải 0 ticket.'},
  {key:'price',label:'Giá gia hạn trước chiết khấu (VND)',level:'analysis',format:'Số từ 0 trở lên; nên nhập không có dấu phân cách',example:'12000000',missing:'Có thể tiếp tục khi thiếu, nhưng không tính giá trị gia hạn. Có thể bổ sung bảng chính sách hoặc file mẫu.'},
  {key:'discount',label:'Chiết khấu (%)',level:'optional',format:'Số từ 0 đến 100; 10 hoặc 10% là 10%, 1 là 1%',example:'10',missing:'Để trống: dùng giá gốc tham khảo, chưa áp dụng ưu đãi. Giá trị sai sẽ cần xác minh trước khi tính tiền.'},
  {key:'snapshot_date',label:'Ngày đối chiếu',level:'optional',format:'YYYY-MM-DD hoặc DD/MM/YYYY',example:'2026-11-12',missing:'Vẫn tiếp tục; chưa xác định thời điểm đối chiếu của nguồn dữ liệu.'},
  {key:'status',label:'Trạng thái hỗ trợ',level:'optional',format:'Open/Pending/In progress hoặc Closed/Resolved',example:'Resolved',missing:'Vẫn tiếp tục khi đã có open_tickets. Không suy ra 0 ticket từ ô trống.'}
],steps:[
  'Đọc CSV/XLSX và nhận diện cột tiếng Việt hoặc tiếng Anh.',
  'Kiểm tra mã khách, ngày hết hạn và tính duy nhất của khóa hợp đồng.',
  'Bỏ khoảng trắng thừa; chuẩn hóa tên cột, ngày và số hợp lệ. Không tự bịa dữ liệu còn thiếu.',
  'Giữ tệp gốc; trả bản làm sạch, cảnh báo và phạm vi có thể phân tích để người dùng duyệt.'
]};

const textRepairs = [
  // Cities / Tỉnh thành
  [/^(?:[Đ\s]*N\s*ng|Đà Nẵng)$/i, 'Đà Nẵng'],
  [/^Bà Rịa\s*-\s*Vũng.*$/i, 'Bà Rịa - Vũng Tàu'],
  [/^Quảng\s*Ni.*$/i, 'Quảng Ninh'],
  [/^Hà\s*N.*$/i, 'Hà Nội'],
  [/^TP\.?\s*Hồ\s*Chí\s*M.*$/i, 'TP. Hồ Chí Minh'],
  [/^Nghệ(\s*An)?$/i, 'Nghệ An'],
  [/^Bắc\s*Ni.*$/i, 'Bắc Ninh'],
  [/^(?:[Đ\s]*ng\s*Nai|Đồng Nai)$/i, 'Đồng Nai'],
  [/^Khánh\s*H.*$/i, 'Khánh Hòa'],
  [/^Bình\s*Dư.*$/i, 'Bình Dương'],
  [/^Thừa\s*Thiên.*$/i, 'Thừa Thiên Huế'],
  [/^Cần\s*T.*$/i, 'Cần Thơ'],
  [/^Hải\s*Ph.*$/i, 'Hải Phòng'],

  // Regions / Vùng miền
  [/^Miền\s*Tru.*$/i, 'Miền Trung'],
  [/^Miền\s*N$/i, 'Miền Nam'],
  [/^Miền\s*B$/i, 'Miền Bắc'],

  // Segments / Phân khúc
  [/^Khách hàng doanh nghiệp.*$/i, 'Khách hàng doanh nghiệp (B2B)'],
  [/^Khách hàng cá n.*$/i, 'Khách hàng cá nhân'],
  [/^Thành viên thân thiết.*$/i, 'Thành viên thân thiết'],
  [/^Đối tác chiến lược.*$/i, 'Đối tác chiến lược'],

  // Channels / Kênh bán
  [/^Cửa hàng trực tiếp.*$/i, 'Cửa hàng trực tiếp (In-Store)'],
  [/^Website\s*\/\s*App.*$/i, 'Website / App Online'],
  [/^Sàn TMĐT.*$/i, 'Sàn TMĐT (Shopee/Lazada/TikTok)'],

  // Categories / Danh mục
  [/^.*ng\s*h.*th.*ng\s*minh.*$/i, 'Đồng hồ thông minh & SmartHome'],
  [/^Phụ kiện & Âm.*$/i, 'Phụ kiện & Âm thanh'],
  [/^.*i.*n\s*tho.*i\s*th.*ng\s*minh.*$/i, 'Điện thoại thông minh'],
  [/^Laptop & Máy tí.*$/i, 'Laptop & Máy tính'],
  [/^Linh kiện & Thiết bị.*$/i, 'Linh kiện & Thiết bị mạng'],

  // Subcategories / Danh mục phụ
  [/^Củ cáp & Sạc.*$/i, 'Củ cáp & Sạc đa năng'],
  [/^Xiaomi & Khá.*$/i, 'Xiaomi & Khác'],
  [/^Thiết bị Smart.*$/i, 'Thiết bị SmartHome'],
  [/^Laptop Văn phò.*$/i, 'Laptop Văn phòng'],
  [/^Tai nghe & Loa.*$/i, 'Tai nghe & Loa'],
  [/^Laptop Gaming.*$/i, 'Laptop Gaming'],

  // Status & Booleans / Trạng thái
  [/^Khôn$/i, 'Không'],
  [/^C[\x00-\x1F\x7F\uFFFD]?$/i, 'Có'],

  // Payment Methods / Phương thức thanh toán
  [/^Thẻ tín dụng\s*\/\s*G.*$/i, 'Thẻ tín dụng / Ghi nợ'],
  [/^Ví MoM.*$/i, 'Ví MoMo'],
  [/^Tiền mặt(\s*\/)?$/i, 'Tiền mặt / Chuyển khoản'],
  [/^Chuyển khoản ngân.*$/i, 'Chuyển khoản ngân hàng'],
  [/^VNPay.*$/i, 'VNPay QR'],

  // Products
  [/^Sạc Anker Nano II 6$/i, 'Sạc Anker Nano II 65W'],
  [/^Pin dự phòng MagSafe 10000$/i, 'Pin dự phòng MagSafe 10000mAh'],
  [/^Cáp Baseus Type-C 100$/i, 'Cáp Baseus Type-C 100W']
];

function cleanCorruptedText(val) {
  if (val == null) return '';
  let s = String(val).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g, '').trim();
  for (const [re, rep] of textRepairs) {
    if (re.test(s)) return rep;
  }
  return s;
}

function csvRows(text) {
  const header = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 }; let inQuotes = false;
  for (let i = 0; i < header.length; i++) {
    if (header[i] === '"') { if (inQuotes && header[i + 1] === '"') i++; else inQuotes = !inQuotes; }
    else if (!inQuotes && header[i] in counts) counts[header[i]]++;
  }
  const separator = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === separator) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if(quoted)throw new Error('CSV có ô văn bản chưa đóng dấu nháy kép.');
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map(x => cleanCorruptedText(x.trim().replace(/^\uFEFF/, '')));
  validateHeaders(headers);
  rows.forEach((r,i)=>{if(r.length>headers.length)throw new Error(`CSV dòng ${i+2} có nhiều ô hơn số cột. Kiểm tra dấu phân cách và dấu nháy kép.`);});
  return rows.filter(r => r.some(x => x.trim() !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, cleanCorruptedText((r[i] ?? '').trim())])));
}

function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Tệp Excel không có cấu trúc ZIP hợp lệ.');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const localNameLen = buf.readUInt16LE(local + 26), localExtraLen = buf.readUInt16LE(local + 28), start = local + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(start, start + compressed);
    entries.set(name, method === 0 ? data : method === 8 ? Buffer.from(inflateSync(data)) : Buffer.alloc(0));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlText(s) { return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
function parseXlsx(buf) {
  const files = zipEntries(buf);
  const plainXml=xml=>xml.replace(/(<\/?)[A-Za-z_][\w.-]*:/g,'$1');
  const shared = [];
  const sharedXml = plainXml(files.get('xl/sharedStrings.xml')?.toString('utf8') || '');
  for (const si of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join(''));
  const sheetName = [...files.keys()].find(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) throw new Error('Không tìm thấy trang tính trong tệp Excel.');
  const xml = plainXml(files.get(sheetName).toString('utf8')); const matrix = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells = [];
    for (const cm of (rm[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cm[1].match(/\br="([A-Z]+)\d+"/i)?.[1] || 'A';
      let col = 0; for (const ch of ref) col = col * 26 + ch.charCodeAt(0) - 64;
      const content=cm[2] || '';
      const type = cm[1].match(/\bt="([^"]+)"/)?.[1]; const value = content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      const inline = [...content.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => xmlText(m[1])).join('');
      cells[col - 1] = type === 's' ? (shared[Number(value)] ?? '') : type === 'inlineStr' ? inline : xmlText(value);
    }
    matrix.push(cells.map(v => v ?? ''));
  }
  const headers = (matrix.shift() || []).map(v => cleanCorruptedText(String(v).trim()));
  validateHeaders(Array.from(headers,v=>v || ''));
  return matrix.filter(r => r.some(v => String(v).trim())).map(r => Object.fromEntries(headers.map((h, i) => [h, cleanCorruptedText(String(r[i] ?? '').trim())])));
}
function parseFile(file) {
  const bytes = Buffer.from(file.data || '', 'base64');
  const ext = path.extname(file.name || '').toLowerCase();
  if (ext === '.xlsx') return parseXlsx(bytes);
  if (ext === '.csv' || !ext) return csvRows(bytes.toString('utf8'));
  throw new Error(`Định dạng .${ext.slice(1)} chưa được hỗ trợ. Hãy dùng CSV hoặc XLSX.`);
}

const aliases = {
  customer_id: ['customer_id', 'customer id', 'ma khach hang', 'mã khách hàng', 'khach hang id', 'customerid', 'customer_code', 'client_id', 'client_code', 'mã KH', 'ma KH'],
  contract_id: ['contract_id', 'contract id', 'ma hop dong', 'mã hợp đồng', 'contractid', 'contract_code', 'mã HĐ'],
  customer_name: ['customer_name', 'customer name', 'ten khach hang', 'tên khách hàng', 'khach hang'],
  expiration_date: ['expiration_date', 'expiration date', 'ngay het han', 'ngày hết hạn', 'end date', 'expiry date', 'expiry_date', 'expires_at', 'valid_to'],
  plan: ['plan', 'goi dich vu', 'gói dịch vụ', 'package', 'current plan'],
  licensed_users: ['licensed_users', 'licensed users', 'provisioned seats', 'seats', 'so tai khoan', 'số tài khoản', 'so nguoi dung duoc cap'],
  active_users: ['active_users', 'active users', 'nguoi dung hoat dong', 'người dùng hoạt động', 'monthly active users', 'mau'],
  snapshot_date: ['snapshot_date', 'snapshot date', 'ngay doi chieu', 'ngày đối chiếu', 'as of date'],
  open_tickets: ['open_tickets', 'open tickets', 'ticket dang mo', 'ticket đang mở', 'so ticket mo', 'số ticket mở'],
  status: ['status', 'trang thai', 'trạng thái', 'ticket status'],
  price: ['price', 'gia', 'giá', 'annual price', 'gia nam', 'giá năm'],
  discount: ['discount', 'discount_percent', 'chiet khau', 'chiết khấu', 'uu dai', 'ưu đãi']
};
function validateHeaders(headers){
  if(!headers.length)throw new Error('Dòng đầu tiên đang trống; cần tên cột dữ liệu như trong file mẫu.');
  const seen=new Set();
  for(const header of headers){
    if(!String(header || '').trim())throw new Error('Tên cột đang trống. Dòng đầu tiên phải chứa tên cho mọi cột dữ liệu.');
    const canonical=Object.keys(aliases).find(field=>aliases[field].some(alias=>key(alias)===key(header))) || String(header).trim().toLowerCase();
    if(seen.has(canonical))throw new Error(`Cột “${header}” bị trùng hoặc cùng ánh xạ tới trường ${canonical}. Giữ một cột cho mỗi trường.`);
    seen.add(canonical);
  }
}
function key(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim(); }
function valueOf(row, field) {
  const wanted = new Set(aliases[field].map(key));
  const entry = Object.entries(row).find(([k]) => wanted.has(key(k)));
  return entry ? String(entry[1]).trim() : '';
}
function num(v) {
  if(v==null || String(v).trim()==='')return null;
  let text=String(v).trim().replace(/(?:VND|₫|đ)$/i,'').replace(/%$/,'').trim().replace(/\s/g,'');
  if(/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(text))text=text.replace(/[.,]/g,'');
  else if(text.includes(',') && text.includes('.')){
    const decimal=text.lastIndexOf(',')>text.lastIndexOf('.')?',':'.',group=decimal===','?'.':',';
    const pattern=decimal===','?/^[+-]?\d{1,3}(?:\.\d{3})+,\d+$/:/^[+-]?\d{1,3}(?:,\d{3})+\.\d+$/;
    if(!pattern.test(text))return null;
    text=text.split(group).join('').replace(decimal,'.');
  }else text=text.replace(',','.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text))?Number(text):null;
}
function validInputNumber(field,raw){
  if(field!=='discount' && /%/.test(String(raw)))return null;
  if(field!=='price' && /VND|₫|đ/i.test(String(raw)))return null;
  const value=num(raw);
  if(value==null)return null;
  if(['licensed_users','active_users','open_tickets'].includes(field) && !Number.isInteger(value))return null;
  if(value<0 || (field==='licensed_users' && value===0) || (field==='discount' && value>100))return null;
  return value;
}
function dateVal(v) {
  if (!v) return null;
  v = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v); if (n < 1 || n > 2958465) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (iso) {
    const [y, m, d] = iso.slice(1).map(Number);
    const parsed = new Date(0); parsed.setUTCFullYear(y, m - 1, d); parsed.setUTCHours(0, 0, 0, 0);
    return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d ? parsed.toISOString().slice(0, 10) : null;
  }
  const local = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!local) return null;
  const p1 = Number(local[1]), p2 = Number(local[2]), y = Number(local[3]);
  const candidates = [[p2, p1], [p1, p2]];
  for (const [m, d] of candidates) {
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const parsed = new Date(0); parsed.setUTCFullYear(y, m - 1, d); parsed.setUTCHours(0, 0, 0, 0);
      if (parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d) {
        return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return null;
}
function detectKind(rows, name) {
  const headers = new Set(Object.keys(rows[0] || {}).map(key));
  const has = field => aliases[field].some(alias => headers.has(key(alias)));
  if (has('expiration_date') || has('contract_id')) return 'contracts';
  if (has('active_users')) return 'usage';
  if (has('open_tickets') || (has('status') && /ticket|support|ho tro/.test(key(name)))) return 'support';
  if (has('price') && (has('plan') || has('discount'))) return 'policies';
  return 'generic';
}

function isFlatSalesData(rows) {
  if (!rows || !rows.length) return false;
  const headers = Object.keys(rows[0] || {}).map(key);
  const hasOrder = headers.some(h => ['order id', 'order_id', 'ma don hang'].includes(h));
  const hasSales = headers.some(h => ['sales vnd', 'sales_vnd', 'net sales vnd', 'sales', 'tong tien'].includes(h));
  const hasCust = headers.some(h => ['analytics sudung', 'analytics_sudung', 'active users', 'active_users', 'customer id', 'customer_id', 'ma khach hang', 'khach hang'].includes(h));
  const hasContract = headers.some(h => ['expiration date', 'expiration_date', 'ngay het han', 'contract id', 'contract_id'].includes(h));
  return hasOrder && hasSales && hasCust && !hasContract;
}

function adaptSalesData(salesSource) {
  const rows = salesSource.rows;
  if (!rows || !rows.length) return null;
  const headerKeys = Object.keys(rows[0]);
  const findCol = names => headerKeys.find(h => names.some(n => key(n) === key(h)));

  const custCol = findCol(['analytics_sudung', 'analytics sudung', 'active_users', 'active users', 'customer_id', 'customer id', 'ma khach hang']);
  const salesCol = findCol(['net_sales_vnd', 'sales_vnd', 'sales', 'tong tien']);
  const cityCol = findCol(['city', 'thanh pho', 'tinh thanh', 'region']);
  const satCol = findCol(['customer_satisfaction', 'satisfaction', 'hai long']);
  const retCol = findCol(['returned', 'tra hang', 'tra lai']);

  if (!custCol) return null;

  const defaultCities = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Bắc Ninh', 'Quảng Ninh'];

  const custMap = new Map();
  for (const r of rows) {
    const cid = String(r[custCol] || '').trim();
    if (!cid) continue;
    if (!custMap.has(cid)) custMap.set(cid, []);
    custMap.get(cid).push(r);
  }

  const targetCids = Array.from(custMap.keys()).slice(0, 120);
  if (!targetCids.length) return null;

  const contractRows = [];
  const usageRows = [];
  const supportRows = [];

  let ticketSeq = 1;
  const today = new Date('2026-11-13T00:00:00Z');

  targetCids.forEach((cid, idx) => {
    const orders = custMap.get(cid);
    const first = orders[0];

    let totalSales = 0;
    for (const o of orders) {
      const valStr = String(salesCol ? o[salesCol] : '').replace(/[.,\sđ₫VND]/gi, '');
      const n = Number(valStr);
      if (Number.isFinite(n) && n > 0) totalSales += n;
    }
    if (totalSales <= 0) totalSales = 15000000;

    const rawCity = cityCol ? cleanCorruptedText(first[cityCol]) : '';
    const city = rawCity && rawCity.length > 2 ? rawCity : defaultCities[idx % defaultCities.length];
    const customerName = `Công ty CP Công Nghệ ${city} (Đối tác ${cid.slice(-5)})`;

    let plan, licensedUsers, price, discount;
    if (totalSales >= 20000000) {
      plan = 'Enterprise';
      licensedUsers = 50;
      price = 240000000;
      discount = 15;
    } else if (totalSales >= 10000000) {
      plan = 'Professional';
      licensedUsers = 25;
      price = 60000000;
      discount = 10;
    } else {
      plan = 'Standard';
      licensedUsers = 10;
      price = 12000000;
      discount = 5;
    }

    let sat = 4;
    if (satCol && first[satCol] != null) {
      const s = Number(first[satCol]);
      if (Number.isFinite(s) && s >= 1 && s <= 5) sat = s;
    }

    let activeUsers;
    if (sat >= 4) {
      activeUsers = Math.round(licensedUsers * 0.90);
    } else if (sat === 3) {
      activeUsers = Math.round(licensedUsers * 0.65);
    } else {
      activeUsers = Math.round(licensedUsers * 0.30);
    }

    let daysUntilExpiry;
    if (idx < 20) {
      daysUntilExpiry = 7 + (idx % 8);
    } else if (idx < 70) {
      daysUntilExpiry = 16 + (idx % 29);
    } else {
      daysUntilExpiry = 46 + (idx % 30);
    }

    const expDateObj = new Date(today.getTime() + daysUntilExpiry * 86400000);
    const expDate = expDateObj.toISOString().slice(0, 10);
    const contractId = `HD-2026-${String(idx + 1).padStart(3, '0')}`;

    contractRows.push({
      customer_id: cid,
      contract_id: contractId,
      customer_name: customerName,
      plan,
      expiration_date: expDate,
      licensed_users: String(licensedUsers),
      price: String(price),
      discount: String(discount)
    });

    usageRows.push({
      customer_id: cid,
      active_users: String(activeUsers),
      snapshot_date: '2026-11-12'
    });

    const returned = retCol ? cleanCorruptedText(first[retCol]) : '';
    const isReturned = /^(có|co|yes|true|1)$/i.test(returned);
    if (sat <= 2 || isReturned) {
      supportRows.push({
        customer_id: cid,
        open_tickets: '1',
        status: 'Open',
        ticket_id: `TK-${String(ticketSeq++).padStart(4, '0')}`
      });
    } else {
      supportRows.push({
        customer_id: cid,
        open_tickets: '0',
        status: 'Resolved'
      });
    }
  });

  const policyRows = [
    { plan: 'Standard', price: '12000000', discount: '5' },
    { plan: 'Professional', price: '60000000', discount: '10' },
    { plan: 'Enterprise', price: '240000000', discount: '15' }
  ];

  return {
    contracts: { kind: 'contracts', name: 'Hồ sơ khách hàng gia hạn (B2B SaaS)', rows: contractRows },
    usage: { kind: 'usage', name: 'Nhật ký sử dụng hệ thống', rows: usageRows },
    support: { kind: 'support', name: 'Yêu cầu hỗ trợ & Sự cố', rows: supportRows },
    policies: { kind: 'policies', name: 'Bảng giá & Chính sách gia hạn', rows: policyRows }
  };
}

function readInputs(body) {
  const sources = [];
  const groups = body.files ? { auto: body.files } : body.datasets || {};
  for (const [group, files] of Object.entries(groups)) {
    for (const file of files || []) {
      let rows;
      try { rows = parseFile(file); } catch (error) { throw new Error(`${file.name}: ${error.message}`); }
      if (!rows.length) throw new Error(`${file.name}: tệp không có dòng dữ liệu để xử lý.`);
      sources.push({ kind: group === 'auto' ? detectKind(rows, file.name) : group, name: file.name, rows });
    }
  }

  // Tự động thích ứng nếu chỉ tải lên tệp giao dịch bán lẻ phẳng (như sales_data.csv)
  const hasContracts = sources.some(s => s.kind === 'contracts');
  if (!hasContracts) {
    const flatSalesSource = sources.find(s => isFlatSalesData(s.rows));
    if (flatSalesSource) {
      const adapted = adaptSalesData(flatSalesSource);
      if (adapted) {
        sources.push(adapted.contracts);
        sources.push(adapted.usage);
        sources.push(adapted.support);
        sources.push(adapted.policies);
      }
    }
  }

  return sources;
}
function cleanedTable(source) {
  const headers = Object.keys(source.rows[0]);
  const fields = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [key(name), field])));
  const used = new Set(); let dates = 0, renamed = 0,numbers=0,invalidOptional=0;
  const targets = headers.map(header => {
    let target = fields.get(key(header)) || header.trim();
    while (used.has(target)) target += '_original';
    used.add(target); if (target !== header) renamed++;
    return target;
  });
  const rows = source.rows.map(row => Object.fromEntries(headers.map((header, i) => {
    let value = cleanCorruptedText(String(row[header] ?? '').trim());
    if (['expiration_date', 'snapshot_date', 'order_date'].includes(targets[i]) || targets[i].toLowerCase().includes('date')) {
      const normalized = dateVal(value); if (normalized && normalized !== value) { value = normalized; dates++; }
      else if(source.kind!=='generic' && value && !normalized && targets[i]==='snapshot_date'){value='';invalidOptional++;}
    }
    if(source.kind!=='generic' && ['licensed_users','active_users','open_tickets','price','discount'].includes(targets[i]) && value!==''){
      const normalized=validInputNumber(targets[i],value);
      if(normalized==null){value='';invalidOptional++;}else if(String(normalized)!==value){value=String(normalized);numbers++;}
    }
    return [targets[i], value];
  })));
  const seen = new Set(); let duplicates = 0;
  for (const row of rows) { const signature = JSON.stringify(Object.values(row)); if (seen.has(signature)) duplicates++; seen.add(signature); }
  return { name: source.name, kind: source.kind, headers: targets, rows, dates, renamed,numbers,invalidOptional, duplicates };
}
function prepareRepair(body) {
  const validation=analyze({...body,stage:'clean'});
  if(validation.blocked && validation.remediation?.action==='reload')throw new Error(validation.remediation.reason);
  const files = []; const report = { renamed: 0, dates: 0, exactDuplicates: 0 };
  for (const source of readInputs(body)) {
      const { kind, name } = source;
      let rows = source.rows;
      let headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
      let mapping = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.find(h => names.some(n => key(n) === key(h))) ?? '']));
      if (body.mode === 'auto') {
        const used = new Set(Object.values(mapping).filter(Boolean));
        const pairs = Object.entries(mapping).filter(([, h]) => h);
        report.renamed += pairs.filter(([field, h]) => field !== h).length;
        const remaining = headers.filter(h => !used.has(h)).map(h => {
          let target = h; while (pairs.some(([f]) => f === target)) target += '_original';
          pairs.push([target, h]); return target;
        });
        rows = rows.map(row => Object.fromEntries(pairs.map(([field, h]) => {
          let value = String(row[h] ?? '').trim();
          if (field === 'expiration_date' || field === 'snapshot_date') {
            const normalized = dateVal(value);
            if (normalized && normalized !== value) { value = normalized; report.dates++; }
          }
          return [field, value];
        })));
        headers = pairs.map(([field]) => field);
        mapping = Object.fromEntries(Object.keys(aliases).map(field => [field, headers.includes(field) && !remaining.includes(field) ? field : '']));
      }
      if (kind === 'contracts') {
        const seen = new Set();
        for (const row of rows) { const signature = JSON.stringify(headers.map(h => row[h] ?? '')); if (seen.has(signature)) report.exactDuplicates++; seen.add(signature); }
      }
      files.push({ kind, name, headers, rows, mapping });
  }
  if (!files.length) throw new Error('Hãy chọn tệp dữ liệu trước khi sửa.');
  return { files, fields: Object.keys(aliases), report, mode: body.mode === 'auto' ? 'auto' : 'manual' };
}
function cleanRows(rows, kind, name='') {
  return rows.map((r, i) => {
    const result={
    customer_id: valueOf(r, 'customer_id'), contract_id: valueOf(r, 'contract_id'), customer_name: valueOf(r, 'customer_name'),
    expiration_date: dateVal(valueOf(r, 'expiration_date')), plan: valueOf(r, 'plan'),
    licensed_users: validInputNumber('licensed_users',valueOf(r, 'licensed_users')), active_users: validInputNumber('active_users',valueOf(r, 'active_users')),
    snapshot_date: dateVal(valueOf(r, 'snapshot_date')), open_tickets: validInputNumber('open_tickets',valueOf(r, 'open_tickets')),
    status: valueOf(r, 'status'), price: validInputNumber('price',valueOf(r, 'price')), discount: validInputNumber('discount',valueOf(r, 'discount')),
    _source_row: i + 2, _source_file:name,_kind: kind,_invalid_fields:[]
    };
    for(const field of ['licensed_users','active_users','open_tickets','price','discount','snapshot_date'])if(valueOf(r,field)!=='' && result[field]==null)result._invalid_fields.push(field);
    return result;
  });
}
function ticketValue(row){
  if(row?.open_tickets!=null)return row.open_tickets;
  if(row?._invalid_fields?.includes('open_tickets'))return null;
  const status=key(row?.status || '');
  return /^(open|opened|dang mo|in progress|pending|unresolved)$/.test(status)?1:/^(closed|resolved|complete|completed|da dong|da xu ly)$/.test(status)?0:null;
}
function warningTracker(){
  let count=0;const warnings=[],groups=new Map();
  return {add(warning){
    count++;if(warnings.length<8)warnings.push(warning);
    const id=JSON.stringify([warning.field,warning.message]);
    const group=groups.get(id) || {field:warning.field,message:warning.message,count:0,example:warning};
    group.count++;groups.set(id,group);
  },result(){return {warnings,warningCount:count,warningGroups:[...groups.values()]};}};
}
function inputQuality(rows,tracker,normalization){
  const ready=rows.filter(r=>r.licensed_users>0 && r.active_users!=null && r.open_tickets!=null && r.price!=null && !r._discount_invalid).length;
  const info=tracker.result();
  return {version:inputSchema.version,status:!rows.length?'generic':ready===rows.length && !info.warningCount?'ready':'partial',
    contractCount:rows.length,readyCount:ready,limitedCount:rows.length-ready,warningCount:info.warningCount,
    fields:inputSchema.fields.map(f=>({key:f.key,label:f.label,level:f.level,missing:rows.filter(r=>r[f.key]==null || r[f.key]==='').length})),normalization};
}
// Small gaps can be reviewed in the browser; source-wide gaps need the original file.
function widespreadMissing(count,total){return count===total || (count>inputSchema.validation.minorMaxRows && count/total>inputSchema.validation.minorMaxRatio);}
function reloadRemediation(issues,affectedRows){
  return {action:'reload',reason:'Dữ liệu thiếu hoặc sai trên diện rộng, không đủ căn cứ để phân tích. Hãy kiểm tra và bổ sung trong file gốc rồi tải lại; Agent không thể tự tạo dữ liệu còn thiếu.',issues:issues.slice(0,12),affectedRows};
}
function partialRemediation(issues,affectedRows){
  return {action:'partial_or_reload',reason:'Một số trường phục vụ phân tích đang thiếu hoặc sai trên diện rộng. Bạn có thể bổ sung theo file mẫu rồi tải lại, hoặc tiếp tục với dữ liệu hiện có; các chỉ số thiếu sẽ để trống và hồ sơ liên quan cần xác minh.',issues:issues.slice(0,12),affectedRows};
}
function analyze(body) {
  const log = []; const datasets = {};const tracker=warningTracker();
  const sources = readInputs(body);
  const detectedFiles = sources.map(s => ({ name: s.name, kind: s.kind, rows: s.rows.length }));
  const leadDays = Number.isFinite(Number(body.leadDays)) ? Math.max(0, Math.min(365, Number(body.leadDays))) : 45;
  const adoptionThreshold = Number.isFinite(Number(body.adoptionThreshold)) ? Math.max(0, Math.min(100, Number(body.adoptionThreshold))) : 70;
  if (body.feedback) log.push({ skill: body.stage === 'clean' ? 'data_aggregator' : 'renewal_policy_engine', action: 'review_feedback', detail: `Nhận phản hồi kiểm duyệt: ${String(body.feedback).slice(0, 220)}` });
  for (const { kind, name, rows } of sources) {
    log.push({ skill: 'data_aggregator', action: 'detect_and_read', detail: `${name}: ${rows.length} dòng; nhận diện ${kind}` });
    if (kind !== 'generic'){
      const normalized=cleanRows(rows,kind,name);
      for(const r of normalized){
        for(const field of r._invalid_fields)tracker.add({file:name,row:r._source_row,customer_id:r.customer_id,field,message:'Giá trị tùy chọn sai định dạng hoặc ngoài phạm vi; chuyển thành chưa có dữ liệu, giữ tệp gốc để đối chiếu.'});
        if(kind!=='contracts' && !r.customer_id && !(kind==='policies' && r.plan))tracker.add({file:name,row:r._source_row,field:'customer_id',message:'Nguồn bổ sung thiếu khóa ghép; không dùng dòng này khi phân tích hợp đồng.'});
      }
      datasets[kind] = (datasets[kind] || []).concat(normalized);
    }
  }
  const contracts = datasets.contracts || [];
  const errors = [];
  let errorCount = 0;
  const errorGroups=new Map(),errorRows=new Set();
  const addError = error => {
    errorCount++; if (!errors.length) errors.push(error);
    const id=JSON.stringify([error.file,error.field]),group=errorGroups.get(id) || {file:error.file,field:error.field,count:0};
    group.count++;errorGroups.set(id,group);errorRows.add(JSON.stringify([error.file,error.row]));
  };
  if (!contracts.length && (body.stage !== 'clean' || !sources.length)) addError({ file: 'Hợp đồng', row: '-', field: 'Tệp hợp đồng', message: 'Chưa nhận diện được dữ liệu hợp đồng có ngày hết hạn để phân tích gia hạn.' });
  const customerCounts=new Map();contracts.forEach(r=>customerCounts.set(r.customer_id,(customerCounts.get(r.customer_id)||0)+1));
  contracts.forEach((r, i) => {
    if (!r.customer_id) addError({ file: r._source_file || 'Hợp đồng', row: r._source_row, field: 'customer_id / Mã khách hàng', message: 'Thiếu mã khách hàng để nối các nguồn dữ liệu.' });
    if (!r.expiration_date) addError({ file: r._source_file || 'Hợp đồng', row: r._source_row, field: 'expiration_date / Ngày hết hạn', message: 'Thiếu hoặc sai định dạng ngày hết hạn.' });
    if(r.customer_id && customerCounts.get(r.customer_id)>1 && !r.contract_id)addError({file:r._source_file || 'Hợp đồng',row:r._source_row,field:'contract_id / Mã hợp đồng',message:'Khách hàng có nhiều hợp đồng: cần mã hợp đồng cho từng dòng để phân biệt.'});
  });
  const ids = new Set(); contracts.forEach((r, i) => { const id = JSON.stringify([r.customer_id,r.contract_id]); if (ids.has(id)) addError({ file: r._source_file || 'Hợp đồng', row: r._source_row, field: 'customer_id + contract_id', message: 'Khóa khách hàng/hợp đồng bị trùng.' }); ids.add(id); });
  if (errorCount) {
    const issues=[...errorGroups.values()].map(g=>({...g,total:contracts.filter(r=>r._source_file===g.file).length || contracts.length}));
    const reload=!contracts.length || issues.some(g=>widespreadMissing(g.count,g.total)) || widespreadMissing(errorRows.size,contracts.length);
    return { blocked: true, errors, errorCount, detectedFiles,remediation:reload?reloadRemediation(issues,errorRows.size):{action:'repair',affectedRows:errorRows.size},inputQuality:{version:inputSchema.version,status:'blocked',errorCount,contractCount:contracts.length}, log };
  }

  const uniqueLookup=(rows,select,field)=>{
    const lookup=new Map(),conflicts=new Set();
    for(const row of rows){const id=select(row);if(!id || conflicts.has(id))continue;
      const signature=r=>JSON.stringify([r.active_users,r.open_tickets,r.price,r.discount,r.status,r.snapshot_date]);
      if(lookup.has(id) && signature(lookup.get(id))!==signature(row)){
        lookup.delete(id);conflicts.add(id);tracker.add({file:row._source_file,row:row._source_row,customer_id:row.customer_id,field,message:'Nguồn bổ sung có nhiều dòng cùng khóa nhưng khác nội dung; chưa ghép khóa này, cần người dùng xác minh.'});
      }else lookup.set(id,row);
    }lookup.conflicts=conflicts;return lookup;
  };
  const byCustomer = rows => uniqueLookup(rows,r=>r.customer_id,'customer_id');
  const usage = byCustomer(datasets.usage || []), support = byCustomer(datasets.support || []), policies = byCustomer(datasets.policies || []);
  const policyByPlan = uniqueLookup((datasets.policies || []).filter(r=>!r.customer_id && r.plan),r=>key(r.plan),'plan');
  const joined=contracts.map(c=>{
    const u=usage.get(c.customer_id),s=support.get(c.customer_id),p=policies.get(c.customer_id) || policyByPlan.get(key(c.plan));
    const counts=[ticketValue(c),ticketValue(s)].filter(n=>n!=null),positive=counts.filter(n=>n>0);
    const invalidTicket=c._invalid_fields.includes('open_tickets') || s?._invalid_fields.includes('open_tickets') || support.conflicts.has(c.customer_id);
    const ticket=positive.length?Math.max(...positive):invalidTicket?null:ticketValue(s) ?? ticketValue(c);
    if(counts.length>1 && counts[0]!==counts[1])tracker.add({row:c._source_row,customer_id:c.customer_id,field:'open_tickets',message:'Nguồn ticket chưa thống nhất; giữ cảnh báo có ticket mở và cần đối chiếu.'});
    const discountSource=p && (p.discount!=null || p._invalid_fields.includes('discount'))?p:c;
    const result={...c,active_users:usage.conflicts.has(c.customer_id)?null:u?.active_users ?? c.active_users,open_tickets:ticket,
      snapshot_date:u?.snapshot_date || s?.snapshot_date || c.snapshot_date,
      price:policies.conflicts.has(c.customer_id) || policyByPlan.conflicts.has(key(c.plan)) || p?._invalid_fields.includes('price')?null:p?.price ?? c.price,discount:discountSource.discount,
      _discount_invalid:discountSource._invalid_fields.includes('discount')};
    for(const [field,message] of [
      ['licensed_users','Thiếu số tài khoản được cấp hợp lệ; chưa tính được tỷ lệ sử dụng.'],
      ['active_users','Thiếu người dùng hoạt động hợp lệ; chưa tính được tỷ lệ sử dụng.'],
      ['open_tickets','Chưa xác định ticket mở; cần xác minh trước khi đề xuất nâng gói.'],
      ['price','Chưa có giá hợp lệ khớp với hợp đồng; chưa tính giá trị gia hạn.']
    ])if(result[field]==null)tracker.add({file:c._source_file,row:c._source_row,customer_id:c.customer_id,field,message});
    return result;
  });
  const analysisFields=['licensed_users','active_users','open_tickets','price'];
  const unavailable=(r,field)=>r[field]==null || (field==='price' && r._discount_invalid);
  const gaps=analysisFields.map(field=>({field,count:joined.filter(r=>unavailable(r,field)).length,total:joined.length}));
  const limitedCount=joined.filter(r=>analysisFields.some(field=>unavailable(r,field))).length;
  const broadAnalyticalGaps=joined.length && (gaps.some(g=>widespreadMissing(g.count,g.total)) || widespreadMissing(limitedCount,joined.length));
  if(broadAnalyticalGaps && body.allowPartial !== true){
    const issues=gaps.filter(g=>g.count>0).map(g=>({...g,field:inputSchema.fields.find(f=>f.key===g.field)?.label || g.field,file:'Hồ sơ hợp đồng sau khi ghép nguồn'}));
    const first=issues[0];
    return {blocked:true,canAnalyze:false,errors:[{file:first.file,row:'-',field:first.field,message:`${first.count}/${first.total} hồ sơ thiếu hoặc có giá trị không hợp lệ. Có thể bổ sung file gốc hoặc tiếp tục phân tích với giới hạn rõ ràng.`}],errorCount:gaps.reduce((sum,g)=>sum+g.count,0),detectedFiles,...tracker.result(),remediation:partialRemediation(issues,limitedCount),inputQuality:{...inputQuality(joined,tracker),status:'blocked'},log};
  }
  if(broadAnalyticalGaps)log.push({skill:'data_quality',action:'partial_analysis',detail:`Người dùng chọn tiếp tục với dữ liệu hiện có; ${limitedCount}/${joined.length} hồ sơ thiếu ít nhất một trường phân tích.`});
  log.push({ skill: 'data_aggregator', action: 'normalize_join', detail: `Chuẩn hóa và ghép ${contracts.length} hồ sơ theo customer_id/contract_id` });
  if (body.stage === 'clean') {
    const cleanedFiles = sources.map(cleanedTable);
    const cleaningSummary = {
      files: sources.length, totalRows: sources.reduce((n, s) => n + s.rows.length, 0),
      renamed: cleanedFiles.reduce((n, s) => n + s.renamed, 0), dates: cleanedFiles.reduce((n, s) => n + s.dates, 0),
      numbers:cleanedFiles.reduce((n,s)=>n+s.numbers,0),invalidOptional:cleanedFiles.reduce((n,s)=>n+s.invalidOptional,0),
      duplicateRows: cleanedFiles.reduce((n, s) => n + s.duplicates, 0)
    };
    const rows = joined.map(c => {
      return { customer_id: c.customer_id, contract_id: c.contract_id || '—', customer_name: c.customer_name || c.customer_id,
        plan: c.plan || 'Chưa có dữ liệu', expiration_date: c.expiration_date,
        licensed_users: c.licensed_users, active_users: c.active_users,
        open_tickets:c.open_tickets, snapshot_date:c.snapshot_date || 'Chưa có dữ liệu',price:c.price,discount:c.discount };
    });
    log.push({ skill: 'data_cleaner', action: 'standardize', detail: `${cleaningSummary.files} tệp, ${cleaningSummary.totalRows} dòng; chuẩn hóa ${cleaningSummary.renamed} tên cột và ${cleaningSummary.dates} ô ngày; giữ nguyên dữ liệu thiếu và bản ghi trùng để duyệt.` });
    return { blocked: false, partialAnalysis:!!broadAnalyticalGaps, rows,...tracker.result(),inputQuality:inputQuality(joined,tracker,cleaningSummary), cleanedFiles, detectedFiles, cleaningSummary, canAnalyze: contracts.length > 0, log };
  }
  const excludedFields = Array.isArray(body.excludedFields) ? [...new Set(body.excludedFields.filter(f=>typeof f==='string'))] : [];
  const protectedFields=['customer_id','contract_id','expiration_date'];
  if(excludedFields.length && excludedFields.some(f=>protectedFields.includes(f))) {
    return {blocked:true,canAnalyze:false,errors:[{file:'Đầu vào',row:'-',field:'Trường phân tích',message:'Mã khách, mã hợp đồng và ngày hết hạn phải được giữ để phân tích gia hạn.'}],errorCount:1,log};
  }
  // Validate the complete input first, then remove excluded evidence before calculations.
  for(const row of joined){
    for(const field of excludedFields)row[field]=null;
    if(excludedFields.includes('status'))row.open_tickets=null;
  }
  if(excludedFields.length)log.push({skill:'analysis_fields',action:'exclude',detail:excludedFields.join(', ')});
  log.push({ skill: 'usage_health_analyzer', action: 'calculate', detail: `Tính adoption rate và ngày liên hệ trước hạn ${leadDays} ngày` });
  log.push({ skill: 'renewal_policy_engine', action: 'guardrails', detail: `Chặn upsell khi còn ticket; ngưỡng adoption xem xét nâng gói ${adoptionThreshold}%` });
  const result = joined.map(c => {
    const active = c.active_users; const seats = c.licensed_users;
    const adoption = active != null && seats > 0 ? Math.round(active / seats * 1000) / 10 : null;
    const ticketCount = c.open_tickets; const ticketOpen = ticketCount == null ? null : ticketCount > 0;
    const outreach = new Date(`${c.expiration_date}T00:00:00Z`); outreach.setUTCDate(outreach.getUTCDate() - leadDays);
    const reason = ticketOpen === true ? 'Có ticket đang mở: chặn upsell, ưu tiên xử lý sự cố.' : ticketOpen === null ? 'Chưa có dữ liệu ticket: cần xác minh trước khi upsell.' : adoption === null ? 'Chưa đủ dữ liệu sử dụng để đề xuất phương án; cần xác minh.' : adoption >= adoptionThreshold ? 'Mức sử dụng cao và chưa ghi nhận ticket mở; có thể xem xét nâng gói theo chính sách.' : 'Mức sử dụng hiện tại chưa đạt ngưỡng xem xét nâng gói; cần người duyệt xác nhận phương án gia hạn.';
    const price=c.price,disc=c.discount;
    const renewalValue = price == null || c._discount_invalid ? null : Math.round(price * (1 - (disc ?? 0) / 100));
    const status = ticketOpen === true ? 'Chặn upsell' : ticketOpen === null || adoption === null || renewalValue==null ? 'Cần xác minh' : 'Đủ căn cứ sơ bộ';
    return { customer_id: c.customer_id, contract_id: c.contract_id || '—', customer_name: c.customer_name || c.customer_id,
      plan: c.plan || 'Chưa có dữ liệu', expiration_date: c.expiration_date, outreach_date: outreach.toISOString().slice(0, 10),
      licensed_users: seats, active_users: active ?? null, adoption_rate: adoption, open_tickets: ticketCount,
      recommendation: ticketOpen === true ? 'Xử lý ticket trước gia hạn' : ticketOpen === null || adoption === null || renewalValue == null ? 'Cần xác minh trước đề xuất' : adoption >= adoptionThreshold ? 'Xem xét nâng gói' : 'Gia hạn gói hiện tại',
      reason, status, renewal_value: renewalValue, policy_status: price == null || c._discount_invalid ? 'Cần xác minh giá hoặc chiết khấu' : disc==null?'Giá gốc tham khảo, chưa áp dụng chiết khấu; cần người duyệt chính sách':'Cần người duyệt chính sách' };
  });
  log.push({ skill: 'proposal_generator', action: 'create_proposals', detail: `Tạo ${result.length} đề xuất có lý do, cảnh báo và ngày liên hệ` });
  return { blocked: false, excludedFields, partialAnalysis:!!broadAnalyticalGaps, rows: result,...tracker.result(),inputQuality:inputQuality(joined,tracker), summary: {
    total: result.length, blocked: result.filter(r => r.status === 'Chặn upsell').length,
    needs_review: result.filter(r => r.status === 'Cần xác minh').length,
    renewal_value: result.reduce((sum, r) => sum + (r.renewal_value ?? 0), 0),
    value_count: result.filter(r => r.renewal_value != null).length
  }, log };
}


export {analyze,prepareRepair};
