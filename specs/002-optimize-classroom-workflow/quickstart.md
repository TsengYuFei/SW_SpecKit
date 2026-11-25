# Quickstart and Validation: 第二版

此為實作完成後的預定驗收指南，2026-11-25。新增功能尚未實作；不能把第一版66項測試通過當成本版驗收。
資料與介面細節見 [data-model](data-model.md)、[contracts](contracts/interfaces.md)。

## Prerequisites

- Windows、Node.js 24；本次已探測 v24.22.3 及內建SQLite 3.54.1，實作固定支援版本並驗證內建SQLite修補。
- 同機 Chrome、Edge，使用兩個獨立瀏覽器或獨立 context；一般同瀏覽器分頁不是兩個組別身分。
- Google Cloud 啟用 Sheets API 及 Drive API；OAuth Web client callback維持 `http://127.0.0.1:3000/api/google/callback`。
- 設定 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REDIRECT_URI，真實值只由既有安全執行環境注入，不寫終端歷史、截圖、文件、測試報告或對話。
- 新scopes見research R4；Drive metadata scope的同意畫面及測試使用者必須可用；原有Sheets授權不等於已有清單和帳號scope。
- 準備兩個Google測試帳號，各有活動且共用至少一份可編輯測試來源；兩份不同題數、單題／題組教材，另有多工作表、首張零題、唯讀、歧義、衝突等合成資料。
- 真實流程會在結束時自動修改原試算表，應使用獲授權的驗收教材；寫入期間停止外部編輯，不以正式未授權教材測試。
- DATABASE_PATH 是預定新增設定；預設本機 `data/classroom.sqlite`，保留資料夾可寫且整目錄排除Git。測試使用獨立臨時目錄／埠，不碰使用者正式DB或既有服務。

## Install, Check and Run

以下npm scripts目前已存在；新版實作須把新增案例納入相應測試目錄。
在儲存庫根目錄使用正確Node24環境執行：

```powershell
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e
npm run build
npm start
```

預期全部exit0。E2E現有設定先build、使用隔離測試埠及Edge，停用trace／錄影／截圖，
新版須在每個測試使用臨時DATABASE_PATH；不得採用現有teacher Google設定檔。
此隔離須由Phase 1的T005完成，先於Phase 3的SQLite正式接入及任何新版E2E；
每次測試服務使用不同絕對臨時路徑，同一重啟驗收情境保留原臨時DB，服務結束後才清理。
Phase 3的T038須同步移轉舊source-http／source-preview與所有受create契約影響的fixture／測試，保留原安全與錯誤案例，再執行全套Gate。
老師頁預設 http://127.0.0.1:3000，學生以老師畫面提供的完整網址加入，預設3001。
頁面重開可能需先授權原Google帳號才見歷史，學生續答不需等待教師重新授權。

## Diagram Validation

PlantUML JAR由官方下載，在Git排除的驗證目錄；設定名稱PLANTUML_JAR只指工具路徑，不含機密。

```powershell
java -jar $env:PLANTUML_JAR -checkonly specs/002-optimize-classroom-workflow/diagrams/*.puml
java -jar $env:PLANTUML_JAR -tsvg -o ../../../validation-results/feature-002-plan/rendered specs/002-optimize-classroom-workflow/diagrams/*.puml
```

兩指令exit0且六張輸出可讀；本機若java不在PATH，用已安裝Java的絕對路徑。
原始puml納入版本控制，rendered產物放validation-results，避免混進正式程式或DB。

## End-to-End Acceptance

1. 帳號A授權後從清單搜尋、換頁並選教材，無URL/ID欄位。可分辨同名檔案；唯讀標明不可建場。只預覽排列第一工作表的全部題目、題組、小題及目標；其他工作表題目不出現。
2. 設四組建立活動，兩個學生瀏覽器以同一活動網址進入。未填名／空白／41字不能占組；有效名稱與組別一次確認。加入後學生及老師均不能改名，重新整理仍回同一組。
3. 老師開放前檢查兩個學生的UI、HTTP、Socket、重連快照：題幹、小題、作答項目、題號清單、來源與既有答案洩漏0。關閉開發工具原始封包記錄，不記Cookie／OAuth資料；自動測試只用合成資料。
4. 老師開始後兩學生≤2秒顯題。第一組漏一小題整筆拒絕；補齊才受理。兩組先後／同時提交、同requestId重送、不同requestId重答均維持第一完整答案及唯一順序。學生看不到他組答案、進度、順位。
5. 老師在後台所有組別顯示處皆見完整名稱；結束前只有老師看到即時全組答案、暫定結果。至少一題無提交。
6. 在active且至少兩筆提交後記錄非機密活動ID、組別名稱、已受理數及順位，停止Node服務後原環境重啟。學生原URL／Cookie直接續答、序號接續；不需老師手動恢復或先Google授權。waiting仍waiting、ended不可重新收答案。
7. 老師重新授權A後查看同場並正常結束，無額外確認／回填按鈕。立即關閉老師頁，服務繼續回填；重開後確認結果及逐題狀態。原表目標內容匹配，無成功組格／非目標格／格式不變，等號答案保持文字。
8. 多工作表另案：建場後重排工作表，結束仍回填原sheetId；首張零題不得跳第二張。來源插列／刪表／改題／合併變化須停止受影響整題組，不能誤報成功。
9. 至少三場含兩場ended、一場active，關頁、重開瀏覽器、重啟服務後，以A授權比對已確認設定／題目／名稱／答案／順位／結果／工作紀錄100%一致。來源刪除或不可存取不影響已授權A查本機快照。
10. 帳號B授權後僅見B歷史與設定；A畫面資料立即清除。直接請求A活動及socket訂閱不得取得資料，共用試算表亦不例外；切回A可看原歷史。未授權不能看歷史。worker不得以B權杖執行A工作。
11. 核心故事1–4通過才統一UI。以四組六題及40字名稱於1280×720驗表格：完整名稱可閱讀、逐題可比較、長表捲動、所有狀態有文字、鍵盤可操作，正常結束與例外復原可理解；重新跑完整核心流程。

