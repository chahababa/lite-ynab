# Lite YNAB Option B＋旅遊事件 Domain / Product SPEC

版本：v2026-09-16
狀態：Option A 產品語意已核定；Concept maturity = 5
風險等級：Tier 0 — 文件 / 規格 only；本 PR 不修改任何 executable code、package files、migration、env / secrets、deployment、production data 或既有 transactions / categories。

## 0. Precedence / 歷史保留

本文件是 Lite YNAB 產品語意的新版權威規格，對齊 Notion decision SoT：page `32e6f483-1a61-8085-8962-e4aa6e7fe6db`，section「產品方向決策：月度消費規劃器＋旅遊事件（2026-09-16）」。

優先順序：

1. 本文件與上述 Notion 決策，優先於早期「Mobile-first 極簡版 YNAB / 每月預估薪水 / 類 YNAB 信封」SPEC 的產品語意。
2. 舊 SPEC 不刪除，保留為實作歷史與早期背景；但其中「預估薪水＝水庫」、「傳統 YNAB 帳務語意」、「可直接交給 Claude Code 開始開發」等說法，不再作為新功能設計依據。
3. 現有 repo 仍保留許多已上線概念，例如 `monthly_incomes`、`budgets`、`transactions`、`category_groups`、`payment_methods`。本文件描述的是下一階段 domain semantics，不代表本 PR 變更既有 schema 或行為。

## 1. Product positioning

Lite YNAB 的新定位是：個人月度消費規劃與行為分析工具（personal monthly spending planner）。

它不是帳戶精準對帳系統，也不是完整 YNAB ledger。核心用途是讓 Matt 看懂：

- 本月各消費品項花了多少。
- 跟原本規劃相比多花或少花多少。
- 過往消費狀態與趨勢。
- 下個月應如何規劃。
- 旅遊、工作代墊、特殊支出不應扭曲日常生活分析。

產品語言必須避免把「比規劃少花」說成「真實省下的錢」。Lite YNAB 沒有銀行帳戶餘額、信用卡未出帳、薪資入帳、現金流、淨資產或 reconciliation，因此不能宣稱真實存款增加。

建議用語：

- 「比規劃少花」
- 「預算未使用額」
- 「本月仍低於規劃」
- 「日常花費速度較規劃低」

禁止用語：

- 「實際省下」
- 「現金增加」
- 「可投資餘額」
- 「Ready to Assign」
- 「帳戶餘額已對帳」

## 2. Current repo concepts to preserve / reinterpret

目前 repo 已有以下核心概念，可作為 domain 對照，但不能不加區分地沿用舊語意：

- `src/lib/types.ts`
  - `CategoryGroup`：大項分類，例如個人、家庭、其他。
  - `Category`：細項分類，含 `is_auto`、`auto_amount`、`is_quick`。
  - `MonthlyIncome`：目前用於本月收入 / 可分配基礎；新語意下應避免被解讀為精準薪資或銀行入帳。
  - `Budget`：目前以 `allocated` 表示每月分類規劃額。
  - `Transaction`：目前每筆支出含 `date`、`amount`、`category_id`、`payment_method_id`、`source`、`source_text`、`source_id`、`metadata`。
  - `ReportSummary` / `BudgetUsageData`：目前聚合所有當月交易與預算；新語意需加入 analysis scope 後再決定哪些交易進入哪些報表。
- `src/lib/data.ts`
  - `computeDashboardData()` 目前用 `allocated - spent` 計算分類剩餘，並用 `income - allocatedTotal` 計算未分配。
  - `fetchBudgetUsageData()` 目前以 today / month 為 scope，未排除旅遊日期或工作代墊。
- `src/lib/reportData.ts`
  - `computeReportData()` 目前以交易日期月份聚合收入、預算與交易，尚未區分個人 / 旅遊 / 工作排除 / 特殊支出。
- `supabase/migrations/202604020001_init_lite_ynab.sql`
  - 早期 `transactions.category_id references categories(id) on delete cascade` 與 `budgets.category_id ... on delete cascade` 是歷史安全風險；新功能實作前必須先解決分類封存與歷史不可被 cascade 刪除的 blocker。
