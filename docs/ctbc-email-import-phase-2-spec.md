# CTBC 每日待確認支出收件匣｜Phase 2 產品與安全規格

狀態：2026-10-07 Codex 依 PR #59 對齊約 17:00 收集、持久收件匣與安全批次；僅規格，尚未實作或啟用 live 收件。[需求差異、日期案例與最新唯讀查證](ctbc-review-alignment-20261007.md)。S8 仍 `BLOCKED_NO_APPLY`（歷史 [S8 決策包](ctbc-s8-readonly-decision-20260927.md) 不作當前授權）。
基準：本次文件以 `origin/main` `d115dd8de7ca35e9d4a12d607df285eb281c5bda` 為依據；Phase 1 parser/dry-run 已在 repo，S8 transaction source 唯一鍵已合併至 main，但 **S8-PROD production apply/readback 未完成**，不得據此啟動 S9。
來源：[Lite YNAB 題目](https://app.notion.com/p/3a66f4831a6181579ec1db50c5801cb4)、[Phase 2 Architecture / Spec 與 2026-09-26 補充](https://app.notion.com/p/3a66f4831a61818f9c51e2a85204afde)、[Phase 1 MVP](ctbc-email-import-mvp-spec.md)。S8 唯讀證據見 Kanban `t_752c667e` 的 `s8-reconciliation-decision-package.md`（SHA-256 `529103f0599685b08bde1c35c5b24fbf318aababa93826d315594f39ceb9f722`）。本文是後續開發的設計輸入，不是 live 邊界授權。

## 1. 定案與覆蓋關係

- 僅 CTBC「信用卡消費成交回報」、一張受保護設定選定的卡。**每封信逐交易列**用末四碼在 collector 的短暫記憶體比對；混合卡別信只產生目標列候選，非目標列不可入 staging、API、log 或 telemetry。選擇值、原始末四碼及任何可逆卡指紋不得保存到 Git/Notion/Kanban/DB/log；設定來源與金鑰保護方式在 Gate C 另審，不能以本文件直接修改 env/OAuth。
- 產品目標每天約 `17:00 Asia/Taipei` **只排一次**，取代舊 07:00 設計；以前一台北曆日之交易時間作主 cohort。名義截止時間固定 17:00，provider 準時性仍待 Gate C 證明。日報可能下午才到，樣本不是銀行 SLA；不保證 17:00 已收到全部通知。保留合成 dry-run；同槽失敗的受控重試不是第二次日掃描。
- 收信自動化只建立待確認候選；不自動批准、不自動入個人交易。工作支出由人標記「工作支出／排除」後成終態，絕不新建個人交易，也不進個人預算、交易列表、分析、報表或匯出。已存在的正式交易不因標記被自動刪除或修改。
- 私人支出須人選擇**本人擁有**的分類與支付方式並逐筆確認，才可原子寫交易；建議值不能代替人工選擇。批次操作仍逐筆通過 ownership、缺值、重複與狀態驗證，衝突筆不得無警示批准。
- 授權通知不是已結算帳單：商家、匯率及實際入帳額可能改變。介面寫「待確認／尚未與月結帳單核對」，不得聲稱某日支出已完整蒐集或已核帳；月結 PDF 核對是未來獨立工作。

## 2. 時間窗、晚到、去重與欠缺狀態

### 2.1 固定窗口與兩種時間

- `D` 是排程槽的台北日期，由可信 scheduler envelope 決定，**不是 retry/worker 實際啟動的日期**。接收窗口 `S=D-4 天 00:00+08:00`、`E=D 17:00+08:00`，接受 `[S,E)`；解析後只接受 `occurredAt` 的台北日期為 `D-3、D-2、D-1`。D-1 為主要 cohort，D-2/D-3 標示「晚到通知」。日期按曆日運算，包含週末、假日、跨月／年、閏日；不能用主機 UTC 日期或工作日替代。
- [Gmail 搜尋日期字串按 PST 解讀](https://developers.google.com/workspace/gmail/api/guides/filtering)，因此使用 epoch 秒；搜尋範圍採 `after:(S_seconds-1) before:(E_seconds+1)` 作 1 秒外包，再先以 [Gmail `internalDate` 毫秒](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages) 嚴格驗證 `S <= receivedAt < E` 才解析／建候選。信內 Date header 與交易日都不能代替接收時間；自行匯入／非一般 SMTP 信件的 internalDate 可信性留 Gate C 驗證。搜尋命中不是銀行來源驗證；固定 sender/subject allowlist、trusted header、逐列單卡過濾不變。
- Gmail 搜尋所有分頁、metadata/body 取得、解析與寫入是同槽內分階段工作；任何頁失敗不得標為完整成功。索引延遲即使 receivedAt 在窗口內也可能本輪找不到，依同槽重試／次日有界重掃補抓，不能宣稱列表完整等於該日消費完整。
- 合成例 `D=2026-10-07`：S 為 `2026-10-02T16:00:00Z`，E 為 `2026-10-07T09:00:00Z`；主交易日 10-06、補抓 10-04/10-05。14:00 到的昨日通知可以主掃取得；恰好 17:00 收到的通知留到次日，不能由 17:10 的 worker 偷換 E 納入。

### 2.2 晚到、超窗與未完成

- 17:00 後收到 D-1 的信，D+1 regular run 仍在 cohort 時才補入一次；重掃以來源 identity 去重。D-3 的信若在 D 17:00 之後才到，D+1 已超交易日窗口，**不保證會自動補入**。接收窗口多一天只是邊界緩衝，不能延長三個交易曆日的範圍。
- 接收時間合格但交易日在 D-3 之前：不建候選，記 `outside_window` 聚合告警。人工補捕須另給明確 owner／收信及交易起訖／最大訊息數／一次性 exception run key／預覽與去重風險／授權；不得自動讀全信箱或延長窗口。尚未收到或接收時間也在窗外的信無法逐封偵測，頁面保留覆蓋限制與 missed-run 警示，不宣稱「所有超窗信都有抓到」。
- 交易日為 D 且時間不在未來：`current_day_deferred`，不算解析失敗，留下一日主 cohort；未來時間或無效日期為固定錯誤碼告警。被拒信／解析錯誤各自計數，無候選不等於沒有消費。

### 2.3 logical run、重試與排程 gate

- 受保護作用域內 `(owner, mailbox_binding, D, regular)` 唯一；selector/schedule 版本記為 metadata，不能放進唯一 key 讓同日換版本再跑第二次。D、S、E、cohort、設定版本在建立時固定；設定輪替或舊 07:00 槽當日已執行時，不以新版 17:00 假裝新增 regular run。歷史補跑須獨立授權 exception。
- 合成基線：首次嘗試後最多重試 2 次，退避 5／15 分鐘，每次 attempt 最多 15 分鐘，且一律在 D+1 00:00 前停止。worker 開始過早（E 前）拒絕；跨午夜才收到 trigger/retry 標 `missed_run` 或 `retry_expired`，不重算 D。重試使用原 key／窗口；相同 run 的部分成果回 existing，失敗告警仍保留。
- 每個受保護 collector scope 同時只准一個 lease；候選寫入端驗證單調 fencing token／lease deadline，逾期 worker 不能續寫；鎖住跨日新舊 run 交錯。unique constraint 只負責最後去重，不能代替 lease 或承諾整批完成。next-day run 不會把前日失敗標成已修復。
- provider 未選定／未驗證，因此 **17:00 是待實現的目標，不是已證明的 SLA**。若用 GitHub Actions，[官方文件明示可能延遲或丟棄 schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)，repo 既有備份 workflow 不能證明 CTBC 的可靠性。可評估 17:05 觸發、仍固定 17:00 cutoff 以避整點，但要提出延遲／missed-run 偵測與恢復證據再決定，不能默默改回 07:00；此 PR 不改任何 workflow。

### 2.4 來源去重與人工比對

- 接收窗口／來源信任／目標卡驗證後，先查既有來源 shell，再對**新來源列**套交易日 cohort。已知來源重掃回原狀態、不重開、不重設 retention；即使本日已變成 D-4，也不能再當新超窗待辦。相同 identity 的 payload 不一致另報衝突，不能用此順序覆寫資料或避開 ambiguous-row 阻擋；不存在 shell 的過舊列才計 `outside_window`。
- 「回原狀態」不表示丟棄重掃的新風險：相同來源與相同金融 payload 新增 `partial_batch` 等警告時，只單向追加風險並增加 version；pending 應轉為 conflict、拒絕批次批准。相同警告再次重掃冪等，正常重掃不自動清警告；不覆寫金融 payload、不延長首次期限、不重開終態，也不補回已按 retention 清除的明細。此補充由隔離原型回歸驗證，並非正式 collector/RPC 已實作。
- 同一來源：不可持久化 raw Gmail message ID；在可信 collector 端對 canonical ID 做非可逆 hash，逐列 row hash 包含足以分辨同訊息內兩筆真實不同交易的穩定欄位，`source_id=ctbc:v1:<message-hash>:<row-hash>`；`(user_id, source, source_id)` 唯一，重送回 existing 而不重建。對**完全相同列出現兩筆**的銀行通知，現行 parser 使用 Set 合併且 hash 相同；Gate C 必須先驗證此情境並定義可信列序/交易識別或阻擋 ambiguous batch，不可默默折成一筆或無證據拆成兩筆。相同 source ID 但 payload 不同應衝突、不可覆寫；跨封重複通知如 identity 不同仍可能重複，需衝突提示而非假定唯一。
- 比對既有交易：限同 user、相同支付來源，台北同日／±1 日、金額作主要線索，商家輔助。支付來源不明不宣稱相同；同商家但不同額顯示「金額需核對」，同日同額也僅「可能已記過」。不同來源或兩筆真實相同消費不得自動消除，由人選連結／決議。source-identity 去重與人工帳務比對分開；終態保留最小 shell 防止重掃復活。

## 3. 權限與資料流（設計，未實作）

```text
Gate A/B: synthetic fixture → pure model + local ephemeral DB/RLS 驗證 → 內建預覽 UI（零 Gmail/production write）
Gate C: 受限 Gmail 帳戶唯讀 → Gmail trusted Authentication-Results → Phase 1 parser
        → collector 記憶體逐列目標卡過濾 → sanitize/hashed identity → 固定 owner 的受保護 staging API
Gate D: 登入使用者 JWT → /settings/email-import → 補記/已記過/忽略/稍後處理/工作支出
        → owner + version + state + category/payment check → 原子 candidate/event/transaction mutation
```

- 計畫 owner：單一事先核准的 Lite YNAB `user_id`，collector 以 server-side identity 綁定，不接受 payload 的 user ID 覆蓋；Gmail 帳戶、service identity、設定存取及最小唯讀 scope 必須 Gate C preflight 明定。Hermes 只監測聚合告警，不走 production data path。不得借 service role 代理人類確認。
- Phase 1 `src/lib/ctbcEmailParser.ts` 回傳 `gmailMessageId`、含 raw message ID 的 `sourceId`、`cardLast4`；**這些是目前記憶體解析輸出，不是可寫入 staging 的安全 contract**。新 collector 必須在可信邊界內先 filter，再產生 hash identity、移除 raw ID/末四碼；此文件不表示目前程式已符合。MVP 文件原 `ctbc:<raw-message-id>:<row-hash>` 和 raw ID/末四碼資料表建議由本規格取代。
- Staging 建議沿用 Notion Phase 2 三表（batch/candidate/event）及固定 reason codes，不保存原信、header、From、subject、附件、原始 message ID、完整或部分卡號、OAuth token。只存顯示必需之消費日、金額、遮罩/淨化商家、卡產品名稱/正附卡、銀行類別、建議與 warning code。不可逆 hash 不應回顯到 UI/log，需評估低熵與關聯風險；batch hash 不可洩漏可反查的值。
- Browser 三表開 RLS，僅可讀 `auth.uid() = user_id` 的待審資料；不給直接 staging insert/delete。mutation 只走經授權 RPC，固定 search_path、revoke public/anon、owner row lock + expected version；所選 category/payment 均逐項驗證 `id + user_id`。append-only event 只存 IDs/固定 code，不含交易值。不可讓 user A 檢視或修改 B 的候選。
- 私人確認：atomic insert transaction + candidate `imported` + event，雙擊/重試回同一 transaction ID。main 上 `transactions_user_source_source_id_key` 已是 migration **程式碼**；在 production apply/readback 前不可宣稱 DB 已有 unique constraint。正式 transaction source enum 目前不含 `email_import`，後續需在獨立 Tier-2 PR 評估擴充。source metadata 僅保留必要非敏感 UUID、版本/固定 code。

## 4. 使用者介面與狀態

- 專用 `/settings/email-import`「待確認交易」頁，首頁及設定皆有清楚入口；首頁顯示本人可操作的 `needs_review + conflict` 筆數，包含稍後，排除終態與過期列，不只計本輪新增數。手機與鍵盤可操作，展示必要淨化資訊、通知非月結狀態、日期／晚到／衝突、非敏感卡產品／正附卡表示；逐筆明示五操作，不允許「全部自動批准」，不展示卡末四碼、原始 message ID 或 hash。
- 優先呈現待人工決策的衝突／警告；建議分類與支付方式顯示原因及不確定性，可採用或改選，本人確認前都不是批准。無可靠依據顯示「請選擇」或「商家未明」，不能假裝知道商家。帳戶內分類／支付方式在提交時重新驗證。
- Batch `received → ready_for_review | partial_failure | rejected → completed | expired`；`partial_failure` 必示失敗列數與明確警示，不能只顯成功列而標記完整。只有沒有 `needs_review/conflict` 候選時才可結束待處理計數；解析失敗計數與告警獨立保留，不能因人工處理完成功列而清除。`completed` 不代表完整蒐集或月結核帳。

### 4.1 五種操作的持久語意（設計契約）

`needs_review` 即 pending；`conflict` 也屬未結案。以下取代舊 `skipped` 狀態及未定義的 `duplicate` 終態；目前尚無候選 schema，不需要回填既有 production 候選。

| 操作 | 成功後 candidate / 固定 event code | 個人 transactions 影響 | 必要檢查與回饋 |
| --- | --- | --- | --- |
| 補記 | `imported` / `personal_imported` | 原子新增恰好一筆，保存 `imported_transaction_id` | 本人 JWT、owner、expected version、本人分類與支付方式必選；明確確認後才提交。回饋「已補記，尚未與月結帳單核對」。 |
| 已記過 | `already_recorded` / `existing_transaction_linked` | 零新增、零修改、零刪除 | 人選擇一筆仍存在且同 owner 的既有交易並確認；保存候選上的 `linked_transaction_id`，不回寫舊交易的 source/metadata。回饋「已連結既有交易」。 |
| 忽略 | `ignored` / `candidate_ignored` | 零新增、零修改、零刪除 | 本人明確決議不補記，保存最小處理 shell。回饋「已忽略，不會補記」。不要求也不保存既有交易連結。 |
| 稍後處理 | 仍為 `needs_review`；原為 `conflict` 則保持 `conflict` / `review_deferred` | 零新增、零修改、零刪除 | 非終態，仍列在待處理清單，可再次開啟執行五種操作；保留衝突警示，不宣稱已解決。回饋「保留待處理」。 |
| 工作支出 | `work_excluded` / `work_expense_excluded` | 零新增、零修改、零刪除 | 明確確認排除；不要求個人分類/支付方式，只保留必要去重及處理 shell。回饋「已排除，不列入個人帳本」。 |

- 終態為 `imported/already_recorded/ignored/work_excluded/expired`，彼此不可透過一般五種操作轉換。`needs_review` 可進入以上終態或 `conflict`；`conflict` 須明確人工決議才可補記、連結、忽略或工作排除，不能以稍後處理清除衝突。修正證據且解除衝突後可回 `needs_review`，須獨立事件與 version 檢查；來源 identity/payload 未釐清前禁止補記。
- 已記過的同日同額或 ±1 日提示只提供選項，不自動匹配，不自動結案。無可選交易時保留待處理，提供稍後、忽略或補記選項；不可把無連結的「已記過」寫成忽略。跨 user、已刪除或競態失效的連結一律 fail closed，回傳一般衝突，不洩漏另一 owner 的資訊。候選處理時鎖定並驗證連結交易，交易本身不被修改。
- 已記過的連結之後若被使用者於一般帳務流程刪除，候選不自動重開或補記；顯示「原連結交易已不存在」供人工檢查。清除連結不得連帶刪除既有交易（禁止 cascade 到 transactions）。已 imported 不得再標工作而自動移除交易，需獨立有審計的人工帳務更正。
- 所有操作使用 candidate owner lock、expected version 及同一 logical action 的 idempotency key；成功時原子更新 candidate/version + append-only event。補記額外原子建立 transaction；其他四種沒有帳務寫入。相同 key/相同操作重試回原結果且不重複 event；相同 key/不同 payload 拒絕。不同操作搶同一 version 只能有一個成功，輸家 reload 後由人再決議；即使稍後不改 status，首次成功仍增加 version 並記事件。UI 提交中停用五種操作，後端不能依賴停用按鈕保證安全。
- 本版稍後處理不新增提醒排程、不設定永久隱藏或自動重開日期，亦不延長 30 天 retention。最小 event 僅候選/操作者 ID、時間、版本與固定 code，不保存金額、商家或自由文字原因。可能重複、已記過、忽略、稍後與工作排除分別計數，不能統稱「已匯入」。

### 4.2 呈現與個人帳本邊界

- 載入中、`never_run`（尚未成功執行）、`missed_run`（應跑但未跑）、`no_message`（搜尋完成但沒有符合來源條件通知）、`zero_new_candidates`（有信、目標列零／全 existing 等）、`partial_failure/failed`（分頁／解析／寫入失敗）分開顯示。被拒信必有警告，不能包成無信；部分失敗可與成功候選並存。只說「未找到符合條件通知／本次沒有新增候選」，不說零支出／完整核帳；本輪結果不得清空前次待辦。顯示最近嘗試、最近成功 run 與涵蓋的交易日期。
- 缺分類/支付方式、可能重複、stale version、重試、提交中防雙擊、成功/排除皆須回饋；兩人/雙分頁競態 reload。Gate B 標示「合成預覽，不會讀取 Email 或新增正式交易」，若記憶體 demo 重整會重置須明示，不能假裝已實現持久收件匣。
- `work_excluded` 絕不進 `transactions`；現有個人預算/交易列表/分析/報表/CSV/備份等只讀正式交易的通道不得從 staging 聯表或將排除筆列入。人工私人確認後才會出現在這些個人視圖。檢查後續所有匯出/報表使用相同邊界。

### 4.3 批次與通知

- 使用者明確勾選可安全處理的普通候選，提交前看所選筆數、動作、分類與支付方式；建議值可採用或改選，不預先勾選／自動批准。第一版批次補記僅同分類／同支付方式；其餘四操作先逐筆，不擴大語意。每筆仍 owner/version/state/有效分類支付方式/idempotency 驗證。
- 可能重複、金額不符、商家未明、解析警告（包含所屬 partial batch）、工作／私人歸屬不明、版本衝突均不得進批次批准。服務端也重查，不能只靠勾選框 disabled。存在任何已知風險選項即阻擋預覽；送出後發生競態則逐筆回成功／衝突／未提交，不能用單一「全成功」遮蔽部分結果。每筆交易原子、不是整批 DB 原子；重試沿用原逐筆 action key，成功筆不重入。
- Telegram／長門僅在另獲推送授權後提供一次 run 的聚合摘要與入口；沒有授權或通道時不發送。通知失敗不回滾已保存候選、也不重跑 collector；通知按 run key 去重。漏看通知仍可進網頁待辦，不進逐題詢問流程。摘要不含金融明細、卡、郵件或 hash。

## 5. 保留、失敗、關閉與回復

- Pending（`needs_review/conflict`）必要業務欄位自候選首次建立起最多 30 天，稍後處理/重掃/衝突不重設期限；逾期 `expired` 並清除敏感欄位。`imported/already_recorded/ignored/work_excluded` 自結案起 7 天後清除金額、商家、卡產品/類別、建議等；到期狀態立即清除。最小去重 shell（owner/source identity/status/時間、必要的 transaction link）及 event 自結案或到期起 90 天後清除，不延長保存 linked transaction 的金融內容。刪除 candidate/link/event 不修改或刪除正式帳務。
- 重掃命中任何未清除 shell 均回原狀態：已記過、忽略、工作排除及到期不得復活，稍後仍待處理。90 天後不再承諾 shell 可去重；每日有界窗口不能重新引入舊消費，超窗人工補捕須另授權並說明處理 shell 已清除的風險，不可當作一般 replay。原信及末四碼從不持久化。retention worker 另經 live gate，支援 idempotent/batched、先 count-only dry-run。
- 允許觀測僅 run 日期/狀態、批次數、解析失敗/非目標/窗口外/去重/衝突/排除計數、延遲 bucket 與固定錯誤碼；禁止日期級交易明細、金額、商家、卡、郵件地址/message/hash、body/header/token。監測失敗或零訊息只能回報「未能確認」或「未找到」，不能回報「全部入帳」。
- Gmail 讀取/信任驗證失敗、設定缺失、owner 不符、RLS 失敗、parse 部分失敗、staging 寫入失敗、重試額度耗盡、排程漏跑須 fail closed：不建交易、不靜默跳列；保留可稽核非敏感狀態與操作告警。失敗 batch 經修復後只允許受控 idempotent replay；missed day 的補跑是**人工核准的獨立例外**，界定窗口與 run key，不能假冒每天第二次 scheduled run。
- 回復：Gate A/B revert PR/停 fixture；Gate C/D feature-off 先停止新收信/匯入並保留既有候選以供人工安全處置。不能自動刪 staging/已記個人交易；錯帳由有審計的人工 forward-fix。production schema 僅 expand-only、先 backup/preflight/readback；環境、feature-off 或 rollback 不明一律停下。不得藉此文件啟用 scheduler、secret 或 migration。

## 6. 後續 Tier-2 graph 驗收／交棒門檻

1. Gate A：合成多卡同封僅目標列 staging；raw ID/末四碼不入 DB/log/API；run key、邊界日時區、D-3/D-2/D-1、晚到與窗口外的固定碼；同訊息同列/同訊息兩個相同列/跨訊息重送；payload conflict、同額手動交易衝突；RLS 跨 user、RPC race、版本/owner/分類/支付方式檢查；五種操作、終態重掃與 retention（見下表）；全程本地/ephemeral DB，不 apply production。
2. Gate B：合成 inbox 覆蓋五種操作分流，工作排除後零個人交易/預算/報表/匯出、私人缺分類或支付方式不能確認、已記過必人工選同 owner 交易、忽略與稍後不同回饋且稍後可回來、同額手動可能重複必人工、雙擊/錯誤/空/部分失敗/無 run/晚到/stale、360px 與 keyboard/a11y；網路 spy 零 Gmail request/正式 DB write。
3. Gate C（另經授權）：帳戶/受保護卡設定/唯讀 scope、可信 Gmail header、server 固定 owner、受保護 API、sanitizer、無敏感 log、單次 dry-run/replay；scheduler 預演證明約 17:00 台北每日一次、固定 cutoff、排程槽 D、午夜停止、fencing、延遲／漏跑可見與有界恢復（第 2 節及日期案例），不能只驗 cron 字串；實際延遲樣本是否足以支持窗口。首次真實 Gmail/secret/排程/production staging 均要 exact-scope gate。
4. Gate D（另經授權）：S8-PROD apply/readback 證據、migration duplicate preflight 零、exact environment/backup/feature-off、RLS adversarial tests、一次人工私人確認 → 一筆交易重試仍一筆；工作排除 → 零交易與零個人報表/匯出；count-only retention readback；CI、獨立 Review/QA/Release typed verdict，任何失敗 hard stop。

S8 未 `APPLIED_VERIFIED` 前，Gate A/B 僅可做文件、既有合成回歸或明標隔離且不接 app/production 的實驗，不能把上述未來驗收表當作 S9 開工授權。本 docs-only 切片沒有新增候選模型/API/RPC/UI/collector/retention/scheduler；後續隔離原型另開 feature branch。新增 [17:00 邊界矩陣](ctbc-review-alignment-20261007.md) 為必測；純日期測試不是 live scheduler 驗收。

### 五種操作的合成驗收清單（未實作，不宣稱已通過）

| 案例 | 必須觀察到的結果 |
| --- | --- |
| 補記成功、雙擊、timeout 重試、兩分頁同時補記 | 只有一筆本人 transaction、一個成功 event、同一 imported ID；缺本人分類或支付方式為零新增。 |
| 已記過：人選同 owner 既有交易；兩筆同日同額 | 只有人選那筆 linked ID；既有交易逐欄不變、交易數不變；未選不可提交，同日同額不自動結案。 |
| 已記過：跨 user ID、刪除競態、終態後原交易被刪 | 越權/失效 fail closed；零帳務寫入；後續刪除不自動補記或重開。 |
| 忽略 vs 稍後；重掃、reload、回到清單 | 忽略為 ignored 終態且不再待處理；稍後仍 needs_review/conflict，保留警示，可再次決議；均零交易寫入。 |
| 補記與工作排除/已記過/忽略/稍後搶同一版本 | 一個成功，其餘版本衝突；不得出現排除終態卻有新增個人交易，或 terminal 被稍後重開。 |
| 工作支出；嘗試將 imported 改工作 | 前者零 transactions/預算/列表/分析/報表/CSV/帳務備份污染；後者拒絕且原交易不變。 |
| 五操作相同 key replay；不同 payload 重用 key | replay 不新增 event/transaction，不重設 retention；不同 payload 拒絕。 |
| 30/7/90 天邊界；重掃終態與 shell 清除 | 稍後不延長 30 天；7 天清敏感欄、90 天清 shell/event/link，正式交易保留；超窗補捕需獨立 gate。 |
| 部分解析失敗；所有成功列都忽略或已記過 | 成功列待處理數可為零，但失敗警示仍可見，不顯示完整收集/全部入帳/已核帳。 |

### S8-PROD 授權與實況（截至 2026-09-26）

- Matt 於 2026-09-26 選擇 `t_0d1321f8` 的**附條件 A**：僅限 production ref `ihntzjkrkskztmbfovdt` 的 `20260917050000_transaction_source_idempotency.sql`，且所有 preflight 通過後才可單版套用並讀回；不是其他 migration、history repair、backup restore、Gmail、scheduler、S9 或本 PR 合併的授權。
- `t_54bcfc8c` preflight 結果 **BLOCKED_NO_APPLY**：remote `20260703112413` 與 repo `202607030001` 版本不同；`20260917040000` S4A 的 SECURITY DEFINER 函式變更在 production 確實未套用（非僅缺 history），目標 `20260917050000` 亦未套用。`t_752c667e` 唯讀逐字比對指出 July 兩版的可執行 SQL 相同，但**版本差異仍在**，不得自行修補 history 或據此推論整體 schema 等效。備份的可還原 checkpoint／具名 operator，以及受支援、指定 ref/version 的單版 preview 路徑仍未證實；先前 duplicate count=0 只是當時快照。`NO_APPLY`、`production_mutation=false`、`S9_implementation=false`。
- 2026-09-27 Codex 重新唯讀確認 duplicate identity groups=0、S8 constraint 不存在、舊非唯一 index 存在、July 版本差異及 S4A tenant 函式未套用；詳見 [決策包](ctbc-s8-readonly-decision-20260927.md)。新讀回不解除 `BLOCKED_NO_APPLY`。Codex 是唯一工程 writer，負責 repo-only provenance/runbook 與唯讀補證；Matt 指定 operator、checkpoint 與窗口，獨立 reviewer/QA 只讀審查。S4A/history 另案釐清順序、相容性與精確授權，fresh Tier-2 gate 後才可能執行。**不能在未證明產品依賴前宣稱整個 CTBC 產品都必須先套用 S4A**；S9 仍不得啟動。PR #56 僅文件，合併不代表任何 production 步驟放行。

2026-10-07 fresh readback 仍無 S8 constraint、duplicate groups=0、同一 history drift；見 [本輪查證](ctbc-review-alignment-20261007.md)。未定：Gmail 帳戶與受保護卡 selector、相同兩列可信識別、provider 17:00 可靠性與 lease/fencing、超窗補捕 operator／範圍、live retention 承載。這些須未來 gate，不能把 S8 附條件 A 或 PR 合併解讀為 Gmail、scheduler、DB 或 S9 授權；獨立 Review/QA 與 provider auto-deploy/rollback 未讀回前不 merge。
