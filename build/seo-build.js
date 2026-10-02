/* seo-build.js — 依 data/reviews.js 產生每篇心得的靜態頁與 sitemap.xml
 * 同一份程式可在 Node（node build/run.js）或瀏覽器執行
 * 新增或修改心得後重新產生一次即可
 */
function buildSite(REVIEWS, opts) {
  var BASE = (opts && opts.base) || 'https://drew-chen-yc.github.io/book-notes/';
  var TODAY = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  var FOOT = [
    '  <footer class="site-footer"><div class="wrap">',
    '    <form id="newsletter" novalidate>',
    '      <h2>每月一封新心得</h2>',
    '      <p>不寄廣告，只寄這個月讀完的書。</p>',
    '      <div class="form-row">',
    '        <label class="sr-only" for="email">Email</label>',
    '        <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required>',
    '        <label class="sr-only" for="interest">感興趣的分類</label>',
    '        <select id="interest" name="interest">',
    '          <option value="all">全部分類</option><option value="自我成長">自我成長</option><option value="心理學">心理學</option><option value="歷史">歷史</option><option value="投資理財">投資理財</option>',
    '        </select>',
    '        <button class="btn" type="submit">訂閱</button>',
    '      </div>',
    '      <p class="form-msg" aria-live="polite"></p>',
    '    </form>',
    '    <p class="copyright">© 2026 書頁筆記 · <a href="about.html#privacy">隱私說明</a></p>',
    '  </div></footer>',
    '  <script src="data/reviews.js"></script>',
    '  <script src="assets/app.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  var files = {};
  REVIEWS.forEach(function (r) {
    var url = BASE + r.id + '.html';
    var title = r.title + ' 讀書心得｜書頁筆記';
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Review',
      name: r.title + ' 讀書心得',
      url: url,
      datePublished: r.date,
      inLanguage: 'zh-Hant-TW',
      reviewBody: r.summary,
      author: { '@type': 'Organization', name: '書頁筆記', url: BASE },
      itemReviewed: Object.assign({ '@type': 'Book', name: r.title, author: { '@type': 'Person', name: r.author } },
        r.subcategory ? { genre: r.category + '／' + r.subcategory } : {}),
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 }
    };
    files[r.id + '.html'] = [
      '<!doctype html>',
      '<html lang="zh-Hant-TW" data-page-type="review" data-content-group="心得內頁" data-review-id="' + esc(r.id) + '">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>' + esc(title) + '</title>',
      '  <meta name="description" content="' + esc(r.summary) + '">',
      '  <link rel="canonical" href="' + url + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="書頁筆記">',
      '  <meta property="og:title" content="' + esc(title) + '">',
      '  <meta property="og:description" content="' + esc(r.summary) + '">',
      '  <meta property="og:url" content="' + url + '">',
      '  <meta property="article:published_time" content="' + r.date + '">',
      '  <meta name="twitter:card" content="summary">',
      '  <script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>',
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">書頁筆記</a>',
      '    <nav><a href="index.html">心得</a><a href="about.html">關於</a></nav>',
      '  </div></header>',
      '  <main class="wrap narrow" id="review">',
      '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="index.html?cat=' + encodeURIComponent(r.category) + '">' + esc(r.category) + '</a>' +
        (r.subcategory ? ' / <a href="index.html?cat=' + encodeURIComponent(r.category) + '&sub=' + encodeURIComponent(r.subcategory) + '">' + esc(r.subcategory) + '</a>' : '') + '</nav>',
      '    <header class="review-head">',
      '      <div><span class="tag">' + esc(r.category + (r.subcategory ? '・' + r.subcategory : '')) + '</span><h1>' + esc(r.title) + '</h1>',
      '      <p class="meta">' + esc(r.author) + '</p><p class="stars big" aria-label="' + r.rating + ' 顆星">' + stars(r.rating) + '</p>',
      '      <p class="meta">' + r.date + '</p>',
      '      <p class="lead">' + esc(r.summary) + '</p></div>',
      '    </header>',
      '    <article id="article">',
      r.body.map(function (p) { return '      <p>' + esc(p) + '</p>'; }).join('\n'),
      '      <p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p>',
      '    </article>',
      '  </main>',
      FOOT
    ].join('\n');
  });

  var urls = [{ loc: BASE, lastmod: TODAY }, { loc: BASE + 'about.html', lastmod: TODAY }]
    .concat(REVIEWS.map(function (r) { return { loc: BASE + r.id + '.html', lastmod: r.date }; }));
  files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) { return '  <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod></url>'; }).join('\n') +
    '\n</urlset>\n';
  return files;
}
if (typeof module !== 'undefined') module.exports = buildSite;