- `supabase/migrations/202604030004_add_budget_planning_groups_and_payment_methods.sql`
  - 已有 `category_groups`、`payment_methods`，交易需要 payment method，但本 SPEC 不把 payment method 升級為帳戶模型。

## 3. Terms / domain vocabulary

### 3.1 Formal budget vs recommendation

Formal budget（正式規劃額）：

- 使用者明確確認要用來衡量本月 spending 的規劃額。
- 可以來自手動輸入、複製上月、固定金額、或接受系統建議。
- 一旦成為 formal budget，就能用於「比規劃多 / 少花」、「預算未使用額」、「超出規劃」。

Recommendation（建議額）：

- 系統根據歷史或規則提出的參考值。
- 不得在使用者確認前算入 formal budget。
- UI 必須清楚標示「建議」，不能看起來像已設定的規劃。
- 資料不足時可以不提供建議，或標示「資料不足」。

Fixed amount / fixed expense（固定金額 / 固定支出）：

- 目前 repo 的 `Category.is_auto` + `auto_amount` 比較接近固定金額模板。
- 固定金額仍不等於 recommendation；它是使用者過去設定的固定規則。
- 月初自動帶入後，若未被使用者確認，未來仍應能區分「系統帶入草稿」與「使用者正式確認」。

### 3.2 Daily food vs entertainment dining

日常飲食：

- 必要支出。
- 適合每日 / 每週速度控制。
- 旅行期間應排除於日常飲食每日速度分母。
- 例：早餐、便當、日常咖啡、平日簡餐。

聚餐 / 娛樂飲食：

- 可調整支出。
- 適合用月次數、單次上限、事件額度控制。
- 不應混入日常飲食速度，否則會扭曲「平常一天吃多少」。
- 例：朋友聚餐、喝酒、約會餐、慶祝餐。

第一版若尚未重構分類 UI，至少在 domain SPEC 與後續 migration plan 中保留兩者不可混用的規則。

### 3.3 Spending event

Spending event 是一個具有名稱、日期範圍、目的與規劃額的特殊消費事件。

第一版主要用於旅遊事件：

- 一趟旅遊 = 一個 spending event。
- B-only first release：每個旅遊 event 只記一筆 summary transaction。
- C-compatible data model：資料語意保留未來同一 event 連結多筆 detailed transactions 的能力。

事件可以有 planned amount，但 actual amount 只能由 linked transactions 聚合而來。不得同時保存一個手動 event total 又再把 linked transactions 加總，造成兩套真相。

Single-source-of-truth aggregation：任何 event actual amount、category spent、routine daily speed 或報表總額，都必須有單一明確聚合來源；第一版 event actual amount 的 source of truth 是 linked transactions，不是手動 total 欄位或 UI 暫存值。

### 3.4 Analysis scope

每筆交易未來需有 analysis_scope。第一版至少要在 domain / migration plan 中定義以下值：

| analysis_scope | 語意 | 進入日常個人分析 | 進入旅遊 / 特殊分析 | 備註 |
|---|---|---:|---:|---|
| `personal` | 一般個人 / 家庭生活支出 | 是 | 否 | 日常分類與月度規劃的主要來源 |
| `travel` | 旅遊事件支出 | 否 | 是 | 需關聯 spending event；旅行日期也排除日常分母 |
| `work_excluded` | 工作支出 / 公司代墊 | 否 | 可在排除報表查看 | 不處理應收款、還款配對或公司帳 |
| `special` | 非日常但仍屬個人的特殊支出 | 否；不進日常速度分析 | 是 | 計入個人總支出，並在特殊支出報表獨立呈現，例如大額一次性設備、禮物、醫療等 |
| `excluded` | 不進分析的紀錄 | 否 | 否 | 測試資料、修正紀錄、明確排除項 |

所有聚合都必須先明確選擇 analysis scope，不得再用「全部 transactions」隱含代表「個人日常」。

## 4. State semantics

目前既有資料很容易把「沒有資料」、「0 元」、「自動帶入」、「使用者確認」混在一起。新 domain 必須明確區分以下狀態。

