# CTBC 合成收件匣隔離實驗

這是合成預覽，記憶體重整會重置；不是 S9、持久收件匣、正式功能或正式上線。S8-PROD 仍 BLOCKED_NO_APPLY。

基準：PR #60 文件 commit `6d3b7e553713e991c5e067c1cddb3349996b8ca4`；本 writer 在未修改文件前獨立唯讀審查為 DOC_REVIEW_PASS，不是 GitHub human approval。#60 CI 37640973019 兩項 SUCCESS，exact head 相符。#57 全文與兩則留言、#56/#59 文件已重新讀取；main/#56/#59 head 與交接相符。沒有修改或合併這三個 PR。

審查覆蓋：排程槽 D（不是啟動日）、17:00 固定截止、毫秒窗口及 epoch 秒外包、三個交易曆日、晚到／最舊 cohort 超窗、閏日／跨年／假日、固定 key／有限重試／午夜停止／fencing、既有 shell 先查、新來源再 cohort、五操作、可改選建議／理由、待辦數、風險不批次批准、無信／漏跑／零新增／部分失敗分離、Telegram 另經授權。未發現阻擋此實驗的矛盾；provider 準時性、可信 Gmail header 取得、真實相同列識別與超窗補捕均仍待 live gate。

## 本機開啟

在 repo 根目錄執行（使用 lockfile 既有的 Vite，未新增依賴）：

```powershell
node node_modules/vite/bin/vite.js --config experiments/ctbc-synthetic/vite.config.ts
```

開啟 `http://127.0.0.1:4178`。Ctrl+C 結束。沒有使用 next dev，不會接上 src/app。

操作：先核對警告／建議，可採用或改選分類與支付方式，勾選本次確認，再選五操作。已記過另選本人既有合成交易。批次須勾選安全列、指定共同分類／支付方式、查看摘要後確認；風險列不能勾選。頁首數包含稍後與衝突，排除終態。工作排除零個人帳本寫入。收集狀態選單只是 UI 情境切換，不會啟動收集或排程。

## 隔離與模型邊界

- 全部新增實作在 experiments/ctbc-synthetic，唯一 repo 配置改動是讓 vitest 取得實驗測試。src/app、public、production parser、migration、package/lock、env、workflow 均不改。
- Browser 只載入 App/main/model/fixtures 與 design tokens；没有 parser、collector、DB client、網路 API 或 storage。Vite loopback-only、envDir=false、publicDir=false、HMR=false，CSP connect-src=none，fs allow 限實驗／design／node_modules，拒絕 env/.git/src/supabase/collector/parser/test。
- isolation.test.ts 以靜態 graph／config assertions 證明不被 production source import，App.test.tsx 的五操作 spy 禁止 fetch/XHR/WebSocket。這些證據限此受測 graph；不是 OS 網路 sandbox 或任意惡意程式的安全邊界。
- parser.snapshot.ts 凍結基準 Phase 1 parser，唯一行為變更是移除 Set 合併、保留逐列輸出；普通 fixture parity test 與原 parser 比對。快照只供 Node 合成 collector，不修改正式 parser，不接 Browser。以後正式 parser 變更須重新 review/parity，不可默默同步。
- collector 接受測試呼叫的 synthetic envelope／trustedHeader boolean，不讀任何 Gmail。可信 header provenance 在這裡是 mock，不能證明 Gmail 信任鏈。先毫秒窗口／來源驗證，再逐列單卡，ambiguous 目標列整封阻擋，再淨化。現有 row-based identity 不能證明銀行改寫同一列的對應；payload conflict 測試是對固定來源 draft identity 的模型契約，真實穩定 row identity 仍 Gate C。
- source/hash 皆由合成輸入產生，不回顯到 UI。model 的 synthetic checksum 是非安全校驗，非 production hash 設計。詳細資料 30 天／結案後 7 天清除，shell/event/link/replay 在結案或到期後 90 天清除；正式合成帳本保留。所有 dates/merchant/amount/card/message 都是合成。
- ownership、同步記憶體 critical section、version/idempotency、run lease/fence/retry 是模型測試，沒有 Postgres、RLS、RPC、provider scheduler 或多 process crash/recovery 證據。每個 SyntheticRuns instance 模擬一個受保護 collector scope，D 唯一，無 selector/schedule-version key。
- collector 必須帶同 scope 的有效 mock lease，過期或舊 token 在任何 candidate/retention mutation 前拒絕；同步實驗以注入 now 驗證全次呼叫，沒有長時間 I/O／多 process 中途到期／DB 寫入端原子 fencing 證據。直接 model.add/existing 是 unit-test/UI seed API，不是 collector 或正式 API。
- scope 在此只綁定 constructor 傳入的 SyntheticInbox object identity；受測反例含另一個已啟動 inbox/scope 的有效 token（該 scope 自己 canWrite=true）用於本 inbox 仍拒絕。trusted caller 必須每 inbox 使用唯一 SyntheticRuns instance；沒有全域／跨 process lease registry 或 owner/mailbox/service authentication 證據，不能當正式授權。
- 同源重掃的「回原狀態」指不新增候選、不覆寫金融 payload、不延長期限、不復活終態／不補回清除欄位；新 partial_batch 等風險必須單向追加。保留明細的 pending 轉 conflict 並增加 version；相同風險再次出現不加版，正常重掃不清警告。已結案只追加仍保留明細的警告，不重開；已清除明細的 shell 不重建。
- personalViews 的預算／列表／分析／報表／CSV／備份是同一合成 ledger 的 projection，證明實驗候選不流入它們；未聲稱實際 app 每條匯出通道已端對端驗收。

