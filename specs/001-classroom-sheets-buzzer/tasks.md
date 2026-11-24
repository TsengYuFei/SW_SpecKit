---
description: "課堂搶答與 Google Sheets Guided Notes 實作任務"
---

# Tasks: 課堂搶答與 Google Sheets Guided Notes

**Input**: `specs/001-classroom-sheets-buzzer/` 的設計文件。

**Prerequisites**: [plan.md](plan.md)、[spec.md](spec.md)、[research.md](research.md)、
[data-model.md](data-model.md)、[contracts/interfaces.md](contracts/interfaces.md)、[quickstart.md](quickstart.md)。

**Tests**: 依專案憲章與規格，包含每項功能的正常與特殊情境。故事階段先編寫測試，
確認其因功能尚未實作而失敗，再完成實作並通過測試。真實 Google 驗收另行執行。

**Organization**: 三個使用者故事皆為 P1，依教材連線、課堂活動、公布與回寫的順序交付。
本清單描述預定工作，所有核取方塊保留未完成。

## Format: `[ID] [P?] [Story] Description`

- 任務 ID 連續編號。故事階段使用 US1、US2、US3。
- [P] 表示所列先決任務完成後，可與同一批次的其他標記任務並行處理不同檔案。
- 未標記任務依編號順序執行，另須遵守明列的相依關係。
- 欄位約束以 data-model.md 為準。以下 BrowserSession.sessionId 對應該表的
  「隨機 session id」，Source.sheetIds 對應「sheetId 清單」，Writeback.itemStatuses
  對應「item statuses」。這些名稱用於 TypeScript 欄位，引用均指向同一資料模型定義。

## Path Conventions

所有檔案路徑相對儲存庫根目錄。前端使用 `frontend/src/`，後端使用 `backend/src/`，
共享型別與驗證使用 `shared/src/`，測試使用 `tests/`。設計文件在本功能目錄。
圖的相依引用採 `diagrams/architecture.puml`、`diagrams/lifecycle.puml`、
`diagrams/submission.puml`、`diagrams/google-flow.puml`，均相對本功能目錄。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 完成 Diagram First 審查並建立 TypeScript 開發與驗證環境。

- [X] T001 核對 `specs/001-classroom-sheets-buzzer/diagrams/architecture.puml`、`lifecycle.puml`、`submission.puml`、`google-flow.puml` 與規格及契約，重現 PlantUML 語法檢查和渲染；完成設計一致性審查後，在 `specs/001-classroom-sheets-buzzer/plan.md` 記錄結果，作為後續程式實作的先決條件；交付前的維護者人工文件核對依 T052 執行。
- [X] T002 依 T001 建立 npm workspaces，配置 `package.json`、`package-lock.json`、`tsconfig.base.json`、`frontend/package.json`、`backend/package.json`、`shared/package.json` 與各 workspace 的 `tsconfig.json`；依 plan.md 安裝相容套件並鎖版，預先建立 quickstart.md 所列全部 scripts，建立 React/Vite 前端與 Node.js 後端入口。
- [X] T003 [P] 依 T002 在 `eslint.config.mjs`、`.prettierrc.json` 配置 strict TypeScript 對應的 lint 及格式規則，驗證既有 typecheck、lint 與 format:check scripts 可檢查三個 workspace。
- [X] T004 [P] 依 T002 在 `vitest.config.ts`、`playwright.config.ts`、`tests/helpers/server.ts` 與 `tests/helpers/google-adapter.ts` 建立可控制時序的測試伺服器及 Google adapter，配合 quickstart.md 所列既有測試 scripts，真實授權測試停用敏感追蹤產物。
- [X] T005 [P] 依 T002 在 `.gitignore` 與 `backend/src/config.ts` 設定建置產物與機密檔案排除、執行環境驗證、教師與學生 listener 位址、Google 環境變數及可配置資源預算，錯誤訊息僅列設定名稱。

**Checkpoint**: 設計審查結果已記錄，套件與工具可安裝執行，機密值由環境注入。

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立角色驗證、共用狀態及傳輸基礎，完成後才進入故事階段。