| state | 定義 | UI / 報表語意 | 計算語意 |
|---|---|---|---|
| `unconfigured` | 尚未存在有效設定，或使用者尚未對此項做過選擇 | 顯示「尚未設定」或引導設定 | 不得當成 0，也不得當成 formal budget |
| `draft` | 系統帶入、複製、推估或暫存，但尚未被確認 | 顯示「草稿 / 建議」 | 可預覽，不得進正式 KPI |
| `confirmed` | 使用者明確確認的正式規劃額或事件 | 顯示為正式規劃 | 可計入 formal budget 與差異分析 |
| `explicit-zero` | 使用者明確把金額設為 0 | 顯示「已確認 0」而非「尚未設定」 | 可計入 formal budget，且與 unconfigured 不同 |
| `closed` | 月份 / event 已結算，不應被常規自動流程改寫 | 顯示「已結算」 | 報表可讀；修改需有明確解鎖或更正流程 |

適用範圍：

- 月度 category budget。
- spending event planned amount。
- summary transaction 是否已建立。
- report period 是否已結算。

重要規則：

- `unconfigured` 不能被當作 `explicit-zero`。
- `draft` 不能被當作 `confirmed`。
- `closed` 不表示資料不可修正，但修正必須被視為更正流程，而不是一般自動覆寫。

## 5. Domain entities

以下是 domain-level entity，不是本 PR 要新增的 migration。

### 5.1 Month plan

Purpose：描述某月的個人消費規劃。

必要語意：

- month_id：`YYYY-MM`。
- formal planning base：可用於規劃的參考總額；不得宣稱為精準收入或帳戶餘額。
- category budgets：每個分類的 formal / draft / explicit-zero / unconfigured 狀態。
- closed state：月報或人工確認後可關閉。

### 5.2 Category and category group

Purpose：支出分類與報表維度。

必要語意：

- 大項 / 小項可維持現有 `category_groups` / `categories`。
- 日常飲食與娛樂飲食必須能被分類或標籤區分。
- reserve / target category 必須可辨識，避免被當成真實支出或真實省錢。
- 刪除分類不可 cascade 刪除歷史交易；必須改以 archive / inactive 類語意處理。

### 5.3 Transaction

Purpose：實際記錄的一筆支出或排除項。

必要語意：

- date：交易歸屬日期，沿用既有「補記帳看 date，不看建立時間」原則。
- amount：正數支出；本 SPEC 不引入收入、轉帳或退款 ledger。
- category_id：分類。
- payment_method_id：支付方式；仍不代表帳戶對帳。
- analysis_scope：personal / travel / work_excluded / special / excluded。
- spending_event_id：可選；travel 第一版 summary transaction 必須連到 event。
- source / source_id：既有 `manual`、`ynab_import`、`hermes` 等來源需保持 idempotency 能力。

active_for_event：event 聚合時是否把該 transaction 視為 event actual amount 的有效來源。Summary → detailed migration 時，舊 summary transaction 必須被設為 inactive / reversed / superseded（具體技術由後續 SPEC 決定），並留下 audit trail；不得用刪除歷史交易的方式達成不重複計算。

### 5.4 Spending event

Purpose：管理一段特殊消費情境，第一版以旅遊為主。

必要語意：

- type：第一版只需要 travel；可保留未來 special event。
- name：事件名稱，例如「2026 九州家庭旅行」。
- start_date / end_date：含起訖日。
- planned_amount：事件規劃額；有 state semantics。
- recording_mode：`summary` 或 `detailed`。
- actual_amount：不得手動獨立保存為第二套真相；必須由 linked transactions 聚合。
- status：draft / confirmed / closed 等。

B-only first release：

- 每個 travel event 使用 `recording_mode = summary`。
- 只建立一筆 summary transaction，scope = `travel`，連到 spending event。
- summary transaction 的 amount 就是事件目前 actual amount 的唯一來源。

C-compatible future：

- 同一 event 可連多筆 detailed transactions。
- 從 summary 升級 detailed 時，必須用原子流程停用 / 反轉 summary transaction 後，才啟用 detailed transactions。
- 禁止 summary 與 detailed 同時被聚合。

## 6. Pure-function calculations

所有報表與 UI KPI 應盡量寫成可測試的純函式。輸入是 transactions、budgets、events、date range、scope filter；輸出是 summary rows。不得在計算中偷偷讀取 UI state 或 production data。

### 6.1 Routine personal spending

輸入：

- transactions within date range。
- `analysis_scope = personal`。
- category filters。

輸出：

