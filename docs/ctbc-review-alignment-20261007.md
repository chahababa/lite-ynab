# CTBC 收件匣需求對齊與本輪查證（2026-10-07）

本輪先交付 Tier 0 docs-only 修訂；`S8-PROD=BLOCKED_NO_APPLY`、`production_mutation=false`、`S9_implementation=false`。Codex 是唯一 writer，使用空資料夾中的乾淨 clone，從 PR #56 新開 `docs/ctbc-1700-inbox-alignment-20261007`，不寫回原 PR #56/#59 分支、不合併或部署。日期／範例均為合成資料。

## 1. 來源與需求差異

- [Issue #57](https://github.com/chahababa/lite-ynab/issues/57) 及兩則留言已讀；新的使用者方向優先於舊 07:00 設計，安全 gate 不變。
- PR #59：OPEN，head `043552c1dfd726436065f81dd0633733754d3291`。[詳細需求](https://github.com/chahababa/lite-ynab/blob/043552c1dfd726436065f81dd0633733754d3291/docs/ctbc-review-user-requirements-20261007.md)及[接手 Prompt](https://github.com/chahababa/lite-ynab/blob/043552c1dfd726436065f81dd0633733754d3291/docs/ctbc-codex-studio-prompt-20261007.md)由明確遠端 ref 讀取，未假定已在 main。
- PR #56：OPEN，進場 head `ea89dc73421cce0e2ca01b572352297b1f445a3c`。此分支保留它的五操作、owner/version/idempotency、30/7/90 retention 與 S8 決策包。
- `main=d115dd8de7ca35e9d4a12d607df285eb281c5bda`；本輪修訂的 [Phase 2](ctbc-email-import-phase-2-spec.md) 是設計契約，Phase 1 parser 沒有因此改變。

| 面向 | PR #56 進場 | 本輪修訂與驗證邊界 |
| --- | --- | --- |
| 每日時間 | 07:00 台北、前一日主 cohort | 名義截止 17:00 台北；provider 準時性未證實，不能稱 live 定案。 |
| 接收窗口 | `[D-4 00:00,D 07:00)` | `[D-4 00:00,D 17:00)`；epoch 秒搜尋外包 1 秒，再以 `internalDate` 毫秒精確篩選。 |
| 交易日／晚到 | D-3/D-2/D-1 | 維持三個已過去台北曆日；D-1 主 cohort；17:00 後到信下一日仍符合才補入，超窗僅告警。 |
| run／重試 | 以 D 作 key，未明定延遲跨日細節 | D 來自排程槽，不是實際啟動日；固定窗口、有限重試、午夜停止、fencing；排程改時不產生第二次 regular run。 |
| 去重 | 同源唯一＋跨信人工；parser 相同列合併缺口 | 保留；不能以時間窗、商家或同額同日取代 identity，也不能直接把現有 parser Set 結果當安全候選。 |
| 五操作 | 上次已補齊 | 不重做；稍後仍 pending/conflict、仍計數且不延長 30 天。 |
| 入口／建議 | 設定入口、建議值 | 加首頁待辦數、可改選建議／原因／不確定性、同支付來源比對；無資料顯示「請選擇」。 |
| 批次 | 每筆 owner/status 檢查 | 明確勾選、提交前摘要、風險筆拒絕；每筆原子且逐筆結果，重試不再處理成功筆。 |
| 無信／漏跑 | 空／無成功 run／部分失敗 | 分清 no_message、zero_new_candidates、missed_run、partial_failure；「稍後」與既有待辦不被本輪零候選清掉。 |
| Telegram | 未明定主要入口 | 僅摘要／入口；無推送授權先不發送，web 是 durable 待辦。 |

## 2. 先驗證的日期與反例

以下先以 Node `node:assert/strict` 對獨立預期值驗證日曆運算，再修規格。這是文件設計驗證，不是 Gmail integration、scheduler 或新 UI 已通過測試。

| 排程日 D | 精確接收窗口（台北，左閉右開） | 最舊／主交易日 | UTC 截止 |
| --- | --- | --- | --- |
| 2026-10-07 | 10-03 00:00 至 10-07 17:00 | 10-04 / 10-06 | 2026-10-07 09:00Z |
| 2026-10-08 | 10-04 00:00 至 10-08 17:00 | 10-05 / 10-07 | 2026-10-08 09:00Z |
| 2027-01-01 | 2026-12-28 00:00 至 2027-01-01 17:00 | 12-29 / 12-31 | 2027-01-01 09:00Z |
| 2028-03-01 | 02-26 00:00 至 03-01 17:00 | 02-27 / 02-29 | 2028-03-01 09:00Z |

2026-10-07 搜尋時間部分為 `after:1790956799 before:1791363601`；精確判斷仍是 `1790956800000 <= internalDate < 1791363600000`。左右多搜尋 1 秒只為 API 邊界外包；不擴張可解析／建候選的窗口。固定銀行來源查詢條件與可信 header 驗證另行保留。

| 合成情境 | 必須結果 |
| --- | --- |
| 10-06 消費、10-07 14:00 收信 | 舊 07:00 未見；17:00 收入主 cohort，不因此宣稱整日完整。 |
| 接收時間 S-1ms / S / E-1ms / E | 分別拒絕／納入／納入／留待次日；搜尋外包不得使 S-1ms 或 E 入候選。 |
| 10-06 消費、10-07 17:00 或 23:59 收信 | 10-07 run 不納入；10-08 run 晚到補入一次。 |
| 10-04 消費、10-07 16:59 收信 | D-3 晚到納入；同信次日重掃只回既有 shell。 |
| 10-04 消費、10-07 17:00 收信 | 次日已超 D-3；`outside_window` 告警，不自動建候選、不默默略過。 |
| 10-03 消費、10-07 14:00 收信 | 接收時間合格但交易日超窗；告警並等精確授權補捕。 |
| 當日交易／真正未來時間／日期無效 | 當日合法時間延至下一日 cohort；真正未來或無效固定碼告警。 |
| 週末、連假三天以上晚到 | 每個曆日照跑、不按工作日位移；超窗即告警，假日不自動擴窗。 |
| 17:10 啟動、失敗後重試；跨午夜重試 | 前者仍原 D 與 17:00 cutoff；後者停止舊 run，標失敗／漏跑，不改成新 D。 |
| 同信重掃／跨信同額同日／完全相同兩列 | 分別回 existing／人工衝突提示／ambiguous 阻擋；不誤消除兩筆真實消費。 |
| missed run／無信／全為 existing／部分解析失敗 | 四種不同結果；前次未處理數保留，錯誤不被零新增或人工結案消除。 |
| Gmail 分頁／索引延遲／斷線 | 只在全頁讀完且必要持久化成功後結案；未讀完為 partial/failed，同槽重試或次日重掃。 |

## 3. 正式環境 fresh readback 與限制

2026-10-07 22:43:41 Asia/Taipei，已連接 Supabase inventory 確認 Lite YNAB production；以 `BEGIN READ ONLY`、15 秒 statement timeout 讀 catalog/history 與聚合 duplicate count，沒有取回交易列或識別值：

| 檢查 | 讀回 |
| --- | --- |
| duplicate identity groups | 0；僅當時聚合快照。 |
| S8 unique constraint | 不存在；legacy index valid 但非 unique。 |
| migration history | 15 筆；July 仍 `20260703112413`（repo `202607030001`）；缺 S4A `20260917040000` 與 S8 `20260917050000`。 |
| S4A／RLS | legacy `(text)` 函式存在、tenant `(uuid,text)` 不存在；transactions RLS enabled。未呼叫 RPC。 |
| 公開 GET `/login` | HTTP 200；僅服務可達，無登入、無金融資料讀取。 |
| GitHub deployment | `6496372183` 為 09-17 舊 success、SHA 等於 main；較新 `6499183157`/`6519671189` 為 inactive 誤建 metadata。僅 GET。 |
| Zeabur current SHA／auto-deploy／rollback | 本機沒有可用 Zeabur CLI，當前工具無 Zeabur connector；未登入或換 token，故 UNKNOWN，不能由歷史 success 推論。 |

PR #59 CI [37635677847](https://github.com/chahababa/lite-ynab/actions/runs/37635677847) 與 PR #56 CI [36284794990](https://github.com/chahababa/lite-ynab/actions/runs/36284794990) 各兩項 SUCCESS，分別匹配上述進場 SHA。main CI [35186336160](https://github.com/chahababa/lite-ynab/actions/runs/35186336160) 同樣 success，head 精確匹配 main。本輪新 head 另跑 CI，舊綠燈不繼承。repo `Dockerfile`／scripts 沒有自動 migration hook，不足以證明 provider 外部設定。

S8 仍 `BLOCKED_NO_APPLY`。checkpoint 可還原性、具名 operator、headroom／鎖窗口、受支援單版 preview/apply 路徑仍缺；沿用 [S8 決策包 A/B/C](ctbc-s8-readonly-decision-20260927.md)，建議維持 NO_APPLY、分開補證。S8 SQL 不引用 S4A；直接套 S4A 會與現有未送 p_user_id 的 route 不相容，禁止綁成 CTBC 必備前置或一併 repair。

## 4. 分階段交付及未通過的 gate

| 切片 | 可交付 | 不代表 |
| --- | --- | --- |
| 本輪 docs-only | Phase 2/MVP 對齊、本差異表、日期驗證、fresh readback、exact-head CI | 未修改 parser、UI、workflow、DB；沒有新功能驗收或部署。 |
| 下一安全切片 | 新 feature branch 的純合成、記憶體模型／mock inbox；不在 src/app、公用 public 或正式 bundle，不接任何 DB／Gmail／secrets；自動測試與 UI QA | 不叫 S9；mock ownership／race 不能當 Postgres RLS／RPC 證據；重整可重置並須明示。 |
| Gate C/D、S9 | 補齊 S8 與各自 exact-scope 授權後才可另案 | 文件、合成模型、CI 不放行真信箱／OAuth／正式排程／資料寫入／部署。 |

本輪自檢不可冒稱獨立 Review/QA：獨立 reviewer 與 UX 實測若未執行，必須標 NOT_RUN。沒有新 UI 的 docs 切片只做 UX 契約檢查。每個新 PR 提供完整 SHA、實測輸出、缺口與回復；docs rollback 為 revert 本輪文件，不能回復 DB。

17:00 產品意圖與上述合成窗口可以先驗證；provider 選型／可靠性、超窗人工補捕操作員與精確範圍、相同兩列可信識別仍是 live 前的待決 gate，不阻止隔離實驗。Codex 下一步為完成此 docs 切片新 head 驗證後，在上述隔離邊界建立合成原型；不需 Matt 為例行文件／測試重新批准。

## 5. 本輪驗證記錄

- `npm ci --no-audit --no-fund` 通過；Node 24.15.0，未建立 `.env.local`、未更新 lockfile。
- 日曆運算四組／16 個預期值斷言，加窗口／cohort／截止／跨午夜 20 個斷言，合計 36 通過；只驗證文件算式，不是 collector/去重/lease/RPC 已實作。邊界的身份去重以第 2 節先查既有 shell 的順序列為後續必測，未冒稱已有新模型測試。
- `git diff --check`、相對文件連結及狀態／retention／hard-stop 契約自檢通過。實際 diff 僅三份 Markdown。
- `npm run lint`：0 error、17 個既有 warnings；`npm run typecheck` 通過。
- 首次與 lint/typecheck 同時跑 `npm test`，既有 Hermes bearer-secret 拒絕測試在首次 import 逾時（5 秒），304 pass/1 fail；保留失敗。停止並行負載後原指令重跑：**40 files / 305 tests passed**，沒有放寬 timeout、略過測試或修改程式。
- build、新 head CI 的最終輸出／URL／完整 SHA 記在本輪 PR。Windows 未執行本機 Supabase reset；migration smoke 由新 head CI 的隔離 Linux job 驗證。
- 自我文件審查不等於獨立 reviewer verdict；獨立 Review/QA = `NOT_RUN`，新 UI UX = `NOT_APPLICABLE`（沒有新 UI）。合成／隔離原型、live collector 與手機驗收尚未完成。