- [ ] T006 [P] 依 Phase 1 在 `shared/src/schemas/common.ts`、`shared/src/events/envelope.ts` 定義 runtime 驗證、錯誤碼、ack 與事件封裝；實作 data-model.md 的 Activity.id、Activity.bootId、Activity.phase、Activity.revision、Activity.groupCount 欄位約束，並套用契約的 requestId、未知欄位及傳輸大小規則。
- [ ] T007 [P] 依 Phase 1 在 `backend/src/security/sessions.ts`、`backend/src/security/guards.ts` 實作 data-model.md 的 BrowserSession.sessionId、BrowserSession.role、BrowserSession.activityId 約束及記憶體 session，落實教師 loopback、學生匿名 cookie、Host/Origin、CSRF、角色檢查與每 session 頻率限制。
- [ ] T008 [P] 依 Phase 1 在 `backend/src/security/safe-errors.ts`、`backend/src/security/logger.ts` 實作契約的安全錯誤轉換與日誌允許欄位，確保授權 URL、callback query、標頭、本文、cookie 及上游錯誤中的機密值均被排除。
- [ ] T009 依 T006–T008 在 `backend/src/activity/store.ts` 建立記憶體狀態與新 bootId，實作 data-model.md 的 Activity.source、Activity.questions、Activity.groups、Activity.submissions、Activity.nextSequence、Activity.commandReceipts 及 Activity.id、Activity.bootId、Activity.revision 的生命週期，提供同步命令執行與去重入口，程序重啟使舊活動失效。
- [ ] T010 依 T009 在 `backend/src/server.ts`、`backend/src/http/session-routes.ts`、`frontend/vite.config.ts`、`frontend/src/App.tsx` 建立同一行程的兩個 listener、GET /api/session、GET /api/health、同源前端資產及學生路由；教師端與學生端共用 store 並隔離操作權限。
- [ ] T011 在 `tests/contract/session.test.ts`、`tests/integration/server-security.test.ts`、`tests/unit/safe-errors.test.ts` 驗證 session 與 health 正常流程、教師 currentActivityId 與學生欄位隔離、偽造角色、cookie 屬性、OAuth callback 所需 cookie 行為、CSRF、Origin、超限輸入及合成機密過濾，通過後結束 Phase 2。

**Checkpoint**: 兩個 listener 可用，共用記憶體與安全邊界通過測試。

## Phase 3: User Story 1 - 老師連線並確認題目 (Priority: P1)

**Goal**: 老師授權後以 URL 或 ID 直接讀取線上教材，確認所有單題、題組與填空格。

**Independent Test**: 以兩份不同分頁、題數及位置的線上教材測試 URL 與 ID，
比對所有題組、小題及目標位置。歧義及失敗情境須阻止確認並提供可理解的錯誤。

### Tests for User Story 1

- [ ] T012 [P] [US1] 在 `tests/contract/source-http.test.ts` 編寫 POST /api/google/start、GET /api/google/callback、POST /api/activities、POST /api/activities/:id/source 與 /source/confirm 的契約測試，涵蓋正常輸出、權限、輸入及 mappingVersion 過期。
- [ ] T013 [P] [US1] 在 `tests/unit/guided-notes-parser.test.ts`、`tests/fixtures/guided-notes.ts` 編寫不同表頭位置、跨分頁、合併格、單題、題組、重複題號及歧義測試；使用合成 Sheets 回覆資料，避免教材讀寫流程依賴中介檔案。
- [ ] T014 [P] [US1] 在 `tests/integration/google-source.test.ts` 編寫授權正常與取消、state 重用或過期、無效 URL/ID、401/403/404/429/5xx、網路中斷、部分掃描失敗、重載及非同步舊回覆測試，確認沒有部分成功或機密洩漏。

### Implementation for User Story 1