- spent_by_category。
- spent_by_group。
- total_personal_spent。
- remaining_by_category = formal_budget - personal_spent。
- plan_delta = personal_spent - formal_budget。

語意：

- travel / work_excluded / special / excluded 不進 routine personal spending。
- 若 budget state 是 unconfigured 或 draft，不得列入正式差異；UI 可顯示「缺正式規劃」。
- 若 budget state 是 explicit-zero 且有支出，這是「已確認 0 但發生支出」，不是「尚未編列」。

### 6.2 Daily routine denominator

目的：計算日常飲食或其他每日速度時的分母。

定義：

- routine_days(month) = 該月天數 - 該月與所有 confirmed / closed travel event 日期範圍交集的 union day count。
- travel event 起訖日都算旅行日。
- 跨月旅行只排除該月交集的日期。
- 多個 travel event 重疊時只能排除一次。
- 若 routine_days = 0，不得除以 0；UI 顯示「本月沒有可比較的日常天數」或「資料不足」。
- draft travel event 只能用於預覽，不得影響正式 routine denominator 或 formal KPI。

### 6.3 Travel event actual amount

定義：

- event_actual_amount(event_id) = sum(transactions where spending_event_id = event_id and analysis_scope = travel and active_for_event = true)。
- summary mode：理論上只有一筆 active summary transaction。
- detailed mode：可以多筆 active detailed transactions。
- 若同時存在 summary 與 detailed active transactions，這是資料一致性錯誤，報表不得默默加總，必須阻擋或標示需要修復。

### 6.4 Work advances / company reimbursements

定義：

- `analysis_scope = work_excluded` 的交易，不進個人 routine spending、不進「比規劃多 / 少花」、不影響日常速度。
- 第一版不做應收款、還款配對、公司帳、invoice、reimbursement aging。
- 可在「排除項 / 工作代墊」報表列出，方便人工查詢。

### 6.5 Reserve / target categories

Reserve / target categories 例如緊急預備金、年度目標、旅行基金。

規則：

- Formal budget 代表「本月打算保留 / 撥出 / 不花」的規劃，不等於實際已存入某帳戶。
- 若沒有 linked transaction，不得把未花掉的金額宣稱為真實存款增加。
- 報表可顯示「目標預留額」、「本月未使用額」，但不能宣稱已完成資產配置。

## 7. First-release UX requirements

第一版目標是讓 Matt 可用最少新增流程得到正確分析口徑。

### 7.1 Month planning UX

- 使用者能看到本月分類 formal budget。
- 系統可提供建議或固定金額，但必須標示 draft / recommendation，直到使用者確認。
- `unconfigured`、`draft`、`confirmed`、`explicit-zero` 在 UI 上不可混淆。
- 「預算未使用額」只針對 confirmed / explicit-zero 的 formal budget 顯示。

### 7.2 Daily food / entertainment dining UX

- 日常飲食與娛樂飲食需要分開呈現。
- 日常飲食看每日 / 每週速度。
- 聚餐 / 娛樂飲食看月次數、單次金額或事件額度。
- 若使用者仍把娛樂飲食記到日常飲食，報表應能透過分類 / scope 修正，而不是把高單價聚餐平均進日常便當速度。

### 7.3 Travel event UX — B-only first release

最小流程：

1. 建立旅遊事件：名稱、起訖日、規劃額。
2. 建立一筆旅遊摘要支出：日期、金額、支付方式、備註。
3. 系統把該摘要 transaction 標為 `analysis_scope = travel` 並連到 event。
4. 日常分析排除該金額。
5. 日常飲食每日速度排除旅遊日期。
6. 旅遊報表顯示 planned amount、actual summary amount、差額。

第一版不要求：

- 旅遊逐筆記帳 UI。
- 外幣與匯率。
- 自動判斷哪些交易屬於旅行。
- 共同付款或分帳。
- 一筆交易拆成多個用途。

### 7.4 Work excluded UX

- 使用者能把某筆交易標成工作代墊 / 公司支出排除。
- 排除後，個人月度分析與日常速度不受影響。
- 可在單獨清單查到排除交易，避免資料消失。
- 不做還款追蹤或應收帳款模型。

## 8. Acceptance criteria

### 8.1 Product semantics

