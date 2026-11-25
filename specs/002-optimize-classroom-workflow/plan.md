# Implementation Plan: 課堂搶答流程與歷史管理優化

**Branch**: 依tasks.md每Phase獨立codex分支，main為合併目標（功能識別 `002-optimize-classroom-workflow`） | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: 第二版功能規格、三項釐清、使用者指定 SQLite。

**Status**: Phase 1–6已通過審查及合併；Phase 6實作5b5a247、合併main 9f47bf9，149項測試及真實核心驗收通過，維護者已回覆「審閱完成」。接續Phase 7統一UI，備份恢復及最終收斂仍在後續Phase；實測與各階段人審依review-notes.md記錄。

## Summary

沿用 TypeScript、React、Express、Socket.IO 單一行程及雙角色 listener，新增 SQLite 業務資料持久化。
短交易保存組別、首答順序、命令收據、固定結果與自動回填工作，commit 後才確認成功及推播。
Google OAuth 增加帳號識別與 Drive 清單功能；教師資料依已驗證帳號隔離。
選表只讀第一個工作表，回填綁定原 sheetId；學生開放前不取得題目、加入必填且鎖定組名。
服務重啟自動恢復進行中活動，正常結束自動回填；核心功能驗收後才統一改善 UI。

## Technical Context

**Language/Version**: TypeScript 5.9.3、Node.js 24；已探測 runtime v24.22.3、SQLite 3.54.1。實作以此作基線，更新最低 engine 並驗證支援版本。

**Primary Dependencies**: 沿用 React 19.2、Express 5.1、Socket.IO 4.8.1、googleapis 160、Zod 4.1；資料存取用 Node 24 內建 `node:sqlite` 的 `DatabaseSync`，repository 隔離 API，不新增 ORM。

**Storage**: SQLite、本機 `data/classroom.sqlite`；新增非機密設定 `DATABASE_PATH`。WAL、synchronous=FULL、foreign_keys=ON、busy_timeout=2000；啟動確認設定。單一寫入連線，交易內不等待 Google。

**Testing**: Vitest unit/integration/contract、Playwright e2e。新增 SQLite 實檔、子行程 crash/restart、Google double 及兩帳號越權測試；真實 Google 與文件人工驗收另行記錄。

**Target Platform**: Windows 本機單一 Node 行程，教師 loopback HTTP 3000、學生預設同機 HTTP 3001；不增加跨裝置驗收。

**Project Type**: npm workspaces Web 應用，維持 frontend/backend/shared。

**Performance Goals**: 正常連線階段同步 ≤2 秒；四組六題、40 字組名、1280×720 教師表格可讀。鎖定逾時明確失敗，不誤報受理。

**Constraints**: 全域同時一場可進行活動；未確認回填沿用新場阻擋。Google tokens、Cookie 原值、OAuth code 不入 DB／文件／紀錄。成功 ack 先 commit；歷史不自動刪除。回填期間暫停外部編輯。

**Scale/Scope**: 單機教師可切換帳號、同機不同瀏覽器匿名分組；沿用 MAX_GROUPS、MAX_SOURCE_CELLS。歷史分頁，不一次載入所有歷史答案。SQLite 僅放本機磁碟。

