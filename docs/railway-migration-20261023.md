# lite-ynab：Zeabur → Railway 搬家步驟（2026-10-23 準備）

> 依據：Matt 10/23 12:26 核准的 Zeabur 收攤方案（期限 10/30 前，要趕在 11/1 00:10 Hermes 月報之前）。
> 本文件只列變數**名稱**與來源，不含任何值。值由 Matt 在 Railway 後台親自貼（建議用 Seal）。

## 這支分支改了什麼

- 新增 `railway.json`：用 repo 內現有 `Dockerfile` 建置、健康檢查 `/login`（未登入回 200；首頁 `/` 是 307 轉址，不適合當健檢）、失敗才重啟。
- `Dockerfile` 不用改：`NEXT_PUBLIC_SUPABASE_URL`／`NEXT_PUBLIC_SUPABASE_ANON_KEY` 已宣告成 `ARG`，Railway 會把同名服務變數當 build arg 傳進去；`next start` 讀 Railway 給的 `PORT`。
- 本機驗證（10/23）：`docker build` 成功；`docker run -e PORT=3123` 後 `/login`＝200、`/`＝307。
- Zeabur 不受影響：Zeabur 不讀 `railway.json`。

## 1. Railway 建服務（總控）

1. Railway 專案（可沿用正式站所在專案，或另開 `lite-ynab`）→ New Service → GitHub repo `chahababa/lite-ynab`，分支 `main`（本 PR 合併後）。
2. Settings → Build：確認 Builder＝Dockerfile（`railway.json` 會自動帶）。
3. Settings → Networking：Generate Domain（先拿 `*.up.railway.app` 做影子驗證）；目標 port＝Railway 自動偵測的 `PORT`。
4. **先貼完變數再觸發第一次建置**（`NEXT_PUBLIC_*` 在建置時寫進前端；建置後才貼要再 Redeploy）。

## 2. 變數名稱清單（Matt 貼值）

| 名稱 | 來源 | 備註 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Zeabur 同名搬過去 | 建置期需要 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Zeabur 同名（10/17 輪換後的新值） | 建置期需要 |
| SUPABASE_SERVICE_ROLE_KEY | Zeabur 同名（10/17 輪換後的新值） | Seal |
| LITEYNAB_USER_ID | Zeabur 同名 | |
| CRON_SECRET | Zeabur 同名 | 要和 Hermes `LITE_YNAB_CRON_SECRET`、GitHub secret `DAILY_TRANSACTION_BACKUP_CRON_SECRET` 一致 |
| HERMES_WEBHOOK_SECRET | Zeabur 同名 | 要和 Hermes 各 profile `LITE_YNAB_HERMES_WEBHOOK_SECRET` 一致 |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Zeabur 同名 | |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Zeabur 同名 | 多行金鑰，貼時保留換行或 `\n` 原樣 |
| GOOGLE_SHEET_ID | Zeabur 同名 | |
| GOOGLE_TRANSACTION_BACKUP_SHEET_ID | Zeabur 同名 | |
| NOTION_API_KEY | Zeabur 同名（10/17–18 輪換後的新值） | |
| NOTION_MONTHLY_REPORT_DATABASE_ID | Zeabur 同名 | |
| TELEGRAM_BOT_TOKEN | Zeabur 同名 | |
| TELEGRAM_CHAT_ID | Zeabur 同名 | |
| NODE_OPTIONS | 視情況 | Zeabur 有設；先不帶，若 Railway 上連 Supabase／Google 出現 DNS 或 IPv6 逾時再補同名同值 |

不用帶：`PASSWORD`、`PORT`（Railway 自給）、`ZBPACK_NODE_VERSION`（Zeabur 專用）。
程式還認得但 Zeabur 沒設的：`CTBC_INBOX_ENABLED`（不設＝CTBC 收件關閉，維持現狀）。

## 3. 影子驗證（在 `*.up.railway.app` 上，切換前）

- `GET /login` 200，能用帳密登入、看到交易。
- 月報 dry-run（不寫 Notion）：`POST /api/cron/monthly-expense-report/sheets?monthId=<上月>&dryRun=1`，帶 `Authorization: Bearer <CRON_SECRET>`（指令見 `DEPLOYMENT.md`，只把網址換成新網址）。
- Hermes 記帳 webhook 用新網址手動送一筆測試或 dry-run（由總控依 Hermes skill 做）。

## 4. 網域（Matt 親按）