- [ ] T015 [US1] 在 `shared/src/schemas/source.ts` 定義並驗證 data-model.md 的 Source.spreadsheetId、Source.sheetIds、Source.baseline、Source.mappingVersion、Source.confirmed、Source.loadState、Question.id、Question.displayNumber、Question.kind、Question.items、Item.id、Item.label、Item.prompt、Item.target、Item.baselineValue、Target.sheetId、Target.rowIndex、Target.columnIndex、Target.mergeRange，保留完整原值與結構基線。
- [ ] T016 [P] [US1] 依 T015 在 `backend/src/google/oauth.ts` 實作 data-model.md 的 OAuthSession.state、OAuthSession.teacherSessionId、OAuthSession.expiresAt、OAuthSession.accessToken、OAuthSession.refreshToken、OAuthSession.tokenExpiresAt 約束，採 Web application client、固定 loopback callback、state 驗證及記憶體 token 更新，授權後導向乾淨 URL。
- [ ] T017 [P] [US1] 依 T015 在 `backend/src/google/sheets-client.ts` 實作固定 Google API 端點、field mask、全部分頁的分段讀取及安全錯誤映射，遵守 research.md 的有限退避及未知寫入結果處理邊界，保留可替換的 adapter 供測試。
- [ ] T018 [P] [US1] 依 T015 在 `backend/src/google/guided-notes-parser.ts` 實作表頭、跨列題號、小題標記及合併格辨識，套用 data-model.md 的 Question.id、Question.items、Item.id、Item.target、Target.mergeRange 唯一性及對應規則，回傳明確歧義，完整掃描才產出可確認預覽。
- [ ] T019 [US1] 依 T016–T018 在 `backend/src/activity/source-service.ts` 實作 URL/ID 解析、載入協調、原值保存、來源版本及確認；依 data-model.md 的 Source.loadState、Source.mappingVersion、Source.confirmed、Activity.source 在非同步回覆時重新驗證版本和階段。
- [ ] T020 [US1] 在 `backend/src/http/google-routes.ts`、`backend/src/http/activity-routes.ts`、`backend/src/http/source-routes.ts` 串接 T012 的全部端點，建立活動與固定組數，僅允許合法階段操作，將服務接入 T010 的教師 listener。
- [ ] T021 [US1] 在 `frontend/src/teacher/SourcePage.tsx`、`frontend/src/transport/http.ts` 建立授權、組數設定、URL/ID、載入狀態、題目及目標格預覽、確認與修正來源後重讀流程，呈現契約錯誤及輸入限制。
- [ ] T022 [US1] 在 `tests/e2e/source-preview.spec.ts` 驗證教師頁從建立活動到對應確認，含載入中操作、授權失敗、歧義及重試；使用合成 adapter，通過 T012–T014 及本故事測試。
- [ ] T023 [US1] 依 `specs/001-classroom-sheets-buzzer/quickstart.md` 的來源讀取情境完成真實 URL 與 ID 的獨立驗收，核對兩份線上教材完整對應，在同檔記錄不含機密的指令、日期與結果，覆蓋 FR-003、FR-004 與 SC-002。

**Checkpoint**: 老師可獨立完成授權、動態讀題與確認，具備第一個可展示增量。

## Phase 4: User Story 2 - 老師控制活動，學生分組搶答 (Priority: P1)

**Goal**: 以匿名選組完成私密且有共同次序的課堂搶答，老師即時控制及監看活動。

**Independent Test**: 以測試建立的已確認教材或 US1 教材，啟動一位老師及兩個獨立瀏覽器身分，
驗證選組、命名、完整題組提交、階段同步與隱私，並測試斷線與程序重啟。

### Tests for User Story 2

- [ ] T024 [P] [US2] 在 `tests/contract/activity-sockets.test.ts` 編寫 activity:subscribe、group:join、group:rename、activity:start、answer:submit、activity:end 及對應 ack/server events 測試，涵蓋權限、過期 activityId、錯誤階段及未知欄位。
- [ ] T025 [P] [US2] 在 `tests/integration/activity-ordering.test.ts` 編寫兩組併發選組、同時提交、缺小題、重複 requestId、變更 payload、不同 requestId 重答、結束交錯、系統時間回撥、重連及重啟測試，依 submission.puml 與 lifecycle.puml 驗證唯一裁決。
- [ ] T026 [P] [US2] 在 `tests/unit/activity-projections.test.ts` 編寫老師與學生角色快照及事件資料測試，驗證未結束前無其他組答案、進度或任何收件順位，並測試多分頁共享身分及同 revision 多事件。

