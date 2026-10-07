# CTBC 一次性 PostgreSQL 合成驗證

從 PR #61 `079fb714bd6a9551e7d0616dc6ad65a0fe47b8bd` 疊加的獨立 DB 實驗。只使用本目錄 SQL；不是 production migration、正式 Supabase schema、S8 executor、S9 或產品接線。

## 執行與邊界

- Linux CI 執行 `python3 experiments/ctbc-postgres/run.py`。固定 Docker Unix socket、官方 Postgres immutable digest（與 #58 參考相同），自行新建 UUID/label 容器並逐次驗 owner。沒有外部 DB URL/target 參數、host mounts、port、network、憑證讀取或持久 volume；PGDATA/runtime/tmp 全在 tmpfs，root filesystem read-only。
- subprocess env 僅 PATH/LANG allowlist；不繼承 PG/provider/Docker 設定，不讀專案環境檔或 Supabase credentials。不使用 Supabase CLI。
- `finally` 只刪此輪 immutable ID 且 label 符合的容器；owner 驗證失敗即拒絕清理。SIGKILL/runner 硬取消可能遺留此輪容器至 ephemeral runner 銷毀，不能宣稱 finally 涵蓋硬中止。
- 本機 Windows Docker daemon 未啟動；不啟動、安裝、重設服務。可執行 `run.py --check`；非 Linux 無參數執行會拒絕。靜態檢查不代表 SQL/DB 測試通過。本機 DB = NOT_RUN。
- workflow 僅 pull_request/manual、contents:read、無 cron、secret 或 provider env，無 deploy。既有 quality/migration CI 不修改。

## 模型與權限

兩個實際 DB login `synthetic_a/b`，沒有 superuser、BYPASSRLS 或角色切換權；直接表存取僅 SELECT。五張 owner 表 FORCE RLS，以不可由一般 caller 修改的 `session_user` 判斷，不接受 payload owner/GUC/JWT。此方式適用本實驗的獨立 DB login，**不代表 Supabase pooled authenticated/auth.uid() 身分安全**。

寫入經 private schema 的 SECURITY DEFINER 函式：owner 是 NOLOGIN/NOBYPASSRLS、不是 table owner 的 executor，固定 search_path、完全限定表名、PUBLIC EXECUTE 撤銷、窄範圍 grant 且 RLS 仍生效。這是隔離 fixture 的受限角色方案，不是可直接部署的 RPC。

link 只驗證仍存在且同 owner 的 ledger ID，使用 `FOR KEY SHARE` 阻擋 delete/key change 至處置交易提交；不驗證或修改 ledger 金融欄位。PostgreSQL 的 row-lock SELECT 需要 UPDATE 權限，因此另設不可登入、非 table-owner 的 `synthetic_link_locker`，僅 SELECT + UPDATE(id)，沒有 INSERT/DELETE 或金融欄位 UPDATE。只有 executor 可執行其固定唯讀 lock helper，login 不能直接呼叫或切換到該角色。executor 保持原 SELECT/INSERT，不新增任何 ledger UPDATE/DELETE 權限。helper 的 UPDATE(id) 是鎖定所需的內部權限，並非宣稱 PostgreSQL 有獨立 lock privilege；SQL函式沒有 UPDATE/DELETE 帳本語句。

單次處置先取 owner/key advisory transaction lock，再鎖 candidate row；驗證 exact version、open/detail/30-day期限、風險核對、owner/category/payment/link。帳本 insert、candidate update、event insert 同交易；same key/request 回傳同 event/ledger ID，same key 不同 request 拒絕。四個非 import 動作不修改帳本。defer 不清風險或重設 created_at。風險四結案均需 resolve_risk=true；NULL 亦拒絕。

批次只允許安全 import，最多20、唯一 candidate IDs。`preview_batch` 用唯讀 snapshot；有任何已知風險／失效候選即整批不送出，沒有 act/event/ledger mutation。預覽全 safe 後，`submit_batch` 每筆各自呼叫一次 act/transaction，**不是整批 DB 原子**；提交後版本／狀態競態回逐筆 success/conflict/not_submitted，前筆成功保留。harness 停在衝突時將其餘明列 not_submitted；retry 可繼續剩餘項，沿用原 plan 中每筆 key/version/request，成功筆回同 ID、不重入。服務端 act 仍拒絕任何 forged risky batch。沒有 whole-batch SQL function，也沒有改 #61；collector logical-run membership/sticky partial 仍是 #61 的記憶體模型，**沒有新增正式 batch/collector storage**。

## 驗證矩陣

| 範圍 | 真 DB 反例／成功案例 |
|---|---|
| 角色/RLS | 五表 FORCE RLS；兩 login 互不見 owner 列；foreign candidate/category/payment/link、直接 update/ledger insert、SET ROLE、GUC冒充皆拒絕且全狀態不變 |
| 五操作/風險 | 四風險結案 false 拒絕、true 成功；NULL拒絕；defer保持風險/期限；link/ignore/work/defer整張ledger不變 |
| version race | 兩條真 psql 連線：第一條交易未提交時第二條在 pg_stat_activity 顯示 Lock wait；提交後不同操作同version只有一勝、一event、一ledger |
| idempotency race | 相同key/request兩連線確認真Lock wait；retry回同event/ledger ID，event/ledger各一；不同payload拒絕 |
| link/delete race | delete先鎖且提交：login link真等待後拒絕，candidate/event不變；link先鎖：admin delete真等待到link提交後才完成；先刪missing拒絕、後刪同key回原結果、不同key不可重開/補記。受測act一律synthetic login；admin僅故障注入 |
| rollback | ledger insert trigger故障；event insert故障（已新增ledger並更新candidate）；candidate/ledger/event全回到操作前 |
| batch | known safe/risk正反序唯讀預覽拒絕零提交；安全雙列逐筆成功/retry；預覽全safe→前筆commit→次筆與另一login連線defer競態且確認Lock wait→success/conflict/not_submitted；原key retry保留前筆、可續第三筆、不得重入 |
| retention | pending/conflict各D30-1秒保留明細、D30立即expire+清amount/detail+設scrubbed，晚跑仍立即清除、重跑冪等；四正常終態仍7天、shell/event仍90天且界線前1秒保留；ledger完全不變 |

retention.sql 是 bootstrap/admin 合成維護查詢，沒有一般 caller 的 cleanup grant，不是正式排程。event 無 candidate FK、ledger 無 candidate FK，避免清理連帶刪帳；不存在 app/report/export 接線。資料全為 SYNTHETIC，日誌只輸出案例名/版本/計數，不上傳 rows/SQL/credentials。

30天到期以 created_at+30 days 為 closed_at，實際清除時刻為 scrubbed_at；晚跑不延長 shell 的90天期限。expired立即清除，沒有再留7天；7天僅適用 imported/linked/ignored/excluded。UTC合成測試時間固定，不依賴本機時區。

本機靜態結果與 exact-head CI 會記於 PR body。CI 的 synthetic DB pass、既有 migration pass、獨立 review、production apply、部署與 live acceptance 分別追蹤，不互相替代。回復為停此 workflow/revert 本切片；正式 DB 零 mutation，S8-PROD=BLOCKED_NO_APPLY。

參考：[PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html)、[RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)、[function security](https://www.postgresql.org/docs/17/sql-createfunction.html)。實驗參考 #58 的容器隔離模式，不執行其 S8 harness 或 migration。
