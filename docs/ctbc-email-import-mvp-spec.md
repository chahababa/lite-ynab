# 中國信託消費成交回報匯入 MVP 規格

狀態：Active / Parser dry-run implemented
日期：2026-07-23
專案：Lite YNAB

## 1. 目標

將 Gmail 中的中國信託「信用卡消費成交回報」轉成 Lite YNAB 的待確認交易，讓使用者批次檢查、補分類後才正式匯入。

第一版只處理 Email 本文，不處理信用卡月結 PDF，不登入網銀，也不自動寫入正式交易。

## 2. 已驗證的來源特徵

- 寄件者：中國信託銀行消費通知寄件地址（以 allowlist 比對完整地址）。
- 主旨：`信用卡消費成交回報`（比對前先 trim）。
- 郵件驗證：Gmail `Authentication-Results` 必須同時為 DKIM、SPF、DMARC pass，且驗證網域為中信實際寄件網域；顯示名稱與 From 地址本身不足以證明來源。
- Collector 只可傳入 Gmail 自己加入、以 `mx.google.com;` 開頭的 trusted `Authentication-Results`；不得串接或信任寄件者自行夾帶的同名 header。DKIM／SPF／DMARC verdict 必須是完整 token `pass`，任一 fail、`pass.*` 偽造值或非完整 allowlist 網域都必須拒絕。
- MIME：`multipart/signed` → `multipart/alternative`，包含 `text/plain`、`text/html` 與 S/MIME signature。
- Gmail Workspace MCP 對這類信件可能回傳空 body；使用 Gmail API `messages.get(format=full)` 可取得完整 MIME 內容。
- HTML 版型含大量巢狀 table，且父 table 會重複包含子 table 的文字。解析器不可抓第一個 table 或整頁純文字，必須找出具有精確欄位標題、且資料列為六個直接儲存格的最小交易表格。
- 已只讀檢查三封近期樣本，涵蓋單一卡別、多卡別、正卡、附卡、多筆交易、已知商家及「暫無商店資訊」。

## 3. 信件交易欄位

交易表格固定六欄：

1. 卡別
2. 末四碼
3. 消費日（含時間）
4. 消費金額
5. 商店名稱
6. 商店類型／交易類型

正規化後候選交易欄位：

```ts
type CtbcEmailCandidate = {
  source: "ctbc_email_alert";
  gmailMessageId: string;
  sourceId: string;
  occurredAt: string;            // Asia/Taipei
  amountTwd: number;
  currency: "TWD";
  cardProductName: string;
  cardRole: "primary" | "supplementary" | "unknown";
  cardLast4: string;              // 僅四碼，不保存完整卡號
  merchantRaw: string;
  merchantNormalized: string | null;
  bankCategoryRaw: string | null;
  transactionChannelRaw: string | null;
  suggestedCategoryId: string | null;
  suggestedPaymentMethodId: string | null;
  confidence: number;
  warnings: string[];
  status: "authorized_unreconciled";
};
```

注意：成交回報屬授權／通知資料，商店名稱與外幣換算可能在正式帳單入帳時改變，因此不可標記為已核帳。

## 4. 解析規則

### 4.1 信件篩選

同時滿足以下條件才解析：

- 寄件地址完全符合 allowlist。
- 主旨 trim 後完全等於 `信用卡消費成交回報`。
- `Authentication-Results` 的 DKIM、SPF、DMARC 均通過，且對應 allowlist 網域。
- 可取得 `text/html` 或 `text/plain` MIME part。

不依顯示名稱判斷，避免偽造寄件者。

### 4.2 HTML 解析

1. 遞迴讀取 MIME parts，優先使用 `text/html`。
2. 尋找直接列包含以下六個標題的 table：
   `卡別 / 末四碼 / 消費日 / 消費金額 / 商店名稱 / 商店類型│交易類型`。
3. 只接受 header 後直接含六個 cell 的資料列。
4. 跳過父層包裝 table、頁尾、提醒及相關連結。
5. 每列須通過日期、金額及末四碼格式驗證；不合格列進 `parse_failed`，不可默默忽略。
6. 若 HTML 找不到交易表，或找到的資料列全部驗證失敗，再嘗試具嚴格狀態機的 `text/plain` fallback；HTML 部分成功時不得混入 text 重複資料。
7. `text/plain` fallback 必須逐列驗證；損壞列要回報並繼續檢查後續列，只能在辨識到中信已知註記／頁尾標記時結束交易區段。

### 4.3 正規化

- 金額移除 `$`、逗號、空白與「元」，轉為正整數 TWD。
- 日期以信件內容為準；中信實際版型使用三位民國年，轉為西元後解析成 Asia/Taipei datetime，同時允許合成測試使用四位西元年。
- 卡別中的 `(正卡)`、`(附卡)`拆為 `cardRole`。
- `商店類型│交易類型`拆成銀行分類與交易通路；例如行動支付、實體卡、非實體卡。
- `暫無商店資訊`保留在 `merchantRaw`，但 `merchantNormalized = null`，且必須人工確認。
- 外幣交易仍只保存通知中的 TWD 授權金額，並加上「待月結核對」警告。

### 4.4 去重

候選交易的 `sourceId` 使用：

```text
ctbc:<gmailMessageId>:<normalized-row-sha256>
```

row hash 至少包含：末四碼、交易時間、金額、原始商家與卡別。資料庫對 `(user_id, source, source_id)` 建唯一約束。

同一 Gmail message 重跑不得產生第二筆候選；同日同額但不同卡片、時間或商家不得誤判為重複。

