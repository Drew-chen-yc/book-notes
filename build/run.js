// 用法：node build/run.js [YYYY-MM-DD]  → 在網站根目錄寫出每篇心得頁與 sitemap.xml
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/reviews.js'), 'utf8'), ctx);
const files = require('./seo-build.js')(ctx.window.REVIEWS, { today: process.argv[2] });
for (const [name, content] of Object.entries(files)) { fs.writeFileSync(path.join(root, name), content); console.log('wrote', name, Buffer.byteLength(content)); }
