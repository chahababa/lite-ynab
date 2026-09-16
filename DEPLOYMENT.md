# DEPLOYMENT

Lite YNAB 目前部署於 `Zeabur`，資料庫與登入服務使用 `Supabase`。

正式網址：https://lite-ynab.zeabur.app/

部署日期：2026-04-05

這份文件整理的是：
- 部署前檢查清單
- 正式環境準備流程
- Zeabur 部署步驟
- 上線後驗證項目
- 實際部署踩坑紀錄

## 一、部署前 Checklist

在開始部署前，先確認以下項目：

- `npm run typecheck` 通過
- `npm run test` 通過
- 正式要使用的路由已確認
  - `/`
  - `/quick-entry`
  - `/budget-allocation`
  - `/budget-usage`
  - `/transactions`
  - `/reports`
- `/budget-allocation-compact` 已改為導向正式版 `/budget-allocation`
- `README.md`、`STATUS.md`、`CHANGELOG.md` 已更新
- 不再使用的試作文案已清掉
  - 例如 `試作版` 這種字樣不應留在正式 UI
- `.env.local` 只保留本機開發用，不要提交
- Supabase migrations 已整理好順序

## 二、正式環境需要的資料

正式部署至少需要這些環境變數：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

若要啟用 v3.0「月初固定預算自動回復」排程，還需要：

```env
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=***
```

若要啟用 v3.1「月報自動分析 + Notion/Telegram 通知」，還需要：

```env
NOTION_API_KEY=***
NOTION_MONTHLY_REPORT_DATABASE_ID=3646f483-1a61-8191-8280-c2ab8ca8fa0c
TELEGRAM_BOT_TOKEN=***
TELEGRAM_CHAT_ID=***
# Hermes 文字記帳 webhook
HERMES_WEBHOOK_SECRET=***
# Google Sheets 月報匯出
GOOGLE_SHEET_ID=1bnq9psR6yWNvZv97n1t5zyZkqTf2PMNH8tLwnfoZm28
GOOGLE_SERVICE_ACCOUNT_EMAIL=***
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
# 選用；若未設定，月報 service role 會彙總目前可讀取的資料；Hermes endpoint 則需 request body 傳 userId。
LITEYNAB_USER_ID=
```


`SUPABASE_SERVICE_ROLE_KEY` 只能放在伺服器端環境變數，不可提交、不可以 `NEXT_PUBLIC_` 開頭。
`CRON_SECRET` 是外部排程呼叫 `/api/cron/monthly-budget-reset`、`/api/cron/monthly-expense-report` 與 `/api/cron/monthly-expense-report/sheets` 時使用的 Bearer token。
`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`、`NOTION_API_KEY`、Google service account private key 不可提交到 repo、不可寫入 Notion 文件。
Google service account 必須被加入 `Lite YNAB 月報匯出` Google Sheet，且至少要有 Editor 權限。

## 三、Supabase 正式環境準備

1. 建立正式 Supabase 專案
2. 到 SQL Editor 或 migration 流程套用以下檔案：

```text
202604020001_init_lite_ynab.sql
202604030001_fix_default_category_labels.sql
202604030002_fix_auth_function_user_id.sql
202604030003_translate_default_categories_to_zh_hant.sql
202604030004_add_budget_planning_groups_and_payment_methods.sql
202604030005_stop_recreating_deleted_default_categories.sql
202604110001_merge_duplicate_english_categories.sql
202605180001_monthly_auto_budget_reset.sql
```

3. 確認以下資料表與 RPC 已存在：

資料表：
- `category_groups`
- `categories`
- `payment_methods`
- `monthly_incomes`
- `budgets`
- `transactions`
- `budget_auto_adjustment_stats`

RPC：
- `bootstrap_default_category_groups()`
- `bootstrap_default_categories()`
- `bootstrap_default_payment_methods()`
- `initialize_monthly_budget(text)`
- `reset_monthly_auto_budgets(text)`