1. Railway → Settings → Networking → Custom Domain：`ynab.hoochuu.com.tw`。Railway 會顯示 CNAME 目標（`xxxx.up.railway.app`）及可能的 TXT 驗證記錄。
2. PChome DNS（cyberdns）新增：
   - CNAME `ynab` → Railway 顯示的目標
   - 若 Railway 要求：TXT（名稱與值照 Railway 畫面）
   - **不要動 MX 與其他既有記錄**。
3. 等 Railway 顯示憑證簽好（綠勾）。

## 5. Supabase（lite-ynab 自己的 Supabase 專案，不是正式庫）

- 本 app 登入是 `signInWithPassword`，**沒有 OAuth 回呼，Redirect URL 不是必要**。
- 建議：Authentication → URL Configuration → Site URL 改成 `https://ynab.hoochuu.com.tw`；Redirect URLs 加 `https://ynab.hoochuu.com.tw/**`（舊 Zeabur 網址保留到停運）。

## 6. 切換時要改的外部網址（只列位置；改動屬 Hermes／GitHub 設定，需 Matt 同意）

| 位置 | 目前值（網址，非金鑰） | 改成 |
|---|---|---|
| `.github/workflows/daily-transaction-backup.yml` 第 35 行 `BACKUP_ENDPOINT`（寫死在 workflow，不是 secret） | `https://lite-ynab.zeabur.app/api/cron/daily-transaction-backup` | `https://ynab.hoochuu.com.tw/api/cron/daily-transaction-backup`（另開小 PR） |
| Hermes `~/.hermes/.env` 的 `LITE_YNAB_HERMES_ENDPOINT` | Zeabur 網址 | 新網址 `/api/hermes/transactions` |
| Hermes 各 profile `.env` 的 `LITE_YNAB_HERMES_ENDPOINT`：cfo、company-google、nicole-hoochuu、notion-manager、pmo-hoochuu-stores、pmo、qa、release、review、ux-qa、vibe-discovery、vibe | 同上 | 同上 |
| Hermes `~/.hermes/scripts/lite_ynab_monthly_report.py`：讀 `LITE_YNAB_BASE_URL`→`LITE_YNAB_HERMES_ENDPOINT` 的 host→第 44 行 `FALLBACK_BASE_URL`（寫死 Zeabur） | Zeabur | 建議在 `~/.hermes/.env` 加 `LITE_YNAB_BASE_URL=https://ynab.hoochuu.com.tw`，並把 fallback 改新網址 |
| 舊腳本 `~/.hermes/profiles/pmo/scripts/lite_ynab_monthly_report_cron.py`（第 23 行寫死 Zeabur、第 34 行用 `zeabur variable list` 讀密鑰） | Zeabur | 確認已無 cron 引用後停用；若仍被引用要改 |
| Hermes skill `lite-ynab-transaction-entry/SKILL.md`（主 skills 與各 profile 複本，第 27／51 行附近預設值） | Zeabur | 改新網址（文件型預設值） |
| repo `README.md` 第 5 行、`DEPLOYMENT.md` 第 5、178、203、212、219 行 | Zeabur | 新網址（另開文件 PR） |

**Telegram**：只用 `sendMessage` 主動推送（`src/lib/telegramNotify.ts`），**沒有 webhook**，搬家不用重設 Telegram。

## 7. 切換順序（建議 10/27–10/30，避開 11/1 00:10）

1. 影子驗證全過 → DNS 生效 → 新網域 `/login` 200。
2. 改 Hermes `LITE_YNAB_HERMES_ENDPOINT`／`LITE_YNAB_BASE_URL` → 跑 `lite_ynab_monthly_report.py --dry-run`。
3. 合併 GitHub workflow 網址 PR → 這支 workflow 只有 schedule、沒有 workflow_dispatch，等隔天台北 03:30 看執行結果（或在網址 PR 一併加 workflow_dispatch）。
4. Zeabur 服務先保留跑著（回退用），12/1 前再停用。

## 8. 回退

把上面第 6 節各處網址改回 `https://lite-ynab.zeabur.app/...`；Zeabur 服務未刪就立刻恢復。注意 Zeabur 上那份程式是 10/8 部署、金鑰 10/17 換過但沒重部署，回退前要在 Zeabur Redeploy 一次。

## 未驗項

- Railway 實際建置（CLI 未登入，未建服務）。
- 真金鑰下的登入、Google Sheet、Notion、Telegram 呼叫（本機只用 placeholder 建置）。
- PChome DNS 與 Railway 憑證簽發。
