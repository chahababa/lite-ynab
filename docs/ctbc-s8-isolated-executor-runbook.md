# S8 隔離 executor 驗證與放行包補證

狀態：**`BLOCKED_NO_APPLY`**。此為 A 路徑的 repo-only 研究／隔離合成驗證，沒有 S9、正式 DB write、history repair、S4A apply、Gmail、OAuth/secrets、排程或部署。

2026-09-27 Matt 明確選 A 並指定自己為正式操作與備份還原負責人。operator 缺口已關閉；窗口尚待容量、負載與備份證據後提案。這不代表准許任一正式 apply／restore，也不擴大舊附條件 A。

交接：[Issue #57](https://github.com/chahababa/lite-ynab/issues/57)；五操作規格與上輪決策：[PR #56](https://github.com/chahababa/lite-ynab/pull/56)。本輪從 main 建新 worktree／branch `test/s8-isolated-preflight-20260927`；既有 checkout、PR #56 branch、local Supabase 均保留。

## 1. 本輪唯讀快照

| 檢查 | 實際結果 | 限制 |
| --- | --- | --- |
| main | `d115dd8de7ca35e9d4a12d607df285eb281c5bda` | 只有 repo S8 已合併。 |
| PR #56 | `ea89dc73421cce0e2ca01b572352297b1f445a3c`、OPEN/CLEAN、兩項 CI SUCCESS | 規格未 merge；不是本輪新 branch gate。 |
| 正式 SQL readback | 2026-09-27 03:04:16Z（11:04 台北）：duplicate groups=0、S8 constraint 無、legacy index 在、July drift 與缺 S4A/S8 history 持續 | 不取回交易列或來源 keys；僅 catalog/history versions/aggregate。 |
| 正式 catalog | 03:16:14Z（11:16 台北）：Postgres 17.6；ledger 欄位 `version text NOT NULL`、`statements text[]`、`name text`、`created_by text`、`idempotency_key text`、`rollback text[]`；PK(version)、UNIQUE(idempotency_key) | 已補進合成 ledger 形狀；未證明 future direct executor role/grants/defaults/triggers 或 provider provisioning trace。 |
| index／鎖 | 舊 index ready/valid/non-unique；交易表當時 waiting locks=0；source index 無 ltree key | 只是一刻快照，不能當維護窗口、headroom 或鎖延遲保證。 |
| Zeabur | MCP `list_projects` 仍 `ERROR_INVALID_TOKEN` | 未改 token、未重新部署；current SHA／auto-deploy／rollback 權限仍未證。 |
| 備份 browser | IAB inventory 無既有登入；開備份頁與讀取連續 timeout，未取得可見登入／checkpoint | 只開唯讀頁，不登入、不讀憑證、不 restore；需要 Matt 透過原生流程恢復存取。 |

所有正式 SQL 均 `BEGIN READ ONLY` + `statement_timeout='15s'`，明確 ref `ihntzjkrkskztmbfovdt`。未 link worktree，未對正式連線跑 CLI dry-run/push/up。

## 2. 官方 executor 研究與選擇

獨立唯讀 source review 的 verdict 是 **`RESEARCH_PASS / PRODUCTION_NO_GO`**。引用均固定官方 CLI `v2.118.0`，不是浮動 develop。

- 公開 [db push flags](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/commands/db/push/push.command.ts#L9) 沒有 version/file 選項；[migration up](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/commands/migration/up/up.command.ts#L9) 還沒有 dry-run/skip-vault。
- [pending 比對](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/migration-pending.ts#L47) 與 [push core](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/db-push-core.ts#L133)：remote July 版本缺 local 對應時拒絕；`--include-all` 不解除 missing-local。不能用 repair 或一併套 S4A 來通過。
- [linked resolver](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/db-config.layer.ts#L98) 可能建立 `read_only:false` 臨時登入角色；故 linked dry-run 不保證整個 provider invocation 唯讀。已知 [direct db-url resolver](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/db-config.layer.ts#L476) 不建 Management API runtime；本輪只對自行建立的 loopback fixture 使用它。
- [history insert](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/migration-apply.ts#L439) 從 filename 擷取原 version/name，將 SQL 解析後 statements 記錄。S8 guard/drop/add/history 在同一 final batch；[ledger provisioning](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/migration-history.ts#L95)、`RESET ALL`、vault/roles/seed 不可混稱整個 invocation 原子。
- ledger provisioning 的 4 秒 lock timeout 不涵蓋 S8；S8 前會 RESET ALL。隔離測試使用 startup connection `options` 提供 lock/statement limits，並實測 lock timeout；未在正式 DB 設 role defaults 或改 server config。
- [官方 apply API](https://supabase.com/docs/reference/api/v1-apply-a-migration) 的公開 body 只有 query/name/rollback，沒有 version，且未公布足以證明此原版號與原子性的契約。此包不推薦以 MCP/API apply 或額外 upsert history 來繞過 gate。

**候選方法（我們組合的 manifest，不是官方單版 flag）**：獨立 workdir 的 migration 版本集合完全對齊「已套用 remote history」，只增加 unchanged S8，排除未套的 S4A/July repo alias。再以官方 `db push --skip-vault` 確認 pending 只有 S8。此方法在合成資料已驗證，但 production manifest 還未製作／批准。

### 正式 manifest 必須補齊

1. 受保護唯讀取得所有 remote history 檔案與 version/name/statements 的 provenance；檢查敏感內容，禁止將 raw 私有 SQL 或資料放到公開 GitHub。
2. 逐檔封存 hash、與當下 history 版本集合比對；July mapping 需精確審查，不能靠之前忽略空白/分號的 MD5 宣稱全 SQL 等效。
3. 原 S8 檔與 version/name 保持不變：`20260917050000` / `transaction_source_idempotency` / SHA-256 `9bf138a554b78ba42f51d25c68a50d829f0aa1b5fe3ee0e1ba94269f89ac88d7`。
4. 固定 CLI package version及實際平台 executable/bundle hash，檢查 direct executor credentials 的最小 scope、TLS 與 privilege。憑證由 Matt 在原生環境保管，不貼聊天／GitHub，不修改 OAuth/secrets。
5. 封存完整 command/config、無 vault/roles/seed、無額外 ledger provisioning DDL 的證據，確認 startup options 在 exact runtime 生效。任何額外 pending 或 target/SQL/hash/history diff 都 abort。

**本輪歷史檔是明標 `SYNTHETIC ONLY` 的 SELECT 1 placeholders**，僅證明 pending-selection 邏輯。它們不代表正式舊 SQL，不得複製成正式 release manifest。

## 3. 可重跑的隔離合成驗證

```powershell
npm ci --no-audit --no-fund
npm run test:s8-isolated
```

入口：[harness](../scripts/test-s8-isolated-preflight.mjs)。無 target arguments、production mode、受保護 env 輸入或 remote ref。腳本會：

- 檢查 local Docker endpoint；使用官方 postgres image 的固定 digest，建立 UUID/label 專屬容器，僅綁 `127.0.0.1` 隨機 port，PGDATA 是 tmpfs。不碰既有 container/volume，不 mount checkout 或 `.env.local`。
- 使用 npm 官方套件 `supabase@2.118.0`；拒絕版本不符，移除 inherited SUPABASE/PG/DATABASE_URL/DOTENV_PRIVATE_KEY env，產生無 provider ref 的暫存 config/manifest。
- 用 Git blob bytes 核對原 S8 hash。10000 筆交易均為腳本生成的合成 fixture；history 使用已知版本集合及假 SQL，S4A 只有無帳務功能的 sentinel。
- 只對該 run 自行建立的 loopback URL 執行 `db push --skip-vault`。SSL 關閉只適用此暫存 loopback fixture；正式執行包必須另驗 TLS，不能沿用此 URL。
- 失敗比較 rows checksum、legacy index、S8 constraint、既有 ledger records、S4A sentinel；成功驗證原版號/name/3 statements、範圍 unique 與 replay。
- finally 驗證 immutable container ID 的 owner label 後刪除本輪容器；刪除本輪 mkdtemp 建立的資料夾。沒有清除其他工作目錄。

| 隔離案例 | 結果／保護 |
| --- | --- |
| repo-shaped July drift | CLI 拒絕；資料/catalog/history 不變。 |
| aligned dry-run | structured plan 恰好只有原 S8，狀態不變。 |
| source 重複 | guard abort，原 index 在、constraint 無、ledger 未新增、row checksum 不變。 |
| final history insert 故障 | injected synthetic trigger 拒絕，S8 DDL 與 history 同批回復，資料不變。 |
| 既有讀鎖阻擋 DDL | startup `lock_timeout=250ms`、`statement_timeout=5s`，CLI 因 lock timeout 失敗且回復。 |
| 成功 apply | ledger 記 `20260917050000`、原 name、3 statements；constraint valid、舊 index 移除、既有 records/rows/S4A 不變。 |
| CLI replay | up-to-date；不重做 DDL，不新增 ledger 或交易。原 SQL 本身不具任意 replay idempotency；timeout 後仍須先 readback，不能盲重跑。 |
| constraint scope | 同 owner/source/id 重複拒絕；NULL source_id 與不同 owner 可寫（測試交易 rollback）。 |
| synthetic checkpoint restore | 套用前 pg_dump 在新合成 DB 還原 schema/history/rows，與 baseline 一致。不是正式 provider checkpoint 證明。 |

首次本機實測 **9/9 PASS**：CLI 2.118.0、Node 24.12.0、Postgres **17.11**；10000 synthetic rows，成功 CLI invocation 約 **2.9 秒**、含 startup options 的 lock-failure case 約 **4.0 秒**。這些時間含 npm/CLI 啟動與查核，不是正式 DB DDL 耗時、容量或還原 SLA。正式 engine 17.6，provider/full-schema/privileges 的差異仍需補證；既有 full-schema Supabase migration smoke 仍由 CI 另跑。

GitHub CI 新增 `S8 isolated executor experiment`，只跑上述合成腳本；無 workflow_dispatch、schedule、provider secrets、正式 endpoint 或 production deployment。其他 CI jobs 保留。

## 4. Release 邊界、回復與下一步

**可完成的部分**：operator=Matt、S8 artifact 固定、官方 executor 源碼審查、local synthetic 成功／失敗／replay／restore 測試。

**仍 BLOCKED**：正式 checkpoint 可還原性、storage/compute headroom、窗口／寫入暫停方法、Zeabur current SHA/auto-deploy/rollback、完整 production manifest provenance、direct executor TLS/權限/binary hash/trace、fresh exact-head independent Review/QA/Release，以及那一次正式操作的精確批准。

下一步由 Matt 恢復 provider 原生唯讀存取；Codex 取得可見證據並補封存包。備份還原按 [官方 backup 說明](https://supabase.com/docs/guides/platform/backups) 會造成停機且可能回退新資料；本輪 synthetic dump 還原不替代 provider checkpoint，restore 本身另需批准。

窗口提案須包含一次 apply 的 lock/statement/time budget、停止新寫入方式、最大停機與可接受資料損失，及可用備份實際 restore 資源/時間。現有合成時間不足以直接預設正式窗口；沒有偷偷將 user「往前推」當作接受窗口。

未 commit 的 S8 batch 失敗應回復；成功後優先保留 constraint 做 forward-fix。若需要撤 constraint/recreate 原 index或整庫 restore，另交精確 catalog SQL/資料損失／operator／窗口批准，不刪改交易、不 repair 舊 history。程式/文件回退用新 PR revert，不能冒充 DB rollback。

交付須分開讀回 **harness 完成／PR merge／部署／S8 APPLIED_VERIFIED／S9／真實 Gmail/scheduler**；本輪只推進前者與補證，無 UI，UX QA 不適用。