## Normal and Edge Test Matrix

| 需求                  | 正常情境                           | 特殊情境與預期                                                                          | 層級                            |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| FR-001、FR-028        | 各角色／owner合法操作              | 跨帳號、未授權、學生教師API、舊socket推播皆無資料                                       | contract/integration/e2e        |
| FR-002–FR-004         | 清單搜尋、換頁、同名辨識           | 空頁含next、incompleteSearch、失效cursor、scope不足、401/403/404/429/5xx、切帳號舊回覆  | unit/integration/真實OAuth      |
| FR-005–FR-007         | 首張單題題組、正組數建場           | 隱藏／非GRID首張、零題不fallback、重排、唯讀、過期預覽、來源變化、同時建場／system busy | unit/contract/integration       |
| FR-008–FR-009、FR-016 | 等待不顯題、開始後2秒同步          | 所有資料管道／刷新／重連、其他組進度／baseline洩漏0                                     | contract/e2e                    |
| FR-010–FR-013         | 原子加入、完整名、重連同組         | trim空白、40/41字、特殊字元、同搶組、改名、同瀏覽器分頁、清Cookie不可接管               | unit/integration/e2e            |
| FR-014–FR-015         | 完整首答與sequence                 | 漏答／多項／空白／2000及2001字、同時送、重送、ack遺失、時鐘回撥、end交錯                | unit/integration                |
| FR-017–FR-018、FR-021 | end一次自動job、關頁仍處理         | 同時end、已完成開歷史不重寫、end commit後worker前crash                                  | integration/e2e                 |
| FR-019–FR-020         | 原sheetId題組batch、純文字、讀回   | baseline/merge/結構變化、題組混合值、無答不寫、非目標／格式差異                         | integration/真實Sheets          |
| FR-022                | 清楚狀態與安全復原                 | write timeout/授權失效/結果未知、先查核後重試、worker用錯帳號必拒                       | contract/integration            |
| FR-023–FR-027         | 全資料及設定持久化、active自動恢復 | 實檔disk滿／唯讀／鎖忙／損壞／migration版本、commit斷點、原連結原身分及順序不變         | unit/integration子行程/實際重啟 |
| FR-029–FR-030         | 四組六題長名教師表格、可用操作     | 空／loading／pending／failed／conflict、文字非唯顏色、鍵盤、長表換行捲動                | e2e/人工UI                      |
| FR-031                | 只保存allowlist業務資料            | 合成敏感值檢查DB/WAL/SHM/備份、response、log、report；原Cookie/tokens外洩0              | unit/integration/產物掃描       |

持久化故障測試須以子行程及真實暫存DB注入：commit前、commit後ack前、end commit後worker前、
writing保存後送寫前、送寫後讀回前、讀回後本機保存前。worker發生儲存錯誤須停止派發且不誤報verified。
未知寫入分類測試：全expected→verified，全baseline→可安全重試，混合／異值→conflict，讀不到→pending。
依 [Retry Policy](data-model.md#retry-policy) 以可控制時鐘驗證：每輪3次寫入、2／4秒最早重試、
連續4次暫時性查核失敗及1／2／4秒退避、next_attempt_at到期才派發、restart不重設cycle／計數。
驗證寫前crash也消耗已保存次數、缺授權不耗次數、未知滿限仍pending、owner明確verify不寫入，
同retry requestId只開一輪，verified／conflict不開新輪，過期timer不派發。
儲存故障後重新開啟不可自動以空DB覆蓋；只檢查成功count不足，還要查受影響狀態未半套更新。

## Evidence and Phase Gate

每Phase記錄branch、指令、exit code、測試數、涵蓋情境與限制；通過且審查後才merge main。
第一版測試中舊boot失效、改名、等待顯題、手動回填等被取代預期須更新；其餘安全／題組／衝突案例繼續通過。
自動Google double不冒充真實Google證據，API雙client不冒充兩個UI瀏覽器。
新版AI文件及圖須人工核對；完成回覆前不把人審標通過。本次規劃驗證結果另見review-notes。
