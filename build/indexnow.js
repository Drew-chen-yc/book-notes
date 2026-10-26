/* IndexNow：網站更新後通知 Bing（以及 Yandex、Naver 等支援 IndexNow 的搜尋引擎）來抓新網頁。
 * 由 .github/workflows/indexnow.yml 在每次推到 main、GitHub Pages 部署完後執行。
 *   node build/indexnow.js         只送這次 commit 改到、而且在 sitemap.xml 裡的網頁
 *   node build/indexnow.js --all   送 sitemap.xml 裡的全部網址
 * 金鑰檔是網站根目錄的 <32 位十六進位>.txt，內容就是金鑰本身，不要刪。 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var key = fs.readdirSync(ROOT).map(function (f) { var m = /^([0-9a-f]{32})\.txt$/.exec(f); return m && m[1]; }).filter(Boolean)[0];
if (!key) { console.error('找不到 IndexNow 金鑰檔'); process.exit(1); }
var sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
var locs = []; sitemap.replace(/<loc>([^<]+)<\/loc>/g, function (_, u) { locs.push(u.trim()); });
var base = locs[0].replace(/^(https?:\/\/[^/]+\/).*$/, '$1');
var host = base.replace(/^https?:\/\//, '').replace(/\/$/, '');
var urls;
if (process.argv.indexOf('--all') >= 0) {
  urls = locs;
} else {
  var changed = cp.execSync('git diff --name-only HEAD~1 HEAD', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  var want = changed.filter(function (f) { return /^[^/]+\.html$/.test(f); })
    .map(function (f) { return f === 'index.html' ? base : base + f; });
  urls = locs.filter(function (u) { return want.indexOf(u) >= 0; });
}
if (!urls.length) { console.log('這次沒有 sitemap 內的網頁變動，不用通知。'); process.exit(0); }
var body = { host: host, key: key, keyLocation: base + key + '.txt', urlList: urls.slice(0, 10000) };
fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body)
}).then(function (r) {
  console.log('IndexNow 回應 ' + r.status + '，送出 ' + body.urlList.length + ' 個網址：\n' + body.urlList.join('\n'));
  if (r.status !== 200 && r.status !== 202) process.exit(1);
}).catch(function (e) { console.error(e); process.exit(1); });
