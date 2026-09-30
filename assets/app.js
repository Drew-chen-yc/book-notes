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
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  function readMinutes(r) { return Math.max(1, Math.round(r.body.join('').length / 400)); }
  function reviewParams(r) {
    return { review_id: r.id, book_title: r.title, book_author: r.author, book_category: r.category, rating: r.rating };
  }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* 心得頁網址：正式站用 ?id=（GA 報表較好讀）；預覽環境可設 BN_LINK_MODE='hash' 改用 #id */
  function reviewHref(id) {
    return window.BN_LINK_MODE === 'hash' ? 'review.html#' + id : 'review.html?id=' + encodeURIComponent(id);
  }
  function currentReviewId() {
    return new URLSearchParams(location.search).get('id') || location.hash.replace('#', '') || null;
  }

  function cover(r, size) {
    return '<div class="cover cover-' + size + '" style="--c:' + r.color + '" aria-hidden="true">' +
      '<span>' + esc(r.title) + '</span><small>' + esc(r.author) + '</small></div>';
  }
  function card(r, listName, pos) {
    return '<a class="card" href="' + reviewHref(r.id) + '" data-id="' + r.id +
      '" data-list="' + listName + '" data-pos="' + pos + '">' + cover(r, 'sm') +
      '<div class="card-body"><span class="tag">' + esc(r.category) + '</span>' +
      '<h3>' + esc(r.title) + '</h3><p class="meta">' + esc(r.author) + ' · <span class="stars" aria-label="' + r.rating + ' 顆星">' + stars(r.rating) + '</span></p>' +
      '<p>' + esc(r.summary) + '</p><p class="meta">' + r.date + ' · 約 ' + readMinutes(r) + ' 分鐘</p></div></a>';
  }

  /* 列表點擊 → select_content（GA4 建議事件） */
  function bindCardClicks(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a.card');
      if (!a) return;
      var r = REVIEWS.find(function (x) { return x.id === a.dataset.id; });
      track('select_content', Object.assign({ content_type: 'review', content_id: a.dataset.id,
        list_name: a.dataset.list, list_position: Number(a.dataset.pos) }, r ? { book_category: r.category } : {}));
    });
  }

  /* ================= 首頁 ================= */
  function initHome() {
    var list = $('#review-list'), empty = $('#empty'), input = $('#search'), chips = $('#chips');
    var state = { q: '', cat: '全部' };

    chips.innerHTML = ['全部'].concat(window.CATEGORIES).map(function (c) {
      return '<button type="button" class="chip' + (c === '全部' ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join('');

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return REVIEWS.filter(function (r) {
        var okCat = state.cat === '全部' || r.category === state.cat;
        var hay = (r.title + r.author + r.category + r.summary + r.tags.join(' ')).toLowerCase();
        return okCat && (!q || hay.indexOf(q) > -1);
      });
    }
    function render() {
      var rows = filtered();
      list.innerHTML = rows.map(function (r, i) { return card(r, 'home_latest', i + 1); }).join('');
      empty.hidden = rows.length > 0;
      return rows.length;
    }
    render();
    bindCardClicks(list);

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      state.cat = b.dataset.cat;
      chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === b); });
      var n = render();
      if (b.dataset.silent) { delete b.dataset.silent; return; }   // 網址帶入的不算使用者操作
      track('filter_category', { book_category: state.cat, results_count: n });
    });

    /* 搜尋：停止輸入 1 秒後才送，避免每個字都送一次 */
    var timer, lastSent = '';
    input.addEventListener('input', function () {
      state.q = input.value;
      var n = render();
      clearTimeout(timer);
      timer = setTimeout(function () {
        var term = input.value.trim();
        if (term.length >= 2 && term !== lastSent) {
          lastSent = term;
          track('search', { search_term: term, results_count: n });
        }
      }, 1000);
    });

    // 支援 ?q= 帶入（GA4 站內搜尋也可直接讀這個參數）
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; input.dispatchEvent(new Event('input')); }
  }

  /* ================= 心得頁 ================= */
  function initReview() {
    var id = currentReviewId();
    var r = REVIEWS.find(function (x) { return x.id === id; });
    var main = $('#review');
    if (!r) {
      main.innerHTML = '<h1>找不到這篇心得</h1><p><a href="index.html">回首頁</a></p>';
      track('review_not_found', { review_id: id || '(empty)' });
      return;
    }
    document.title = r.title + ' 讀書心得｜書頁筆記';
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', r.summary);

    var base = reviewParams(r);
    var liked = safeGet('bn_like_' + r.id) === '1';

    main.innerHTML =
      '<nav class="crumb"><a href="index.html">首頁</a> / <a href="index.html?cat=' + encodeURIComponent(r.category) + '">' + esc(r.category) + '</a></nav>' +
      '<header class="review-head">' + cover(r, 'lg') +
      '<div><span class="tag">' + esc(r.category) + '</span><h1>' + esc(r.title) + '</h1>' +
      '<p class="meta">' + esc(r.author) + '</p><p class="stars big" aria-label="' + r.rating + ' 顆星">' + stars(r.rating) + '</p>' +
      '<p class="meta">' + r.date + ' · 約 ' + readMinutes(r) + ' 分鐘閱讀</p>' +
      '<p class="lead">' + esc(r.summary) + '</p></div></header>' +
      '<article id="article">' + r.body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p></article>' +
      '<section class="actions" aria-label="互動">' +
      '<button type="button" id="like" class="btn btn-ghost" aria-pressed="' + liked + '">' + (liked ? '♥ 已收藏' : '♡ 收藏這篇') + '</button>' +
      '<span class="share-label">分享：</span>' +
      '<button type="button" class="btn btn-ghost" data-share="line">LINE</button>' +
      '<button type="button" class="btn btn-ghost" data-share="facebook">Facebook</button>' +
      '<button type="button" class="btn btn-ghost" data-share="copy_link">複製連結</button></section>' +
      '<section class="buy"><h2>想讀這本書？</h2><div class="buy-links">' +
      window.STORES.map(function (s) {
        return '<a class="btn" target="_blank" rel="noopener" data-store="' + s.key + '" href="' + s.url(r) + '">到' + s.name + '看看 ↗</a>';
      }).join('') + '</div></section>' +
      '<section class="related"><h2>同類型心得</h2><div id="related" class="grid"></div></section>';

    track('view_review', base);
    window.BN.bumpProfile('view', r.category);
    window.BN.trackReading($('#article'), { review_id: r.id, book_category: r.category }, { minSeconds: 30 });

    /* 收藏 */
    $('#like').addEventListener('click', function () {
      liked = !liked;
      safeSet('bn_like_' + r.id, liked ? '1' : '0');
      this.setAttribute('aria-pressed', liked);
      this.textContent = liked ? '♥ 已收藏' : '♡ 收藏這篇';
      track('like_review', Object.assign({}, base, { like_action: liked ? 'like' : 'unlike' }));
    });

    /* 分享（GA4 建議事件 share） */
    var shareUrl = location.origin + location.pathname + '?id=' + r.id +
      '&utm_source=share&utm_medium=social&utm_campaign=review_share';
    main.addEventListener('click', function (e) {
      var b = e.target.closest('[data-share]');
      if (!b) return;
      var method = b.dataset.share;
      track('share', { method: method, content_type: 'review', item_id: r.id, book_category: r.category });
      var u = encodeURIComponent(shareUrl.replace('utm_source=share', 'utm_source=' + method));
      if (method === 'line') window.open('https://social-plugins.line.me/lineit/share?url=' + u, '_blank', 'noopener');
      if (method === 'facebook') window.open('https://www.facebook.com/sharer/sharer.php?u=' + u, '_blank', 'noopener');
      if (method === 'copy_link') {
        var done = function () { b.textContent = '已複製 ✓'; setTimeout(function () { b.textContent = '複製連結'; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(decodeURIComponent(u)).then(done, done); else done();
      }
    });

    /* 購書點擊：高意圖，設為 GA4 關鍵事件，也是廣告轉換 */
    main.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-store]');
      if (!a) return;
      track('click_buy_book', Object.assign({}, base, { store: a.dataset.store, link_url: a.href }));
    });

    /* 相關推薦 */
    var rel = REVIEWS.filter(function (x) { return x.id !== r.id && x.category === r.category; });
    if (rel.length < 2) rel = rel.concat(REVIEWS.filter(function (x) { return x.id !== r.id && x.category !== r.category; })).slice(0, 3);
    var relBox = $('#related');
    relBox.innerHTML = rel.slice(0, 3).map(function (x, i) { return card(x, 'review_related', i + 1); }).join('');
    bindCardClicks(relBox);
  }

  /* ================= 電子報表單（每頁頁尾） ================= */
  function initNewsletter() {
    var f = $('#newsletter');
    if (!f) return;
    var started = false;
    var loc = page || 'other';
    f.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('newsletter_start', { form_location: loc });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = f.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        f.querySelector('.form-msg').textContent = 'Email 格式不正確';
        track('newsletter_error', { form_location: loc, error_type: 'invalid_email' });
        return;
      }
      var interest = f.interest.value;
      // ⚠ 絕不把 email 送進 GA（違反 Google 政策）。實際寄送請接 Formspree / Google 表單，見 README。
      track('generate_lead', { form_location: loc, lead_type: 'newsletter', interest_category: interest });
      f.innerHTML = '<p class="form-msg ok">訂閱成功！每月一封，只寄新心得。</p>';
    });
  }

  /* 首頁支援 ?cat= 帶入分類 */
  function applyCatParam() {
    var cat = new URLSearchParams(location.search).get('cat');
    if (!cat) return;
    var b = document.querySelector('.chip[data-cat="' + cat + '"]');
    if (b) { b.dataset.silent = '1'; b.click(); }
  }

  if (page === 'home') { initHome(); applyCatParam(); }
  if (page === 'review') initReview();
  initNewsletter();
})();