### Implementation for User Story 2

- [ ] T027 [US2] 在 `shared/src/schemas/activity.ts` 定義 data-model.md 的 Group.id、Group.ordinal、Group.name、Group.browserSessionId、Submission.id、Submission.requestId、Submission.questionId、Submission.groupId、Submission.answers、Submission.receivedAt、Submission.sequence 的欄位與關聯驗證，學生提交以 session 決定組別。
- [ ] T028 [US2] 在 `backend/src/activity/group-reducer.ts` 依 data-model.md 的 Group.ordinal、Group.browserSessionId、Group.name 及 BrowserSession.activityId 實作空組原子占用、自組命名、同身分回組及占用至活動結束，禁止解除或轉移綁定。
- [ ] T029 [US2] 在 `backend/src/activity/submission-reducer.ts` 依 data-model.md 的 Submission.answers、Submission.groupId、Submission.questionId、Submission.receivedAt、Submission.sequence 與 Activity.nextSequence、Activity.commandReceipts 實作完整答案驗證、首次有效提交、收據去重及唯一成功組，臨界區內保持同步。
- [ ] T030 [US2] 在 `backend/src/activity/lifecycle-reducer.ts` 實作 data-model.md 的 Activity.phase、Activity.revision、Activity.bootId、Activity.id 與 Source.confirmed、Source.loadState 的階段轉換及重啟語意，將開始、提交、結束與選組串入同一收件入口。
- [ ] T031 [US2] 在 `shared/src/projections/activity.ts` 建立 data-model.md 所述角色投影與單調 Activity.revision，輸出老師全組資訊、學生自組收據及選組占用狀態，排除來源位置、session 識別與 OAuth 資料，結束前不輸出 results。
- [ ] T032 [US2] 在 `backend/src/sockets/activity-handlers.ts` 串接全部 T024 事件與 reducer，逐次驗證身分、活動和輸入，使用隔離角色房間發送快照、階段、教師進度及個人收據，重連時重新 subscribe。
- [ ] T033 [US2] 在 `frontend/src/transport/socket.ts` 實作同源連線、requestId 重送、待確認狀態、revision 與 bootId 校正，逾時先查自組狀態，捨棄舊版本但處理同版本不同事件。
- [ ] T034 [P] [US2] 依 T033 在 `frontend/src/student/GroupPage.tsx` 實作免登入選組、占用提示、組名及固定編號、原瀏覽器重新加入，失去原身分時顯示拒絕接管的原因。
- [ ] T035 [P] [US2] 依 T033 在 `frontend/src/student/AnswerPage.tsx` 建立單題與題組表單、完整性檢查、階段鎖定及自組受理提示，呈現 data-model.md 的 Submission.answers 限制，題組一次提交所有小題。
- [ ] T036 [P] [US2] 依 T033 在 `frontend/src/teacher/ActivityPage.tsx` 建立學生加入連結、開始與結束控制、組別進度及暫定成功組畫面，狀態與按鈕依目前階段及來源確認結果更新。
- [ ] T037 [US2] 在 `frontend/src/App.tsx` 與 `frontend/src/components/ConnectionStatus.tsx` 串接來源頁、老師控制頁及學生選組作答頁，教師重新整理時由 session 的 currentActivityId 恢復訂閱，顯示中斷、舊活動不可用及老師重啟後重建活動提示。
- [ ] T038 [US2] 在 `tests/e2e/classroom-activity.spec.ts` 驗證兩組完整流程、教師重新整理後恢復控制、併發占用、多分頁、清除 cookie、2 秒同步、封包隱私及程序重啟，通過 T024–T026 與本故事測試，覆蓋 FR-001、FR-002、FR-005–FR-008、FR-013、FR-014 及 SC-003、SC-004、SC-006、SC-007。

**Checkpoint**: 可獨立驗證一位老師與兩組學生的完整搶答活動；結果回寫由 US3 交付。

## Phase 5: User Story 3 - 公布結果並直接回寫 (Priority: P1)