## 驗證與回復

```powershell
npm test -- experiments/ctbc-synthetic
npm run lint
npm run typecheck
npm test
npm run build
```

完整測試／CI／UI 實測結果記在本 PR。相同兩列阻擋、跨訊息不自動消除、來源防偽、單卡、窗口、既有來源優先、五操作、本人既有帳比對、owner/category/payment、double-click/retry/stale、risk batch、工作排除各 projection 零污染、30/7/90、bounded retry/lease expiry/fence/midnight 皆有自動化案例。沒有調大 timeout 或略過舊測試。

本機修正後：lint 0 errors／17 個既有 warnings；typecheck 通過；實驗 4 files／71 tests（model 32、collector 27、UI 8、isolation 4）；全 repo 44 files／376 tests 通過；Next build 通過且無 CTBC route，.next/server/static JavaScript 搜尋實驗 marker 零命中。本機 HTTP probe：不存在的合成 env 路徑、production src 路徑、collector、parser snapshot 全部 403。前一次 376-tests 全套有 Windows worker 結束逾時 warnings（exit 0），保留曾出現的事實；修正 scope 後原指令重跑 376 通過且無該 warnings。最終 release head 的 Linux CI 另於 PR 讀回，不繼承 #60 綠燈。

本 writer 的 UI QA 與自檢不是獨立 reviewer；independent code/security/UX review、Postgres/RLS/RPC QA、手機真機、live Gmail/provider/retention/release 均 NOT_RUN。控管 chat 另行協調獨立驗證。

控管唯讀 review 曾重現 P2：相同來源新 partial_batch 警告被 existing 去重吞掉，且 fence helper 與 collector 寫入分離。已修為風險單向追加、collector 必要 lease，新增首次正常→重掃 partial→版本/批次/稍後/retention/終態/清除明細，以及 expired/old/wrong-scope lease 寫入拒絕回歸。修正後 verdict 仍需控管重新讀回，不自稱獨立 reviewer 通過。

Writer 本機瀏覽器 QA：360px viewport 內容 scrollWidth 約 345px（垂直 scrollbar），沒有水平溢位；原生 select 與 44 CSS px 按鈕可操作。實際瀏覽器以 Space/Enter 完成五操作：180 已記過連既有、35 私人補記、230 忽略、120 未明商家稍後保持 conflict、260 工作排除；待辦 5→1，帳本 1/180→2/215，只增加私人 35；partial_failure 警示仍保留，reload 回 5 筆合成候選。jsdom 八個 UI 案例補分類改選／建議／批次摘要／五操作 keyboard／零網路 spy。Browser console error/warn = 0（本次受測操作）。這不是獨立 UX 或手機真機驗收。截图只存本機 .git/ctbc-evidence，不上傳私人 evidence 目錄。

回復：停 Vite、revert 本實驗 commit；没有 production schema/data write，不需要 DB rollback。正式 Gmail/OAuth/env/secrets/DB/history/排程/部署/通知/merge 都未執行、未獲本輪授權。provider current SHA/auto-deploy/rollback 仍 UNKNOWN。下一步只能 review 此隔離 PR；S8 未 APPLIED_VERIFIED 前不可開 S9。