**Retry Policy**: 依 [data-model.md](data-model.md#retry-policy) 固定寫入／讀取上限及退避，保存cycle、計數與next_attempt_at；restart不重設，未知結果保持pending。owner明確retry以收據去重開新cycle。

**Test Migration and Isolation**: Phase 1的T005先完成Playwright每次測試服務專屬臨時DATABASE_PATH；Phase 3接入SQLite前必須已驗證隔離。T038在Phase 3同時移轉舊create／source契約及E2E測試，不留待後Phase才修正；保留既有安全案例。

## Constitution Check

規劃前已核對憲章 1.0.0；SQLite 為使用者新要求，取代第一版無資料庫限制，無需憲章例外。

| 原則                | 研究前評估         | 設計後證據與執行門檻                                                                                        |
| ------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| I PlantUML 設計優先 | 通過；先設計再實作 | 六圖涵蓋角色、首張、帳號、併發、重送、逾時、恢復與回填；渲染結果見 review-notes。人工設計審查須在實作前完成 |
| II 品質與可維護性   | 通過               | 共用 schemas、transaction command service、repository、帳號 guard 與角色投影；每 Phase 通過檢查再合併       |
| III 驗證與錯誤      | 通過               | contracts 定義輸入、owner 檢查、安全錯誤、rollback，查詢與推播均核權限                                      |
| IV 正常及特殊測試   | 通過               | quickstart 矩陣覆蓋 FR-001–FR-031，實體 DB 與真正行程中斷測試列為必要                                       |
| V 文件一致性及人審  | 預定行為明確標示   | AI 設計核對不冒充人工審查；新版人審狀態獨立記錄，不沿用第一版已通過結論                                     |
| VI 機密保護         | 通過               | tokens/CSRF/teacher session 記憶體限定，匿名 Cookie 只存 digest；DB/WAL/SHM/備份排除 Git                    |

設計沒有已知憲章違規。人工審查是後續執行門檻，任務生成須納入；未通過不得開始對應實作或合併。

## Project Structure

### Documentation (this feature)

```text
specs/002-optimize-classroom-workflow/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
├── data-model.md
├── quickstart.md
├── review-notes.md
├── contracts/interfaces.md
├── diagrams/
│   ├── architecture.puml
│   ├── account-source.puml
│   ├── lifecycle.puml
│   ├── submission.puml
│   ├── writeback.puml
│   └── teacher-ui.puml
└── checklists/requirements.md
```

可執行任務已由 `$speckit-tasks` 產生於 [tasks.md](tasks.md)；以下實作Phase編號已與任務一致。

### Source Code (repository root)

新增路徑是預定設計；現有檔案依責任修改。

```text
backend/src/
├── main.ts                         # DB migration/recovery 完成後才 listen
├── config.ts                       # DATABASE_PATH
├── persistence/                    # 新增 connection/migrations/repositories/unit-of-work
├── activity/                       # 交易命令、reducers、歷史查詢
├── google/                         # OIDC、Drive 清單、首張／指定 sheetId、持久 worker
├── http/                           # 來源預覽／活動歷史／設定
├── security/                       # 匿名 digest、帳號 owner guard、安全錯誤
└── sockets/                        # commit 後依角色及帳號投影
frontend/src/
├── teacher/                        # 清單、活動、歷史、完整組名作答表
├── student/                        # 原子命名加入、waiting/active/ended
├── components/                     # 完整組名／狀態共用呈現
└── transport/                      # 跨 boot 重連、revision、授權代次
shared/src/
├── schemas/                        # 帳號、清單、歷史、join、error
├── projections/                    # 角色白名單投影
└── events/                         # 命令／安全 ack
tests/{unit,integration,contract,e2e}/
data/                              # 預定 DB，整目錄排除 Git
```

**Structure Decision**: 擴充既有三個 workspace，不換框架。HTTP、Socket 共用交易命令服務，
repository 提供 DB 存取。歷史查詢按 owner 過濾，不以現有單一 Map 當權限來源。

## Phase 0: Research

[research.md](research.md) 已解決 SQLite driver／耐久性、匿名恢復、帳號主鍵與 scopes、清單、
首張辨識、outbox、Socket 重連及 UI 驗收；沒有未解需求。

## Phase 1: Design and Contracts

資料模型、六份 PlantUML 與契約共同定義狀態及例外路徑。
核心檢查：先 commit 再 ack；active 重啟不得 ended；學生恢復不依賴 Google 重新授權；
教師清單／詳情／socket／worker 都核 owner；讀題按首張、回填按原 sheetId。
詳見 [data-model.md](data-model.md)、[contracts](contracts/interfaces.md)、[review-notes.md](review-notes.md)。

## Implementation Sequencing and Merge Gates

延用使用者要求，每個實作 Phase 從當時 main 建立新 `codex/002-phase-N-*` 分支，
前一階段測試通過、審查並 merge main，才開始下一階段。本命令停在設計，不執行以下實作。

| Phase          | 範圍                                                     | 通過才可合併／繼續                                        |
| -------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| 1 Setup        | runtime、DB產物排除、隔離測試支援、人工設計審查          | 六圖、維護者審查與既有測試基線                            |
| 2 Foundational | SQLite schema/repository、可靠命令、digest身分、安全錯誤 | 實檔commit/rollback、唯一性、去重、匿名恢復與適用既有測試 |
| 3 US1          | OIDC owner、guard、Drive清單、首張預覽與原子建場         | 清單／權限／預覽／首張／跨owner正常特殊案例與合成E2E      |
| 4 US2          | 一次加入鎖名、等待隱題、完整名、首答與commit後同步       | 原子搶組、全管道隱私、完整題組、共同排序、2秒同步         |
| 5 US3          | ended/results/outbox同交易、owner worker、持久進度與查核 | 無第二按鈕、原表保護、未知寫入、timeout/crash、安全復原   |
| 6 US4          | 歷史／設定／全域slot及啟動恢復、核心真實驗收             | 三場歷史、兩帳號兩瀏覽器、原URL原身分自動續答、真實Google |
| 7 US5          | 核心通過後統一UI、教師作答表與歷史導航                   | 四組六題40字名1280×720、鍵盤文字狀態及核心回歸            |
| 8 Final        | 備份恢復、機密產物、全套檢查、新版文件人工核對           | 實際證據完整、所有任務與審查通過後merge main              |

真實 OAuth 由使用者在瀏覽器完成，不匯出機密；真實自動回填只用已授權驗收教材。
人工審查或外部驗收未完成時保持待辦，不以自動檢查代替。

## Complexity Tracking

無憲章例外。repository 與持久回填工作是資料可靠保存及恢復所需；不引入多行程、外部佇列或 ORM。