**Goal**: 結束後讓雙方查看逐題結果，並由老師安全地將成功答案寫回原教材。

**Independent Test**: 以測試建立的 ended 活動或 US2 產生的結果，核對雙方逐題顯示，
使用 adapter 覆蓋各回寫路徑，再以原線上 Sheets 驗證精確寫入與讀回。

### Tests for User Story 3

- [ ] T039 [P] [US3] 在 `tests/contract/writeback-http.test.ts` 編寫 POST /api/activities/:id/writeback、GET /api/activities/:id/writeback/:op、POST /api/activities/:id/writeback/:op/verify 及 writeback:status 測試，包含老師權限、階段、去重與狀態回覆。
- [ ] T040 [P] [US3] 在 `tests/integration/writeback.test.ts` 編寫精確寫入、題組原子性、格式保留、字串答案、來源或合併結構改動、權限撤銷、429/5xx、寫逾時、讀回失敗、verify 三路判定及序列化測試，驗證 writing/pending 阻擋新場而 verified/conflict/failed 允許新場。
- [ ] T041 [P] [US3] 在 `tests/unit/results.test.ts` 編寫 results:published、ended 快照與結果選擇測試，包含無成功組、跨分頁同題號、題組共同成功組及中斷活動拒絕公布。

### Implementation for User Story 3

- [ ] T042 [US3] 在 `shared/src/schemas/writeback.ts` 定義 data-model.md 的 Writeback.operationId、Writeback.questionId、Writeback.itemStatuses、Writeback.expectedAnswers 及其狀態轉換，建立結果與回寫的角色安全 DTO。
- [ ] T043 [US3] 在 `backend/src/activity/results.ts` 依 data-model.md 的 Activity.phase、Question.items 及 Submission.sequence 產生結束後的固定結果，將公布資料接入 `backend/src/sockets/activity-handlers.ts` 的 results:published 與 ended 快照。
- [ ] T044 [US3] 在 `backend/src/google/writeback-service.ts` 依 data-model.md 的 Writeback.itemStatuses、Writeback.expectedAnswers、Item.baselineValue、Target.mergeRange、Source.baseline 實作回寫前重新核對、整題組衝突阻擋、每題原子 UpdateCells stringValue 批次、精確目標、讀回確認與 pending 查核後重試，Google 操作須序列化。
- [ ] T045 [US3] 在 `backend/src/http/writeback-routes.ts` 串接 T039 全部端點，並在 `backend/src/http/activity-routes.ts` 防止未完成回寫時建立新場，依 data-model.md 的 Writeback.operationId 與 Activity.commandReceipts 保證重複請求回同一操作，發送教師專屬回寫狀態。
- [ ] T046 [P] [US3] 依 T043 在 `frontend/src/components/ResultsView.tsx` 及 `frontend/src/student/ResultsPage.tsx` 顯示題號、成功組、各小題答案及無成功組，與 `frontend/src/App.tsx` 的 ended 路由整合，使用純文字呈現答案。
- [ ] T047 [P] [US3] 依 T045 在 `frontend/src/teacher/WritebackPanel.tsx` 實作教師結果、回寫、逐題 verified/pending/conflict/failed 狀態、查核及安全重試，顯示回寫時暫停外部編輯的操作前提，整合 `frontend/src/teacher/ActivityPage.tsx`。
- [ ] T048 [US3] 在 `tests/e2e/results-writeback.spec.ts` 驗證結束後雙方結果、未作答題、逐小題精確回寫、錯誤文案及待確認操作，通過 T039–T041 與本故事測試，覆蓋 FR-009–FR-011 及 SC-005。

**Checkpoint**: 三個故事組合後，可從線上授權讀題完成至原教材答案回寫。

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 完成全套測試、真實互通及 AI 文件的人工一致性審查。

