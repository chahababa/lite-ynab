# CTBC 持久化收件匣整合

本分支以 S9 `5d6b8a7879f0020c268cf699665b1fd772ed6419` 為基底，依 #60 的收集與審核規格接入既有 Next.js 應用。這是尚未部署的程式碼；預設關閉，migration 僅提交供審查，未套用正式環境。

## 實際流程

`src/lib/ctbcCollector.ts` 解析合成通知，先篩選受保護卡片，再以不可逆識別與經清理的候選呼叫受限收集 RPC。通知原文、卡號、原始郵件識別不進資料庫、收件匣 API 或操作紀錄。相同郵件中的完全相同行會阻擋該郵件，跨郵件疑似重複保留兩筆並警示。

首頁與設定的入口顯示本人待辦數，`/settings/email-import` 讀取本人持久化候選。使用者自行選擇分類、支付方式或本人既有交易，再明確確認五種動作之一：補記、已記過、忽略、稍後處理、工作支出／排除。只有補記新增個人交易；其餘動作不修改帳本。工作排除也保留候選與事件，供保存期限內重播辨識。

動作在資料庫內依本人、候選版本與操作識別序列化；交易、候選狀態及事件於同一交易提交。相同操作重試回傳原收據，不同內容、過期版本或跨本人參照被拒絕。批次先檢查所有已知風險，再逐筆原子提交；遇衝突停止後續，回報成功、衝突或未提交筆數。批次不是全批原子交易。

補記最後依當次選定的支付方式重新比對本人既有交易；即使是收集後才新增的手動交易，或改選其他支付方式，也會重查同日／±1 日同額與同商家不同額線索。新發現的風險先保存警示與新版本，回到頁面供人核對，當次不寫帳本；逐筆須再明確確認，批次拒絕。改動分類、支付方式或連結交易後，舊確認勾選會清除。

批次資料庫預檢先驗明每個操作識別的完整原請求與事件，再檢查尚未提交候選。回覆遺失可回放原結果，部分成功後可沿用原 commands 繼續未提交項目；未匹配的終態、變造請求或其他操作識別不當作成功。任何新提交項目已有風險，都在首筆新增帳務前拒絕。

## 收集與保存

排程槽固定為台北 D 日：收信區間 `[D−4 00:00, D 17:00)`，接受交易日 D−3、D−2、D−1，午夜停止。持久化範圍、租約、fence 與重試預算約束執行；已知來源先回讀狀態，不受後續交易日窗篩掉。部分失敗與疑似衝突不以人工關閉待辦清除。

待確認 30 天到期並立即清除明細，結案 7 天清除明細，結案 90 天刪除候選殼與事件，已補記帳本保留。讀取 RPC 先執行到期及明細清除，瀏覽器沒有候選表直接讀寫權限。`ctbc_retain` 為 service-role 專用、預設 dry-run 的有限量維護函式；此分支不建立排程。

## 預設關閉與後續界線

`CTBC_INBOX_ENABLED` 未設為字串 `true` 時入口隱藏、API 回 404、頁面不可開啟；收集範圍亦預設停用。未修改任何環境檔或憑證。

相依 worker 切片另提供可執行的 Gmail 接線與持久排程判斷，但**沒有讀取真 Gmail、修改 OAuth／設定、建立服務或啟用排程**。正式 migration、provider 啟用、部署及本人操作驗收仍需後續獨立授權；CI 通過不代表這些工作已完成。

## Worker 接線與操作界線

既有 Node 22 容器在 build 時編譯 `.ctbc-worker`，需 Node 22.19 以上。容器啟動仍是既有 web；worker 可用 `npm run worker:ctbc -- daemon` 作為獨立服務入口，每 30 秒向 DB 判斷是否到台北 17:00。`once` 為一次判斷。這裡沒有新增正式服務、GitHub schedule 或 provider 設定。

`CTBC_COLLECTOR_ENABLED` 預設停用。啟用後先讀取受保護的 `CTBC_WORKER_CONFIG`：固定 scope／owner／mailboxBinding、mailboxSha256、targetLast4、armedDate，以及 `gmail-smtp-reviewed-v1` 的來源審查 evidenceSha256／mailboxSha256。日期、帳戶或來源設定缺漏即拒絕；scope／owner／opaque mailbox binding 亦由每個 worker RPC 檢查，排程 armedDate 寫入後不可改。設定內容不得進前端、PR、Notion 或操作 log。

Gmail 憑證只從 server 的 `CTBC_GMAIL_CLIENT_ID`、`CTBC_GMAIL_CLIENT_SECRET`、`CTBC_GMAIL_REFRESH_TOKEN` 讀取，runtime 檢查回傳只讀 scope 和实际 profile 帳戶 hash。此程式不建立 OAuth 授權。每輪最多 3 頁、100 封、每封原始 MIME 1 MB、累積 10 MB，使用 list／get raw；internalDate 精確二次篩選，MIME 只在記憶體解碼。驗證原始郵件完整 body 的銀行 DKIM、必要簽名欄位、唯一標頭及既有 SPF／DMARC policy，不使用 `synthetic:true` 或自行製造 Authentication-Results。

數位簽章證明内容來源，但不能單獨證明 Gmail internalDate 是 SMTP 收信時間、或收到的 Authentication-Results 來自 Gmail。因此 live 前必須獨立確認該 mailbox 的收信／匯入路徑、Google 的標頭處置與实际標頭排列，產生受保護審查證據。合成簽章／證據 hash 只是程式測試，不能充當真實來源驗收。未知或不符合規則的信拒絕；有界讀取中斷保留已解析安全候選並警示，不能標全成功。

新增小 migration `20261008013654_ctbc_worker_lifecycle` 提供 durable cursor、每個 fence 的 attempt 收據與限定 RPC。DB 原生時間決定 D；同槽最多 3 attempts，每次最多 15 分鐘，失敗後 5／15 分鐘退避、午夜截止。worker 重啟後每次最多補判斷 31 個已截止日期，持久標示漏跑／重試到期；不補讀舊日信或把舊 D 改成今天。租約逾期由 poll 收尾；失敗先查 receipt，失去回覆且查不到結果時保留 UNKNOWN，之後由 DB 租約判斷。commit 與 receipt 同一交易，finalizer 重查且舊 fence 不能關閉新 attempt。部分成果及警示不會因重試成功變成無信。

`npm run worker:ctbc -- retention` 為獨立清理入口；`retention-daemon` 每小時執行，不依賴收集啟用／Gmail 設定。`CTBC_RETENTION_ENABLED` 預設停用，先 count-only；另有明確 `CTBC_RETENTION_APPLY=true` 才每次處理最多 200 筆。這次沒有設定任何旗標或啟用清理。正式啟用收集時，清理 applying 的服務可靠性也須一起驗收；停止收集後清理可維持。

## 驗證

單元測試覆蓋固定日窗、受保護卡片篩選、相同行歧義、來源拒絕、明細清理與 API 預設關閉／輸入防護。

`scripts/test-ctbc-inbox-local.mjs` 僅允許 GitHub Linux CI 與既有本機 Supabase 端點，使用兩個合成帳號。它執行實際收集解析、持久化 RPC、正式 Next.js build、登入後 360px 瀏覽器操作五種動作、重載、鍵盤工作排除與批次補記，並檢查本人隔離、競態／重試、保存期限及帳本數量。瀏覽器網路只允許 CI loopback，輸出合成截圖與無 Gmail／正式請求的證據。測試在 17:00 前使用隔離資料庫的合成 lease fixture，另外驗證真正 begin 的時間／啟用限制；不修改資料庫時鐘。