- [ ] Lite YNAB 被描述為「個人月度消費規劃與行為分析工具」，不是 account-accurate ledger。
- [ ] UI / report 文案使用「比規劃少花 / 預算未使用額」，不使用真實 savings 語意。
- [ ] Formal budget 與 recommendation 在資料與 UI 上可區分。
- [ ] `unconfigured` 與 `explicit-zero` 可區分；0 元不再自動代表尚未設定。
- [ ] `draft` 不被正式 KPI 當成 confirmed。

### 8.2 Analysis scope

- [ ] 每筆交易可以被歸入 personal / travel / work_excluded / special / excluded。
- [ ] Routine personal report 只使用 `personal` scope，除非使用者明確切換報表口徑。
- [ ] Work advances 不進個人分析，不影響「比規劃多 / 少花」。
- [ ] Special spending 計入個人總支出、不進 routine daily pacing，並在特殊支出報表單獨呈現。

### 8.3 Travel events

- [ ] 可建立一趟 travel spending event，含名稱、起訖日、規劃額。
- [ ] 第一版每趟 travel event 只有一筆 summary transaction。
- [ ] Travel actual amount 只由 linked transactions 加總，不保存第二套 event total。
- [ ] Travel scope 排除 routine personal spending。
- [ ] Travel dates 排除 routine daily denominator。
- [ ] Summary → detailed future migration 有雙重計算防呆。

### 8.4 Current repo compatibility

- [ ] 新規格能對照現有 `categories`、`category_groups`、`monthly_incomes`、`budgets`、`transactions`、`payment_methods`。
- [ ] 不把現有 `payment_methods` 升級成銀行帳戶模型。
- [ ] 不把現有 `monthly_incomes` 宣稱為精準薪資或實際帳戶餘額。
- [ ] 舊 Mobile-first / estimated-income SPEC 被標示為歷史文件，不再高於本決策。

## 9. Acceptance test scenarios

以下是後續實作 PR 必須具備的 domain-level 測試，不要求本文件 PR 實作。

### 9.1 Cross-month trip denominator

Given：旅遊 event 為 2026-04-28 到 2026-05-03。

When：計算 2026-04 的日常飲食每日速度。

Then：2026-04 排除 04-28、04-29、04-30 共 3 天；4 月 routine denominator = 30 - 3 = 27。

When：計算 2026-05 的日常飲食每日速度。

Then：2026-05 排除 05-01、05-02、05-03 共 3 天；5 月 routine denominator = 31 - 3 = 28。

### 9.2 Zero-day denominator

Given：某 month 的每一天都被 travel events 覆蓋。

When：計算日常飲食每日速度。

Then：不得除以 0；UI 顯示「本月沒有可比較的日常天數」或「資料不足」。

### 9.3 Fixed expenses

Given：房租是固定金額 12,000，月初由系統帶入 draft。

When：使用者尚未確認本月規劃。

Then：它可在 UI 顯示為「待確認固定金額」，但不得被當成正式 confirmed budget 參與「比規劃多 / 少花」。

When：使用者確認房租 12,000。

Then：它成為 formal budget，可進入正式差異分析。

### 9.4 Reserve / target categories

Given：緊急預備金 formal budget = 5,000，當月沒有任何 transaction。

When：顯示月報。

Then：可顯示「目標預留額 5,000」或「預算未使用額 5,000」，不得顯示「已實際存下 5,000」。

### 9.5 Insufficient data for recommendation

Given：某分類只有 1 筆歷史交易，或過去 3 個月資料缺漏。

When：系統產生下月建議額。

Then：可顯示「資料不足，暫不建議」或低信心提示；不得自動建立 confirmed budget。

### 9.6 Same-event multiple transactions

Given：未來 detailed mode 中，一趟旅行 event 連到 3 筆 transactions：8,000、2,500、1,200。

When：計算 event actual amount。

Then：actual amount = 11,700，且 travel report 顯示來源為 3 筆 linked transactions。

### 9.7 Summary → detailed double-count prevention

Given：一趟旅行在 summary mode 已有一筆 30,000 summary transaction。

When：使用者升級為 detailed mode，新增 5 筆 detailed transactions。

Then：系統必須以原子流程停用 summary transaction 後才啟用 detailed aggregation；報表不得顯示 30,000 + detailed total 的雙重計算。