- [ ] T049 依 `specs/001-classroom-sheets-buzzer/quickstart.md` 執行 npm ci、typecheck、lint、format:check、unit、integration、contract、e2e 及 build/start，修復失敗後在同檔記錄指令、工具版本與結果，確認正式啟動是一個 Node.js 行程。
- [ ] T050 依故事階段完成結果，在 `tests/integration/secret-exposure.test.ts` 使用合成敏感值檢查 HTTP、Socket.IO、Google error、日誌及測試產物，並檢查 `.gitignore`、待提交內容與 Git 歷史，記錄安全檢查結論至 `specs/001-classroom-sheets-buzzer/quickstart.md`，排除真實機密值，覆蓋 FR-012。
- [ ] T051 依 `specs/001-classroom-sheets-buzzer/quickstart.md` 在真實本機與兩個學生裝置執行全部線上端到端情境，涵蓋兩份不同教材、2 秒同步、Google 原表回寫、零中介檔案與電腦重啟，逐一記錄 SC-001–SC-007 的結果及 Google 未確認寫入狀態。
- [ ] T052 依實際程式、設定與測試，由維護者人工核對 `specs/001-classroom-sheets-buzzer/spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/interfaces.md`、`quickstart.md` 及 `diagrams/*.puml`，同步修正差異並重新渲染圖，在 plan.md 記錄最終憲章符合性與人工文件審查結果。

**Checkpoint**: 所有自動及真實驗收通過，人工文件審查完成，指令與結果可重現。

## Dependencies & Execution Order

### Phase Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Phase 6。
三個故事以真實使用流程串接，實際端到端完成必須依序整合。
故事測試可透過合成教材或 ended 活動獨立建立前置狀態，避免僅靠前一故事 UI 準備資料。

### User Story Dependencies

- US1 依賴基礎安全、store、HTTP 與測試環境。T012–T014 可同時編寫，
  T016–T018 依賴 T015 後可並行，T019 整合三者。
- US2 整合依賴 US1 的活動與來源確認。T024–T026 可先用已確認教材 fixture 獨立編寫；
  T027–T033 依序完成核心狀態至傳輸後，T034–T036 可並行處理不同前端檔案。
- US3 整合依賴 US1 的 Google adapter 及 US2 的 ended 狀態與投影。
  T039–T041 使用 fixture 可並行編寫；T042–T045 完成後，T046、T047 可並行。
- T049–T052 依賴全部故事完成並依序執行。T050 增加的安全測試須單獨重跑通過，
  驗證紀錄依序寫入 quickstart.md，最後進行真實互通與人工核對。

### Within Each User Story

先寫契約、單元及整合測試並確認預期失敗，再實作 schema、服務、傳輸與 UI。
依故事指定指令通過測試後完成 checkpoint。Diagram First 有設計差異時須先更新圖並審查。
各故事的實作皆須以原有共用入口執行，禁止另建僅供展示的平行業務邏輯。

### Parallel Opportunities

- T003、T004、T005 可在 T002 後並行，分別負責工具、測試與設定檔。
- T006、T007、T008 可在 Phase 1 後並行。T009 和 T010 須等待前置模組完成。
- 各故事的測試任務為獨立檔案。前端並行任務應以已固定的 shared 契約為依據。
- 實際人力分工可依下列批次安排，未授權自動派遣其他代理。

## Parallel Example: User Story 1

基礎完成後，同時編寫 T012 的 HTTP 契約、T013 的 parser 測試及 T014 的 Google 失敗情境。
完成 T015 後，同時執行 T016 OAuth、T017 Sheets client、T018 parser，最後由 T019 串接。

## Parallel Example: User Story 2

同時編寫 T024 Socket.IO 契約、T025 併發與重試整合測試、T026 角色投影測試。
完成 T033 後，同時實作 T034 選組頁、T035 作答頁、T036 教師控制頁，再由 T037 整合路由。

## Parallel Example: User Story 3

同時編寫 T039 回寫契約、T040 寫入故障整合測試、T041 公布結果測試。
完成 T043–T045 後，同時完成 T046 雙方結果頁與 T047 教師回寫面板，再執行 T048。

## Implementation Strategy

### Requirement Traceability