4. 在 Supabase 專案設定中取得：
- `Project URL`
- `anon public key`

## 四、Zeabur 部署步驟

1. 將 GitHub repository 匯入 Zeabur
2. 服務類型選擇 `Next.js` 或讓 Zeabur 自動偵測
3. Root Directory 指向：

```text
lite-ynab
```

4. 在 Zeabur 專案設定加入環境變數：

```env
NEXT_PUBLIC_SUPABASE_URL=你的正式 Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的正式 Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=你的 Supabase service role key（只放伺服器端）
CRON_SECRET=***
NOTION_API_KEY=***
NOTION_MONTHLY_REPORT_DATABASE_ID=3646f483-1a61-8191-8280-c2ab8ca8fa0c
TELEGRAM_BOT_TOKEN=***
TELEGRAM_CHAT_ID=***
HERMES_WEBHOOK_SECRET=***
GOOGLE_SHEET_ID=1bnq9psR6yWNvZv97n1t5zyZkqTf2PMNH8tLwnfoZm28
GOOGLE_SERVICE_ACCOUNT_EMAIL=***
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
# 選用
LITEYNAB_USER_ID=
```

5. 觸發第一次部署

> **重要**：必須在 repo 根目錄放置自訂 `Dockerfile`，不要依賴 Zeabur 自動產生的 Dockerfile（詳見第八節踩坑紀錄）。

如果 Zeabur 有要求額外設定：
- Build Command：通常使用預設值即可，或填 `npm run build`
- Start Command：通常使用預設值即可，或填 `npm run start`

## 五、上線後驗證

部署成功後，請依序檢查：

### 帳號與登入

- 可以開啟首頁
- 可以註冊
- 可以登入
- 可以登出

### 主流程

- 主控臺 `/`
- 快速記帳 `/quick-entry`
- 預算分配 `/budget-allocation`
- 預算使用 `/budget-usage`
- 全部交易 `/transactions`
- 報表 `/reports`

### 預算功能

- 本月收入可儲存
- 預算分配頁可修改本月預算
- 固定預算可修改
- 若已設定外部排程，可用以下方式測試月初固定預算重設 endpoint：

```bash
curl -s -X POST "https://lite-ynab.zeabur.app/api/cron/monthly-budget-reset?monthId=2026-05" \
  -H "Authorization: Bearer ***"
```

回傳應包含 `ok: true` 與 `changedBudgets` / `trackedAutoCategories`。正式排程建議設定為每月 1 號 00:01（台北時間）呼叫同一 endpoint。
- 複製上月預算可執行
- 批次套用固定預算可執行
- 大項 / 小項設定可操作

### 交易功能

- 可新增交易
- 可編輯交易
- 可刪除交易
- 可篩選
- 可匯出 CSV

### 報表功能

- 可載入報表頁
- 圖表與數字正常顯示
- 預算使用頁儀表板正常顯示
- 若已設定 Notion / Telegram env，可用以下方式測試月報 endpoint：

```bash
curl -s -X POST "https://lite-ynab.zeabur.app/api/cron/monthly-expense-report?monthId=2026-04" \
  -H "Authorization: Bearer ***"
```

回傳應包含 `ok: true`、`notionPageId`，且 Telegram 會收到摘要。正式排程設定為每月 1 號 00:10（Asia/Taipei），用來分析上個月。

若已設定 Google Sheets service account env，先用 dry run 預覽同步內容：

```bash
curl -s -X POST "https://lite-ynab.zeabur.app/api/cron/monthly-expense-report/sheets?monthId=2026-04&dryRun=1&includeTables=1" \
  -H "Authorization: Bearer ***"
```

確認 rows 後，再正式寫入 Google Sheet：

```bash
curl -s -X POST "https://lite-ynab.zeabur.app/api/cron/monthly-expense-report/sheets?monthId=2026-04" \
  -H "Authorization: Bearer ***"
```

回傳應包含 `ok: true`、`spreadsheetId` 與各 tab 寫入 row count。正式同步排程建議設定為每月 1 號 00:20（Asia/Taipei），排在 Notion/Telegram 月報之後。

