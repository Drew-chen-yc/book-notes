/* app.js — 頁面渲染與互動，所有追蹤都呼叫 BN.track() */
(function () {
  'use strict';
  var track = window.BN.track;
  var REVIEWS = window.REVIEWS || [];
  var page = document.documentElement.getAttribute('data-page-type');

  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 內文段落：「## 」開頭是小標題、「### 」是次標題、連續的「- 」是條列，其餘是一般段落 */
  function bodyHtml(body) {   // ## 小標題帶 id="s-N"，給目錄跳轉
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
  function SERIES_DATA() { return window.SERIES || []; }
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

  /* 評分可以是 4.5 這種半顆星 */
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
  /* 這篇心得被哪些書單收錄（書單資料在 data/reviews.js 的 window.LISTS） */
  function inLists(r) {
    var ls = (window.LISTS || []).filter(function (l) { return l.sections.some(function (s) { return (s.items || []).some(function (it) { return it.id === r.id; }); }); });
    return !ls.length ? '' : '<p class="meta in-lists">收錄在：' + ls.map(function (l) { return '<a href="' + esc(l.id) + '.html">' + esc(l.title) + '</a>'; }).join('、') + '</p>';
  }
  /* 圖示：Lucide（ISC 授權）。全站不使用 emoji */
  var ICO_HEART = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /></svg>', ICO_HEART_ON = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" /></svg>', ICO_CHECK = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  function likeLabel(on) { return (on ? ICO_HEART_ON + ' 已收藏' : ICO_HEART + ' 收藏這篇'); }
  function stars(n) { var f = Math.floor(n), h = n > f ? 1 : 0; return '★★★★★'.slice(0, f) + (h ? '<span class="star-half">☆</span>' : '') + '☆☆☆☆☆'.slice(0, 5 - f - h); }
  function readMinutes(r) { return Math.max(1, Math.round(r.body.join('').length / 400)); }
  function reviewParams(r) {
    var p = { review_id: r.id, book_title: r.title, book_author: r.author, book_category: r.category, rating: r.rating };
    if (r.subcategory) p.book_subcategory = r.subcategory;
    return p;
  }
  /* 分類頁網址：cat-<分類>.html、cat-<分類>-<子分類>.html（build/seo-build.js 與 assets/app.js 各有一份，要同步） */
  var CAT_SLUG = { '小說': 'novel', '自我成長': 'self-growth', '心理學': 'psychology', '人文社科': 'humanities', '歷史': 'history', '投資理財': 'investing' };
  var SUB_SLUG = { '仙俠': 'xianxia', '玄幻': 'xuanhuan', '奇幻': 'fantasy', '科幻': 'scifi', '推理': 'mystery', '懸疑': 'suspense', '文學': 'literary', '歷史': 'historical', '愛情': 'romance', '翻譯': 'translated', '其他': 'other' };
  function catHref(cat, sub) { return 'cat-' + CAT_SLUG[cat] + (sub ? '-' + SUB_SLUG[sub] : '') + '.html'; }
  function catName(cat, sub) { return sub ? sub + cat : cat; }
  function countOf(cat, sub) { return REVIEWS.filter(function (r) { return r.category === cat && (!sub || r.subcategory === sub); }).length; }
  function liveCats() { return (window.CATEGORIES || []).filter(function (c) { return countOf(c) > 0; }).sort(function (x, y) { return countOf(y) - countOf(x); }); }   // 篇數多的排前面
  function liveSubs(cat) { return ((window.SUBCATEGORIES || {})[cat] || []).filter(function (x) { return countOf(cat, x) > 0; }); }
  /* 分類顯示：有子分類時顯示「小說・仙俠」 */
  var SUBS = window.SUBCATEGORIES || {};
  /* 搜尋用：分類選單的選項（value = 「分類」或「分類|子分類」）與關鍵字比對（空白分隔的每個詞都要出現） */
  function catOptions(selected) {
    return '<option value="">全部分類</option>' + liveCats().map(function (c) {
      return '<option value="' + esc(c) + '"' + (selected === c ? ' selected' : '') + '>' + esc(c) + '（' + countOf(c) + '）</option>' + liveSubs(c).map(function (x) {
        var v = c + '|' + x;
        return '<option value="' + esc(v) + '"' + (selected === v ? ' selected' : '') + '>　' + esc(c) + '・' + esc(x) + '（' + countOf(c, x) + '）</option>';
      }).join('');
    }).join('');
  }
  function norm(t) { return String(t || '').toLowerCase().replace(/[\uff01-\uff5e]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); }).replace(/\s+/g, ' '); }
  function matchAll(hay, q) { hay = norm(hay); return norm(q).split(' ').filter(Boolean).every(function (w) { return hay.indexOf(w) > -1; }); }
  function catLabel(r) { return r.category + (r.subcategory ? '・' + r.subcategory : ''); }
  /* 搜尋字若含 Email 或電話樣式，送進 GA 前先遮蔽（Google 政策禁止把個資送進 GA） */
  function redactPII(t) {
    return String(t).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[redacted]').replace(/\+?\d[\d\s-]{7,}\d/g, '[redacted]');
  }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* 心得頁網址：正式站每篇一個靜態頁 <id>.html（SEO 用）；預覽環境可設 BN_LINK_MODE='hash' 改用 #id */
  function reviewHref(id) {
    return window.BN_LINK_MODE === 'hash' ? 'review.html#' + id : id + '.html';
  }
  function currentReviewId() {
    return document.documentElement.getAttribute('data-review-id') ||
      new URLSearchParams(location.search).get('id') || location.hash.replace('#', '') || null;
  }

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
  /* 心得清單的一列（與 build/seo-build.js 的 rowItem 相同）：同一天的第二列起日期淡出 */
  function row(r, listName, pos, sameDay) {
    return '<a class="row' + (sameDay ? ' same-day' : '') + '" href="' + reviewHref(r.id) + '" data-id="' + r.id + '" data-list="' + listName + '" data-pos="' + pos + '">' +
      '<time class="row-date" datetime="' + r.date + '">' + r.date.replace(/-/g, '.') + '</time>' +
      '<span class="row-main"><span class="row-title">' + esc(r.title) + '</span><span class="row-sub">' + esc(r.author) + '<span class="tag">' + esc(catLabel(r)) + '</span></span>' +
      '<span class="row-sum">' + esc(r.summary) + '</span></span>' + seal(r.rating, 'xs') + '</a>';
  }
  function rowList(list, listName, start) {
    start = start || 0;
    return list.map(function (r, i) { return row(r, listName, start + i + 1, i > 0 && list[i - 1].date === r.date); }).join('');
  }

  /* 列表點擊 → select_content（GA4 建議事件） */
  function bindCardClicks(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-list]');
      if (!a) return;
      if (a.dataset.kind === 'list') {   // 搜尋結果裡的書單
        track('select_content', { content_type: 'list', content_id: a.dataset.id, list_name: a.dataset.list, list_position: Number(a.dataset.pos) });
        return;
      }
      if (a.dataset.kind === 'news') {   // 書訊列：content_type = news，另帶 news_type
        track('select_content', { content_type: 'news', content_id: a.dataset.id, list_name: a.dataset.list,
          list_position: Number(a.dataset.pos), news_type: a.dataset.type });
        return;
      }
      var r = REVIEWS.find(function (x) { return x.id === a.dataset.id; });
      track('select_content', Object.assign({ content_type: a.dataset.kind === 'spoiler' ? 'spoiler' : 'review', content_id: a.dataset.id,
        list_name: a.dataset.list, list_position: Number(a.dataset.pos) }, r ? { book_category: r.category } : {}));
    });
  }

  /* ================= 首頁：導覽用，只放最新 6 篇與書單 =================
   * 最新 6 篇與書單卡片已由 build/seo-build.js 寫進 index.html（搜尋引擎不跑程式也讀得到）。
   * 這裡只在頁面上還沒有內容時才畫（舊版頁面的備援），或預覽環境改用 #id 連結時重畫。 */
  /* 書單依更新日（updated，沒有就用 date）由新到舊；和 build/seo-build.js 的 LISTS_NEW 一致 */
  function newestLists() {
    var d = function (l) { return l.updated || l.date; };
    return (window.LISTS || []).slice().sort(function (x, y) { return d(x) < d(y) ? 1 : d(x) > d(y) ? -1 : 0; });
  }
  function initHome() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var k = el.dataset.count;
      el.textContent = k === 'lists' ? (window.LISTS || []).length :
        k.indexOf('cat:') === 0 ? REVIEWS.filter(function (r) { return r.category === k.slice(4); }).length : REVIEWS.length;
    });
    var redraw = window.BN_LINK_MODE === 'hash';
    var latest = $('#home-latest');
    if (latest) {
      if (redraw || !latest.children.length) latest.innerHTML = rowList(REVIEWS.slice(0, 8), 'home_latest');
      bindCardClicks(latest);
    }
    var hl = $('#home-lists');
    if (hl && (redraw || !hl.children.length)) {
      hl.innerHTML = newestLists().slice(0, 6).map(function (l) {
        var n = l.sections.reduce(function (a, x) { return a + (x.items || []).length; }, 0);
        return '<a class="list-card" href="' + esc(l.id) + '.html"><b>' + esc(l.title) + '</b><small>' + n + ' 本 · ' + esc(l.date) + '</small></a>';
      }).join('');
    }
  }

  /* ================= 心得列表頁：搜尋、分類、分頁 ================= */
  var PER_PAGE = 20;
  function initReviewsList() {
    var list = $('#review-list'), empty = $('#empty'), input = $('#search'), chips = $('#chips');
    var state = { q: '', cat: '全部', sub: '全部', page: Math.max(1, parseInt(new URLSearchParams(location.search).get('page'), 10) || 1) };
    var pager = $('#pager');
    var subchips = document.createElement('div');
    subchips.id = 'subchips'; subchips.className = 'chips subchips'; subchips.hidden = true;
    subchips.setAttribute('role', 'group'); subchips.setAttribute('aria-label', '子分類篩選');
    chips.parentNode.insertBefore(subchips, chips.nextSibling);

    /* 分類選單（和搜尋框同一排）：跟下面的分類標籤同步 */
    var sel = $('#search-cat'), count = $('#result-count'), listHits = $('#list-hits');
    function syncSel() { if (sel) sel.value = state.cat === '全部' ? '' : state.cat + (state.sub !== '全部' ? '|' + state.sub : ''); }
    if (sel) {
      sel.innerHTML = catOptions('');
      sel.addEventListener('change', function () {
        var v = sel.value.split('|');
        state.cat = v[0] || '全部'; state.sub = v[1] || '全部'; state.page = 1;
        chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c.dataset.cat === state.cat); });
        renderSubchips();
        var n = render();
        track('filter_category', Object.assign({ book_category: state.cat, results_count: n }, state.sub !== '全部' ? { book_subcategory: state.sub } : {}));
      });
    }
    chips.innerHTML = ['全部'].concat(liveCats()).map(function (c) {
      return '<button type="button" class="chip' + (c === '全部' ? ' active' : '') + '" data-cat="' + c + '">' + c + ' <small>' + (c === '全部' ? REVIEWS.length : countOf(c)) + '</small></button>';
    }).join('');

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return REVIEWS.filter(function (r) {
        var okCat = state.cat === '全部' || r.category === state.cat;
        var okSub = state.sub === '全部' || r.subcategory === state.sub;
        var hay = [r.title, r.author, r.category, r.subcategory || '', r.summary, r.tags.join(' ')].join(' ');
        return okCat && okSub && (!q || matchAll(hay, q));
      });
    }
    function render() {
      var rows = filtered();
      syncSel();
      var label = (state.cat === '全部' ? '' : state.cat + (state.sub !== '全部' ? '・' + state.sub : ''));
      if (count) {
        count.hidden = !(state.q.trim() || label);
        count.textContent = (label ? label + ' ' : '') + (state.q.trim() ? '「' + state.q.trim() + '」' : '') + '找到 ' + rows.length + ' 篇';
      }
      if (listHits) {   // 關鍵字也比對書單標題與說明
        var hits = !state.q.trim() ? [] : (window.LISTS || []).filter(function (l) { return matchAll(l.title + ' ' + (l.description || ''), state.q); }).slice(0, 4);
        listHits.hidden = !hits.length;
        listHits.innerHTML = hits.length ? '<b>相關書單</b>' + hits.map(function (l, i) {
          return '<a href="' + esc(l.id) + '.html" data-id="' + esc(l.id) + '" data-kind="list" data-list="search_lists" data-pos="' + (i + 1) + '">' + esc(l.title) + '</a>';
        }).join('') : '';
      }
      var pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      state.page = Math.min(state.page, pages);
      var start = (state.page - 1) * PER_PAGE;
      list.innerHTML = rowList(rows.slice(start, start + PER_PAGE), 'reviews_list', start);
      empty.hidden = rows.length > 0;
      pager.hidden = pages < 2;
      pager.innerHTML = pages < 2 ? '' :
        '<button type="button" class="pg" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>上一頁</button>' +
        Array.apply(null, Array(pages)).map(function (_, i) {
          return '<button type="button" class="pg' + (i + 1 === state.page ? ' active' : '') + '" data-page="' + (i + 1) + '"' + (i + 1 === state.page ? ' aria-current="page"' : '') + '>' + (i + 1) + '</button>';
        }).join('') +
        '<button type="button" class="pg" data-page="' + (state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + '>下一頁</button>';
      var u = new URL(location.href);   // 網址的 ?page= 跟著目前頁數走，重新整理或分享都停在同一頁
      if (state.page > 1) u.searchParams.set('page', state.page); else u.searchParams.delete('page');
      if (u.href !== location.href) history.replaceState(null, '', u);
      return rows.length;
    }
    render();
    bindCardClicks(list);
    if (listHits) bindCardClicks(listHits);
    if (location.hash === '#search') setTimeout(function () { input.focus(); }, 50);
    pager.addEventListener('click', function (e) {
      var b = e.target.closest('.pg');
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      render();
      $('#list-top').scrollIntoView({ block: 'start' });
    });

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      state.cat = b.dataset.cat; state.sub = '全部'; if (!b.dataset.silent) state.page = 1;
      chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === b); });
      renderSubchips();
      var n = render();
      if (b.dataset.silent) { delete b.dataset.silent; return; }   // 網址帶入的不算使用者操作
      track('filter_category', { book_category: state.cat, results_count: n });
    });

    /* 子分類：選到有子分類的分類（例如小說）時，才出現第二排標籤 */
    function renderSubchips() {
      var subs = SUBS[state.cat] && liveSubs(state.cat);
      subchips.hidden = !subs;
      subchips.innerHTML = !subs ? '' : ['全部'].concat(subs).map(function (s) {
        return '<button type="button" class="chip chip-sub' + (s === state.sub ? ' active' : '') + '" data-sub="' + s + '">' + s + (s === '全部' ? '' : ' <small>' + countOf(state.cat, s) + '</small>') + '</button>';
      }).join('');
    }
    subchips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      var silent = !!b.dataset.silent;
      state.sub = b.dataset.sub; if (!silent) state.page = 1;
      renderSubchips();
      var n = render();
      if (silent) return;
      track('filter_category', { book_category: state.cat, book_subcategory: state.sub, results_count: n });
    });

    /* 搜尋：停止輸入 1 秒後才送，避免每個字都送一次 */
    var timer, lastSent = '';
    input.addEventListener('input', function () {
      state.q = input.value; state.page = 1;
      var n = render();
      clearTimeout(timer);
      timer = setTimeout(function () {
        var term = input.value.trim();
        if (term.length >= 2 && term !== lastSent) {
          lastSent = term;
          track('search', Object.assign({ search_term: redactPII(term), results_count: filtered().length, book_category: state.cat }, state.sub !== '全部' ? { book_subcategory: state.sub } : {}));
        }
      }, 1000);
    });

    // 支援 ?q= 帶入（GA4 站內搜尋也可直接讀這個參數）
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; input.dispatchEvent(new Event('input')); }
  }

  /* ================= 重雷心得頁（<id>-spoiler.html，靜態，不重畫） =================
   * 沿用心得頁的 view_review／review_scroll／read_complete，報表用 page_type = spoiler（content_group = 重雷心得）區分，不用改 GTM。 */
  function initSpoiler() {
    var id = document.documentElement.getAttribute('data-review-id');
    var r = REVIEWS.find(function (x) { return x.id === id; });
    if (!r) return;
    track('view_review', reviewParams(r));
    window.BN.trackReading($('#article'), { review_id: r.id, book_category: r.category }, { minSeconds: 60 });
    bindCardClicks($('main'));
    readProgress($('#article'));
  }

  /* 閱讀進度條：頁面最上面一條細線，跟著文章捲動的比例變長 */
  function readProgress(article) {
    if (!article) return;
    var bar = document.querySelector('.read-progress span');
    if (!bar) {
      var wrap = document.createElement('div'); wrap.className = 'read-progress'; wrap.setAttribute('aria-hidden', 'true');
      wrap.appendChild(bar = document.createElement('span')); document.body.appendChild(wrap);
    }
    var ticking = false;
    function update() {
      ticking = false;
      var r = article.getBoundingClientRect(), total = r.height - window.innerHeight * 0.6;
      var pct = total <= 0 ? 100 : Math.min(100, Math.max(0, (-r.top + window.innerHeight * 0.2) / total * 100));
      bar.style.width = pct.toFixed(1) + '%';
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ================= 心得頁 ================= */
  function initReview() {
    var id = currentReviewId();
    var r = REVIEWS.find(function (x) { return x.id === id; });
    var main = $('#review');
    // 重雷心得的連結：build 只在有寫重雷心得的書加 data-spoiler，下面重畫內容時要放回去
    var sp = main.dataset.spoiler ? { file: main.dataset.spoiler, title: main.dataset.spoilerTitle || '', progress: main.dataset.spoilerProgress || '' } : null;
    if (!r) {
      main.innerHTML = '<h1>找不到這篇心得</h1><p><a href="index.html">回首頁</a></p>';
      track('review_not_found', { review_id: id || '(empty)' });
      return;
    }
    document.title = seoTitle(r);
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', seoIntro(r) + r.summary);

    var base = reviewParams(r);
    var liked = safeGet('bn_like_' + r.id) === '1';

    main.innerHTML =
      '<nav class="crumb"><a href="index.html">首頁</a> / <a href="reviews.html">心得</a> / <a href="' + catHref(r.category) + '">' + esc(r.category) + '</a>' +
      (r.subcategory ? ' / <a href="' + catHref(r.category, r.subcategory) + '">' + esc(r.subcategory) + '</a>' : '') + '</nav>' +
      '<header class="review-head">' + cover(r, 'lg') +
      '<div><span class="tag">' + esc(catLabel(r)) + '</span><h1>' + esc(seoH1(r)) + '</h1>' +
      '<p class="meta">' + esc(r.author) + '</p><p class="rating">' + seal(r.rating, 'lg') + '<span class="stars big" aria-hidden="true">' + stars(r.rating) + '</span></p>' +
      '<p class="meta">' + r.date + ' · 約 ' + readMinutes(r) + ' 分鐘閱讀' + (seriesTag(r) ? ' · ' + esc(seriesTag(r)) : '') + '</p>' +
      '<p class="intro">' + esc(seoIntro(r)) + '</p>' +
      '<p class="lead">' + esc(r.summary) + '</p></div></header>' +
      tocHtml(r.body) +
      '<article id="article">' + bodyHtml(r.body).join('') +
      '<p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p></article>' +
      seriesNav(r, function (id) { return REVIEWS.find(function (x) { return x.id === id; }); }) +
      (sp ? '<section class="spoiler-cta" aria-labelledby="spoiler-h"><h2 id="spoiler-h">讀完了？看重雷心得</h2>' +
        '<p>無雷心得只能講到這裡。結局、伏筆和我真正想聊的部分，寫在重雷心得：</p>' +
        '<p><a class="spoiler-link" href="' + esc(sp.file) + '" data-id="' + esc(r.id) + '" data-kind="spoiler" data-list="review_spoiler_cta" data-pos="1">' + esc(sp.title) + '</a></p>' +
        '<p class="meta">內含完整劇情與結局。' + (sp.progress ? '寫到' + esc(sp.progress) + '。' : '') + '</p></section>' : '') +
      '<section class="actions" aria-label="互動">' +
      '<button type="button" id="like" class="btn btn-ghost" aria-pressed="' + liked + '">' + likeLabel(liked) + '</button>' +
      '<span class="share-label">分享：</span>' +
      '<button type="button" class="btn btn-ghost" data-share="line">LINE</button>' +
      '<button type="button" class="btn btn-ghost" data-share="facebook">Facebook</button>' +
      '<button type="button" class="btn btn-ghost" data-share="copy_link">複製連結</button></section>' +
      '<section class="buy"><h2>想讀這本書？</h2><div class="buy-links">' +
      window.STORES.map(function (s) {
        return '<a class="btn" target="_blank" rel="noopener" data-store="' + s.key + '" href="' + s.url(r) + '">到' + s.name + '看看 ↗</a>';
      }).join('') + '</div></section>' +
      '<section class="related"><h2>同類型心得</h2><div id="related" class="rows"></div></section>' + inLists(r);

    track('view_review', base);
    window.BN.bumpProfile('view', r.category);
    window.BN.trackReading($('#article'), { review_id: r.id, book_category: r.category }, { minSeconds: 30 });

    /* 收藏 */
    $('#like').addEventListener('click', function () {
      liked = !liked;
      safeSet('bn_like_' + r.id, liked ? '1' : '0');
      this.setAttribute('aria-pressed', liked);
      this.innerHTML = likeLabel(liked);
      track('like_review', Object.assign({}, base, { like_action: liked ? 'like' : 'unlike' }));
    });

    /* 分享（GA4 建議事件 share） */
    var shareUrl = location.origin + location.pathname.replace(/[^/]*$/, '') + r.id + '.html' +
      '?utm_source=share&utm_medium=social&utm_campaign=review_share';
    main.addEventListener('click', function (e) {
      var b = e.target.closest('[data-share]');
      if (!b) return;
      var method = b.dataset.share;
      track('share', { method: method, content_type: 'review', item_id: r.id, book_category: r.category });
      var u = encodeURIComponent(shareUrl.replace('utm_source=share', 'utm_source=' + method));
      if (method === 'line') window.open('https://social-plugins.line.me/lineit/share?url=' + u, '_blank', 'noopener');
      if (method === 'facebook') window.open('https://www.facebook.com/sharer/sharer.php?u=' + u, '_blank', 'noopener');
      if (method === 'copy_link') {
        var done = function () { b.innerHTML = '已複製 ' + ICO_CHECK; setTimeout(function () { b.textContent = '複製連結'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(decodeURIComponent(u)).then(done, done); else done();
      }
    });

    /* 購書點擊：高意圖，設為 GA4 關鍵事件，也是廣告轉換 */
    main.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-store]');
      if (!a) return;
      track('click_buy_book', Object.assign({}, base, { store: a.dataset.store, link_url: a.href }));
    });

    if (sp) bindCardClicks(main.querySelector('.spoiler-cta'));
    if (main.querySelector('.series-nav')) bindCardClicks(main.querySelector('.series-nav'));
    readProgress($('#article'));

    /* 相關推薦 */
    var rel = relatedOf(r, REVIEWS, 4);
    var relBox = $('#related');
    relBox.innerHTML = rel.map(function (x, i) { return row(x, 'review_related', i + 1, false); }).join('');
    bindCardClicks(relBox);
  }

  /* ================= 電子報（2026-10-29 停辦） =================
   * 訂閱表單已從全站拿掉；這張 Google 表單只留給關於頁「刪除先前的訂閱資料」使用。Email 絕不送進 GA。 */
  var NEWSLETTER = {
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSeZIZwdwvDil4ZJNt87a8bcVeVZix9YbsOLa1wJ2yg1qv0HuQ/formResponse',
    email: 'entry.1091954786', interest: 'entry.733728389', action: 'entry.618872592', source: 'entry.833493817'
  };
  function sendToForm(email, interest, action) {
    var body = new URLSearchParams();
    body.append(NEWSLETTER.email, email);
    body.append(NEWSLETTER.interest, interest);
    body.append(NEWSLETTER.action, action);
    body.append(NEWSLETTER.source, page || 'other');
    // Google 表單不回傳跨網域結果（no-cors），送得出去就視為成功；斷線才會進 catch
    return fetch(NEWSLETTER.url, { method: 'POST', mode: 'no-cors', body: body });
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254; }

  /* ================= 回饋表單（feedback.html） =================
   * 內容送到站長的另一張 Google 表單，GA 只記「有人送出、哪一種」，不含任何留言內容。 */
  var FEEDBACK = {
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSd3ak-caP-oa58mzXcgZ3FTmRZLhFqs-YKPsgIh9bhX22UzqQ/formResponse',
    type: 'entry.1712395485', book: 'entry.1969115601', author: 'entry.1325602357', message: 'entry.2000198279',
    name: 'entry.1055032485', email: 'entry.1077421570', source: 'entry.1043682175'
  };
  function initFeedback() {
    var f = $('#feedback');
    if (!f) return;
    var msg = f.querySelector('.form-msg'), started = false, sending = false;
    var LABEL = { '推薦好書': '為什麼推薦', '網站意見': '想說的話', '內容更正': '哪一篇、哪裡有誤' };
    function curType() { return f.querySelector('input[name=type]:checked').value; }
    function syncType() {
      var t = curType();
      f.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.dataset.for !== t; });
      $('#fb-msg-label').textContent = LABEL[t];
    }
    f.querySelectorAll('input[name=type]').forEach(function (r) { r.addEventListener('change', syncType); });
    var pre = new URLSearchParams(location.search).get('type');   // 例：feedback.html?type=內容更正
    if (pre) { var el = Array.prototype.filter.call(f.querySelectorAll('input[name=type]'), function (r) { return r.value === pre; })[0]; if (el) el.checked = true; }
    syncType();
    f.message.addEventListener('input', function () { $('#fb-n').textContent = f.message.value.length; });
    var trap = document.createElement('input');
    trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1; trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true'); trap.className = 'sr-only';
    f.appendChild(trap);
    f.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('feedback_start', { form_location: 'feedback' });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      var t = curType(), text = f.message.value.trim(), email = f.email.value.trim();
      var err = t === '推薦好書' && !f.book.value.trim() ? '請填書名' : text.length < 5 ? '內容太短，請多寫幾個字' : email && !validEmail(email) ? 'Email 格式不正確' : '';
      if (err) { msg.textContent = err; track('feedback_error', { form_location: 'feedback', error_type: 'validation' }); return; }
      var done = function () {
        track('submit_feedback', { form_location: 'feedback', feedback_type: t, has_email: email ? 'yes' : 'no' });
        f.innerHTML = '<p class="form-msg ok">已送出，謝謝你。</p><p><a class="more" href="reviews.html">回心得列表</a></p>';
      };
      if (trap.value) { done(); return; }
      if (!FEEDBACK.url) { msg.textContent = '回饋表單尚未開放。'; return; }
      var body = new URLSearchParams();
      body.append(FEEDBACK.type, t); body.append(FEEDBACK.book, f.book.value.trim()); body.append(FEEDBACK.author, f.author.value.trim());
      body.append(FEEDBACK.message, text); body.append(FEEDBACK.name, f.name.value.trim()); body.append(FEEDBACK.email, email);
      body.append(FEEDBACK.source, document.referrer ? document.referrer.replace(/^https?:\/\/[^/]+/, '').slice(0, 120) : '');
      var btn = f.querySelector('button[type=submit]');
      sending = true; btn.disabled = true; msg.textContent = '送出中…';
      fetch(FEEDBACK.url, { method: 'POST', mode: 'no-cors', body: body }).then(done).catch(function () {
        sending = false; btn.disabled = false;
        msg.textContent = '送出失敗，請檢查網路後再試一次。';
        track('feedback_error', { form_location: 'feedback', error_type: 'network' });
      });
    });
  }

  /* 取消訂閱（關於頁） */
  function initUnsubscribe() {
    var f = $('#unsubscribe');
    if (!f) return;
    var msg = f.querySelector('.form-msg');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = f.email.value.trim();
      if (!validEmail(email)) { msg.textContent = 'Email 格式不正確'; return; }
      msg.textContent = '送出中…';
      sendToForm(email, '', '取消訂閱').then(function () {
        f.innerHTML = '<p class="form-msg ok">已收到，我們會在 7 天內刪除這個 Email。</p>';
      }).catch(function () { msg.textContent = '送出失敗，請檢查網路後再試一次。'; });
    });
  }

  /* 心得列表頁支援 ?cat=、?sub= 帶入分類 */
  function applyCatParam() {
    var cat = new URLSearchParams(location.search).get('cat');
    if (!cat) return;
    // 只接受既有分類，不把網址參數直接組進選擇器
    var b = Array.prototype.filter.call(document.querySelectorAll('.chip'), function (c) { return c.dataset.cat === cat; })[0];
    if (!b) return;
    b.dataset.silent = '1'; b.click();
    var sub = new URLSearchParams(location.search).get('sub');
    var sb = sub && Array.prototype.filter.call(document.querySelectorAll('#subchips .chip'), function (c) { return c.dataset.sub === sub; })[0];
    if (sb) { sb.dataset.silent = '1'; sb.click(); }
  }

  /* ================= 書訊總覽頁：依類型、範圍篩選（列表本身是 build 寫好的靜態 HTML） ================= */
  function initNewsList() {
    var list = $('#news-list'), types = $('#news-types'), scopes = $('#news-scopes'), empty = $('#news-empty');
    if (!list || !types) return;
    var state = { type: '', scope: '' };
    function apply() {
      var shown = 0;
      list.querySelectorAll('.nrow').forEach(function (a) {
        var ok = (!state.type || a.dataset.type === state.type) && (!state.scope || a.dataset.scope === state.scope);
        a.hidden = !ok; if (ok) shown += 1;
      });
      empty.hidden = shown > 0;
      var u = new URL(location.href);
      if (state.type) u.searchParams.set('type', state.type); else u.searchParams.delete('type');
      if (u.href !== location.href) history.replaceState(null, '', u);
    }
    function pick(box, key, b) {
      box.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === b); });
      state[key] = b.dataset[key]; apply();
    }
    types.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) pick(types, 'type', b); });
    if (scopes) scopes.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) pick(scopes, 'scope', b); });
    var t = new URLSearchParams(location.search).get('type');   // news.html?type=得獎 可直接帶入
    var hit = t && types.querySelector('.chip[data-type="' + t.replace(/"/g, '') + '"]');
    if (hit) pick(types, 'type', hit);
  }

  if (page === 'home') initHome();
  if (page === 'reviews') { initReviewsList(); applyCatParam(); }
  if (page === 'review') initReview();
  if (page === 'spoiler') initSpoiler();
  if (page === 'news') initNewsList();
  if (page === 'list' || page === 'books' || page === 'category' || page === 'news' || page === 'news_article') bindCardClicks($('main'));
  if (page === 'home' && $('#home-news')) bindCardClicks($('#home-news'));

  /* 導覽列下拉選單與頁尾網站地圖：全站共用（只列有心得的分類）。
   * 正式頁面已由 build/seo-build.js 把這兩塊寫進 HTML，內容與順序兩邊要一致；
   * 這裡只在頁面上沒有時才動態補上（瀏覽器還留著舊版頁面，或新的手寫頁還沒加進 build 的 HAND_PAGES 時）。 */
  function initSiteNav() {
    var link = document.querySelector('.site-header nav a[href="reviews.html"]');
    if (link && !link.closest('.dd')) {
      var dd = document.createElement('div');
      dd.className = 'dd';
      link.parentNode.insertBefore(dd, link);
      dd.appendChild(link);
      link.setAttribute('aria-haspopup', 'true');
      var menu = document.createElement('div');
      menu.className = 'dd-menu';
      menu.innerHTML = '<a href="reviews.html"><b>全部心得</b><small>' + REVIEWS.length + '</small></a>' + liveCats().map(function (c) {
        return '<a href="' + catHref(c) + '"><b>' + esc(c) + '</b><small>' + countOf(c) + '</small></a>' + liveSubs(c).map(function (x) {
          return '<a class="dd-sub" href="' + catHref(c, x) + '">' + esc(x) + '<small>' + countOf(c, x) + '</small></a>';
        }).join('');
      }).join('');
      dd.appendChild(menu);
    }
    var foot = document.querySelector('.site-footer .copyright');
    if (foot && !document.querySelector('.site-footer .sitemap')) {
      var col = function (title, links) { return '<div><h3>' + title + '</h3>' + links.join('') + '</div>'; };
      var a = function (href, text) { return '<a href="' + href + '">' + esc(text) + '</a>'; };
      var map = document.createElement('nav');
      map.className = 'sitemap'; map.setAttribute('aria-label', '網站地圖');
      map.innerHTML =
        col('分類', liveCats().map(function (c) { return a(catHref(c), c + '（' + countOf(c) + '）'); })) +
        liveCats().filter(function (c) { return liveSubs(c).length; }).map(function (c) {
          return col(esc(c) + '類型', liveSubs(c).map(function (x) { return a(catHref(c, x), x + '（' + countOf(c, x) + '）'); }));
        }).join('') +
        col('書單', newestLists().slice(0, 6).map(function (l) { return a(l.id + '.html', l.title); }).concat((window.LISTS || []).length > 6 ? [a('lists.html', '全部 ' + window.LISTS.length + ' 份書單')] : [])) +
        col('網站', [a('index.html', '首頁'), a('reviews.html', '全部心得')].concat((window.NEWS || []).length ? [a('news.html', '書訊')] : [], [a('lists.html', '書單總覽'), a('books.html', '全部的書（總表）'), a('resources.html', '閱讀資源：圖書館與電子書'), a('feedback.html', '推薦好書／意見回饋'), a('about.html', '關於')]));
      foot.parentNode.insertBefore(map, foot);
    }
  }
  /* 導覽列的搜尋按鈕：展開「分類＋關鍵字」搜尋框，送出到心得列表（reviews.html?q=&cat=&sub=）。心得列表頁本身就直接跳到搜尋欄 */
  function initHeaderSearch() {
    var btn = document.querySelector('.site-header .nav-search');
    if (!btn) return;
    var panel = null;
    btn.addEventListener('click', function (e) {
      if (page === 'reviews' && $('#search')) { e.preventDefault(); $('#search').focus(); $('#search').scrollIntoView({ block: 'center' }); return; }
      e.preventDefault();
      if (!panel) {
        panel = document.createElement('form');
        panel.className = 'nav-search-panel wrap'; panel.action = 'reviews.html'; panel.method = 'get'; panel.setAttribute('role', 'search');
        panel.innerHTML = '<label class="sr-only" for="ns-cat">分類</label><select id="ns-cat" name="c">' + catOptions('') + '</select>' +
          '<label class="sr-only" for="ns-q">關鍵字</label><input id="ns-q" name="q" type="search" placeholder="書名、作者或關鍵字…" autocomplete="off">' +
          '<button class="btn" type="submit">搜尋</button>';
        panel.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var q = panel.q.value.trim(), v = panel.c.value.split('|'), u = new URLSearchParams();
          if (q) u.set('q', q);
          if (v[0]) u.set('cat', v[0]);
          if (v[1]) u.set('sub', v[1]);
          location.href = 'reviews.html' + (u.toString() ? '?' + u.toString() : '');
        });
        document.querySelector('.site-header').appendChild(panel);
      } else { panel.hidden = !panel.hidden; }
      if (!panel.hidden) panel.q.focus();
    });
  }
  initHeaderSearch();
  /* 閱讀資源頁：外部連結點擊 */
  if (page === 'resources') $('main').addEventListener('click', function (e) {
    var a = e.target.closest('a.res');
    if (a) track('click_resource', { resource_name: a.dataset.res, resource_type: a.dataset.type, link_url: a.href });
  });
  initSiteNav();   // 書單與總表的連結也送 select_content
  initUnsubscribe();
  initFeedback();
})();
