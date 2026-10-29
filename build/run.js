// 用法：node build/run.js [YYYY-MM-DD]  → 在網站根目錄寫出每篇心得頁、分類頁、書單頁、總表、sitemap.xml，並更新手寫頁
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/reviews.js'), 'utf8'), ctx);
// 重雷心得：只有 build 讀，前台不載入（檔案大，iPad 也要順）
if (fs.existsSync(path.join(root, 'data/spoilers.js'))) vm.runInContext(fs.readFileSync(path.join(root, 'data/spoilers.js'), 'utf8'), ctx);
const buildSite = require('./seo-build.js');
// 手寫頁（首頁、心得列表、關於、回饋…）一起傳進去：build 會把導覽列下拉選單、頁尾網站地圖、首頁的篇數與最新心得寫成靜態 HTML 後一併輸出
const pages = {};
buildSite.HAND_PAGES.forEach(name => { pages[name] = fs.readFileSync(path.join(root, name), 'utf8'); });
const files = buildSite(ctx.window.REVIEWS, { today: process.argv[2], lists: ctx.window.LISTS || [], news: ctx.window.NEWS || [],
  categories: ctx.window.CATEGORIES, subcategories: ctx.window.SUBCATEGORIES || {}, pages, spoilers: ctx.window.SPOILERS || [], series: ctx.window.SERIES || [], catIntros: ctx.window.CAT_INTROS || {} });
for (const [name, content] of Object.entries(files)) { fs.writeFileSync(path.join(root, name), content); console.log('wrote', name, Buffer.byteLength(content)); }