| 需求 | 主要實作任務 | 測試或驗收任務 | 成功條件 |
| --- | --- | --- | --- |
| FR-001 | T009、T010、T037 | T038、T051 | SC-001、SC-003 |
| FR-002 | T007、T020、T032、T045 | T011、T012、T024、T039 | SC-001、SC-004 |
| FR-003 | T016、T017、T019–T021 | T012、T014、T022、T023 | SC-001 |
| FR-004 | T015、T018、T019、T021 | T013、T014、T023 | SC-002 |
| FR-005 | T030、T032、T033、T036 | T024、T025、T038 | SC-003 |
| FR-006 | T027、T029、T035 | T024、T025、T038 | SC-004 |
| FR-007 | T029、T030 | T025、T038 | SC-004 |
| FR-008 | T031、T032、T036 | T026、T038 | SC-003、SC-004 |
| FR-009 | T043、T046 | T041、T048 | SC-001、SC-005 |
| FR-010 | T042、T044、T045、T047 | T040、T048、T051 | SC-005 |
| FR-011 | T008、T017、T019、T044、T047 | T014、T040、T048 | SC-005 |
| FR-012 | T005、T008、T016、T031 | T011、T050、T052 | SC-001 的安全驗收 |
| FR-013 | T027、T028、T034 | T025、T038 | SC-006 |
| FR-014 | T009、T030、T037 | T025、T038、T051 | SC-007 |

### MVP First (User Story 1 Only)

先完成 T001–T023，交付可授權、讀取、辨識與確認線上教材的第一個可展示增量。
課堂可用的最小完整版本必須再包含 US2 與 US3，才能符合使用者指定的端到端流程。

### Incremental Delivery

1. Setup 與基礎完成後驗證兩個角色入口、安全邊界與重啟清空。
2. US1 驗證兩份線上教材的動態辨識。
3. US2 驗證至少兩組學生的即時、私密及有序搶答。
4. US3 驗證共同結果及原線上教材的精確回寫。
5. Phase 6 完成真實互通與人工核對，全部需求通過才作完整交付。

### Parallel Team Strategy

有多位開發者時，以同故事內的測試、Google adapter/parser 或獨立 UI 檔案作為分工邊界。
共用 schema、store、Socket handler 與 App 路由由一人依序整合，避免並行修改同一檔案。

## Notes

- 本次只產生 tasks.md，核取方塊代表尚待執行的實作與驗收。
- 每項任務實作時都須檢查正常及適用特殊情況。測試、日誌與審查紀錄均遵守機密要求。
- 不建立資料庫，活動與 Google token 均限單一行程記憶體，程序重啟後重新開場。
- 所有教材匯入及答案匯出均直接讀寫線上 Google Sheets。
- 完成任務或邏輯批次後檢查差異與測試結果，再更新對應核取方塊。

## Phase 7: Convergence

2026-11-24 收斂評估結果為 tasks_appended。原 T001–T052 已逐項檢查，目前只有規格與設計文件，
尚無應用程式、套件設定或測試程式。以下 F1–F8 依現況分組記錄剩餘工作。
CRITICAL 表示缺少 P1 基線功能；本次沒有已實作程式違反憲章的證據。

**Execution**：先依原 Phase 1–6 的相依順序完成尚未完成的任務。維持每個 Phase 使用新分支、
階段測試全部通過後才合併 main 及進入下一階段的既定流程。T001 仍為原實作前置條件。
Phase 7 在原階段完成後使用新的 Phase 分支，逐一複核並補齊當時仍缺少的部分。
原階段已完成的功能以測試確認，避免重複建立。既有編號、次序及核取狀態均保留。
所有原資料模型欄位引用、機密限制及正常與特殊情境測試要求持續適用。

