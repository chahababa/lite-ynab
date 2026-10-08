# CTBC S8 唯讀查證與 Matt 決策包（2026-09-27）

結論：**`BLOCKED_NO_APPLY`**。本輪 `production_mutation=false`、`S9_implementation=false`；未執行正式 migration/history/data write、Gmail、OAuth/secrets、排程啟用或部署。不是 `APPLIED_VERIFIED`，舊附條件 A 不擴權。

入口：[Issue #57](https://github.com/chahababa/lite-ynab/issues/57)、[規格 PR #56](https://github.com/chahababa/lite-ynab/pull/56)、[Phase 2 規格](ctbc-email-import-phase-2-spec.md)。本文件只記錄公開程式/schema 的狀態、聚合判斷與缺口；無真實交易、卡、郵件、帳號、憑證、備份畫面或 raw transcript。所有快照在正式操作前必須重新取得。

## 1. 本輪 repo、CI、部署分開讀回

2026-09-27 約 09:00–09:10 Asia/Taipei 進場快照：

| 層次 | 實際讀回 | 能證明的範圍 |
| --- | --- | --- |
| main | `d115dd8de7ca35e9d4a12d607df285eb281c5bda` | S8 migration 程式碼已 merge；不能證明正式 constraint。 |
| PR #56 進場 head | `f76488d0dba9e998bcde69c3b93a64ccc2790a7f`；OPEN/CLEAN，無 reviews | 原本兩份文件；尚未 merge，非功能成品。本輪增加此決策包及五操作契約，須新 head 重新 gate。 |
| main CI | [35186336160](https://github.com/chahababa/lite-ynab/actions/runs/35186336160) success，head = 上述 main | repo quality 與 local migration tests。 |
| PR 進場 CI | [36257749255](https://github.com/chahababa/lite-ynab/actions/runs/36257749255) 兩項 success，head = 進場 PR SHA | 僅舊 head，不能替新增 commit 放行。 |
| 實際 GitHub Zeabur 記錄 | deployment `6496372183`、2026-09-17 05:39:08Z、state success、SHA = 上述 main、`https://lite-ynab.zeabur.app` | 歷史 provider 回報，不能證明目前 provider 的 current image。 |
| 較新 deployment 記錄 | `6499183157`、`6519671189` 均 inactive；description 明示誤建 metadata、未請求 provider deploy | 不得把最新 deployment row 當 live 成功；本輪只 GET，未建立 deployment。 |
| 公開 smoke | GET `/login` HTTP 200，回應包含登入文字 | 服務可達；無登入、無金融資料讀取，不能證明 live SHA/DB/scheduler。 |
| provider 權限 | Zeabur MCP `list_projects` 回 `ERROR_INVALID_TOKEN` | 未能重新確認 branch 自動部署設定、current deployment、rollback 控制權。未嘗試登入或修改 token。 |

使用新 sibling clone `lite-ynab-ctbc-handoff-20260927`，remote = `https://github.com/chahababa/lite-ynab.git`，checkout PR #56 branch；進場乾淨。既有 checkout 未 reset/clean/覆寫。Codex 是唯一工程 writer，獨立 reviewer/QA 僅唯讀檢查，不改 branch。

`Dockerfile` build 為 `npm ci`、`next build`，runner 為 `npm start` → `next start`；package scripts 沒有 migration hook。這只證明 repo 啟動路徑，不足以證明 provider 外部 hook。既有 main 自動部署曾被 PR #55 接受；本輪仍須重新讀 provider 後才可考慮合併，文件修改也不能跳過 gate。

## 2. 正式 DB 唯讀結果

透過已連接 Supabase MCP，project inventory 確認 `Lite YNAB` production ref `ihntzjkrkskztmbfovdt`，`ACTIVE_HEALTHY`、Postgres 17。未 link checkout，未使用 staging/production `--linked`，未取得或輸出 API key。

SQL 在 `BEGIN READ ONLY`、15 秒 statement timeout 下查 catalog、history 與聚合 duplicate count；2026-09-27 **01:02:23Z**（09:02:23 台北）讀回：

| 檢查 | 結果 | Gate 判定 |
| --- | --- | --- |
| 非 NULL `(user_id, source, source_id)` 重複群組 | 0，沒有取回 group keys 或交易列 | 當時 duplicate preflight 通過；不是 apply 許可。 |
| `transactions_user_source_source_id_key` | catalog 無此 constraint | S8 **未套用／未驗證**。 |
| `idx_transactions_user_source_source_id` | 存在、valid、非 unique，partial `source_id IS NOT NULL` | 舊狀態仍存在；不能提供 S8 唯一性。 |
| `user_id/source/source_id` | 前二者 NOT NULL；source_id nullable | 符合 S8 允許多筆 NULL source_id 的前提。 |
| transactions RLS | enabled，非 forced | 只確認旗標；未以正式交易做越權測試，不代表新候選/RPC 已安全。 |
| migration history | 共 15 筆；July 為 `20260703112413`，repo 為 `202607030001`；缺 `20260917040000` 與 `20260917050000` | drift 仍在；不自行 repair。 |
| S4A 函式 | `reset_monthly_auto_budgets(text)` 仍在，SECURITY DEFINER；`(uuid,text)` 不存在，函式體未按 p_user_id 篩選 | 實際 schema 未改為 S4A；不只是缺 history。未呼叫該 mutating RPC。 |

July history statements 與 repo blob 移除 SQL 單行註解、空白及分號並轉小寫後的 MD5 均為 `96fb02dbf46f1aa27084fa34bdcf3403`。這是範圍有限的格式正規化比對，非完整 SQL 語意證明或全 schema 等效證明，**不授權改版本**。repo 檔亦明載當時正式版號 `20260703112413`。

Migration 的可信 hash 使用 **Git blob 原始 bytes**（`git show HEAD:supabase/migrations/<file>`），避免 Windows checkout CRLF 誤差：

| Artifact | SHA-256 |
| --- | --- |
| `20260917050000_transaction_source_idempotency.sql` | `9bf138a554b78ba42f51d25c68a50d829f0aa1b5fe3ee0e1ba94269f89ac88d7` |
| `20260917040000_tenant_scoped_monthly_budget_reset.sql` | `8ce83c8f0d6cc66ccbe72d5f33f8bbe0328c545e594641aa5c956ac0fb6c4b1b` |

S8 唯一原範圍仍是第一個檔案：duplicate guard → drop 舊 index → add `UNIQUE (user_id, source, source_id)`。不含任何交易修復、相鄰 migration、既有 history repair 或 source enum 擴充。

### 可重跑的最小唯讀 SQL

以下以 connector 的**明確 production ref**執行，結果只含 counts、catalog、函式是否存在；不查真實金融明細。工具多 statement 可能只回傳最後一個結果，故合併為單一 JSON evidence。

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
  'checked_at', now(),
  'duplicate_identity_groups', (
    SELECT count(*) FROM (
      SELECT 1 FROM public.transactions WHERE source_id IS NOT NULL
      GROUP BY user_id, source, source_id HAVING count(*) > 1
    ) d
  ),
  's8_constraint', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', conname, 'validated', convalidated,
      'definition', pg_get_constraintdef(oid, true)
    )), '[]'::jsonb)
    FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_user_source_source_id_key'
  ),
  'legacy_index_exists',
    to_regclass('public.idx_transactions_user_source_source_id') IS NOT NULL,
  's4a_legacy_present',
    to_regprocedure('public.reset_monthly_auto_budgets(text)') IS NOT NULL,
  's4a_tenant_present',
    to_regprocedure('public.reset_monthly_auto_budgets(uuid,text)') IS NOT NULL
) AS evidence;
COMMIT;
```

## 3. S4A 的產品依賴與相容性（獨立決策）

- S8 SQL 只引用 transactions 與 source index，**不呼叫也不引用** monthly reset 函式；Phase 1 CTBC parser/dry-run 也不呼叫此 RPC。現有證據未建立 S4A 是 CTBC 產品前置依賴。S9 的明確前置仍是 S8 `APPLIED_VERIFIED`。
- 但是 `src/app/api/cron/monthly-budget-reset/route.ts` 在上述 main/PR head 只送 `{p_month_id}` 或 `{}`。S4A migration 新函式要求 `p_user_id uuid` 並 drop 舊 `(text)` 函式；**若直接套用 S4A，現有 route 將不相容**。必須另案設計可信 tenant 來源、部署先後順序、舊路由停止/相容期、對應測試與 rollback。不得為清 history 一併套用 S4A。
- 現行 globally scoped SECURITY DEFINER 是相鄰正式風險；本輪沒有呼叫、修函式、停既有排程或改環境。它值得另開 gate，但不是擴大本輪 S8 授權的理由。
- 後續 CTBC candidate schema、RPC 與 `transactions_source_check` 的 `email_import` 擴充都尚未實作，均另走 Tier-2 PR/apply gate。S8 套用也不等於這些功能已存在。

## 4. 仍欠缺的 release 證據

| 缺口 | 本輪證據與限制 | 下一個必要輸入 / owner |
| --- | --- | --- |
| 可還原 checkpoint | 未取得本輪 provider backup metadata；目前 connector 無 backup list/restore 工具。舊交接「有備份清單」不是本輪可還原證明。 | Matt 指定授權 operator，在受保護 provider UI/API 唯讀確認 checkpoint 狀態、涵蓋 schema/history、restore 可用性與資料損失範圍；不得在公開 GitHub/聊天貼 backup payload/畫面。 |
| operator 與窗口 | 尚無具名 DB apply/restore 操作員、approved maintenance window 或最大可接受停機/資料損失。 | Matt 指定人與窗口；恢復 production 是另需授權的破壞性操作。 |
| 容量、鎖與承載 | 已查 DB size aggregate，但 DB size 不證明 storage headroom、index build 空間、鎖等待、備份容量或時間。 | Operator 唯讀確認 provider compute/storage，reviewer 審 lock/statement timeout、abort 條件及停止寫入窗口；合成 DB 測量不能冒充正式負載。 |
| exact-one preview/apply | 本機 CLI `2.118.0` 的 `db push`/`migration up --help` 沒有指定單一 migration version/file 的 apply 選項；`db push --dry-run` 是列出 pending。只讀 help，未對正式 DB push/dry-run/up。 | Codex 提供可重現隔離 executor/manifest 與 provider 支援證據；逐項列出實際 SQL、history recording、vault/roles/seed 副作用，獨立審查後取得必要的新精確授權。 |
| Zeabur auto-deploy / rollback | connector token 無效；歷史 GitHub success + public 200 不能證明現在配置或 rollback 權限。 | Matt/provider operator 在受保護設定讀回 branch、hook、current SHA/image 及上一個可回復 artifact；需要重新連接權限時走 native 授權，不貼 token、不由本輪更改 OAuth/secrets。 |

[官方 CLI 參考](https://supabase.com/docs/reference/cli/supabase-db-push) 說明 push 的 pending/dry-run 語意；本輪以實際 `2.118.0 --help` 為版本證據。新版 help 特別指出 push 可能先更新 vault secrets，除非 `--skip-vault`；不能因 dry-run 字樣就把未驗證的 remote path 當零副作用 preview。未執行 remote push，也不使用 `--include-all` 繞過 drift。

[官方 backup 說明](https://supabase.com/docs/guides/platform/backups) 提供 dashboard/API 查清單與 restore 路徑；restore 會讓服務暫不可用，DB backup 不包含 Storage 實體物件。每日 transaction backup workflow 最近 success 是**帳務匯出**，不是 S8 schema/history 可還原 checkpoint；未讀其私有輸出。

已查 [Supabase changelog](https://supabase.com/changelog)；changelog.md 端點未成功，改用官方 index。Node 20 支援及 Data API exposure 的變更留待 S9 明確版本與 grant/RLS 設計，本輪 Node 24、本 repo CI/Docker Node 22，沒有套件更新或安全設定變更。

## 5. 精確範圍、回復方式與 A/B/C

**目前無可立即批准執行的正式 apply 包**：operator/checkpoint/window/provider executor 尚缺。下列選項是 Matt 的路徑決定；沒有一項代表現在可以寫正式 DB。

| 選項 | 精確範圍 | 風險與回復 | 交付後 gate |
| --- | --- | --- | --- |
| **A（建議）：維持 NO_APPLY，補 S8 prerequisite** | Matt 指定 operator/checkpoint/window；Codex 只做唯讀與 repo-only executor/runbook，保留原 S8 blob/hash；不 repair July、不套 S4A。 | 本輪無正式寫入，文件可新 PR revert；未知還原能力仍須取得證據。 | 補齊上表後交 exact ref/SQL hash/preview/鎖與容量證據，fresh independent Review/QA/Release；必要的新範圍再由 Matt 決定。 |
| B：研究替代單版 provider 路徑 | 只在隔離合成 DB 驗證指定 S8 SQL 與 history recording；若 provider 產生新 version/name，明列與原 `20260917050000` 的差異。 | 替代 executor 或新 history 記錄會改原授權範圍；不得把「研究」當正式 apply。回復先丟棄隔離環境/文件 revert。 | 選定受支援途徑與 exact version 後另交精確操作包與新授權；不能直接呼叫 MCP apply_migration。 |
| C：優先另案 S4A/history 相容性包 | 僅文件與隔離合成設計：July provenance、S4A tenant route/函式契約、先後順序與 rollback。 | 不套 S4A、不 repair、不修改既有 scheduler；避免現 route 因 drop 舊函式失效。 | 與 S8 分開的 PR、獨立 review/test/release 及正式授權；不解除 CTBC S9 hard stop。 |

正式 S8 若未來獲准：必須在執行前重查 duplicates/catalog/history/hash/ref，確認受支援 executor 把 guard/drop/add/history 原子處理，設定鎖等待及最大窗口，任何 unexpected pending/vault/roles/seed/history diff 即 abort。**不能在 production 上以 BEGIN/ROLLBACK 試 DDL 充當唯讀 preview**，它仍會取得正式鎖。

回復決策需包含：未 commit 的失敗由 transaction rollback；成功後先停依賴 S8 的新寫入，評估保留 constraint 的 forward-fix。若確需撤 constraint/recreate 舊非唯一 partial index，只能另批准精確 catalog SQL，不刪改交易、不假修 history。整庫 restore 是最後手段，可能回退其他功能與新交易，需 checkpoint/operator/停機/資料損失的新授權，不能沿用舊 A。不要用 Git revert 當成 DB rollback。

## 6. 本輪驗證與後續唯一合法步驟

- 規格：Phase 2 第 4 節及 MVP 同步五種動作；already_recorded 與 ignored 分終態，defer 維持 pending/conflict；event/idempotency/version/owner/link/30-7-90 retention 驗收有明確結果。
- 本機全程乾淨 clone、無 `.env.local`、沒有 dev server；`npm ci` 成功，`npm run lint` 0 errors / 17 個既有 warnings，`npm run typecheck` 成功，`npm test` **40 files / 305 tests passed**。未新增對產品實作的測試；新五操作驗收仍是規格，未宣稱功能通過。
- `npm run build` 成功（Next.js 15.5.14，沒有新增 CTBC route）；`git diff --check` 與三份文件的相對檔案連結檢查通過。Local migration smoke 由新 PR head 的 CI local Supabase job 重跑；本機已有其他任務的 `supabase_db_lite-ynab-local`，本輪未 reset/使用它。independent read-only review/QA 及 exact-head CI 的最終結果以本輪交付 SHA 的證據讀回。
- 沒有新 UI，因此本輪是 UX **規格檢查**，不是手機/鍵盤/a11y 實測。沒有部署/登入 smoke、真實 Gmail 或正式排程測試。

下一個唯一 owner：**Matt 選路徑並指定受保護的 operator/checkpoint/window；Codex 繼續 S8 唯讀補證**。S8 未 `APPLIED_VERIFIED` 時不開 S9。不合併 PR #56，直到新 head CI/獨立審查及 Zeabur auto-deploy/rollback readback 都有證據；本輪 commit/CI 不是 merge/deploy/正式啟用證明。
