# 給工作室電腦 Codex 的接手 Prompt（2026-10-07）

以下整段可貼給工作室電腦的 Codex Desktop／Cloud。這是任務指示，不含密碼、信用卡識別或真實交易資料。

---

你是 `chahababa/lite-ynab` 中信 Email 待確認交易功能的既定**單一工程 writer**。Matt 已確認：不要讓財務 Agent 在 Telegram 逐筆詢問；改由 Lite YNAB 網頁收件匣持續保存候選，讓他按自己的時間批次檢查、參考建議並選分類。這次可以開始推進安全的 repo-only 開發；**沒有**授權你改真實 Gmail/OAuth/env/secrets、production DB 或 migration history、正式排程／服務、正式資料寫入或風險不明的 merge/deploy。

請先在工作室電腦做 live discovery，不要相信任何舊 SHA、舊 CI 或這份 Prompt 的日期就是目前狀態：

1. 確認 `gh auth status`，查看本機 repo `git status --short --branch`、`git remote -v`；若沒有 repo，用 `gh repo clone chahababa/lite-ynab`。若有任何本機修改，保留它們；使用新的乾淨 clone 或專屬 worktree，**不要 reset/clean/force-push**。
2. 先用 `git ls-remote --heads origin docs/ctbc-review-requirements-20261007` 確認需求分支存在，再用 `git fetch origin refs/heads/docs/ctbc-review-requirements-20261007:refs/remotes/origin/docs/ctbc-review-requirements-20261007` 取得該分支；另以 `gh pr view 56 --repo chahababa/lite-ynab --json headRefOid,headRefName,state,statusCheckRollup` 查 PR 最新 head，並用 `gh pr diff 56 --repo chahababa/lite-ynab` 或明確 fetch `pull/56/head` 讀最新規格（普通 `git fetch origin` 不保證建立 `origin/pr-56`）。用 `gh issue view 57 --repo chahababa/lite-ynab --comments` 與 `gh pr view 56 --repo chahababa/lite-ynab --comments` 讀完整交接與最新狀態。
3. 從遠端讀新需求 `docs/ctbc-review-user-requirements-20261007.md`（它在 `origin/docs/ctbc-review-requirements-20261007`，未必已 merge 到 `main`；例如 `git show origin/docs/ctbc-review-requirements-20261007:docs/ctbc-review-user-requirements-20261007.md`）。再讀 repo `AGENTS.md`、PR #56 最新 Phase 2 spec、MVP parser spec、現有程式／測試／migration 及設計規範。GitHub Issue #57 與此需求文件是產品與安全交接；PR #56 是舊的待合併規格，不要把 PR 已開、CI 成功或 migration 已 merge 誤認為 production 功能上線。

先產出短的「需求差異與分階段實作表」：比對新需求與 PR #56，特別列出每日 **07:00 → 約 17:00 Asia/Taipei** 對 Gmail 接收時間窗、交易日 cohort、logical run key／重試／跨日、重疊回看／去重／超窗警示與合成測試的逐項影響。以具體邊界例子驗證後才修改 Phase 2 規格；若窗口無法證成，就列為待決設計而非宣稱 17:00 已全面定案。確認五種處置各自的狀態語意：補記、已記過、忽略、稍後、工作排除，以及建議分類可改選、首頁待辦數與 Telegram 只做摘要。

然後實際推進：

- 本次第一切片先完成需求差異、docs-only 規格／驗收案例修訂，提交 PR 或在既有 PR #56 上改前**先確認你是唯一 writer、沒有其他人在同 branch 工作**；新 head 重新跑 CI／文件自檢。若 #56 的 provider 自動部署與 rollback 不明，不要擅自 merge。
- 完成第一切片並確認規格邊界後，Matt 這次「開始開發」的授權僅容許在新 feature branch 以**純合成資料與隔離環境**製作 parser 整合模型、候選狀態與 mock inbox／分類操作原型及自動測試；須與 production-bound S9 分離，不能讀真實 Gmail、寫 production 或宣稱正式可用。若無法證明隔離，停在文件與測試計畫並提交差異。重點驗證來源防偽、單卡逐列過濾、去重與不誤刪兩筆真實相同消費、既有手記比對、五種處置、本人資料 ownership、工作支出零個人帳污染、並發冪等、無信／部分失敗、手機與鍵盤 UX。
- 執行 repo 既有的 lint、typecheck、test、build；對 UI 做獨立 UX QA，涉及 DB/RLS/權限與真實資料的 Tier 2 另做隔離的唯讀對抗 review、QA、release gate。不要用舊 head 的綠燈當新 head 的證據。每個 PR 附 exact commit、測試輸出、變更範圍、風險與 rollback／forward-fix。

硬停：Issue #57／PR #56 記載 `S8-PROD = BLOCKED_NO_APPLY`，**程式碼內有 migration 不代表正式 DB 已套用**；S8 未經 fresh preflight、授權、apply、精確讀回前，不啟動 S9 production-bound implementation。相鄰 S4A、migration history repair、production ref、備份可還原性、具名 operator 與維護窗口均需獨立查證；不能承襲舊的附條件授權。真實 Gmail、保護卡設定、OAuth/env/secrets、正式 staging 寫入／排程啟用與正式交易寫入也都另需 exact-scope gate。若遇硬停，保留安全成果並提交具體缺口、證據、A/B/C 選項與建議，不要空等，也不要繞過。

重要：repo 是公開的。任何真實卡號／末四碼、Email／Gmail ID、消費金額與商家、token、env、私有 DB 資料、原始信件及日誌，以及由真實資料推得的 source/message hash、卡片指紋或任何可關聯識別值，都不得寫入 GitHub、fixtures、PR、issue 或 Prompt。只用合成資料與合成 hash；個人資料只在獲授權的受保護邊界處理。

請回報：你讀到的遠端最新 head 與對應文件、已完成的 branch/PR/測試 artifact、哪些只是 mock、哪些尚未 live、目前唯一下一步、以及是否真的需要 Matt 的精確決策。不要只給計畫；在安全範圍內完成可驗證的第一個 docs／synthetic 切片。
