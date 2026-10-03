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
  function bodyHtml(body) {
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
  /* 評分可以是 4.5 這種半顆星 */
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
  /* 分類顯示：有子分類時顯示「小說・仙俠」 */
  var SUBS = window.SUBCATEGORIES || {};
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

  function genreKey(r) { return ({ '仙俠': 'xian', '玄幻': 'xuan', '奇幻': 'fantasy', '科幻': 'scifi', '推理': 'mystery', '文學': 'lit' })[r.subcategory] || 'plain'; }
  /* 評分印章：全站同一顆，size = xs（行內）／sm（卡片）／lg（心得頁） */
  function seal(n, size) { return '<span class="seal seal-' + size + '" role="img" aria-label="' + n + ' 顆星">' + n + '<i aria-hidden="true">★</i></span>'; }
  function cover(r, size) {
    return '<div class="cover cover-' + size + '" data-g="' + genreKey(r) + '" style="--c:' + r.color + '" aria-hidden="true">' +
      '<em>' + esc(r.subcategory || r.category) + '</em><span>' + esc(r.title) + '</span><small>' + esc(r.author) + '</small></div>';
  }
  function card(r, listName, pos) {
    return '<a class="card" href="' + reviewHref(r.id) + '" data-id="' + r.id +
      '" data-list="' + listName + '" data-pos="' + pos + '">' + cover(r, 'sm') +
      '<div class="card-body"><span class="tag">' + esc(catLabel(r)) + '</span>' +
      seal(r.rating, 'sm') + '<h3>' + esc(r.title) + '</h3><p class="meta">' + esc(r.author) + '</p>' +
      '<p>' + esc(r.summary) + '</p><p class="meta">' + r.date + ' · 約 ' + readMinutes(r) + ' 分鐘</p></div></a>';
  }

  /* 列表點擊 → select_content（GA4 建議事件） */
  function bindCardClicks(root) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-list]');
      if (!a) return;
      var r = REVIEWS.find(function (x) { return x.id === a.dataset.id; });
      track('select_content', Object.assign({ content_type: 'review', content_id: a.dataset.id,
        list_name: a.dataset.list, list_position: Number(a.dataset.pos) }, r ? { book_category: r.category } : {}));
    });
  }

  /* ================= 首頁 ================= */
  function initHome() {
    var list = $('#review-list'), empty = $('#empty'), input = $('#search'), chips = $('#chips');
    var state = { q: '', cat: '全部', sub: '全部' };
    var subchips = document.createElement('div');
    subchips.id = 'subchips'; subchips.className = 'chips subchips'; subchips.hidden = true;
    subchips.setAttribute('role', 'group'); subchips.setAttribute('aria-label', '子分類篩選');
    chips.parentNode.insertBefore(subchips, chips.nextSibling);

    chips.innerHTML = ['全部'].concat(window.CATEGORIES).map(function (c) {
      return '<button type="button" class="chip' + (c === '全部' ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join('');

    function filtered() {
      var q = state.q.trim().toLowerCase();
      return REVIEWS.filter(function (r) {
        var okCat = state.cat === '全部' || r.category === state.cat;
        var okSub = state.sub === '全部' || r.subcategory === state.sub;
        var hay = (r.title + r.author + r.category + (r.subcategory || '') + r.summary + r.tags.join(' ')).toLowerCase();
        return okCat && okSub && (!q || hay.indexOf(q) > -1);
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

    /* 首頁第一屏與入口卡片上的數字跟著資料走 */
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = el.dataset.count === 'lists' ? (window.LISTS || []).length : REVIEWS.length;
    });

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      state.cat = b.dataset.cat; state.sub = '全部';
      chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === b); });
      renderSubchips();
      var n = render();
      if (b.dataset.silent) { delete b.dataset.silent; return; }   // 網址帶入的不算使用者操作
      track('filter_category', { book_category: state.cat, results_count: n });
    });

    /* 子分類：選到有子分類的分類（例如小說）時，才出現第二排標籤 */
    function renderSubchips() {
      var subs = SUBS[state.cat];
      subchips.hidden = !subs;
      subchips.innerHTML = !subs ? '' : ['全部'].concat(subs).map(function (s) {
        return '<button type="button" class="chip chip-sub' + (s === state.sub ? ' active' : '') + '" data-sub="' + s + '">' + s + '</button>';
      }).join('');
    }
    subchips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      var silent = !!b.dataset.silent;
      state.sub = b.dataset.sub;
      renderSubchips();
      var n = render();
      if (silent) return;
      track('filter_category', { book_category: state.cat, book_subcategory: state.sub, results_count: n });
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
          track('search', { search_term: redactPII(term), results_count: n });
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
    document.title = seoTitle(r);
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', seoIntro(r) + r.summary);

    var base = reviewParams(r);
    var liked = safeGet('bn_like_' + r.id) === '1';

    main.innerHTML =
      '<nav class="crumb"><a href="index.html">首頁</a> / <a href="index.html?cat=' + encodeURIComponent(r.category) + '">' + esc(r.category) + '</a>' +
      (r.subcategory ? ' / <a href="index.html?cat=' + encodeURIComponent(r.category) + '&sub=' + encodeURIComponent(r.subcategory) + '">' + esc(r.subcategory) + '</a>' : '') + '</nav>' +
      '<header class="review-head">' + cover(r, 'lg') +
      '<div><span class="tag">' + esc(catLabel(r)) + '</span><h1>' + esc(seoH1(r)) + '</h1>' +
      '<p class="meta">' + esc(r.author) + '</p><p class="rating">' + seal(r.rating, 'lg') + '<span class="stars big" aria-hidden="true">' + stars(r.rating) + '</span></p>' +
      '<p class="meta">' + r.date + ' · 約 ' + readMinutes(r) + ' 分鐘閱讀</p>' +
      '<p class="intro">' + esc(seoIntro(r)) + '</p>' +
      '<p class="lead">' + esc(r.summary) + '</p></div></header>' +
      '<article id="article">' + bodyHtml(r.body).join('') +
      '<p class="tags">' + r.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p></article>' +
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
      '<section class="related"><h2>同類型心得</h2><div id="related" class="grid"></div></section>' + inLists(r);

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

    /* 相關推薦 */
    var rel = relatedOf(r, REVIEWS, 4);
    var relBox = $('#related');
    relBox.innerHTML = rel.map(function (x, i) { return card(x, 'review_related', i + 1); }).join('');
    bindCardClicks(relBox);
  }

  /* ================= 電子報表單（每頁頁尾） =================
   * 名單存進站長自己的 Google 表單（回應在 Google 表單／試算表），Email 絕不送進 GA。 */
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

  function initNewsletter() {
    var f = $('#newsletter');
    if (!f) return;
    var started = false, sending = false;
    var loc = page || 'other';
    var msg = f.querySelector('.form-msg');
    // 興趣分類選單跟著 CATEGORIES 走，新增分類不用改每一頁
    if (f.interest && window.CATEGORIES) {
      f.interest.innerHTML = '<option value="all">全部分類</option>' + window.CATEGORIES.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
    }
    // 蜜罐欄位：真人看不到，機器人會填 → 直接丟棄
    var trap = document.createElement('input');
    trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1; trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true'); trap.className = 'sr-only';
    f.appendChild(trap);
    var note = document.createElement('p');
    note.className = 'form-note';
    note.innerHTML = '按下訂閱即同意我們用這個 Email 寄送新心得通知，不作其他用途。可隨時<a href="about.html#unsubscribe">取消訂閱</a>，詳見<a href="about.html#privacy">隱私說明</a>。';
    f.appendChild(note);

    f.addEventListener('focusin', function () {
      if (started) return;
      started = true;
      track('newsletter_start', { form_location: loc });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      var email = f.email.value.trim();
      if (!validEmail(email)) {
        msg.textContent = 'Email 格式不正確';
        track('newsletter_error', { form_location: loc, error_type: 'invalid_email' });
        return;
      }
      if (trap.value) { f.innerHTML = '<p class="form-msg ok">訂閱成功！</p>'; return; }
      var interest = f.interest.value;
      var btn = f.querySelector('button[type=submit]');
      sending = true; btn.disabled = true; msg.textContent = '送出中…';
      sendToForm(email, interest, '訂閱').then(function () {
        // 注意：只送「有人訂閱」這件事進 GA，不含 Email
        track('generate_lead', { form_location: loc, lead_type: 'newsletter', interest_category: interest });
        f.innerHTML = '<p class="form-msg ok">訂閱成功！有新心得時會寄信通知你。</p>';
      }).catch(function () {
        sending = false; btn.disabled = false;
        msg.textContent = '送出失敗，請檢查網路後再試一次。';
        track('newsletter_error', { form_location: loc, error_type: 'network' });
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
        f.innerHTML = '<p class="form-msg ok">已收到取消訂閱的申請，我們會在 7 天內從名單移除並刪除這個 Email。</p>';
      }).catch(function () { msg.textContent = '送出失敗，請檢查網路後再試一次。'; });
    });
  }

  /* 首頁支援 ?cat= 帶入分類 */
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

  if (page === 'home') { initHome(); applyCatParam(); }
  if (page === 'review') initReview();
  if (page === 'list' || page === 'books') bindCardClicks($('main'));   // 書單與總表的連結也送 select_content
  initNewsletter();
  initUnsubscribe();
})();