## 5. 使用流程

```text
Gmail 唯讀搜尋
→ 解析成交回報
→ 建立 import batch
→ 產生候選交易
→ 待確認收件匣
→ 使用者補支付方式／分類
→ 批次批准
→ 寫入 transactions
```

候選狀態：

```text
discovered → parsed → needs_review → approved → imported
                         ↘ ignored
              ↘ parse_failed
```

## 6. Lite YNAB UI

新增：`/settings/statement-import` 或 `/imports/transactions`

每筆候選顯示：

- 日期與時間
- 金額
- 卡別（只顯示遮罩後末四碼）
- 正卡／附卡
- 原始商家名稱
- 中信分類與交易通路
- 建議 Lite YNAB 分類
- 建議支付方式
- 信心分數與警告

操作：

- 單筆或批次選擇
- 批次設定分類／支付方式
- 批准匯入
- 忽略
- 查看來源資訊（不保存完整 Email HTML）

第一版不提供「全部自動批准」。

## 7. 建議資料表

### `transaction_import_batches`

- `id`
- `user_id`
- `source`
- `source_message_id`
- `discovered_at`
- `status`
- `candidate_count`
- `imported_count`
- `metadata`（不得放完整 Email 或敏感憑證）

### `transaction_import_candidates`

- `id`
- `batch_id`
- `user_id`
- `source_id`
- `occurred_at`
- `amount`
- `currency`
- `merchant_raw`
- `merchant_normalized`
- `card_product_name`
- `card_role`
- `card_last4`
- `bank_category_raw`
- `transaction_channel_raw`
- `suggested_category_id`
- `suggested_payment_method_id`
- `confidence`
- `warnings`
- `status`
- `imported_transaction_id`
- `created_at / updated_at`

## 8. 整合架構建議

第一版採「Hermes 收件、Lite YNAB 審核」：

- Hermes 使用現有 Google Workspace 授權，唯讀取得 Gmail。
- Hermes parser 產生候選 JSON。
- 透過新的受保護 API 寫入 `transaction_import_candidates`。
- Lite YNAB 負責登入、顯示、人工確認及正式匯入。

優點：

- 不必立即替 Zeabur App 增加 Google OAuth 與 Gmail token。
- 可沿用現有 Hermes webhook 驗證與 `source_id` 去重模式。
- 敏感 Gmail 存取維持在既有 Hermes 環境。

## 9. 安全與隱私

- Gmail 只讀；不得刪信、標記、轉寄或回覆。
- 不登入網銀。
- 第一版不下載或解密 PDF。
- 不保存完整卡號、身分證、PDF 密碼、OAuth token 或完整 Email HTML。
- Logs 必須遮罩姓名、Email、末四碼及金額樣本；測試 fixture 使用合成資料。
- 正式資料寫入前一定有人工作業。
- API 需驗證 bearer secret、user scope、payload schema、重播與唯一鍵。

## 10. MVP 驗收條件

- [ ] 能辨認正確寄件者與主旨，排除偽造／無關信件。
- [ ] 能解析一封內 1–N 筆交易。
- [ ] 支援正卡、附卡及多卡別。
- [ ] 正確抽出六欄，不受巢狀重複 table 干擾。
- [ ] `暫無商店資訊`不會被自動誤分類。
- [ ] 同一封信重跑不新增重複候選。
- [ ] Dry-run 只輸出遮罩摘要，不寫資料庫。
- [ ] 待確認 UI 可批次分類、批准及忽略。
- [ ] 批准後建立 Lite YNAB transaction，並保留來源追蹤。
- [ ] parser、去重、API 權限與 UI 核心流程有測試。
- [ ] `npm run typecheck`、`npm run test`與 production build 通過。
- [ ] 不把任何真實金融資料放入 Git、fixture、log 或錯誤追蹤。

## 11. 非目標

- 月結 PDF 解密與核帳。
- 自動登入網銀。
- 自動批准／自動入帳。
- 支援中國信託以外銀行。
- 股票、證券或銀行綜合對帳單。
- 用通知中的授權商家名稱取代未來正式帳單資料。

## 12. 後續階段

1. CTBC parser dry-run：用合成 fixture 與遮罩後樣本驗證。
2. 待確認資料表與 API。
3. Lite YNAB 匯入收件匣 UI。
4. 人工批准與正式交易寫入。
5. 中國信託月結 PDF 核帳。
6. 商家正規化與分類學習。
7. 擴充台新、永豐、玉山等 adapter。

Dry-run CLI 可讀取合成 JSON 檔，或用 `-` 從 stdin 接收一次性資料；stdout 僅輸出遮罩摘要，不在專案目錄保存真實信件內容。只要存在任何未解析資料列，CLI 即使已有部分候選也必須以非零狀態結束。CLI 使用專案既有的 TypeScript compiler 在記憶體轉譯 parser，不依賴 Node experimental type-stripping，因此可維持專案的 Node 20+ 相容範圍。

## 13. 進入實作前的必要決策

- Active／授權開發：已由 Matt 於 2026-07-23 確認；本輪授權範圍僅 CTBC parser dry-run，不含資料庫寫入、Gmail 排程或正式自動匯入。
- 第一版由手動觸發還是每日排程掃描 Gmail；建議先手動 dry-run，再加入排程。
- 正卡與附卡是否映射為不同 `payment_methods`；建議分開，避免家庭支出來源混淆。
- 待確認資料保留期限；建議成功匯入後只留正規化欄位與來源 ID，不保留原始 Email。