### 每日交易備份啟用與恢復

本功能對應 Issue #35，使用獨立 Sheet「Lite YNAB 交易備份」，不使用月報 `GOOGLE_SHEET_ID`。Repository PR 的測試只使用 synthetic fixtures，不會讀取或寫入正式財務資料。

正式 activation 需要 Matt 另行核准精確範圍，至少包含目標 service/environment、目的 Sheet、所需 env 名稱、唯一 scheduler、dry run、第一次回填、失敗處置及 rollback。取得授權之前維持未啟用；不要因 code merge 自動執行下列 production 步驟。

1. 唯讀核對目標 Sheet、服務帳號既有 Editor 授權、`CRON_SECRET`、`LITEYNAB_USER_ID`、`GOOGLE_TRANSACTION_BACKUP_SHEET_ID` 等變數名稱，禁止輸出值。目的 Sheet 必須與兩個月報 env alias 都不同。
2. 確認兩個分頁已存在且第一列分別符合程式碼的 `TRANSACTION_CURRENT_HEADERS` / `TRANSACTION_HISTORY_HEADERS`。不得在既有 History 插列、排序、編輯、清空或重建；事件的追加順序是 retry 還原基準。History 不是任意可編輯的工作表。
3. Read back 唯一 scheduler：每日 03:30 Asia/Taipei（UTC 19:30）、max concurrency = 1、單次 timeout、序列 retry 規則、失敗監控及人工補跑程序。沒有核實其中任何一項時不可啟用。不得同時有 cron、worker 與人工觸發。成功靜默，失敗保留 HTTP status、時間與 scheduler job/run ID，不保留原始交易或 token。
4. 所有重試必須等上一個服務端執行結束；scheduler timeout 或失去 response 不代表服務端已停止。遇到不確定完成狀態，暫停新觸發並先 read back/reconcile，確認沒有 in-flight run 才能序列重試。不得自動取消舊 request 後立刻在另一 instance 重跑；部署/重啟也需先讓 scheduler 排空。
5. 依授權先呼叫 `POST /api/cron/daily-transaction-backup?dryRun=1`，確認只回傳 `currentRows`、`events`、`rowHashes`。dry run 仍會讀取 production 財務資料，必須包含在 activation scope 中；此步驟不會寫入 Google Sheets。
6. 在同一序列執行首次正式 backfill，再核對 row counts、event types、row hashes 及可判讀的 UTC/Asia-Taipei 時間。此後才啟用排程。大型資料集的執行時間與 Sheet 容量應在核准的 dry run/readback 中確認。

端點會先驗證 secret 與 tenant，再取得 process-local single-flight，持有至讀取、寫入或錯誤處理完成。重疊回 `409`，所有 provider 失敗回 `500 / ok:false`，錯誤內容不包含 provider 原始 payload。單一 instance 的 guard 無法阻止另一 instance，亦不跨 restart；Redis、DB lock migration、多 scheduler 與 HA 都是 v1 non-goal。

寫入順序固定為 History header（需要時）→ History append → Current update → Current tail clear。若 History 已成功而 Current 失敗，下次重試先重播 History，以最後事件狀態和 Supabase 比較；相同狀態不追加，來源已再變動則追加下一個 transition。event ID 包含前一事件，因此 A→B→A→B 不會漏掉第二次 B。`deduped` 表示已記錄於 History、但 Current 尚未反映且本次來源仍相同的交易數。

恢復及失敗處置：

- 單次失敗：確認上一個 run 已結束，序列 retry；不清空 History。即使 append response 遺失，只要資料已可讀回，retry 會使用既有 journal。
- Current 舊尾列未清除：重試完成 Current 更新與尾端清除；相同 DELETE 不會再次追加。
- History 遺失、人工改動或 schema 不符：停止自動化，保存目的地副本後另行調查；不得以清空 History「修好」去重。
- 程式 rollback：在取得對應 production 授權後停用 scheduler，revert replacement PR；保留 Sheet 與 History。回復 Current 應由仍受 tenant 約束的程式重建，不能將 Sheet 回寫 Supabase。
- 錯誤 History 以另行核准的修正事件或人工標示前進處理，不可不可逆刪列。僅靠本備份不能自動還原交易以外的收入、預算、設定或逐筆事件稽核。