- [ ] T053 CRITICAL 補齊並驗證原 T002–T005 的 TypeScript npm workspaces、套件鎖版、前後端入口、工具與設定，完成 `package.json`、`package-lock.json`、`tsconfig.base.json`、`frontend/package.json`、`backend/package.json`、`shared/package.json`、`eslint.config.mjs`、`.prettierrc.json`、`.gitignore`、`vitest.config.ts`、`playwright.config.ts`、`backend/src/config.ts` 與 `tests/helpers/` 所列工作；依 T001 完成後才開始程式實作 per F1、T002–T005、plan: Technical Context / Project Structure (missing)
- [ ] T054 CRITICAL 補齊並驗證原 T006–T011 的 `shared/src/schemas/common.ts`、`shared/src/events/envelope.ts`、`backend/src/security/`、`backend/src/activity/store.ts`、`backend/src/server.ts`、`backend/src/http/session-routes.ts`、`frontend/src/App.tsx` 及對應測試，落實原欄位約束、單一行程記憶體、角色入口、安全錯誤、教師活動恢復及重啟失效 per F2、T006–T011、FR-001、FR-002、FR-011、FR-012、FR-014、plan: Storage (missing)
- [ ] T055 CRITICAL 補齊並驗證原 T012–T023 的 `shared/src/schemas/source.ts`、`backend/src/google/oauth.ts`、`backend/src/google/sheets-client.ts`、`backend/src/google/guided-notes-parser.ts`、`backend/src/activity/source-service.ts`、`backend/src/http/` 來源與授權路由、`frontend/src/teacher/SourcePage.tsx`、`frontend/src/transport/http.ts` 及對應測試，完成 URL/ID 線上授權、全部分頁單題與題組辨識、對應確認及錯誤處理，取得兩份真實教材的比對結果 per F3、T012–T023、FR-003、FR-004、FR-011、US1/AC1–AC3、SC-002 (missing)
- [ ] T056 CRITICAL 補齊並驗證原 T024–T038 的 `shared/src/schemas/activity.ts`、`shared/src/projections/activity.ts`、`backend/src/activity/` reducers、`backend/src/sockets/activity-handlers.ts`、`frontend/src/transport/socket.ts`、`frontend/src/student/`、`frontend/src/teacher/ActivityPage.tsx`、`frontend/src/components/ConnectionStatus.tsx` 及對應測試，完成匿名選組、唯一綁定、完整題組提交、共同排序、私密同步與重連，驗證雙組併發、2 秒同步及活動重啟 per F4、T024–T038、FR-005–FR-008、FR-013、FR-014、US2/AC1–AC10、SC-003、SC-004、SC-006、SC-007 (missing)
- [ ] T057 CRITICAL 補齊並驗證原 T039–T048 的 `shared/src/schemas/writeback.ts`、`backend/src/activity/results.ts`、`backend/src/google/writeback-service.ts`、`backend/src/http/writeback-routes.ts`、`frontend/src/components/ResultsView.tsx`、`frontend/src/student/ResultsPage.tsx`、`frontend/src/teacher/WritebackPanel.tsx` 及對應測試，完成結果公布、原線上教材逐小題回寫、來源預檢、題組原子更新、讀回確認與 pending 查核，遵循現有終止狀態及新場限制 per F5、T039–T048、FR-009–FR-011、US3/AC1–AC3、SC-005 (missing)
- [ ] T058 HIGH 完成原 T049–T050 的全套型別、lint、格式、單元、整合、契約、e2e、建置及正式啟動驗證，補齊 `tests/integration/secret-exposure.test.ts` 的合成機密測試，依原 T050 執行安全檢查，將指令、工具版本與不含機密的結果記錄於 `specs/001-classroom-sheets-buzzer/quickstart.md` per F6、T049–T050、FR-012、plan: Testing、Constitution II / III / IV / VI (missing)
- [ ] T059 HIGH 完成原 T051，依 `specs/001-classroom-sheets-buzzer/quickstart.md` 在老師本機與至少兩組學生裝置逐一執行 SC-001–SC-007，記錄真實 Google 授權、URL/ID 讀題、完整作答、結束、結果、原表回寫及重啟的驗收證據，各項只在實際通過後標示完成 per F7、T051、SC-001–SC-007 (missing)
- [ ] T060 HIGH 完成並核對原 T001、T052 尚缺的設計一致性審查與維護者人工文件一致性核對，在 `specs/001-classroom-sheets-buzzer/plan.md` 記錄真實審查結果，對照 `spec.md`、`tasks.md` 與 `diagrams/*.puml` 重新渲染及確認差異；T001 必須在原 T002 開始前完成，不得以本任務位置延後原前置條件 per F8、T001、T052、plan: Phase Execution Record、Constitution I / V (partial)
