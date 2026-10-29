/* seo-build.js — 依 data/reviews.js 產生每篇心得的靜態頁與 sitemap.xml
 * 同一份程式可在 Node（node build/run.js）或瀏覽器執行
 * 新增或修改心得後重新產生一次即可
 * 另外產生 books.html（總表）與每篇書單文 <id>.html（opts.lists = window.LISTS）
 * 導覽列下拉選單、頁尾網站地圖、首頁的最新心得與書單卡片也在這裡寫成靜態 HTML（手寫頁經 opts.pages 傳入）
 */
function buildSite(REVIEWS, opts) {
  var BASE = (opts && opts.base) || 'https://dogeared-notes.com/';
  var TODAY = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  /* Google AdSense 發布商 ID（2026-10-22 改為個人帳戶的 ID）：每一頁的 <head> 加驗證用 meta，根目錄產生 ads.txt。設成空字串就全部拿掉。
   * 廣告版位另外由 app.js 控制，這裡只負責網站驗證與 ads.txt。 */
  var ADSENSE_PUB = (opts && opts.adsensePub !== undefined) ? opts.adsensePub : 'ca-pub-3634341941601249';
  var ADS_META = ADSENSE_PUB ? '  <meta name="google-adsense-account" content="' + ADSENSE_PUB + '">' : '';
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 結構化資料：BreadcrumbList、ItemList，以及 meta description 的長度上限 */
  function ldTag(o) { return '  <script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>'; }
  function crumbLd(items) {   // items = [[名稱, 檔名], ...]，首頁的檔名是空字串
    return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(function (it, i) {
      return { '@type': 'ListItem', position: i + 1, name: it[0], item: BASE + it[1] };
    }) };
  }
  function itemListLd(rows) {   // rows = [[名稱, 檔名], ...]
    return { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.map(function (x, i) {
      return x[1] ? { '@type': 'ListItem', position: i + 1, name: x[0], url: BASE + x[1] } : { '@type': 'ListItem', position: i + 1, name: x[0] };
    }) };
  }
  function collectionLd(name, file, desc, rows) {
    return { '@context': 'https://schema.org', '@type': 'CollectionPage', name: name, url: BASE + file, description: desc, inLanguage: 'zh-Hant-TW',
      isPartOf: { '@type': 'WebSite', name: '折角 Dogeared', url: BASE }, mainEntity: itemListLd(rows) };
  }
  function clip(d) { return d.length > 160 ? d.slice(0, 159) + '…' : d; }
  function stars(n) { var f = Math.floor(n), h = n > f ? 1 : 0; return '★★★★★'.slice(0, f) + (h ? '<span class="star-half">☆</span>' : '') + '☆☆☆☆☆'.slice(0, 5 - f - h); }
  /* SEO 用字：標題、H1、開頭第一句都對準「書名＋心得／評價／好看嗎」這類搜尋字詞 */
  function seoAsk(r) { return r.category === '小說' ? '好看嗎' : '值得讀嗎'; }
  function seoH1(r) { return '《' + r.title + '》' + (r.category === '小說' ? '心得與評價' : '讀書心得與評價'); }
  function seoTitle(r) { return seoH1(r) + '：' + seoAsk(r) + '？｜折角 Dogeared'; }
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
  /* 重雷心得（data/spoilers.js 的 window.SPOILERS，經 opts.spoilers 傳入；前台不載入這個檔）：
   * 每篇對應一篇無雷心得（id 相同），輸出 <id>-spoiler.html。無雷心得頁底部只在有重雷心得時才出現連結。
   * 欄位：id、date（上架日）、updated（改寫日，選填）、progress（連載中的書寫到哪，選填）、hook（標題後半句的問題）、summary（一句話結論）、body（同心得 body 規則） */
  var SPOILERS = {};
  ((opts && opts.spoilers) || []).forEach(function (sp) {
    var who = '重雷心得 ' + (sp.id || '(沒有 id)');
    var r = null;
    for (var i = 0; i < REVIEWS.length; i++) if (REVIEWS[i].id === sp.id) r = REVIEWS[i];
    if (!r) throw new Error(who + '：找不到對應的無雷心得。');
    if (SPOILERS[sp.id]) throw new Error(who + '：重複。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') || (sp.updated && !/^\d{4}-\d{2}-\d{2}$/.test(sp.updated))) throw new Error(who + '：日期要是 YYYY-MM-DD。');
    if (!sp.hook || !sp.summary || !(sp.body || []).length) throw new Error(who + '：缺 hook、summary 或 body。');
    if (/——/.test(sp.summary + sp.body.join(''))) throw new Error(who + '：不用破折號「——」。');
    SPOILERS[sp.id] = sp;
  });
  function spoilerFile(r) { return r.id + '-spoiler.html'; }
  function spoilerH1(r) { return '《' + r.title + '》結局解析與重雷心得'; }
  function spoilerTitle(r, sp) { return '《' + r.title + '》結局解析：' + sp.hook + '（重雷心得）｜折角 Dogeared'; }
  function spoilerDate(sp) { return sp.updated || sp.date; }
  function reviewMod(r) { var sp = SPOILERS[r.id]; return [r.updated || r.date].concat(sp ? [spoilerDate(sp)] : []).sort().pop(); }
  /* 分享縮圖：有書封就用書封（assets/covers/og/<id>.jpg，從書封 WebP 轉成 JPEG，社群平台都吃），沒有就用全站共用圖 */
  function ogImage(r) {
    if (!r.cover) return '  <meta property="og:image" content="' + BASE + 'assets/og.png">';
    var dim = r.coverSize || [300, 430];
    return ['  <meta property="og:image" content="' + BASE + 'assets/covers/og/' + r.id + '.jpg">',
      '  <meta property="og:image:width" content="' + dim[0] + '">', '  <meta property="og:image:height" content="' + dim[1] + '">',
      '  <meta property="og:image:alt" content="《' + esc(r.title) + '》書封">'].join('\n');
  }
  function spoilerCta(r) {
    var sp = SPOILERS[r.id];
    if (!sp) return '';
    return '    <section class="spoiler-cta" aria-labelledby="spoiler-h"><h2 id="spoiler-h">讀完了？看重雷心得</h2>' +
      '<p>無雷心得只能講到這裡。結局、伏筆和我真正想聊的部分，寫在重雷心得：</p>' +
      '<p><a class="spoiler-link" href="' + spoilerFile(r) + '" data-id="' + esc(r.id) + '" data-kind="spoiler" data-list="review_spoiler_cta" data-pos="1">' + esc(spoilerH1(r)) + '</a></p>' +
      '<p class="meta">內含完整劇情與結局。' + (sp.progress ? '寫到' + esc(sp.progress) + '。' : '') + '</p></section>';
  }
  function bodyHtml(body) {   // 「## 」小標題（帶 id="s-N" 給目錄跳轉）、「### 」次標題、連續的「- 」條列
    var out = [], li = [], h2 = 0;
    function flush() { if (li.length) { out.push('<ul>' + li.join('') + '</ul>'); li = []; } }
    body.forEach(function (p) {
      if (p.indexOf('- ') === 0) { li.push('<li>' + esc(p.slice(2)) + '</li>'); return; }
      flush();
      var m = /^(#{2,3})\s+(.+)$/.exec(p);
      out.push(m ? '<h' + m[1].length + (m[1].length === 2 ? ' id="s-' + (++h2) + '"' : '') + '>' + esc(m[2]) + '</h' + m[1].length + '>' : '<p>' + esc(p) + '</p>');
    });
    flush();
    return out;
  }
  function SERIES_DATA() { return (opts && opts.series) || []; }
  /* 長篇心得的目錄（## 小標題 4 個以上才出現）與系列導覽（window.SERIES）。build/seo-build.js 與 assets/app.js 各一份，要同步 */
  function tocHtml(body) {
    var hs = body.filter(function (p) { return /^##\s/.test(p); }).map(function (p) { return p.replace(/^##\s+/, ''); });
    if (hs.length < 4) return '';
    return '<nav class="toc" aria-label="本篇目錄"><details><summary>目錄<small>' + hs.length + ' 節，點標題直接跳過去</small></summary><ol>' +
      hs.map(function (h, i) { return '<li><a href="#s-' + (i + 1) + '">' + esc(h) + '</a></li>'; }).join('') + '</ol></details></nav>';
  }
  function seriesOf(r) {
    var list = SERIES_DATA();
    for (var i = 0; i < list.length; i++) { var k = list[i].ids.indexOf(r.id); if (k > -1) return { s: list[i], i: k }; }
    return null;
  }
  function seriesTag(r) { var x = seriesOf(r); return x ? x.s.name + '第 ' + (x.i + 1) + ' 本（共 ' + x.s.ids.length + ' 本）' : ''; }
  function seriesNav(r, findById) {
    var x = seriesOf(r);
    if (!x) return '';
    function link(id, cls, label, pos) {
      var b = id && findById(id);
      return b ? '<a class="' + cls + '" href="' + esc(b.id) + '.html" data-id="' + esc(b.id) + '" data-list="series_nav" data-pos="' + pos + '"><small>' + label + '</small>《' + esc(b.title) + '》</a>' : '<span class="' + cls + ' none"><small>' + label + '</small>' + (cls === 'prev' ? '這是第一本' : '這是最後一本') + '</span>';
    }
    return '<nav class="series-nav" aria-label="系列導覽"><p class="series-head"><b>' + esc(x.s.name) + '</b>第 ' + (x.i + 1) + ' 本，共 ' + x.s.ids.length + ' 本' +
      (x.s.list ? '<a href="' + esc(x.s.list) + '.html">看閱讀順序</a>' : '') + '</p><div class="series-links">' +
      link(x.s.ids[x.i - 1], 'prev', '上一本', 1) + link(x.s.ids[x.i + 1], 'next', '下一本', 2) + '</div></nav>';
  }

  /* 分類頁網址：cat-<分類>.html、cat-<分類>-<子分類>.html（build/seo-build.js 與 assets/app.js 各有一份，要同步） */
  var LISTS = (opts && opts.lists) || [];
  /* 書單類型（window.LISTS 每篇的 type 欄位）：書單總覽依這個順序分組；沒填的歸「其他書單」 */
  var LIST_TYPES = ['分類推薦', '主題書單', '比較', '作者與系列', '入門與指南', '年度回顧'];
  function listDate(l) { return l.updated || l.date; }
  var LISTS_NEW = LISTS.slice().sort(function (a, b) { return listDate(a) < listDate(b) ? 1 : listDate(a) > listDate(b) ? -1 : 0; });   // 新的在前
  var CAT_SLUG = { '小說': 'novel', '自我成長': 'self-growth', '心理學': 'psychology', '人文社科': 'humanities', '歷史': 'history', '投資理財': 'investing' };
  var SUB_SLUG = { '仙俠': 'xianxia', '玄幻': 'xuanhuan', '奇幻': 'fantasy', '科幻': 'scifi', '推理': 'mystery', '懸疑': 'suspense', '文學': 'literary', '歷史': 'historical', '愛情': 'romance', '翻譯': 'translated', '其他': 'other' };
  function catHref(cat, sub) { return 'cat-' + CAT_SLUG[cat] + (sub ? '-' + SUB_SLUG[sub] : '') + '.html'; }
  /* 導覽列下拉選單與頁尾網站地圖：直接寫進每一頁的 HTML，搜尋引擎不必執行程式就讀得到所有分類頁與書單的連結。
   * 內容與順序要和 assets/app.js 的 initSiteNav() 一致（那邊只在頁面沒有這兩塊時才動態補上）。
   * 分類順序依 data/reviews.js 的 CATEGORIES、SUBCATEGORIES（opts.categories、opts.subcategories），只列有心得的。 */
  var APP_VER = '20261029b';   // assets/app.js 的快取版本參數：改 app.js 時只要換這裡，build 會寫進每一頁
  function countOf(cat, sub) { return REVIEWS.filter(function (r) { return r.category === cat && (!sub || r.subcategory === sub); }).length; }
  function uniq(list) { return list.filter(function (x, i) { return x && list.indexOf(x) === i; }); }
  var LIVE_CATS = ((opts && opts.categories) || uniq(REVIEWS.map(function (r) { return r.category; })))
    .filter(function (c) { return countOf(c) > 0; }).sort(function (x, y) { return countOf(y) - countOf(x); });   // 篇數多的排前面
  function liveSubs(cat) {
    return (((opts && opts.subcategories) || {})[cat] || uniq(REVIEWS.filter(function (r) { return r.category === cat; }).map(function (r) { return r.subcategory; })))
      .filter(function (s) { return countOf(cat, s) > 0; });
  }
  /* 書訊（新聞／得獎／排行榜）：資料在 data/reviews.js 的 window.NEWS（opts.news）。依日期由新到舊；同一天維持資料裡的順序。
   * 沒有任何一則時，導覽列、首頁區塊、news.html 都不出現。 */
  var NEWS_TYPES = ['新聞', '得獎', '排行榜'];
  var NEWS_TYPE_KEY = { '新聞': 'news', '得獎': 'award', '排行榜': 'rank' };
  var NEWS_SCOPES = ['網路小說', '台灣書市', '國際文學獎', '日本輕小說／文學'];
  var NEWS = ((opts && opts.news) || []).map(function (n, i) { return { n: n, i: i }; })
    .sort(function (a, b) { return a.n.date < b.n.date ? 1 : a.n.date > b.n.date ? -1 : a.i - b.i; }).map(function (o) { return o.n; });
  (function checkNews() {
    var ids = {}, taken = {};
    REVIEWS.forEach(function (r) { taken[r.id] = 1; });
    LISTS.forEach(function (l) { taken[l.id] = 1; });
    NEWS.forEach(function (n) {
      var who = '書訊 ' + (n.id || '(沒有 id)');
      if (!/^nws\d{4,}$/.test(n.id || '')) throw new Error(who + '：id 要是 nws 加數字，例如 nws2601。');
      if (ids[n.id] || taken[n.id]) throw new Error(who + '：id 重複。');
      ids[n.id] = 1;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date || '')) throw new Error(who + '：日期要是 YYYY-MM-DD。');
      if (NEWS_TYPES.indexOf(n.type) < 0) throw new Error(who + '：類型只能是 ' + NEWS_TYPES.join('／') + '。');
      if (n.scope && NEWS_SCOPES.indexOf(n.scope) < 0) throw new Error(who + '：範圍只能是 ' + NEWS_SCOPES.join('／') + '。');
      if (!n.title || !n.summary) throw new Error(who + '：缺標題或摘要。');
      if (n.url && !/^https?:\/\//.test(n.url)) throw new Error(who + '：來源網址要以 http 開頭。');
      (n.related || []).forEach(function (rid) { if (!taken[rid] || !REVIEWS.some(function (r) { return r.id === rid; })) throw new Error(who + '：相關心得 ' + rid + ' 不存在。'); });
    });
  })();
  function newsRow(n, listName, pos) {
    return '<a class="nrow" href="' + esc(n.id) + '.html" data-id="' + esc(n.id) + '" data-kind="news" data-list="' + listName + '" data-pos="' + pos +
      '" data-type="' + esc(n.type) + '" data-scope="' + esc(n.scope || '') + '">' +
      '<time class="row-date" datetime="' + n.date + '">' + n.date.replace(/-/g, '.') + '</time>' +
      '<span class="ntype ntype-' + NEWS_TYPE_KEY[n.type] + '">' + esc(n.type) + '</span>' +
      '<span class="row-main"><span class="row-title">' + esc(n.title) + '</span><span class="row-sub nsrc">' + esc([n.scope, n.source].filter(Boolean).join(' · ')) + '</span></span></a>';
  }
  var NEWS_NAV = NEWS.length ? '<a href="news.html">書訊</a>' : '';
  /* 導覽列最右邊的搜尋按鈕：有 JS 時 app.js 會展開「分類＋關鍵字」搜尋框；沒有 JS 時就是連到心得列表的搜尋欄 */
  var NAV_SEARCH = '<a class="nav-search" href="reviews.html#search" aria-label="搜尋心得"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span class="sr-only">搜尋</span></a>';
  var NAV = '<nav><div class="dd"><a href="reviews.html" aria-haspopup="true">心得</a><div class="dd-menu">' +
    '<a href="reviews.html"><b>全部心得</b><small>' + REVIEWS.length + '</small></a>' + LIVE_CATS.map(function (c) {
      return '<a href="' + catHref(c) + '"><b>' + esc(c) + '</b><small>' + countOf(c) + '</small></a>' + liveSubs(c).map(function (s) {
        return '<a class="dd-sub" href="' + catHref(c, s) + '">' + esc(s) + '<small>' + countOf(c, s) + '</small></a>';
      }).join('');
    }).join('') + '</div></div>' + NEWS_NAV + '<a href="lists.html">書單</a><a href="books.html">全部的書</a><a href="about.html">關於</a>' + NAV_SEARCH + '</nav>';
  function mapCol(title, links) {   // links = [[網址, 文字], ...]
    return '<div><h3>' + esc(title) + '</h3>' + links.map(function (l) { return '<a href="' + l[0] + '">' + esc(l[1]) + '</a>'; }).join('') + '</div>';
  }
  var SITEMAP = '<nav class="sitemap" aria-label="網站地圖">' +
    mapCol('分類', LIVE_CATS.map(function (c) { return [catHref(c), c + '（' + countOf(c) + '）']; })) +
    LIVE_CATS.filter(function (c) { return liveSubs(c).length; }).map(function (c) {
      return mapCol(c + '類型', liveSubs(c).map(function (s) { return [catHref(c, s), s + '（' + countOf(c, s) + '）']; }));
    }).join('') +
    mapCol('書單', LISTS_NEW.slice(0, 6).map(function (l) { return [l.id + '.html', l.title]; }).concat(LISTS.length > 6 ? [['lists.html', '全部 ' + LISTS.length + ' 份書單']] : [])) +
    mapCol('網站', [['index.html', '首頁'], ['reviews.html', '全部心得']].concat(NEWS.length ? [['news.html', '書訊']] : [], [['lists.html', '書單總覽'], ['books.html', '全部的書（總表）'], ['resources.html', '閱讀資源：圖書館與電子書'], ['feedback.html', '推薦好書／意見回饋'], ['about.html', '關於']])) + '</nav>';
  var FOOT = [
    '  <footer class="site-footer"><div class="wrap">',
    '    ' + SITEMAP,
    '    <p class="copyright">© 2026 折角 Dogeared · <a href="about.html#privacy">隱私說明</a></p>',
    '  </div></footer>',
    '  <script src="data/reviews.js"></script>',
    '  <script src="assets/app.js?v=' + APP_VER + '"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  /* 書單文（data/reviews.js 的 window.LISTS）與總表頁共用的小工具 */
  function byId(id) { for (var i = 0; i < REVIEWS.length; i++) if (REVIEWS[i].id === id) return REVIEWS[i]; return null; }
  function genreKey(r) { return ({ '仙俠': 'xian', '玄幻': 'xuan', '奇幻': 'fantasy', '科幻': 'scifi', '推理': 'mystery', '懸疑': 'mystery', '文學': 'lit' })[r.subcategory] || 'plain'; }
  /* 評分印章：全站同一顆，size = xs（行內）／sm（卡片）／lg（心得頁） */
  function seal(n, size) { return '<span class="seal seal-' + size + '" role="img" aria-label="' + n + ' 顆星">' + n + '<i aria-hidden="true">★</i></span>'; }
  /* 書封：有 r.cover（assets/covers/<id>.webp，2026-10-29 起）就用圖片；沒有的書用原本的色塊書封 */
  function cover(r, size) {
    if (r.cover) {
      var dim = r.coverSize || [300, 430];
      return '<div class="cover cover-' + size + ' cover-img" style="--c:' + r.color + '"><img src="' + esc(r.cover) + '" alt="《' + esc(r.title) + '》書封" width="' + dim[0] + '" height="' + dim[1] + '"' + (size === 'lg' ? '' : ' loading="lazy"') + ' decoding="async"></div>';
    }
    return '<div class="cover cover-' + size + '" data-g="' + genreKey(r) + '" style="--c:' + r.color + '" aria-hidden="true">' +
      '<em>' + esc(r.subcategory || r.category) + '</em><span>' + esc(r.title) + '</span><small>' + esc(r.author) + '</small></div>';
  }
  function catName(cat, sub) { return sub ? sub + cat : cat; }
  function readMinutes(r) { return Math.max(1, Math.round(r.body.join('').length / 400)); }
  function crumbOf(r) {   // 首頁 / 心得 / 分類 / 子分類
    return '<nav class="crumb"><a href="index.html">首頁</a> / <a href="reviews.html">心得</a> / <a href="' + catHref(r.category) + '">' + esc(r.category) + '</a>' +
      (r.subcategory ? ' / <a href="' + catHref(r.category, r.subcategory) + '">' + esc(r.subcategory) + '</a>' : '') + '</nav>';
  }
  /* 心得清單的一列：日期｜書名、作者、分類、一句話｜評分。同一天的第二列起日期淡出，看起來像依日期分組的清單 */
  function rowItem(r, listName, pos, sameDay) {
    return '<a class="row' + (sameDay ? ' same-day' : '') + '" href="' + esc(r.id) + '.html" data-id="' + esc(r.id) + '" data-list="' + listName + '" data-pos="' + pos + '">' +
      '<time class="row-date" datetime="' + r.date + '">' + r.date.replace(/-/g, '.') + '</time>' +
      '<span class="row-main"><span class="row-title">' + esc(r.title) + '</span><span class="row-sub">' + esc(r.author) + '<span class="tag">' + esc(catLabel(r)) + '</span></span>' +
      '<span class="row-sum">' + esc(r.summary) + '</span></span>' + seal(r.rating, 'xs') + '</a>';
  }
  function rowList(list, listName) {
    return list.map(function (r, i) { return rowItem(r, listName, i + 1, i > 0 && list[i - 1].date === r.date); });
  }
  function catLabel(r) { return r.category + (r.subcategory ? '・' + r.subcategory : ''); }
  function para(p) { return '    <p>' + esc(p) + '</p>'; }
  function listLink(l) { return '<a href="' + esc(l.id) + '.html">' + esc(l.title) + '</a>'; }
  function listsOf(r) {
    return LISTS.filter(function (l) { return l.sections.some(function (s) { return (s.items || []).some(function (it) { return it.id === r.id; }); }); });
  }
  function shell(o) {   // 書單、總表這類靜態頁的外殼
    o.desc = clip(o.desc);
    return [
      '<!doctype html>',
      '<html lang="zh-Hant-TW" data-page-type="' + o.type + '" data-content-group="' + o.group + '">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">' + (ADS_META ? '\n' + ADS_META : ''),
      '  <title>' + esc(o.title) + '｜折角 Dogeared</title>',
      '  <meta name="description" content="' + esc(o.desc) + '">',
      '  <link rel="canonical" href="' + BASE + o.file + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="折角 Dogeared">',
      '  <meta property="og:title" content="' + esc(o.title) + '">',
      '  <meta property="og:description" content="' + esc(o.desc) + '">',
      '  <meta property="og:url" content="' + BASE + o.file + '">',
      '  <meta name="twitter:card" content="summary">',
      (o.ld || []).map(ldTag).join('\n'),
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="icon" href="assets/logo.svg" type="image/svg+xml">',
      '  <meta property="og:image" content="' + BASE + 'assets/og.png">',
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css?v=20261029b">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">折角<span>Dogeared</span><small>｜讀書心得與推薦</small></a>',
      '    ' + NAV,
      '  </div></header>',
      '  <main class="wrap ' + (o.wide ? '' : 'narrow ') + 'listing">',
      o.main,
      '  </main>',
      FOOT
    ].join('\n');
  }

  var files = {};
  REVIEWS.forEach(function (r) {
    var url = BASE + r.id + '.html';
    var title = seoTitle(r), intro = seoIntro(r), desc = clip(intro + r.summary), rel = relatedOf(r, REVIEWS, 4);
    var ld = {
      '@context': 'https://schema.org',
      '@type': 'Review',
      name: seoH1(r),
      url: url,
      datePublished: r.date,
      dateModified: reviewMod(r),
      inLanguage: 'zh-Hant-TW',
      reviewBody: r.summary,
      author: { '@type': 'Organization', name: '折角 Dogeared', url: BASE },
      itemReviewed: Object.assign({ '@type': 'Book', name: r.title, author: { '@type': 'Person', name: r.author } }, r.cover ? { image: BASE + r.cover } : {},
        r.subcategory ? { genre: r.category + '／' + r.subcategory } : {}),
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 }
    };
    files[r.id + '.html'] = [
      '<!doctype html>',
      '<html lang="zh-Hant-TW" data-page-type="review" data-content-group="心得內頁" data-review-id="' + esc(r.id) + '">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">' + (ADS_META ? '\n' + ADS_META : ''),
      '  <title>' + esc(title) + '</title>',
      '  <meta name="description" content="' + esc(desc) + '">',
      '  <link rel="canonical" href="' + url + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="折角 Dogeared">',
      '  <meta property="og:title" content="' + esc(title) + '">',
      '  <meta property="og:description" content="' + esc(desc) + '">',
      '  <meta property="og:url" content="' + url + '">',
      '  <meta property="article:published_time" content="' + r.date + '">',
      '  <meta property="article:modified_time" content="' + reviewMod(r) + '">',
      '  <meta name="twitter:card" content="summary">',
      ldTag(ld),
      ldTag(crumbLd([['首頁', ''], ['心得', 'reviews.html'], [r.category, catHref(r.category)]]
        .concat(r.subcategory ? [[r.subcategory, catHref(r.category, r.subcategory)]] : [], [[seoH1(r), r.id + '.html']]))),
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="icon" href="assets/logo.svg" type="image/svg+xml">',
      ogImage(r),
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css?v=20261029b">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">折角<span>Dogeared</span><small>｜讀書心得與推薦</small></a>',
      '    ' + NAV,
      '  </div></header>',
      '  <main class="wrap narrow" id="review"' + (SPOILERS[r.id] ? ' data-spoiler="' + spoilerFile(r) + '" data-spoiler-title="' + esc(spoilerH1(r)) + '" data-spoiler-progress="' + esc(SPOILERS[r.id].progress || '') + '"' : '') + '>',
      '    ' + crumbOf(r),
      '    <header class="review-head">',
      '      ' + cover(r, 'lg'),
      '      <div><span class="tag">' + esc(r.category + (r.subcategory ? '・' + r.subcategory : '')) + '</span><h1>' + esc(seoH1(r)) + '</h1>',
      '      <p class="meta">' + esc(r.author) + '</p><p class="rating">' + seal(r.rating, 'lg') + '<span class="stars big" aria-hidden="true">' + stars(r.rating) + '</span></p>',
      '      <p class="meta">' + r.date + (seriesTag(r) ? ' · ' + esc(seriesTag(r)) : '') + '</p>',
      '      <p class="intro">' + esc(intro) + '</p>',
      '      <p class="lead">' + esc(r.summary) + '</p></div>',
      '    </header>',
      tocHtml(r.body) ? '    ' + tocHtml(r.body) : '',
      '    <article id="article">',
      bodyHtml(r.body).map(function (x) { return '      ' + x; }).join('\n'),
      '      <p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p>',
      '    </article>',
      seriesNav(r, byId) ? '    ' + seriesNav(r, byId) : '',
      spoilerCta(r),
      '    <section class="related"><h2>同類型心得</h2><ul>',
      rel.map(function (x) { return '      <li><a href="' + esc(x.id) + '.html">' + esc(seoH1(x)) + '</a>（' + esc(x.author) + '）</li>'; }).join('\n'),
      '    </ul></section>',
      listsOf(r).length ? '    <p class="meta in-lists">收錄在：' + listsOf(r).map(listLink).join('、') + '</p>' : '',
      '  </main>',
      FOOT
    ].join('\n');
  });

  /* 重雷心得頁：<id>-spoiler.html。版面跟心得頁一樣，開頭多一個劇透警告；結構化資料用 Article（評分只放在無雷心得的 Review，避免同一本書兩個評分） */
  REVIEWS.forEach(function (r) {
    var sp = SPOILERS[r.id];
    if (!sp) return;
    var file = spoilerFile(r), url = BASE + file, h1 = spoilerH1(r), title = spoilerTitle(r, sp);
    var desc = clip('《' + r.title + '》結局解析（含完整劇透）：' + sp.summary);
    var mins = Math.max(1, Math.round(sp.body.join('').length / 400));
    var others = REVIEWS.filter(function (x) { return x.id !== r.id && SPOILERS[x.id]; });
    others = others.filter(function (x) { return x.subcategory === r.subcategory; }).concat(others.filter(function (x) { return x.subcategory !== r.subcategory; })).slice(0, 4);
    var ld = { '@context': 'https://schema.org', '@type': 'Article', headline: h1, description: desc, url: url, mainEntityOfPage: url,
      datePublished: sp.date, dateModified: spoilerDate(sp), inLanguage: 'zh-Hant-TW', image: BASE + 'assets/og.png', articleSection: '重雷心得',
      about: { '@type': 'Book', name: r.title, author: { '@type': 'Person', name: r.author } },
      author: { '@type': 'Organization', name: '折角 Dogeared', url: BASE }, publisher: { '@type': 'Organization', name: '折角 Dogeared', url: BASE } };
    files[file] = [
      '<!doctype html>',
      '<html lang="zh-Hant-TW" data-page-type="spoiler" data-content-group="重雷心得" data-review-id="' + esc(r.id) + '">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">' + (ADS_META ? '\n' + ADS_META : ''),
      '  <title>' + esc(title) + '</title>',
      '  <meta name="description" content="' + esc(desc) + '">',
      '  <link rel="canonical" href="' + url + '">',
      '  <meta property="og:type" content="article">',
      '  <meta property="og:site_name" content="折角 Dogeared">',
      '  <meta property="og:title" content="' + esc(h1 + '（含劇透）') + '">',
      '  <meta property="og:description" content="' + esc('《' + r.title + '》的完整劇情、結局與伏筆解析。還沒讀完的話，先看無雷心得。') + '">',
      '  <meta property="og:url" content="' + url + '">',
      '  <meta property="article:published_time" content="' + sp.date + '">',
      '  <meta property="article:modified_time" content="' + spoilerDate(sp) + '">',
      '  <meta name="twitter:card" content="summary">',
      ldTag(ld),
      ldTag(crumbLd([['首頁', ''], ['心得', 'reviews.html'], [r.category, catHref(r.category)]]
        .concat(r.subcategory ? [[r.subcategory, catHref(r.category, r.subcategory)]] : [], [[seoH1(r), r.id + '.html'], ['結局解析', file]]))),
      '  <!-- 追蹤程式必須最先載入：Consent 預設值 → dataLayer 脈絡 → GTM -->',
      '  <script src="assets/analytics.js"></script>',
      '  <link rel="icon" href="assets/logo.svg" type="image/svg+xml">',
      ogImage(r),
      '  <link rel="preconnect" href="https://fonts.googleapis.com">',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">',
      '  <link rel="stylesheet" href="assets/style.css?v=20261029b">',
      '</head>',
      '<body>',
      '  <header class="site-header"><div class="wrap">',
      '    <a class="logo" href="index.html">折角<span>Dogeared</span><small>｜讀書心得與推薦</small></a>',
      '    ' + NAV,
      '  </div></header>',
      '  <main class="wrap narrow" id="spoiler">',
      '    ' + crumbOf(r).replace('</nav>', ' / <a href="' + esc(r.id) + '.html">《' + esc(r.title) + '》心得</a> / 結局解析</nav>'),
      '    <aside class="spoiler-warn" role="note"><b>這篇有完整劇透。</b>會直接講到結局、反轉和角色下場' + (sp.progress ? '，寫到' + esc(sp.progress) : '') + '。還沒讀的話，先看 <a href="' + esc(r.id) + '.html">無雷心得</a>。</aside>',
      '    <header class="review-head">',
      '      ' + cover(r, 'lg'),
      '      <div><span class="tag tag-spoiler">重雷心得</span><h1>' + esc(h1) + '</h1>',
      '      <p class="meta">' + esc(r.author) + '</p><p class="rating">' + seal(r.rating, 'lg') + '<span class="stars big" aria-hidden="true">' + stars(r.rating) + '</span></p>',
      '      <p class="meta">' + sp.date + (sp.updated && sp.updated !== sp.date ? '・更新 ' + sp.updated : '') + ' · 約 ' + mins + ' 分鐘閱讀</p>',
      '      <p class="lead">' + esc(sp.summary) + '</p></div>',
      '    </header>',
      tocHtml(sp.body) ? '    ' + tocHtml(sp.body) : '',
      '    <article id="article">',
      bodyHtml(sp.body).map(function (x) { return '      ' + x; }).join('\n'),
      '    </article>',
      '    <section class="related"><h2>繼續看</h2><ul>',
      '      <li><a href="' + esc(r.id) + '.html" data-id="' + esc(r.id) + '" data-list="spoiler_back" data-pos="1">' + esc(seoH1(r)) + '</a>（無雷，含評分與適合誰看）</li>',
      others.map(function (x, i) { return '      <li><a href="' + spoilerFile(x) + '" data-id="' + esc(x.id) + '" data-kind="spoiler" data-list="spoiler_related" data-pos="' + (i + 1) + '">' + esc(spoilerH1(x)) + '</a></li>'; }).join('\n'),
      '    </ul></section>',
      listsOf(r).length ? '    <p class="meta in-lists">收錄在：' + listsOf(r).map(listLink).join('、') + '</p>' : '',
      '  </main>',
      FOOT
    ].filter(function (x) { return x !== ''; }).join('\n');
  });

  /* 總表：全部的書一頁看完（書名、類型、評分、一句話），依評分排序 */
  var sorted = REVIEWS.map(function (r, i) { return { r: r, i: i }; })
    .sort(function (a, b) { return b.r.rating - a.r.rating || a.i - b.i; }).map(function (o) { return o.r; });
  files['books.html'] = shell({
    file: 'books.html', type: 'books', group: '總表',
    ld: [collectionLd('全部的書', 'books.html', '折角 Dogeared 讀過的 ' + REVIEWS.length + ' 本書總表，含類型、評分和一句話短評。',
      sorted.map(function (r) { return ['《' + r.title + '》', r.id + '.html']; })), crumbLd([['首頁', ''], ['全部的書', 'books.html']])],
    title: '全部的書：' + REVIEWS.length + ' 本讀書心得的評分與一句話短評',
    desc: '折角 Dogeared 讀過的 ' + REVIEWS.length + ' 本書總表，含類型、評分和一句話短評，點書名看完整心得。',
    main: [
      '    <h1>全部的書</h1>',
      '    <p class="meta">共 ' + REVIEWS.length + ' 本，依評分排序，滿分 5 顆星。點書名看完整心得。</p>',
      LISTS.length ? '    <p class="quick">書單：' + LISTS_NEW.slice(0, 8).map(listLink).join('') + (LISTS.length > 8 ? '<a href="lists.html">全部書單</a>' : '') + '</p>' : '',
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
      ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: l.title, description: l.description, url: BASE + l.id + '.html',
        mainEntityOfPage: BASE + l.id + '.html', datePublished: l.date, dateModified: listDate(l), inLanguage: 'zh-Hant-TW', image: BASE + 'assets/og.png',
        author: { '@type': 'Organization', name: '折角 Dogeared', url: BASE }, publisher: { '@type': 'Organization', name: '折角 Dogeared', url: BASE },
        mainEntity: itemListLd(l.sections.reduce(function (a, sec) { return a.concat(sec.items || []); }, []).map(function (it) {
          if (!it.id) return ['《' + it.title + '》', ''];   // 還沒寫心得的書：只列名稱，不連結
          var b = byId(it.id); return ['《' + (b ? b.title : it.id) + '》', it.id + '.html'];
        })) }, crumbLd([['首頁', ''], ['書單', 'lists.html'], [l.title, l.id + '.html']])],
      main: [
        '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="lists.html">書單</a></nav>',
        '    <h1>' + esc(l.title) + '</h1>',
        '    <p class="meta">' + l.date + (l.updated && l.updated !== l.date ? '・更新 ' + l.updated : '') + (l.type ? '・' + esc(l.type) : '') + '</p>',
        (l.intro || []).map(para).join('\n'),
        l.sections.map(function (s) {
          return (s.heading ? ['    <h2>' + esc(s.heading) + '</h2>'] : []).concat((s.paras || []).map(para), (s.items || []).map(function (it) {
            if (!it.id) {   // 還沒寫心得的書（title、author、rating 可省略、note）：不連結，有評分才顯示印章
              return '    <div class="pick pick-plain"><h3>《' + esc(it.title) + '》' + (it.rating ? ' ' + seal(it.rating, 'xs') : '') + '</h3>' +
                '<p class="meta">' + esc(it.author || '') + (it.tag ? ' · ' + esc(it.tag) : '') + '</p><p>' + esc(it.note) + '</p></div>';
            }
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
        LISTS_NEW.filter(function (x) { return x.id !== l.id && x.type && x.type === l.type; }).concat(LISTS_NEW.filter(function (x) { return x.id !== l.id && !(x.type && x.type === l.type); }))
          .slice(0, 6).map(function (x) { return '      <li>' + listLink(x) + '</li>'; }).join('\n'),
        LISTS.length > 7 ? '      <li><a href="lists.html">全部 ' + LISTS.length + ' 份書單</a></li>' : '',
        '      <li><a href="books.html">全部的書（總表）</a></li>',
        '    </ul></section>'
      ].join('\n')
    });
  });

  /* 分類頁與子分類頁：每個有心得的分類一頁，靜態輸出卡片 */
  var catPages = [];
  var cats = [], seen = {};
  REVIEWS.forEach(function (r) {
    if (!seen[r.category]) { seen[r.category] = { name: r.category, subs: [], subSeen: {} }; cats.push(seen[r.category]); }
    var c = seen[r.category];
    if (r.subcategory && !c.subSeen[r.subcategory]) { c.subSeen[r.subcategory] = 1; c.subs.push(r.subcategory); }
  });
  function buildCat(cat, sub, subs) {
    var rows = REVIEWS.filter(function (r) { return r.category === cat && (!sub || r.subcategory === sub); });
    var file = catHref(cat, sub), name = catName(cat, sub), slug = file.replace(/^cat-|\.html$/g, '');
    catPages.push(file);
    files[file] = shell({
      file: file, type: 'category', group: '分類', wide: true,
      ld: [collectionLd(name + '心得', file, '折角 Dogeared 的 ' + rows.length + ' 篇' + name + '心得與評價。',
        rows.map(function (r) { return [seoH1(r), r.id + '.html']; })),
        crumbLd([['首頁', ''], ['心得', 'reviews.html']].concat(sub ? [[cat, catHref(cat)]] : [], [[sub || cat, file]]))],
      title: name + '心得與評價：' + rows.length + ' 篇讀書心得',
      desc: '折角 Dogeared 的 ' + rows.length + ' 篇' + name + '心得與評價，每本附評分、一句話短評和完整心得。',
      main: [
        '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="reviews.html">心得</a>' + (sub ? ' / <a href="' + catHref(cat) + '">' + esc(cat) + '</a>' : '') + ' / ' + esc(sub || cat) + '</nav>',
        '    <h1>' + esc(name) + '心得</h1>',
        '    <p class="meta">共 ' + rows.length + ' 篇，滿分 5 顆星。</p>',
        subs && subs.length ? '    <p class="chips cat-links"><a class="chip active" href="' + file + '">全部</a>' + subs.map(function (s) {
          return '<a class="chip" href="' + catHref(cat, s) + '">' + esc(s) + '</a>';
        }).join('') + '</p>' : '',
        sub ? '    <p class="chips cat-links"><a class="chip" href="' + catHref(cat) + '">全部' + esc(cat) + '</a>' + seen[cat].subs.map(function (s) {
          return '<a class="chip' + (s === sub ? ' active' : '') + '" href="' + catHref(cat, s) + '">' + esc(s) + '</a>';
        }).join('') + '</p>' : '',
        '    <div class="rows">',
        rowList(rows, 'category_' + slug).map(function (x) { return '      ' + x; }).join('\n'),
        '    </div>'
      ].join('\n')
    });
  }
  cats.forEach(function (c) {
    buildCat(c.name, null, c.subs);
    c.subs.forEach(function (s) { buildCat(c.name, s); });
  });

  /* 書訊總覽頁與每則書訊頁（有書訊時才產生） */
  if (NEWS.length) {
    var typesLive = NEWS_TYPES.filter(function (t) { return NEWS.some(function (n) { return n.type === t; }); });
    var scopesLive = NEWS_SCOPES.filter(function (t) { return NEWS.some(function (n) { return n.scope === t; }); });
    files['news.html'] = shell({
      file: 'news.html', type: 'news', group: '書訊', wide: true,
      ld: [collectionLd('書訊', 'news.html', '折角 Dogeared 整理的 ' + NEWS.length + ' 則書訊：新聞、得獎、排行榜。',
        NEWS.map(function (n) { return [n.title, n.id + '.html']; })), crumbLd([['首頁', ''], ['書訊', 'news.html']])],
      title: '書訊：新聞、得獎與排行榜',
      desc: '折角 Dogeared 整理的 ' + NEWS.length + ' 則書訊：' + typesLive.join('、') + '，依發布日期由新到舊。',
      main: [
        '    <nav class="crumb"><a href="index.html">首頁</a> / 書訊</nav>',
        '    <h1>書訊</h1>',
        '    <p class="meta">共 ' + NEWS.length + ' 則。</p>',
        '    <div id="news-types" class="chips" role="group" aria-label="類型篩選"><button type="button" class="chip active" data-type="">全部 <small>' + NEWS.length + '</small></button>' +
          typesLive.map(function (t) { return '<button type="button" class="chip" data-type="' + t + '">' + t + ' <small>' + NEWS.filter(function (n) { return n.type === t; }).length + '</small></button>'; }).join('') + '</div>',
        scopesLive.length > 1 ? '    <div id="news-scopes" class="chips subchips" role="group" aria-label="範圍篩選"><button type="button" class="chip chip-sub active" data-scope="">全部範圍</button>' +
          scopesLive.map(function (t) { return '<button type="button" class="chip chip-sub" data-scope="' + t + '">' + t + '</button>'; }).join('') + '</div>' : '',
        '    <div id="news-list" class="rows">',
        NEWS.map(function (n, i) { return '      ' + newsRow(n, 'news_list', i + 1); }).join('\n'),
        '    </div>',
        '    <p id="news-empty" class="empty" hidden>這個條件下沒有書訊。</p>'
      ].join('\n')
    });
    NEWS.forEach(function (n, idx) {
      var file = n.id + '.html';
      var rel = (n.related || []).map(byId);
      var others = NEWS.filter(function (x) { return x.id !== n.id; }).slice(0, 4);
      files[file] = shell({
        file: file, type: 'news_article', group: '書訊',
        ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: n.title, description: n.summary, url: BASE + file, mainEntityOfPage: BASE + file,
          datePublished: n.date, inLanguage: 'zh-Hant-TW', image: BASE + 'assets/og.png', articleSection: n.type,
          author: { '@type': 'Organization', name: '折角 Dogeared', url: BASE }, publisher: { '@type': 'Organization', name: '折角 Dogeared', url: BASE } },
          crumbLd([['首頁', ''], ['書訊', 'news.html'], [n.title, file]])],
        title: n.title,
        desc: n.summary,
        main: [
          '    <nav class="crumb"><a href="index.html">首頁</a> / <a href="news.html">書訊</a> / ' + esc(n.type) + '</nav>',
          '    <article class="news-article" data-news-id="' + esc(n.id) + '">',
          '      <p class="news-meta"><span class="ntype ntype-' + NEWS_TYPE_KEY[n.type] + '">' + esc(n.type) + '</span><time datetime="' + n.date + '">' + n.date.replace(/-/g, '.') + '</time>' +
            [n.scope, n.source].filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p>',
          '      <h1>' + esc(n.title) + '</h1>',
          '      <p class="lead">' + esc(n.summary) + '</p>',
          bodyHtml(n.body || []).map(function (x) { return '      ' + x; }).join('\n'),
          n.url ? '      <p class="news-source">原始來源：<a href="' + esc(n.url) + '" target="_blank" rel="noopener nofollow">' + esc(n.source || n.url) + ' ↗</a></p>' : '',
          '    </article>',
          rel.length ? '    <section class="related"><h2>相關心得</h2><div class="rows">' + rowList(rel, 'news_related').join('') + '</div></section>' : '',
          others.length ? '    <section class="related"><h2>其他書訊</h2><div class="rows">' + others.map(function (x, i) { return newsRow(x, 'news_more', i + 1); }).join('') + '</div></section>' : ''
        ].filter(Boolean).join('\n')
      });
    });
  }

  /* 書單總覽頁：列出所有書單 */
  files['lists.html'] = shell({
    file: 'lists.html', type: 'lists', group: '書單',
    ld: [collectionLd('書單', 'lists.html', '折角 Dogeared 的 ' + LISTS.length + ' 份書單，把讀過的書依主題整理。',
      LISTS.map(function (l) { return [l.title, l.id + '.html']; })), crumbLd([['首頁', ''], ['書單', 'lists.html']])],
    title: '書單：依主題整理的讀書心得',
    desc: '折角 Dogeared 的 ' + LISTS.length + ' 份書單，把讀過的書依主題整理，每本附短評和完整心得連結。',
    main: [
      '    <h1>書單</h1>',
      '    <p class="meta">共 ' + LISTS.length + ' 份，把讀過的書依主題整理。</p>',
      LIST_TYPES.concat(['其他書單']).map(function (t) {
        var g = LISTS_NEW.filter(function (l) { return (LIST_TYPES.indexOf(l.type) < 0 ? '其他書單' : l.type) === t; });
        if (!g.length) return '';
        return '    <h2>' + esc(t) + '</h2>\n' + g.map(function (l) {
          var n = l.sections.reduce(function (a, s) { return a + (s.items || []).length; }, 0);
          return '    <a class="list-card" href="' + esc(l.id) + '.html"><b>' + esc(l.title) + '</b><span>' + esc(l.description) + '</span><small>' + n + ' 本 · ' + listDate(l) + '</small></a>';
        }).join('\n');
      }).filter(Boolean).join('\n')
    ].join('\n')
  });

  var urls = [{ loc: BASE, lastmod: TODAY }, { loc: BASE + 'about.html', lastmod: TODAY }]
    .concat([{ loc: BASE + 'reviews.html', lastmod: TODAY }, { loc: BASE + 'lists.html', lastmod: TODAY }, { loc: BASE + 'feedback.html', lastmod: TODAY }, { loc: BASE + 'resources.html', lastmod: TODAY }])
    .concat(catPages.map(function (f) { return { loc: BASE + f, lastmod: TODAY }; }))
    .concat(REVIEWS.map(function (r) { return { loc: BASE + r.id + '.html', lastmod: reviewMod(r) }; }))
    .concat(REVIEWS.filter(function (r) { return SPOILERS[r.id]; }).map(function (r) { return { loc: BASE + spoilerFile(r), lastmod: spoilerDate(SPOILERS[r.id]) }; }))
    .concat([{ loc: BASE + 'books.html', lastmod: TODAY }])
    .concat(LISTS.map(function (l) { return { loc: BASE + l.id + '.html', lastmod: listDate(l) }; }))
    .concat(NEWS.length ? [{ loc: BASE + 'news.html', lastmod: TODAY }] : [])
    .concat(NEWS.map(function (n) { return { loc: BASE + n.id + '.html', lastmod: n.date }; }));
  files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(function (u) { return '  <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod></url>'; }).join('\n') +
    '\n</urlset>\n';
  /* robots.txt：自訂網域後 repo 根目錄就是網域根目錄。全部允許抓取（noindex 的頁面要讓 Google 抓得到才看得到 noindex），只宣告 sitemap 位置 */
  if (ADSENSE_PUB) files['ads.txt'] = 'google.com, ' + ADSENSE_PUB.replace(/^ca-/, '') + ', DIRECT, f08c47fec0942fa0\n';
  files['robots.txt'] = 'User-agent: *\nAllow: /\n\nSitemap: ' + BASE + 'sitemap.xml\n';
  /* 手寫頁（清單在最下面的 buildSite.HAND_PAGES）：傳入 opts.pages = { 檔名: 原始碼 } 時，把導覽列下拉選單與頁尾網站地圖寫進 HTML、
   * app.js 的版本參數換成 APP_VER 後一起輸出；首頁另外寫入篇數（data-count）、最新 6 篇與書單卡片。
   * 這樣不跑 JS 的爬蟲也讀得到這些連結；app.js 看到頁面上已經有就不再重畫。同一頁重複處理結果不變。
   * Node 的 run.js 與後台 admin.html 都會傳。opts.indexHtml 是舊寫法，等同 pages['index.html']。 */
  var PAGES = {};
  Object.keys((opts && opts.pages) || {}).forEach(function (name) { PAGES[name] = opts.pages[name]; });
  if (opts && opts.indexHtml) PAGES['index.html'] = opts.indexHtml;
  function need(ok, name, what) { if (!ok) throw new Error(name + ' 找不到' + what + '，沒有產生任何檔案。'); }
  function fill(src, name, id, rows) {   // 把 <div id="..."> 的內容換成 rows，一列一行
    var re = new RegExp('(<div id="' + id + '"[^>]*>)[\\s\\S]*?(</div>\\s*</section>)');
    need(re.test(src), name, ' #' + id);
    return src.replace(re, function (m, open, close) { return open + '\n' + rows.map(function (x) { return '        ' + x + '\n'; }).join('') + '      ' + close; });
  }
  Object.keys(PAGES).forEach(function (name) {
    var s = PAGES[name];
    need(/<nav>[\s\S]*?<\/nav>/.test(s), name, '導覽列 <nav>');
    s = s.replace(/<nav>[\s\S]*?<\/nav>/, function () { return NAV; });
    s = s.replace(/[ \t]*<nav class="sitemap"[^>]*>[\s\S]*?<\/nav>\n?/, '');
    need(/^[ \t]*<p class="copyright">/m.test(s), name, '頁尾的 <p class="copyright">');
    s = s.replace(/^([ \t]*)(<p class="copyright">)/m, function (m, sp, p) { return sp + SITEMAP + '\n' + sp + p; });
    s = s.replace(/assets\/app\.js\?v=\w+/g, 'assets/app.js?v=' + APP_VER);
    s = s.replace(/[ \t]*<meta name="google-adsense-account"[^>]*>\n?/g, '');
    if (ADS_META) {
      need(/^[ \t]*<meta name="viewport"[^>]*>$/m.test(s), name, ' <meta name="viewport">');
      s = s.replace(/^([ \t]*<meta name="viewport"[^>]*>)$/m, function (m) { return m + '\n' + ADS_META; });
    }
    if (name === 'index.html') {
      s = s.replace(/(data-count="([^"]+)">)[^<]*/g, function (m, head, key) {
        return head + (key === 'reviews' ? REVIEWS.length : key === 'lists' ? LISTS.length :
          key.indexOf('cat:') === 0 ? REVIEWS.filter(function (r) { return r.category === key.slice(4); }).length : m.slice(head.length));
      });
      s = fill(s, name, 'home-latest', rowList(REVIEWS.slice(0, 8), 'home_latest'));
      need(/<section class="start" id="home-news-sec"[^>]*>/.test(s), name, '書訊區塊 #home-news-sec');
      s = s.replace(/<section class="start" id="home-news-sec"[^>]*>/, '<section class="start" id="home-news-sec" aria-labelledby="news-h"' + (NEWS.length ? '' : ' hidden') + '>');
      // 沒有書訊時，「看全部書訊」不留 href：區塊雖然 hidden，Google 仍會抓到連結，news.html 不存在會被報 404
      s = s.replace(/<a class="more"[^>]*>看全部書訊<\/a>/, NEWS.length ? '<a class="more" href="news.html">看全部書訊</a>' : '<a class="more">看全部書訊</a>');
      s = fill(s, name, 'home-news', NEWS.slice(0, 4).map(function (n, i) { return newsRow(n, 'home_news', i + 1); }));
      s = fill(s, name, 'home-lists', LISTS_NEW.slice(0, 6).map(function (l) {
        var n = l.sections.reduce(function (a, x) { return a + (x.items || []).length; }, 0);
        return '<a class="list-card" href="' + esc(l.id) + '.html"><b>' + esc(l.title) + '</b><small>' + n + ' 本 · ' + esc(listDate(l)) + '</small></a>';
      }));
    }
    files[name] = s;
  });
  return files;
}
/* 要經過 build 的手寫頁；run.js 與後台都依這份清單讀檔 */
buildSite.HAND_PAGES = ['index.html', 'reviews.html', 'about.html', 'feedback.html', 'review.html', 'resources.html'];
if (typeof module !== 'undefined') module.exports = buildSite;
