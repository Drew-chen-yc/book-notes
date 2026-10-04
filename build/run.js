// 用法：node build/run.js [YYYY-MM-DD]  → 在網站根目錄寫出每篇心得頁與 sitemap.xml
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/reviews.js'), 'utf8'), ctx);
const files = require('./seo-build.js')(ctx.window.REVIEWS, { today: process.argv[2], lists: ctx.window.LISTS || [] });
for (const [name, content] of Object.entries(files)) { fs.writeFileSync(path.join(root, name), content); console.log('wrote', name, Buffer.byteLength(content)); }
// 首頁 data-count 的靜態數字（app.js 載入後會再填一次）跟著資料更新，爬蟲不跑 JS 時也讀到正確的值
const R = ctx.window.REVIEWS, L = ctx.window.LISTS || [];
const idx = path.join(root, 'index.html'), before = fs.readFileSync(idx, 'utf8');
const after = before.replace(/(data-count="([^"]+)">)[^<]*/g, (m, head, key) =>
  head + (key === 'reviews' ? R.length : key === 'lists' ? L.length : key.indexOf('cat:') === 0 ? R.filter(r => r.category === key.slice(4)).length : m.slice(head.length)));
if (after !== before) { fs.writeFileSync(idx, after); console.log('updated index.html counts'); }
