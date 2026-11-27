# Implementation Plan: 活動結果 CSV 匯出與收件順位呈現

**Branch**: codex/003-phase-3-csv-export（Phase 2已合併main後依T018建立） | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: 003功能規格及兩項釐清：檔名活動名稱取建場保存的試算表名稱，未加入的預設組別仍列未作答、只顯示系統組號。

**Status**: Phase 1／2已測試、人審並合併。Phase 3已建立一致唯讀結果讀取器、CSV／檔名／資源閘門、teacher端點與目前／歷史下載入口；255項測試、靜態檢查、建置與四圖通過，Excel直接開啟已人工確認，尚待本階段文件核對及合併。教師雙視角與複製功能仍待後續Phase。結果與限制見 [review-notes.md](review-notes.md)。

## Summary

在既有本機TypeScript課堂搶答系統增添所屬老師單場ended活動CSV下載、共用的全場／逐題受理順位介面及活動連結複製。不新增資料表、Google scopes、學生投影欄位或獨立排名資料。結果以SQLite一致唯讀快照及已保存來源／答案導出，題組全部子題共用順位；未加入組別也屬未作答。共用純函數供CSV與兩處教師UI，避免畫面、檔案及固定第一名不一致。

CSV先完整驗資料及容量，採UTF-8 BOM、全欄quoting、必要excel-tab-v1文字保護、臺灣時間及安全中文檔名，成功後才送binary response。對資源限流、過大、缺漏、切帳號及斷線有明確失敗，不改DB或再回填Google。老師進行中的歷史詳情新增原活動即時訂閱，已結束則使用保存快照；複製只寫目前顯示學生網址，失敗保留手動方式。

## Technical Context

**Language/Version**: TypeScript 5.9.3；Node >=24.22.3 <25，沿用已驗證24.22.3與node:sqlite。

**Primary Dependencies**: 現有React19.2.0、Express5.1.0、Socket.IO4.8.1、Zod4.1.12、Vite7.2.2；Google API adapter沿用但本功能不呼叫Google。CSV／檔名／BOM可用標準字串／Buffer／Intl，不預設新增套件。

**Storage**: 現有SQLite WAL／FULL／foreign_keys；17表110欄不變。唯讀快照增加明確同步readSnapshot入口，無migration、排名表、匯出job或持久下載檔。Google授權及session仍僅記憶體。

**Testing**: Vitest4.0.13 unit／integration／contract，Playwright1.56.1（既有Edge channel）E2E；隔離臨時DB／埠／合成Google；真實Excel以合成檔案人工驗BOM、欄位、文字安全。PlantUML語法與渲染及文件對照另驗。

**Target Platform**: 現有Windows本機雙listener：teacher loopback3000、student預設loopback3001，依使用者既定範圍用獨立瀏覽器驗收；Excel版本／build／地區設定在人工驗收時記錄。不藉此新增跨裝置或公網部署。

**Project Type**: 現有frontend／backend／shared npm workspace web application。

**Performance Goals**: 30組、20題、40資料列5秒內生成下載；教師兩種收件視角2秒內更新；複製已知結果後1秒內回饋。CSV有界chunks編碼，至多4096格或4ms讓出事件迴圈；同步DB讀取先有界且不await。