### 9.8 Work advance exclusion

Given：Matt 幫公司代墊 4,200，標記為 `work_excluded`。

When：計算 personal routine monthly report。

Then：4,200 不進個人 spent、不影響 category remaining、不影響 daily speed；但可在 work excluded list 查到。

### 9.9 Explicit-zero vs unconfigured

Given：娛樂飲食 formal budget state = explicit-zero。

When：當月發生 1,000 娛樂飲食支出。

Then：報表顯示「已確認 0，但實際支出 1,000」，不是「尚未設定」。

Given：另一分類 state = unconfigured。

When：當月發生支出。

Then：報表顯示「尚未設定規劃」，不得把未設定當成正式 0 元超支。

## 10. Migration safety constraints / blockers before implementation

下列 blocker 是任何 schema / code implementation 前的 prerequisites。本 Tier 0 PR 只記錄，不處理。

### 10.1 Category archive / no cascade history deletion

現有 migration 歷史中，`budgets.category_id` 與 `transactions.category_id` 曾使用 `on delete cascade`。這會讓刪除分類有機會刪掉歷史預算與交易，是 domain safety blocker。

Implementation prerequisite：

- 分類應支援 archive / inactive，而不是直接刪除歷史分類。
- 歷史 transactions / budgets 不得因分類刪除被 cascade 刪掉。
- UI 上「刪除分類」若仍存在，需改成封存或有安全遷移。

### 10.2 Tenant ownership

所有新 entity，包括 spending_events、event links、scope metadata，都必須有明確 ownership，且不能讓不同 user / tenant 的資料互相連結。

Implementation prerequisite：

- event、transaction、category、budget 的 ownership 必須一致。
- RLS / service role 寫入需有測試證明不能跨 user 關聯。
- Batch writes 必須驗證所有 ids 屬於同一 owner。

### 10.3 Atomic batch writes

Travel event + summary transaction 是跨 entity 寫入；summary → detailed migration 更需要一致性。

Implementation prerequisite：

- 建立 event 與 summary transaction 必須同成同敗。
- summary → detailed 切換必須同成同敗。
- 任一步失敗時不得留下 active summary + active detailed 同時計算的狀態。

### 10.4 Export formula sanitization

CSV / Excel / Google Sheets 匯出既有功能會輸出交易文字與備註。新增 event name、note、source text 後，所有可被 spreadsheet 解析成公式的欄位都必須防 formula injection。

Implementation prerequisite：

- 任何以 `=`, `+`, `-`, `@` 等開頭的使用者輸入，在匯出前要被安全轉義。
- Event name、transaction note、source_text、category name 都在防護範圍。

### 10.5 Idempotency

既有 transactions 有 `source` / `source_id`，Hermes 與 YNAB import 已需 dedupe。新增 event summary 寫入也必須有 idempotency。

Implementation prerequisite：

- 同一 travel event 的 summary transaction 重試不得重複新增。
- 外部匯入 / Hermes 寫入不得因 retry 造成重複交易。
- Batch operation 應有可重試 key 或 deterministic source_id。

### 10.6 Reproducible lockfile / CI

README / DEPLOYMENT 已記錄過 Dockerfile 因 lockfile 不同步而改用 `npm install`。在進入正式 implementation 前，需恢復可重現安裝與 CI 信心。

Implementation prerequisite：

- package lockfile 與 package manifest 同步。
- CI 至少跑 typecheck、test、lint 或等效檢查。
- 文件 / spec PR 可以不處理，但 implementation PR 不應在不可重現 install 狀態下擴大 schema / domain 風險。

## 11. Non-goals

第一版不做：

- 本 SPEC PR 不修改 executable code。
- 本 SPEC PR 不修改 package files / lockfiles。
- 本 SPEC PR 不修改 migrations、Supabase schema、RLS、production DB 或 production data。
- 本 SPEC PR 不修改 `.env`、secrets、OAuth、Zeabur env 或部署設定。
- 本 SPEC PR 不修改既有 transactions、categories、budgets、payment methods 或使用者資料。
- Account balances。
- Ready to Assign。
- Bank / credit card reconciliation。
- Net worth。
- Foreign exchange / FX。
- Shared payment splitting。
- Automatic travel classification。
- Transaction splits。
- Work reimbursement workflow / AR aging。
- Full ledger with income / transfer semantics。
- Production data migration in the spec PR。
- Supabase schema migration in the spec PR。
- Any executable code change in the spec PR。

