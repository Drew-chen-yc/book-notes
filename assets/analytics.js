/* =========================================================
 * analytics.js — 所有追蹤邏輯集中於此
 * 架構：網站只推 dataLayer，GTM 負責把事件送到 GA4 / 廣告平台
 * 參數一律放在 event_params 物件內，推送前先清空，避免舊參數殘留
 * ========================================================= */
(function () {
  'use strict';

  // ★ 取得 GTM 容器 ID 後替換這一行即可（維持佔位符時不會載入 GTM，但 dataLayer 照常運作）
  var GTM_ID = 'GTM-XXXXXXX';

  var CONSENT_KEY = 'bn_consent';        // 'all' | 'necessary'
  var PROFILE_KEY = 'bn_profile';        // 讀者行為輪廓（僅存在瀏覽器）

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  /* ---------- 1. Consent Mode v2：預設拒絕，使用者同意後才開啟 ---------- */
  var GRANTED = { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' };
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });
  var consent = safeGet(CONSENT_KEY);
  if (consent === 'all') gtag('consent', 'update', GRANTED);

  /* ---------- 2. 讀者輪廓 → GA4 使用者屬性（用來切廣告受眾） ---------- */
  function loadProfile() {
    var p;
    try { p = JSON.parse(safeGet(PROFILE_KEY) || '{}'); } catch (e) { p = {}; }
    p.visits = p.visits || 0;
    p.reviews_viewed = p.reviews_viewed || 0;
    p.reads_completed = p.reads_completed || 0;
    p.cat = p.cat || {};
    return p;
  }
  var profile = loadProfile();
  if (!sessionStorageFlag()) profile.visits += 1;
  saveProfile();

  function sessionStorageFlag() {
    try {
      if (sessionStorage.getItem('bn_session')) return true;
      sessionStorage.setItem('bn_session', '1');
    } catch (e) {}
    return false;
  }
  function saveProfile() { safeSet(PROFILE_KEY, JSON.stringify(profile)); }
  function favoriteCategory() {
    var best = null, n = 0;
    Object.keys(profile.cat).forEach(function (k) { if (profile.cat[k] > n) { best = k; n = profile.cat[k]; } });
    return best || '(none)';
  }
  function readerTier() {
    if (profile.reads_completed >= 3) return 'deep_reader';
    if (profile.reviews_viewed >= 2) return 'browser';
    return 'new';
  }
  function userProperties() {
    return {
      favorite_category: favoriteCategory(),
      reader_tier: readerTier(),
      visit_count: profile.visits >= 5 ? '5+' : String(profile.visits)
    };
  }

  /* ---------- 3. 頁面脈絡：在 GTM 載入前推入，Google 代碼可讀到 ---------- */
  var body = document.documentElement;
  window.dataLayer.push({
    page_type: body.getAttribute('data-page-type') || 'other',
    content_group: body.getAttribute('data-content-group') || 'other',
    user_properties: userProperties()
  });

  /* ---------- 4. 載入 GTM ---------- */
  if (!/X{4,}/.test(GTM_ID)) {
    (function (w, d, s, l, i) {
      w[l] = w[l] || []; w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0], j = d.createElement(s), dl = l != 'dataLayer' ? '&l=' + l : '';
      j.async = true; j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl; f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', GTM_ID);
  }

  /* ---------- 5. 統一事件出口 ---------- */
  var DEBUG = window.BN_DEBUG === true || /[?&]debug=1/.test(location.search) || safeGet('bn_debug') === '1';
  if (/[?&]debug=1/.test(location.search)) safeSet('bn_debug', '1');
  if (/[?&]debug=0/.test(location.search)) { safeSet('bn_debug', '0'); DEBUG = false; }

  function track(eventName, params) {
    params = params || {};
    window.dataLayer.push({ event_params: null });               // 清空上一個事件的參數
    window.dataLayer.push({ event: eventName, event_params: params, user_properties: userProperties() });
    if (DEBUG) { console.log('[track]', eventName, params); debugLog(eventName, params); }
  }

  /* 讓頁面更新輪廓（例如看完一篇心得） */
  function bumpProfile(kind, category) {
    if (kind === 'view') {
      profile.reviews_viewed += 1;
      if (category) profile.cat[category] = (profile.cat[category] || 0) + 1;
    }
    if (kind === 'read_complete') profile.reads_completed += 1;
    saveProfile();
  }

  /* ---------- 6. 同意橫幅 ---------- */
  function setConsent(choice) {
    safeSet(CONSENT_KEY, choice);
    if (choice === 'all') gtag('consent', 'update', GRANTED);
    else gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
    track('consent_update', { consent_choice: choice });
    var b = document.getElementById('consent-banner');
    if (b) b.remove();
  }
  function showBanner() {
    if (safeGet(CONSENT_KEY)) return;
    var d = document.createElement('div');
    d.id = 'consent-banner';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Cookie 使用同意');
    d.innerHTML =
      '<p>本站使用 Cookie 分析閱讀行為，並用於推薦內容與廣告成效衡量。詳見<a href="about.html#privacy">隱私說明</a>。</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="btn btn-ghost" data-consent="necessary">僅必要</button>' +
      '<button type="button" class="btn" data-consent="all">全部接受</button></div>';
    d.addEventListener('click', function (e) {
      var c = e.target.getAttribute('data-consent');
      if (c) setConsent(c);
    });
    document.body.appendChild(d);
  }

  /* ---------- 7. Debug 面板（網址加 ?debug=1 開啟、?debug=0 關閉） ---------- */
  var debugBox;
  function debugLog(name, params) {
    if (!document.body) return;
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.id = 'debug-panel';
      debugBox.innerHTML = '<strong>dataLayer 事件</strong><ol></ol>';
      document.body.appendChild(debugBox);
    }
    var li = document.createElement('li');
    li.innerHTML = '<b>' + name + '</b> <code>' + escapeHtml(JSON.stringify(params)) + '</code>';
    var ol = debugBox.querySelector('ol');
    ol.insertBefore(li, ol.firstChild);
    while (ol.children.length > 15) ol.removeChild(ol.lastChild);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- 8. 閱讀深度與專注時間 ---------- */
  function trackReading(el, baseParams, opts) {
    opts = opts || {};
    var minSeconds = opts.minSeconds || 30;
    var marks = [25, 50, 75, 90], fired = {};
    var engaged = 0, reachedEnd = false, completed = false;

    // 只在分頁可見時累計專注秒數
    setInterval(function () {
      if (document.visibilityState === 'visible') {
        engaged += 1;
        maybeComplete();
      }
    }, 1000);

    function onScroll() {
      var rect = el.getBoundingClientRect();
      var total = el.offsetHeight - window.innerHeight;
      var seen = total <= 0 ? 100 : Math.min(100, Math.max(0, (-rect.top / total) * 100));
      marks.forEach(function (m) {
        if (seen >= m && !fired[m]) {
          fired[m] = true;
          track('review_scroll', Object.assign({}, baseParams, { percent_scrolled: m }));
          if (m === 90) { reachedEnd = true; maybeComplete(); }
        }
      });
    }
    function maybeComplete() {
      if (completed || !reachedEnd || engaged < minSeconds) return;
      completed = true;
      bumpProfile('read_complete');
      track('read_complete', Object.assign({}, baseParams, { engaged_seconds: engaged }));
    }
    window.addEventListener('scroll', throttle(onScroll, 250), { passive: true });
    onScroll();
    return { engagedSeconds: function () { return engaged; } };
  }
  function throttle(fn, ms) {
    var t = 0;
    return function () { var n = Date.now(); if (n - t >= ms) { t = n; fn(); } };
  }

  window.BN = { track: track, bumpProfile: bumpProfile, trackReading: trackReading, userProperties: userProperties };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
  else showBanner();
})();