**Constraints**: owner與ended強制驗證、teacher-only route、既有session／CSRF／Host／Origin；沒有部分成功附件。所有尺寸與生成量限制集中參照 [research R4](research.md#r4-有界匯出與完整性)，錯誤與bytes分流。既有學生隱題、匿名身分、原順位及Google直接讀寫流程不變。

**Scale/Scope**: 三個故事、26 FR／10 SC；目前活動與單一歷史活動兩下載入口、共用教師順位UI、一個複製元件、一個新增GET下載端點。已有MAX_GROUPS最高10000不代表Excel必可容納所有輸出，超界明確拒絕，不靜默省略。沒有CSV教材匯入、批次匯出、活動另命名／改名、背景匯出任務、XLSX替代、QR Code或訊息發送。

## Constitution Check

規劃前檢查：下列原則均能在本功能範圍遵守，無需要例外才能規劃的違反。設計後重查同表；「待人工核對」是實作前門檻，不阻止完成本次設計產物。

| 原則               | 規劃前／設計後結論                       | 證據與後續門檻                                                                                                                     |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| I PlantUML設計優先 | 技術設計已建立，實作仍受人工審查門檻約束 | 四圖先於產品變更，對應架構、匯出／拒絕、順位／歷史即時、複製／失敗；語法渲染實測後記review-notes，設計修改先更新圖再審查           |
| II 品質／維護性    | 通過設計檢查                             | 同一純排名與名稱formatter、CSV／filename／resource gate責任分開；沿用workspace，無無關重構；實作必跑typecheck／lint／format／build |
| III 輸入與錯誤     | 通過設計檢查                             | UUID與空query/body、owner／phase／CSRF／generations、完整集合與上限；HTTP先產生完才送bytes，錯誤JSON不假下載成功                   |
| IV 正常／特殊測試  | 通過設計檢查，測試待實作                 | [quickstart驗收矩陣](quickstart.md#validation-matrix)涵蓋所有FR／SC、真實SQLite／teacher HTTP／E2E／Excel，不只測純記憶體或UI mock |
| V AI文件一致性     | 技術對照完成，人工核對待辦               | 現有程式唯讀核對與驗證結果記review-notes；人審須在實作前核對圖／契約，逐Phase合併前核對AI文件；不沿用002核對                       |
| VI 機密保護        | 通過設計檢查                             | 不讀正式憑證／DB／瀏覽器profile，CSV只既定業務欄；token不入URL、React key、檔名、log或報告，沒有新增持久secret                     |

## Project Structure

### Documentation (this feature)

```text
specs/003-export-answer-orders/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/interfaces.md
├── quickstart.md
├── review-notes.md
├── tasks.md
└── diagrams/
    ├── architecture.puml
    ├── export-sequence.puml
    ├── answer-order.puml
    └── copy-link.puml
```

plan命令結束時未產生tasks.md；現已由speckit-tasks產生 [tasks.md](tasks.md)，以下實作Phase編號以該清單為準。

### Source Code (repository root)

以下是**預計新增／修改的精確整合位置**，不是本次已新增產品檔案。

```text
shared/src/
├── projections/answer-order.ts          # 新：唯一純順位／完整性檢查
├── schemas/result-export.ts             # 新：共用輸入／型別化導出資料邊界
├── schemas/common.ts                    # 改：兩種匯出安全錯誤碼
└── formatters/group-name.ts             # 沿用
backend/src/
├── activity/result-export-service.ts    # 新：owner／ended、閘門與編碼協作
├── persistence/result-export-reader.ts  # 新：有界一致快照、來源與答案對照
├── persistence/connection.ts            # 改：同步readSnapshot，不改原寫交易
├── export/csv.ts                        # 新：layout／文字安全／BOM
├── export/filename.ts                   # 新：Taipei／安全basename／header
├── export/limits.ts                     # 新：唯一尺寸數值常數
├── export/export-gate.ts                # 新：記憶體頻率／生成量／deadline
├── http/result-export-routes.ts         # 新：GET binary、HEAD 405、JSON錯誤
├── security/safe-errors.ts              # 改：allowlist兩種錯誤
└── source-module.ts                     # 改：只於teacher註冊下載route
frontend/src/
├── App.tsx                              # 改：teacher scope fence，學生key不擴改
├── components/Classroom.tsx             # 改：傳非機密下載／複製context
├── components/CopyActivityLinkButton.tsx # 新：立即write、成功／備援
├── transport/download.ts                # 新：binary／abort／scope／URL清理
├── teacher/ExportResultsButton.tsx      # 新：單場控制與安全文字提示
├── teacher/AnswerOrderPanel.tsx         # 新：全部／逐題共用元件
├── teacher/HistoryLiveAnswers.tsx       # 新：原活動訂閱與一次detail刷新
├── teacher/ActivityPage.tsx             # 改：三功能入口、原結果／回填保留
├── teacher/HistoryDetailPage.tsx        # 改：共用Panel及單場下載
└── styles.css                           # 改：可讀表列、長文與鍵盤焦點
```

新增測試預計放tests/unit/answer-order.test.ts、csv-export.test.ts、export-filename.test.ts、export-gate.test.ts；tests/integration/result-export.test.ts、export-read-snapshot.test.ts；tests/contract/result-export-http.test.ts；tests/e2e/result-export.spec.ts、answer-order.spec.ts、copy-activity-link.spec.ts。人工合成檔案助手預計為tests/manual/export-results-fixture.mjs，以隔離teacher端點產檔供Excel驗收。精確任務與測試檔分工由tasks產生，不提前新增測試或產品碼。

**Structure Decision**: 保留現有三workspace及單機SQLite。共用排名留shared但不擴wire；CSV與資源策略是backend責任，frontend只接收binary及teacher既有snapshot。新schema可重用既有teacher欄位，不導入ORM或新CSV依賴。

## Phase 0 Research Outcomes

研究未知項均由 [research.md](research.md) R1–R8解決：資料可重用、唯讀快照／完整性、CSV與安全文字、Excel及本機資源界線、中文檔名／時區、雙視角與live history、Clipboard及blob生命週期、驗收證據。研究子代理依技能要求各自負責CSV／官方資料與現有整合／瀏覽器能力，未修改產品檔。

## Phase 1 Design and Handoff

| 圖／文件                                              | 需求覆蓋                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [architecture.puml](diagrams/architecture.puml)       | 三功能、teacher-only、既有student與Google路徑邊界                                  |
| [export-sequence.puml](diagrams/export-sequence.puml) | FR-001–FR-017、FR-024–FR-026；owner、資源、read snapshot、失敗不送附件、晚授權防護 |
| [answer-order.puml](diagrams/answer-order.puml)       | FR-003–FR-009、FR-018–FR-021、FR-025；共同順位、完整題組、未加入組、live history   |
| [copy-link.puml](diagrams/copy-link.puml)             | FR-022–FR-024、FR-026；完整URL、鍵盤、resolve／reject、舊scope                     |
| [data-model.md](data-model.md)                        | 既有欄位與導出實體、驗證、無DB遷移、暫存操作狀態                                   |
| [contracts/interfaces.md](contracts/interfaces.md)    | HTTP binary／JSON錯誤、CSV及UI具體契約                                             |
| [quickstart.md](quickstart.md)                        | 未來可重現正常／特殊／人工驗收；不包含完整實作                                     |
| [review-notes.md](review-notes.md)                    | 本次已做與尚未做的證據、人審範圍                                                   |

### Subsequent Implementation Phases

維持使用者既定政策：每個實作Phase從main建立新的codex分支，前一Phase完整Gate、文件人審與合併完成後才能進下一Phase。此為交接拆分，最終任務編號由tasks決定：

1. Setup：分支、設計／文件人審、基線與隔離合成fixture。
2. Foundational：唯一純順位、型別／錯誤與同步唯讀快照。
3. US1：CSV／檔名／teacher下載、目前與單一歷史入口、權限／資源／中斷保護及MVP Excel驗收。
4. US2：目前與歷史共用雙視角、live history與可讀性，保留下載／回填／結果。
5. US3：活動連結複製、鍵盤／失敗備援與晚promise防護。
6. Final：完整連續回歸、指定規模效能、核對有效Excel證據及最終文件人審與合併；輸出政策有變才重做受影響Excel案例。

技術上獨立的測試可同Phase並行，但不得跨越前一Phase測試／人工核對／merge門檻。產生tasks前無需執行這些未完成的產品任務；本計畫到Phase 1設計即結束。

## Complexity Tracking

無憲章例外。readSnapshot、有界generator與非機密scope fence是保證資料一致、資源有界及切帳號不誤下載所需；不新增永久匯出任務、排名表、另一服務、多行程或ORM。Excel文字安全有版本相容性限制，明確保留人工驗收，不降低安全或資料完整性要求。
