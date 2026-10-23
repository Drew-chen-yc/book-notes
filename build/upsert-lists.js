// 用法：node build/upsert-lists.js <書單.json>
// 把 JSON 檔裡的書單（一個物件或物件陣列）寫進 data/reviews.js 的 window.LISTS：
// id 已存在就整篇取代（保留原本的 date，除非新資料有給），不存在就加在最前面。
// 寫入前會檢查每個 items[].id 都找得到心得，欄位格式不對就停下來不寫。
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const file = path.join(root, 'data/reviews.js');
const src = fs.readFileSync(file, 'utf8');

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const incoming = Array.isArray(input) ? input : [input];

const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx);
const ids = new Set(ctx.window.REVIEWS.map(r => r.id));
const TYPES = ['分類推薦', '主題書單', '比較', '作者與系列', '入門與指南', '年度回顧'];
const lists = ctx.window.LISTS.slice();

function fail(msg) { console.error('停止：' + msg); process.exit(1); }
for (const l of incoming) {
  if (!/^[a-z0-9-]+$/.test(l.id || '')) fail('id 只能用小寫英文、數字和連字號：' + l.id);
  if (ids.has(l.id)) fail('書單 id 不能和心得 id 重複：' + l.id);
  for (const k of ['title', 'description', 'date']) if (!l[k]) fail(l.id + ' 缺少 ' + k);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || (l.updated && !/^\d{4}-\d{2}-\d{2}$/.test(l.updated))) fail(l.id + ' 日期格式要 YYYY-MM-DD');
  if (l.type && !TYPES.includes(l.type)) fail(l.id + ' 的 type 要是：' + TYPES.join('、'));
  if (!Array.isArray(l.sections) || !l.sections.length) fail(l.id + ' 沒有 sections');
  const all = JSON.stringify(l);
  if (all.includes('——')) fail(l.id + ' 有破折號「——」');
  if (/暫定|暫給/.test(all)) fail(l.id + ' 出現「暫定」字樣，評分一律不標暫定');
  for (const s of l.sections) for (const it of (s.items || [])) {
    if (!ids.has(it.id)) fail(l.id + ' 找不到心得 ' + it.id);
    if (!it.note) fail(l.id + ' 的 ' + it.id + ' 沒有短評');
  }
  const i = lists.findIndex(x => x.id === l.id);
  if (i >= 0) { lists[i] = Object.assign({ date: lists[i].date }, l); console.log('更新', l.id); }
  else { lists.unshift(l); console.log('新增', l.id); }
}

const start = src.indexOf('window.LISTS = [');
const end = src.indexOf('\n];\n', start);
if (start < 0 || end < 0) fail('找不到 window.LISTS 區塊');
const body = JSON.stringify(lists, null, 2).slice(1, -1).replace(/^\n/, '').replace(/\n$/, '');
const out = src.slice(0, start) + 'window.LISTS = [\n' + body.split('\n').map(x => x).join('\n') + src.slice(end);
fs.writeFileSync(file, out);
console.log('window.LISTS 共', lists.length, '份');
