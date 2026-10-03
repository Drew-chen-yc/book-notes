/* seo-build.js — 依 data/reviews.js 產生每篇心得的靜態頁與 sitemap.xml
 * 同一份程式可在 Node（node build/run.js）或瀏覽器執行
 * 新增或修改心得後重新產生一次即可
 * 另外產生 books.html（總表）與每篇書單文 <id>.html（opts.lists = window.LISTS）
 */
function buildSite(REVIEWS, opts) {
  var BASE = (opts && opts.base) || 'https://drew-chen-yc.github.io/book-notes/';
  var TODAY = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { var f = Math.floor(n), h = n > f ? 1 : 0; return '★★★★★'.slice(0, f) + (h ? '<span class="star-half">☆</span>' : '') + '☆☆☆☆☆'.slice(0, 5 - f - h); }
  /* SEO 用字：標題、H1、開頭第一句都對準「書名＋心得／評價／好看嗎」這類搜尋字詞 */
  function seoAsk(r) { return r.category === '小說' ? '好看嗎' : '值得讀嗎'; }
  function seoH1(r) { return '《' + r.title + '》' + (r.category === '小說' ? '心得與評價' : '讀書心得與評價'); }
  function seoTitle(r) { return seoH1(r) + '：' + seoAsk(r) + '？｜書頁筆記'; }
  function seoIntro(r) {
    return '《' + r.title + '》' + seoAsk(r) + '？這篇是我讀完' + (/^[A-Za-z]/.test(r.author) ? ' ' : '') + r.author +
      (r.category === '小說' ? '這部' + (r.subcategory || '') + '小說' : '這本書') + '之後寫的心得與評價，給 ' + r.rating + ' 顆星。';
  }
  /* 文末推薦：同子分類優先，再來同分類，不夠才補其他分類 */
  function relatedOf(r, list, n) {
    return list.filter(function (x) { return x.id !== r.id; }).map(function (x, i) {
      return { x: x, i: i, s: (x.category === r.category ? 4 : 0) + (r.subcategory && x.subcategory === r.subcategory ? 2 : 0) + ((x.category === '小說') === (r.category === '小說') ? 1 : 0) };
    }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).slice(0, n).map(function (o) { return o.x; });
  }
  function bodyHtml(body) {   // 「## 」小標題、「### 」次標題、連續的「- 」條列
    var out = [], li = [];
    function flush() { if (li.length) { out.push('<ul>' + li.join('') + '</ul>'); li = []; } }
    body.forEach(function (p) {
      if (p.indexOf('- ') === 0) { li.push('<li>' + esc(p.slice(2)) + '</li>'); return; }
      flush();
      var m = /^(#{2,3})\s+(.+)$/.exec(p);
      out.push(m ? '<h' + m[1].length + '>' + esc(m[2]) + '</h' + m[1].length + '>' : '<p>' + esc(p) + '</p>');
    });
    flush();
    return out;
  }
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
    '          <option value="all">全部分類</option><option value="小說">小說</option><option value="自我成長">自我成長</option><option value="心理學">心理學</option><option value="人文社科">人文社科</option><option value="歷史">歷史</option><option value="投資理財">投資理財</option>',
    '        </select>',
    '        <button class="btn" type="submit">訂閱</button>',
    '      </div>',
    '      <p class="form-msg" aria-live="polite"></p>',
    '    </form>',
    '    <p class="copyright">© 2026 書頁筆記 · <a href="about.html#privacy">隱私說明</a></p>',
    '  </div></footer>',
    '  <script src="data/reviews.js"></script>',
    '  <script src="assets/app.js?v=20261003"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  /* 書單文（data/reviews.js 的 window.LISTS）與總表頁共用的小工具 */
  var LISTS = (opts && opts.lists) || [];
  function byId(id) { for (var i = 0; i < REVIEWS.length; i++) if (REVIEWS[i].id === id) return REVIEWS[i]; return null; }
  function genreKey(r) { return ({ '仙俠': 'xian', '玄幻': 'xuan', '奇幻': 'fantasy', '科幻': 'scifi', '推理': 'mystery', '文學': 'lit' })[r.subcategory] || 'plain'; }
  /* 評分印章：全站同一顆，size = xs（行內）／sm（卡片）／lg（心得頁） */
  function seal(n, size) { return '<span class="seal seal-' + size + '" role="img" aria-label="' + n + ' 顆星">' + n + '<i aria-hidden="true">★</i></span>'; }
  function cover(r, size) {
    return '<div class="cover cover-' + size + '" data-g="' + genreKey(r) + '" style="--c:' + r.color + '" aria-hidden="true">' +
      '<em>' + esc(r.subcategory || r.category) + '</em><span>' + esc(r.title) + '</span><small>' + esc(r.author) + '</small></div>';
  }
  function catLabel(r) { return r.category + (r.subcategory ? '・' + r.subcategory : ''); }
  function para(p) { return '    <p>' + esc(p) + '</p>'; }
  function listLink(l) { return '<a href="' + esc(l.id) + '.html">' + esc(l.title) + '</a>'; }
  function listsOf(r) {
    return LISTS.filter(function (l) { return l.sections.some(function (s) { return (s.items || []).some(function (it) { return it.id === r.id; }); }); });
  }
  function shell(o) {   // 書單、總表這類靜態頁的外殼
    return [
      '<!doctype html>',
      '<html lang="zh-Hant-TW" data-page-type="' + o.type + '" data-content-group="' + o.group + '">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>' + esc(o.title) + '｜書頁筆記</title>',
      '  <meta name="description" content="' + esc(o.desc) + '">',
      '  <link rel="canonical" href="' + BASE + o.file + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="書頁筆記">',
      '  <meta property="og:title" content="' + esc(o.title) + '">',
      '  <meta property="og:description" content="' + esc(o.desc) + '">',
      '  <meta property="og:url" content="' + BASE + o.file + '">',
      '  <meta name="twitter:card" content="summary">',
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css?v=20261003">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">書頁筆記</a>',
      '    <nav><a href="index.html">心得</a><a href="books.html">全部的書</a><a href="about.html">關於</a></nav>',
      '  </div></header>',
      '  <main class="wrap narrow listing">',
      o.main,
      '  </main>',
      FOOT
    ].join('\n');
  }

  var files = {};
  REVIEWS.forEach(function (r) {
    var url = BASE + r.id + '.html';
    var title = seoTitle(r), intro = seoIntro(r), desc = intro + r.summary, rel = relatedOf(r, REVIEWS, 4);
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Review',
      name: seoH1(r),
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
      '  <meta name="description" content="' + esc(desc) + '">',
      '  <link rel="canonical" href="' + url + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="書頁筆記">',
      '  <meta property="og:title" content="' + esc(title) + '">',
      '  <meta property="og:description" content="' + esc(desc) + '">',
      '  <meta property="og:url" content="' + url + '">',
      '  <meta property="article:published_time" content="' + r.date + '">',
      '  <meta name="twitter:card" content="summary">',
      '  <script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>',
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css?v=20261003">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">書頁筆記</a>',
      '    <nav><a href="index.html">心得</a><a href="books.html">全部的書</a><a href="about.html">關於</a></nav>',
      '  </div></header>',
      '  <main class="wrap narrow" id="review">',
      '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="index.html?cat=' + encodeURIComponent(r.category) + '">' + esc(r.category) + '</a>' +
        (r.subcategory ? ' / <a href="index.html?cat=' + encodeURIComponent(r.category) + '&sub=' + encodeURIComponent(r.subcategory) + '">' + esc(r.subcategory) + '</a>' : '') + '</nav>',
      '    <header class="review-head">',
      '      ' + cover(r, 'lg'),
      '      <div><span class="tag">' + esc(r.category + (r.subcategory ? '・' + r.subcategory : '')) + '</span><h1>' + esc(seoH1(r)) + '</h1>',
      '      <p class="meta">' + esc(r.author) + '</p><p class="rating">' + seal(r.rating, 'lg') + '<span class="stars big" aria-hidden="true">' + stars(r.rating) + '</span></p>',
      '      <p class="meta">' + r.date + '</p>',
      '      <p class="intro">' + esc(intro) + '</p>',
      '      <p class="lead">' + esc(r.summary) + '</p></div>',
      '    </header>',
      '    <article id="article">',
      bodyHtml(r.body).map(function (x) { return '      ' + x; }).join('\n'),
      '      <p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p>',
      '    </article>',
      '    <section class="related"><h2>同類型心得</h2><ul>',
      rel.map(function (x) { return '      <li><a href="' + esc(x.id) + '.html">' + esc(seoH1(x)) + '</a>（' + esc(x.author) + '）</li>'; }).join('\n'),
      '    </ul></section>',
      listsOf(r).length ? '    <p class="meta in-lists">收錄在：' + listsOf(r).map(listLink).join('、') + '</p>' : '',
      '  </main>',
      FOOT
    ].join('\n');
  });

  /* 總表：全部的書一頁看完（書名、類型、評分、一句話），依評分排序 */
  var sorted = REVIEWS.map(function (r, i) { return { r: r, i: i }; })
    .sort(function (a, b) { return b.r.rating - a.r.rating || a.i - b.i; }).map(function (o) { return o.r; });
  files['books.html'] = shell({
    file: 'books.html', type: 'books', group: '總表',
    title: '全部的書：' + REVIEWS.length + ' 本讀書心得的評分與一句話短評',
    desc: '書頁筆記讀過的 ' + REVIEWS.length + ' 本書總表，含類型、評分和一句話短評，點書名看完整心得。',
    main: [
      '    <h1>全部的書</h1>',
      '    <p class="meta">共 ' + REVIEWS.length + ' 本，依評分排序，滿分 5 顆星。點書名看完整心得。</p>',
      LISTS.length ? '    <p class="quick">書單：' + LISTS.map(listLink).join('') + '</p>' : '',
      '    <table class="books"><thead><tr><th>書名</th><th>類型</th><th>評分</th><th>一句話</th></tr></thead><tbody>',
      sorted.map(function (r, i) {
        return '      <tr><td><a href="' + esc(r.id) + '.html" data-id="' + esc(r.id) + '" data-list="all_books" data-pos="' + (i + 1) + '">《' + esc(r.title) + '》</a><br><small>' + esc(r.author) + '</small></td>' +
          '<td>' + esc(catLabel(r)) + '</td><td>' + seal(r.rating, 'xs') + '</td><td>' + esc(r.summary.split('。')[0] + '。') + '</td></tr>';
      }).join('\n'),
      '    </tbody></table>'
    ].join('\n')
  });

  /* 書單文：每篇一個靜態頁，項目連回單本心得 */
  LISTS.forEach(function (l) {
    var pos = 0;
    files[l.id + '.html'] = shell({
      file: l.id + '.html', type: 'list', group: '書單', title: l.title, desc: l.description,
      main: [
        '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="books.html">全部的書</a></nav>',
        '    <h1>' + esc(l.title) + '</h1>',
        '    <p class="meta">' + l.date + '</p>',
        (l.intro || []).map(para).join('\n'),
        l.sections.map(function (s) {
          return (s.heading ? ['    <h2>' + esc(s.heading) + '</h2>'] : []).concat((s.paras || []).map(para), (s.items || []).map(function (it) {
            var r = byId(it.id);
            if (!r) throw new Error('書單 ' + l.id + ' 找不到心得 ' + it.id);
            pos += 1;
            return '    <div class="pick"><h3><a href="' + esc(r.id) + '.html" data-id="' + esc(r.id) + '" data-list="list_' + esc(l.id) + '" data-pos="' + pos + '">《' + esc(r.title) + '》</a> ' +
              seal(r.rating, 'xs') + '</h3>' +
              '<p class="meta">' + esc(r.author) + ' · ' + esc(catLabel(r)) + '</p><p>' + esc(it.note) + '</p></div>';
          })).join('\n');
        }).join('\n'),
        (l.outro || []).map(para).join('\n'),
        '    <section class="related"><h2>繼續看</h2><ul>',
        LISTS.filter(function (x) { return x.id !== l.id; }).map(function (x) { return '      <li>' + listLink(x) + '</li>'; }).join('\n'),
        '      <li><a href="books.html">全部的書（總表）</a></li>',
        '    </ul></section>'
      ].join('\n')
    });
  });

  var urls = [{ loc: BASE, lastmod: TODAY }, { loc: BASE + 'about.html', lastmod: TODAY }]
    .concat(REVIEWS.map(function (r) { return { loc: BASE + r.id + '.html', lastmod: r.date }; }))
    .concat([{ loc: BASE + 'books.html', lastmod: TODAY }])
    .concat(LISTS.map(function (l) { return { loc: BASE + l.id + '.html', lastmod: l.date }; }));
  files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) { return '  <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod></url>'; }).join('\n') +
    '\n</urlset>\n';
  return files;
}
if (typeof module !== 'undefined') module.exports = buildSite;
