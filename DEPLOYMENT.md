# DEPLOYMENT

Lite YNAB 目前建議的部署平台是 `Zeabur`，資料庫與登入服務使用 `Supabase`。

這份文件整理的是：
- 部署前檢查清單
- 正式環境準備流程
- Vercel 設定步驟
- 上線後驗證項目

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

正式部署至少需要這兩個環境變數：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

它們會來自你的正式 Supabase 專案。

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
```

3. 確認以下資料表與 RPC 已存在：

資料表：
- `category_groups`
- `categories`
- `payment_methods`
- `monthly_incomes`
- `budgets`
- `transactions`

RPC：
- `bootstrap_default_category_groups()`
- `bootstrap_default_categories()`
- `bootstrap_default_payment_methods()`
- `initialize_monthly_budget(text)`

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
```

5. 觸發第一次部署

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

1. 正式環境 smoke test
2. 修部署後才會出現的環境差異
3. Google Sheets 同步
4. 更多端對端測試
