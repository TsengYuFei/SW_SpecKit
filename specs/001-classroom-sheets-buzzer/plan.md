# Implementation Plan: 課堂搶答與 Google Sheets

**Branch**: `main` | **Date**: 2026-11-24 | **Spec**: [spec.md](spec.md)

**Input**: specs/001-classroom-sheets-buzzer/spec.md

功能識別為 001-classroom-sheets-buzzer。setup-plan 回傳該識別作為 BRANCH，
實際 git branch --show-current 為 main。本次沿用目前 checkout。

## Summary

前後端採 TypeScript，Socket.IO 同步角色狀態。單一 Node.js 行程在老師本機執行，
所有活動與 Google token 存於記憶體。學生由區域網路瀏覽器加入，老師控制面只提供本機。
Google Sheets 直接讀寫，依既有表頭及合併格辨識單題與題組。
題組完整提交才取得共同收件順位。重啟重新授權及建立新活動。

## Technical Context

**Language/Version**: TypeScript 5.x strict，Node.js 24 LTS
**Primary Dependencies**: React、Vite、Express、Socket.IO 4.x、googleapis、Zod
**Storage**: 單一行程 Map，無資料庫或活動檔案；瀏覽器僅保存匿名 session cookie
**Testing**: Vitest、Socket.IO client、Playwright、真實 Google Sheets 人工驗收
**Target Platform**: 老師 Windows 本機，學生現代瀏覽器經 LAN 連線
**Project Type**: 本機 Web 應用
**Performance Goals**: 正常連線下至少兩組端與教師端狀態於 2 秒內更新
**Constraints**: 不可使用中介檔案，機密不得落入程式、文件、日誌、Git 或 AI 對話
**Scale/Scope**: 一個行程同時一場活動；驗收基線兩組，組數由老師設定正整數；
教材題數、分頁及位置不硬編碼。資源不足須明確拒絕載入，不得靜默省略題目。

## Constitution Check

| 原則 | 研究前 | 設計後與證據 |
| --- | --- | --- |
| I 設計優先 | 適用，實作前設計 | diagrams 四份 PlantUML 已實際渲染成功，涵蓋架構、階段、選組、提交與 Google 流程 |
| II 品質與維護 | 適用 | 共享型別與驗證，集中 reducer 裁決，獨立 Google adapter |
| III 驗證與錯誤 | 適用 | contracts 定義權限、錯誤、限制、衝突與逾時 |
| IV 正常與特殊測試 | 適用 | quickstart 對應全部功能及成功條件 |
| V 文件核對 | 適用 | 全部文件標示為預定設計，實作後須人工核對 |
| VI 機密 | 適用 | token 僅後端記憶體，安全環境注入、日誌允許清單與測試追蹤限制 |

設計一致性審查已逐項對照 FR-001 至 FR-014。
PlantUML 1.2026.10 使用本機 Java 實際產生四份 SVG，退出碼為 0。
圖與文件已完成需求一致性檢查，無待釐清的技術決策或憲章例外。
正式實作前完成設計一致性審查並記錄結果；憲章要求的維護者人工文件核對於交付前執行。
本階段交付預定設計，程式行為驗收於實作階段執行。

## Project Structure

### Documentation (this feature)

```text
specs/001-classroom-sheets-buzzer/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── diagrams/ (architecture, lifecycle, submission, google-flow).puml
└── contracts/ interfaces.md
```

### Source Code (repository root)

以下為預定目錄，由實作階段建立。

```text
frontend/src/ (teacher, student, components, transport)
backend/src/ (http, sockets, activity, google, security)
shared/src/ (schemas, events, projections)
tests/ (unit, integration, contract, e2e)
```

**Structure Decision**: npm workspaces 共用驗證與契約，前端以角色畫面區分，
伺服端集中處理狀態與角色投影。google 模組負責授權、教材解析和回寫。

## Complexity Tracking

無已接受的憲章例外。Google 同時編輯限制記於 research 與 quickstart。

## Design Validation

研究已完成，細節見 [research.md](research.md)。資料關係及狀態見
[data-model.md](data-model.md)，HTTP 與即時事件見
[contracts/interfaces.md](contracts/interfaces.md)，驗收指令見 [quickstart.md](quickstart.md)。
所有設計圖保留可重現的 PlantUML 原始檔，正式實作的第一項品質門檻為設計一致性審查。

本次額外選定 React/Vite、Express、Zod、Vitest 與 Playwright，屬可維護性及驗證工具選擇。
活動與 token 都在伺服端記憶體。前端瀏覽器僅保存匿名 cookie，程序停止即失去所有活動。
Google 機密透過執行環境注入，真實 Google 流程以操作者本機授權完成。

## Phase Execution Record

2026-11-24 已依使用者要求，從 main 建立 codex/phase-1-setup。
各 Phase 使用新的 codex/phase-N-* 分支，須先完成該階段所有檢查與測試，
再提交完成狀態並合併至 main，之後才從 main 建立下一個 Phase 分支。

T001 設計審查準備已完成。分析報告的五項修正已整理為待維護者審查的變更，
包括回寫外部編輯前提、Google 無法確定原因的錯誤訊息、教師重新整理恢復、
回寫狀態的終止條件，以及 mappingVersion 命名統一。
2026-11-24 已完成設計一致性審查並重跑 PlantUML 語法檢查。T001 完成，開始 T002 至 T005。原任務額外要求人工核對先於程式開發，現修正為交付前依 T052 人工核對，保留憲章要求。

已執行 PlantUML 1.2026.10 的 -checkonly 與 -tsvg，兩者退出碼皆為 0，
並核對四份 SVG 已產生且無語法錯誤。git diff --check 通過。
Phase 1 尚未完成套件安裝、型別、格式、測試環境與建置驗證，尚未合併 main。

Phase 1 已完成 T001–T005。依賴以鎖定檔重現安裝成功，typecheck、lint、format:check、5 項單元測試及三個 workspace 建置均通過。由 Codex 完成設計與程式差異核對，交付前人工文件核對仍由 T052 追蹤。

Phase 2 已完成 T006–T011。實作兩個 HTTP / Socket.IO listener、角色 session、CSRF、Host / Origin、頻率限制、安全錯誤及記憶體 store。12 項單元、2 項契約、4 項整合及 1 項 Edge 端到端測試通過，型別、lint、格式與正式建置通過。

Phase 3 已完成 T012–T022，自動驗證共 40 項通過，Google 遠端使用 mock。Google-flow 圖已同步授權狀態讀取及乾淨回呼流程，四份 PlantUML 檢查及渲染通過。當時 T023 尚待真實授權教材驗收，結果已於下段更新。

Phase 3 的 T023 已於 2026-11-24 透過原老師頁真實重測通過，完整 URL 與純 ID 各一份，題目、題組及原格對應相符且均完成確認。詳細目標及變體覆蓋限制記於 quickstart.md。Phase 3 已具備合併條件。

Phase 4 已完成 T024–T038，52 項累計自動測試及靜態與建置檢查通過。角色投影先於傳送產生，兩個 listener 共用逐 socket 的活動與 session 訂閱表，達成原設計的角色隔離；未使用全體廣播。學生只取得自組受理收據；結束後才取得成功答案。已核對 submission/lifecycle 圖，沒有流程變更。

Phase 5 已完成 T039–T048，62 項累計自動測試通過。Google-flow 圖與契約明確記錄「查核並安全重試」的三路判斷，已重新檢查與渲染。寫入未知結果不自動重送，老師明確查核且原值與結構均未改時才重送一次。Phase 5 以合成 adapter 驗證，真實互通由 Phase 6 驗收。
