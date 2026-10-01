# 書頁筆記 — 讀書心得網站（含 GA4 行為追蹤）

純靜態網站，部署在 GitHub Pages。追蹤架構：**網站推 dataLayer → GTM → GA4 / 廣告平台**。

```
book-notes/
├─ index.html          首頁：心得列表、搜尋、分類篩選
├─ review.html         心得頁：review.html?id=atomic-habits
├─ about.html          關於 + 隱私說明（可重設 Cookie 選擇）
├─ data/reviews.js     ★ 心得內容都在這裡，新增心得只改這個檔
├─ assets/analytics.js ★ 所有追蹤邏輯（GTM ID 在第 10 行）
├─ assets/app.js       頁面渲染與事件觸發點
├─ assets/style.css
└─ docs/
   ├─ TRACKING_PLAN.md 事件追蹤規格表（完整版）
   └─ tracking_plan.csv 事件清單（Excel 可開）
```

## 1. 預覽與除錯

網址加 `?debug=1` 會在右側顯示送出的 dataLayer 事件，`?debug=0` 關閉。

## 2. 建立 GA4 與 GTM

1. [analytics.google.com](https://analytics.google.com) 建立資源 → 網站資料串流，記下 **評估 ID `G-XXXXXXX`**。
   - 加強型評估：**關閉「捲動」**（本站自己送更細的 `review_scroll`），站內搜尋的查詢參數填 `q`。
   - 資料保留：改為 14 個月。
2. [tagmanager.google.com](https://tagmanager.google.com) 建立容器（網頁），記下 **`GTM-XXXXXXX`**。
3. 把 `assets/analytics.js` 第 10 行換成你的 GTM ID：`var GTM_ID = 'GTM-你的ID';`

## 3. GTM 設定

### 變數（類型：資料層變數，第 2 版）

| 變數名稱 | 資料層變數名稱 |
|---|---|
| DLV - content_group | `content_group` |
| DLV - page_type | `page_type` |
| DLV - up.favorite_category | `user_properties.favorite_category` |
| DLV - up.reader_tier | `user_properties.reader_tier` |
| DLV - up.visit_count | `user_properties.visit_count` |
| DLV - ep.{參數} | `event_params.{參數}` ← 每個事件參數各建一個 |

事件參數共 23 個：review_id, book_title, book_author, book_category, rating, percent_scrolled, engaged_seconds, like_action, method, content_type, content_id, item_id, list_name, list_position, search_term, results_count, store, link_url, form_location, lead_type, interest_category, error_type, consent_choice。

### 觸發條件

**CE - 書頁事件**：自訂事件，勾選「使用規則運算式比對」，事件名稱：

```
^(consent_update|search|filter_category|select_content|view_review|review_scroll|read_complete|like_review|share|click_buy_book|newsletter_start|newsletter_error|generate_lead|review_not_found)$
```

### 代碼

1. **Google 代碼**：代碼 ID = `G-XXXXXXX`，觸發條件 = Initialization - All Pages；設定參數 `content_group`、`page_type`；使用者屬性 favorite_category / reader_tier / visit_count。
2. **GA4 事件 - 書頁事件**：事件名稱 = `{{Event}}`；23 個事件參數逐一對應 `{{DLV - ep.xxx}}`（沒值的參數會自動略過）；觸發條件 = CE - 書頁事件。

### 同意模式

網站在載入 GTM 前送出 Consent Mode v2 預設值（全部 `denied`），使用者按「全部接受」才改 `granted`。

## 4. GA4 後台設定

- **自訂定義**：依 `docs/TRACKING_PLAN.md` 第 6 節建立（不會回溯，要先建）。
- **關鍵事件**：`read_complete`、`click_buy_book`、`generate_lead`。
- **連結 Google Ads**，把 `click_buy_book`、`generate_lead` 匯入為轉換。
- **內部流量**：排除自己的 IP。

## 5. 日常維護

- **新增心得**：在 `data/reviews.js` 陣列加一個物件（`id` 發布後不要改，GA 報表靠它串接）。
- **電子報**：目前表單只記錄 `generate_lead` 事件、不會存 Email。要收名單可接 Formspree 或 Google 表單。

## 6. 新增或修改心得（後台）

打開 https://drew-chen-yc.github.io/book-notes/admin.html ，貼上 GitHub 權杖連線後填表、按「發布到網站」。後台會一次更新 `data/reviews.js`、產生該篇靜態頁 `<id>.html` 與 `sitemap.xml`，約 1 分鐘生效。

權杖請用 Fine-grained token，只授權 book-notes 這個 repository 的 Contents：Read and write。後台頁不載入 GA，不會被追蹤，也不會出現在搜尋結果（noindex）。