Target mode 說明：PMO 已授權本文件完成後自動接續下一個合法、安全且可逆的工作；但這不等於 production mutation blanket approval。任何 production DB / schema / RLS apply、production data write / delete / backfill、secrets / env / OAuth、deploy / restart / rollback 不明、merge conflict、無法自修的 CI failure、不可逆資料刪除或新的產品取捨，仍必須另建精準 Decision Package。

## 12. Phased roadmap

### Phase 0 — Domain SPEC and PMO reconciliation

Deliverable：本文件。

Goal：讓 PMO 對齊產品語意、Notion decision、old SPEC precedence、implementation blockers。

Exit criteria：

- PMO 確認本文件與 Notion decision 一致。
- Concept maturity = 5；四項產品語意已依 Option A 定案。
- PMO 決定是否拆出 safety blocker / implementation cards。
- 在 target mode 下，maturity gate 已通過；PMO 仍須完成本文件與 Notion decision 的讀回校對，才可建立對應 Tier 2 dependency graph，且不得把此決策視為 production mutation 授權。

### Phase 1 — Safety blockers first

Goal：在任何新 domain schema 前，先處理不應被新功能踩到的基礎風險。

Scope candidates：

- Category archive / no cascade deletion。
- Tenant ownership / RLS proof。
- Atomic batch write pattern。
- Export formula sanitization。
- Idempotency pattern。
- Reproducible lockfile / CI。

### Phase 2 — B-only travel event first release

Goal：用最小可用範圍支援旅遊事件 summary recording。

Scope：

- Spending event domain / storage。
- Transaction analysis_scope。
- One summary transaction per travel event。
- Travel report。
- Routine personal analysis excludes travel spending and travel dates。

### Phase 3 — Personal analysis refinement

Goal：讓 Lite YNAB 更準確支援「下個月怎麼規劃」。

Scope candidates：

- Formal vs recommendation UX。
- Budget state semantics。
- Daily food vs entertainment dining separation。
- Insufficient-data recommendation handling。
- Reserve / target category presentation。

### Phase 4 — C-compatible detailed event recording

Goal：在 B-only summary model 穩定後，才加入 detailed transactions。

Scope candidates：

- Detailed travel transaction UI。
- Summary → detailed atomic migration。
- Same-event multiple transaction aggregation。
- Event-level audit and consistency checks。

## 13. First-release checklist for PMO / implementation card drafting

Implementation card 不得早於以下條件：

- [ ] PMO 已讀回 Notion decision 與本 SPEC，確認無產品矛盾。
- [ ] PMO 明確選定 first implementation slice，且沒有把 Phase 2 / 3 / 4 混成同一張卡。
- [ ] Safety blockers 已完成，或該 slice 被證明不會觸碰 blocker。
- [ ] Acceptance tests 從本文件轉成實作卡的測試要求。
- [ ] Non-goals 被原樣帶入 implementation card。
- [ ] Implementation card 明確禁止 account ledger / Ready to Assign / reconciliation / FX / splits。

## 14. Normative product semantics — Option A

Matt 已選擇 Option A；以下四項為後續規格與實作的產品語意，不再是待 PMO 選擇的開放問題：

1. 日常飲食與娛樂飲食的行為判定使用穩定的系統語意角色 / 標籤，不依賴使用者可編輯的顯示名稱；使用者改名不得改變其分析行為。
2. `special` spending 計入個人總支出、排除日常速度（daily pacing），並在特殊支出報表獨立呈現。
3. `closed` 月份只能透過明確的重新開啟 / 更正流程修改，且必須留下 audit；禁止靜默覆寫已結算月份。
4. Phase 1 將 `monthly_incomes` 的使用者可見 UI 文案改為「本月規劃基準」，但保留既有 table / field 名稱，不做 rename migration。

這些決策只收斂既有 Option B 產品語意；不改變 C-compatible / B-first 旅遊模型、non-goals、invariants、acceptance criteria 或 production hard-stop boundaries，也不構成 implementation 或 production mutation 授權。