Google Sheets transport 的 RAW 行為依 [Google 官方 ValueInputOption](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption)，分頁採 [Supabase range 的含首尾區間](https://supabase.com/docs/reference/javascript/using-modifiers-range) 並核對 exact count；遇到比請求更低的 server row cap，會依實際回傳筆數繼續讀取所有四種資料表。

### Hermes 文字記帳 webhook

受保護 endpoint：`POST /api/hermes/transactions`

- Header：`Authorization: Bearer <HERMES_WEBHOOK_SECRET>`
- Body：

```json
{
  "text": "早餐 85 現金 蛋餅",
  "sourceId": "telegram:chat_id:message_id",
  "context": { "platform": "telegram", "chatId": "chat_id", "messageId": "message_id" }
}
```

成功時會新增 `transactions`：`source = 'hermes'`、`source_text` 保存原始文字、`source_id` 用於 dedupe、`metadata.hermes` 保存解析信心分數與來源 context。若未設定 `LITEYNAB_USER_ID`，request body 必須傳 `userId`。

## 六、目前不建議先做的事

在正式部署完成前，先不要急著做：

- Google Sheets 同步
- 其他外部 webhook 串接
- 太多額外整合

原因是：
- 先讓正式版主流程穩定
- 先確認正式 Supabase 沒問題
- 正式網址確定後，再接外部整合比較省工

## 七、部署後下一步建議

部署完成後，建議依序做：

1. 建立測試帳號，驗證登入後完整功能
2. 修部署後才會出現的環境差異
3. 同步 `package-lock.json`（本地執行 `npm install` 後推上 GitHub，讓 Dockerfile 可改回更穩定的 `npm ci`）
4. 設定自訪網域（選用）
5. Google Sheets 同步
6. 更多端對端測試

## 八、實際部署踩坑紀錄（2026-04-05）

以下是首次部署到 Zeabur 時遇到的問題與解法，留作日後參考。

### 問題 1：Zeabur 自動產生的 Dockerfile 使用 node:22，npm update 壞掉

Zeabur 自動偵測 Next.js 專案後產生的 Dockerfile 包含 `RUN npm update -g npm`，在 node:22 環境下觸發 `MODULE_NOT_FOUND: Cannot find module 'promise-retry'` 錯誤。

嘗試過的方法：
- 設定 `ZBPACK_NODE_VERSION=20` 環境變數 → 無效
- 在 Zeabur Settings 填寫 Dockerfile override → 被忽略，仍使用 node:22

**解法**：在 GitHub repo 根目錄放置自訂 `Dockerfile`，Zeabur 會優先使用它。

### 問題 2：npm ci 因 lock 檔不同步而失敗

`npm ci` 要求 `package.json` 和 `package-lock.json` 完全同步，但實際有缺少 `@emnapi/runtime` 等套件。

**解法**：Dockerfile 中改用 `npm install` 取代 `npm ci`。

### 問題 3：COPY public 目錄不存在

Dockerfile 中 `COPY --from=builder /app/public ./public` 失敗，因為本專案沒有 `public` 資料夾。

**解法**：移除該行。

### 問題 4：NEXT_PUBLIC_ 環境變數需在建置階段注入

Next.js 的 `NEXT_PUBLIC_` 開頭變數會在 `npm run build` 時被嵌入前端程式碼，因此必須在 Docker 建置階段透過 `ARG` + `ENV` 傳入，不能只在執行階段設定。

Zeabur 會自動將環境變數作為 Docker build args 傳入，所䷥ Dockerfile 中需要：

```dockerfile
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 最終可用的 Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```
