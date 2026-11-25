# Quickstart validation guide

本文件記錄啟動方式與各階段驗收。Phase 1–5 已實作並合併 main；Phase 6 的真實驗收與
維護者文件核對尚未全部完成。各項實際證據與限制記於後文，不以自動測試替代實體驗收。

## 前置條件

2026-11-25 使用者調整本次驗收範圍：不測跨裝置，改以同一台電腦的 Chrome、Edge 等
不同瀏覽器，透過老師頁產生的完整學生網址匿名加入。以下跨裝置 LAN 說明屬選用部署，
不再是 T051/T059 的完成條件。預設老師網址為 http://127.0.0.1:3000，學生服務為
http://127.0.0.1:3001；若沿用其他 STUDENT_PUBLIC_ORIGIN，應使用老師頁顯示的完整連結。
同一瀏覽器的普通分頁共用 Cookie，不能用兩個普通分頁假裝兩個組別身分。

- 老師 Windows 電腦安裝 Node.js 24 LTS、npm，學生使用同機不同的現代瀏覽器。
- 老師可連線 Google，兩份驗收教材置於線上 Google Sheets，對應規格 SC-002。
  第一份包含範例版型的四題，題號 1、2 各有兩小題，題號 3、4 為單題。
  第二份改變題數、分頁名與位置，可含多個分頁。另準備歧義、零題與衝突教材。
- Google Cloud 專案啟用 Sheets API，建立 Web application OAuth client，登記
  http://127.0.0.1:3000/api/google/callback。依 Google 專案狀態設定測試使用者或同意畫面。
- 老師在本機執行環境配置 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REDIRECT_URI。
  文件只保存這些名稱，真實值從本機秘密儲存工具注入行程環境。
  配置值的操作須避開 shell history、終端輸出、Git、截圖及 AI 對話。
- 設定 STUDENT_BIND_HOST 與 STUDENT_PUBLIC_ORIGIN，例如老師的 LAN 位址及 3001 連接埠。
  學生需通過 Windows 防火牆允許的私人網路連線。教師 3000 埠只綁定 loopback。
- 目前服務只支援 HTTP，學生 listener 預設僅綁定 127.0.0.1；課堂 LAN 須明確配置
  STUDENT_BIND_HOST 與 STUDENT_PUBLIC_ORIGIN，並限於可信課堂網路。HTTPS 尚未實作。

## 啟動與自動驗證

在儲存庫根目錄執行以下指令。依序通過型別、格式、測試及建置後啟動。

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

unit 使用 Vitest 驗證教材辨識、狀態裁決、投影與機密過濾。
integration 使用 Socket.IO client 與可控制的 Google adapter 驗證順序、重試及錯誤。
contract 檢查 shared schemas、HTTP 和 Socket.IO 的輸入輸出及越權拒絕。
e2e 使用 Playwright 的獨立瀏覽器 context 表示兩組匿名身分，測試完整課堂流程。
`test:e2e` 會先重新建置，再啟動 3010/3011 的測試服務及臨時 listener，不占用老師的
3000/3001。測試以 Edge channel 執行，需已安裝 Microsoft Edge，並停用 trace、截圖及錄影。
上述自動測試使用合成資料與 Google adapter，真實 Google 互通另依下一節驗收。

預期各測試退出碼皆為 0。建置後 npm start 以單一 Node.js 行程啟動兩個 listener，
正式前端由各 listener 同源提供。停止後重新啟動時，活動與 Google 授權均須重新建立。

## 真實線上端到端驗收

1. 老師在本機開啟 http://127.0.0.1:3000，透過系統瀏覽器完成 Google 授權。
   授權期間停用 trace、HAR、錄影及含機密畫面的截圖，禁止匯出 token 檔案。
2. 老師建立兩組的活動。第一次以 Google Sheets URL 讀取第一份教材，核對四個題號、
   六個作答項目與六個目標格。確認無硬編碼座標。依 [資料模型](data-model.md)
   及 [契約](contracts/interfaces.md) 檢查老師可見預覽與學生投影的差異。
3. 老師複製畫面中的學生加入連結。同機兩個不同瀏覽器分別點選空組，免登入加入。
   第一組命名「咕咕嘎嘎」。另一個身分同時搶同一空組時只能一個加入成功。
4. 開始前嘗試提交須被拒絕。老師確認教材後開始活動，兩個學生端在 2 秒內更新。
5. 第一組只填題組一的小題（1）並嘗試提交，須整筆拒絕。補齊兩小題後提交。
   第二組完整提交同一題組。老師看得到兩組答案與次序，學生只看得到自組受理狀態。
   用另一單題互換兩組先後順序，保留至少一題無提交供結果檢查。
6. 在仍進行中的活動重新整理及短暫中斷第一組連線，原瀏覽器可回原組。
   新裝置或清除 cookie 後的身分不能接管原組，老師也無解除綁定操作。
   老師重新整理頁面後，由 session 的 currentActivityId 恢復活動快照及控制。
7. 老師結束活動，雙方在 2 秒內看到逐題成功組及答案。題組兩小題共用唯一成功組，
   無人有效提交的題目標示無成功組。結束後的新答案須遭拒絕。
8. 回寫期間暫停其他人直接編輯來源試算表。老師執行回寫，於原 Google Sheets
   核對各小題答案分別填入正確空格，並確認未作答題、其他儲存格與格式保持原值。
   只有寫後讀回符合預期才顯示已確認。再次按同一回寫操作須取得原結果。
9. 建立下一場，以 Spreadsheet ID 讀取第二份教材，核對所有分頁及不同位置的題目。
   重跑必要提交與回寫，證明 URL 與 ID 均支援，且題數、分頁與位置非固定。
10. 另開活動，在至少一組有效提交後停止並重新啟動 Node.js 服務。舊連結不可繼續操作，老師建立
    新活動後，原組名、綁定、答案與順位皆為空，學生須重新選組並作答。

整個驗收全程直接存取線上 Sheets，中介檔案數須為零。

## 正常與特殊情境的覆蓋

| 需求 | 正常情境 | 特殊情境與預期結果 | 驗證層級 |
| --- | --- | --- | --- |
| FR-001 | 本機老師與兩組不同瀏覽器學生使用同場 | 學生無法連線時顯示中斷 | e2e、真實多瀏覽器 |
| FR-002 | 各角色完成允許的操作 | 偽造 role/groupId、學生打教師 HTTP 或事件均拒絕 | contract、integration |
| FR-003 | URL、ID 授權後直接讀取 | 非 Google URL、ID 錯誤、取消授權、state 過期或重用拒絕 | unit、integration、真實 OAuth |
| FR-004 | 跨分頁單題與題組映射完整 | 重複小題、目標重疊、歧義、無題及掃描失敗均阻止開始 | unit、integration、SC-002 |
| FR-005 | 開始及結束於 2 秒同步 | 提交與結束交錯依共同 reducer 次序決定，禁止重開已結束活動 | integration、e2e |
| FR-006 | 完整非空答案受理 | 空白、缺小題、多餘 itemId、超長、重送及確認遺失不更改首答 | unit、integration |
| FR-007 | 先收先贏 | 兩 socket 同時送、同時間戳、系統時間回撥仍以 sequence 唯一裁決 | integration |
| FR-008 | 老師即時查看全組狀況 | 檢查學生實際網路封包與重連快照，取得他組答案或順位數為零 | contract、e2e |
| FR-009 | 結束後雙方結果一致 | 空題及題組顯示正確，同 revision 事件無遺漏 | unit、e2e |
| FR-010 | 各題精確回寫且讀回一致 | 刪分頁、插列、原值變動、合併結構變動停止該題組；等號答案保持字串 | integration、真實 Sheets |
| FR-011 | 外部讀寫成功且確認 | 模擬 400/401/403/404/429/5xx、網路斷線、寫逾時，無誤報成功 | integration、contract |
| FR-012 | 機密僅環境與記憶體 | 合成敏感值不出現在回應、日誌、快照、測試產物或版本控制內容 | unit、產物檢查 |
| FR-013 | 兩空組各一匿名身分及自訂組名 | 併發搶組恰一成功，多分頁一身分，原組占用至結束 | integration、e2e |
| FR-014 | 重啟後新活動重新作答 | 舊 bootId/activityId 拒絕，沒有部分恢復或中斷場次回寫 | integration、重啟驗收 |

回寫錯誤測試須覆蓋整題組原子性、序列化操作、舊來源回覆，以及 pending 再核對的三路結果。
讀回全等預期為 verified；全等原值才可重試；其餘為 conflict，保留公布結果。
若來源正被他人同時編輯，先檢查再寫仍有競爭空窗，須顯示此操作前提。
writing 或 pending 狀態須阻擋新場；verified、conflict、failed 為終止狀態，允許新場。
failed 須能確定未寫入，未知結果維持 pending。查核仍無法連線時保留活動，
提示重新授權或稍後查核，直到確定結果才解除新場限制。

## PlantUML 設計檢查

安裝 Java 及官方 PlantUML jar 後，以下指令在 repo root 渲染全部圖。
PLANTUML_JAR 為本機工具路徑，圖檔均為不含機密的設計內容。

```powershell
java -jar $env:PLANTUML_JAR -checkonly -charset UTF-8 specs/001-classroom-sheets-buzzer/diagrams/*.puml
java -jar $env:PLANTUML_JAR -tsvg -charset UTF-8 specs/001-classroom-sheets-buzzer/diagrams/*.puml
```

預期退出碼 0，四張圖均無語法錯誤。規劃階段已使用 PlantUML 1.2026.10 產生四份 SVG，
檢查成果及實際軟體驗收分別記錄。維護者人工核對圖、契約、規格後記下審查結果。

## 驗收紀錄

每次驗收記錄 commit、執行日期、工具版本、指令、退出碼、通過或失敗案例及必要修正。
SC-001 至 SC-007 須逐項有可重現證據，真實機密與授權過程排除於紀錄之外。
AI 文件須由人工依實作與測試核對，確認原理與操作均相符後再通過合併審查。

## Phase 1 執行結果

2026-11-24 使用 Node.js 24.22.3、npm 10.9.9。npm ci --ignore-scripts 通過，typecheck、lint、format:check、test:unit（5 項）及 build 全部退出碼為 0。正式課堂與真實 Google 驗收仍待後續階段。

## Phase 2 執行結果

2026-11-24 完成 T006–T011。typecheck、lint、format:check、build 通過；test:unit 12 項、test:contract 2 項、test:integration 4 項、test:e2e 1 項全部通過。HTTP 與 Socket.IO 測試需允許 localhost 連線；Playwright 使用本機 Edge 無頭瀏覽器。已驗證正式建置的老師及學生入口。

## Phase 3 自動驗證與待驗項目

2026-11-24 完成 T012–T022 的程式與自動測試，包含 Google 授權狀態、分段讀取、單題與題組對應、來源確認及教師重新整理恢復。typecheck、lint、format:check、build 通過；test:unit 26 項、test:contract 4 項、test:integration 8 項、test:e2e 2 項全部通過。Google 遠端操作均使用合成 adapter 或 SDK mock，自動測試不是實際授權與真實教材驗收。

## Phase 3 真實教材驗收

2026-11-24 已重用使用者現有授權，透過 Chrome 的老師頁實際重新讀取兩份線上 Google Sheets，並各完成對應確認。教材「搶答系統_題目_1」以完整 URL 讀取，辨識 4 題（2 題題組、2 題單題），共 6 個作答項目，目標為 H5、H6、H8、H9、G11、G13。教材「搶答系統_題目_2」以純 Spreadsheet ID 讀取，辨識 6 個單題，目標為 G5、G7、G9、G11、G13、G15。所有題幹及目標均逐一對照原線上試算表版面，相符且確認成功。全程直接網路讀取。

T023 完成。兩份真實教材分頁名稱均為「學習單」，不同分頁名稱與跨分頁情境已由合成 fixture 測試覆蓋，本次真實教材未覆蓋這兩項變體。Google 相關機密值未寫入驗收紀錄。

## Phase 4 驗證紀錄

2026-11-24 完成 T024–T038。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build` 與四份 PlantUML `-checkonly` 通過。`npm run test:unit` 29 項、`npm run test:integration` 13 項、`npm run test:contract` 6 項、`npm run test:e2e` 4 項全部通過。測試服務使用 3010/3011 及臨時連接埠，保留使用者已授權的服務。

已驗證同步選組裁決、完整題組、首次受理與重送去重、時間回撥及結束交錯、角色封包隱私、同 Cookie 多分頁、清除 Cookie 不可接管、斷線恢復與全新 store/bootId 拒絕舊活動。Edge 的兩個獨立學生瀏覽器身分與老師端在 2 秒內同步階段。這些是自動化瀏覽器情境，實體學生裝置及Node.js 服務重新啟動仍依 T051 驗收。

## Phase 5 驗證紀錄

2026-11-24 完成 T039–T048。`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build` 通過。`npm run test:unit` 31 項、`npm run test:integration` 19 項、`npm run test:contract` 7 項、`npm run test:e2e` 5 項全部通過。四份 PlantUML 語法檢查及 SVG 渲染通過。

老師及學生在 ended 取得同一份凍結結果，含無成功組。回寫使用每題一個原子 batch，精確 UpdateCells、fields=userEnteredValue、stringValue（等號開頭也保持文字），保留非目標格與格式。合成 adapter/SDK mock 已驗證原值、題幹及合併格衝突、寫入拒絕、未知寫入、讀回失敗、查核三路判斷、同 requestId 去重、操作序列化與 pending 阻擋新場；E2E 已驗證重新整理恢復 pending 與查核後 verified。真實 Google 回寫及實體裝置仍待 T051，以上不宣稱是真實 API 寫入結果。

## Phase 6 驗證紀錄（尚未完成整個階段）

2026-11-24 在 codex/phase-6-validation 執行。Node.js 24.22.3、npm 10.9.9、
TypeScript 5.9.3、Vitest 4.0.13、Playwright 1.56.1。下列指令皆已執行並通過：

| 指令 | 實際結果 |
| --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund | 依鎖定檔安裝 387 個套件，退出碼 0 |
| npm run typecheck | 通過 |
| npm run lint | 通過 |
| npm run format:check | 通過；新增機密測試的格式問題已修正後重跑 |
| npm run test:unit | 31 項通過 |
| npm run test:integration | 20 項通過，含 secret-exposure.test.ts |
| npm run test:contract | 7 項通過 |
| npm run test:e2e | 先正式建置，再執行 5 項測試，全部通過 |
| PlantUML -checkonly | 四份設計圖通過 |
| 啟動驗證 | 使用者執行 npm start；3000/3001 同為 PID 20320，確認應用共用單一行程 |

合計 63 項自動測試。測試停止後保留使用者的正式服務。新增基本響應式排版，讓題幹、
作答欄位及按鈕各自換行，避免長題幹把輸入框擠出視窗。

### 機密檢查

T050 使用無效的合成敏感字串，驗證 HTTP、Socket.IO 錯誤、學生快照、Google error
與允許清單日誌不會輸出該字串。掃描 frontend/dist、backend/dist、shared/dist、test-results
四個實際存在的產物目錄，找到該字串的檔案數為 0。

使用 git rev-list --all 配合 git grep -l -I -E，檢查當時 13 個 Git 版本及追蹤中的工作內容，
Google API key、OAuth secret、access token 常見前綴與 PEM 私鑰格式的符合數為 0。
掃描只輸出計數，未輸出任何可能的機密值。這是特定格式檢查，不宣稱能辨識所有種類機密。
.gitignore 的 8 個排除探針均通過，涵蓋環境檔、憑證、client_secret、service account、
token、secrets 目錄與金鑰檔。真實 Google 權杖與原授權環境未被讀出或寫入測試紀錄。

### 真實連線與回寫證據

使用者重啟新版並自行重新授權後，第一份以完整 URL 讀入並確認。Chrome 第一組與 Edge
第二組使用兩個獨立瀏覽器身分，均在同一台老師電腦上操作。第一組只填題組一個小題時
不能送出；完整提交後受理。兩組皆提交第 1 題與第 3 題，第 1 題由第一組先送出，第 3 題
由第二組先送出。老師見到兩組各提交 2 題，學生在結束前只見自組收據。

結束後雙方結果相符，第 2、4 題無成功組。老師實際回寫第一份 Google Sheets，
系統對第 1 題兩小題及第 3 題均顯示「讀回已確認」。原 Sheets 畫面人工可視核對：
H5=CPU、H6=作業系統、G11=0；H8、H9、G13 仍空白，原表格線與合併外觀保留。
這是目標與未作答格的可視核對，未宣稱完成全表逐格格式差異計數。

第二份以純 Spreadsheet ID 再次直接讀取，辨識 6 個單題，新場組別與提交皆未沿用。
桌面工具連續兩次無法啟用已重選的視窗（failed to activate captured window），停止 UI 操作。
其後使用本機公開 HTTP/Socket.IO 介面驗證第二份活動，不存取 Google 機密：

```powershell
node tests/manual/connected-activity.mjs e41904bd-bd4f-4cf8-a63a-5a514887b12e 1gTL_70FJ63l7Y8ngdkQwZ5l0Zl6s5mjBzVT5QyTHTA4
```

實際 PASS：兩個匿名 API 用戶各占一組，開始與結束均於 2 秒內收到階段事件；
第 1 題成功組為第一組（CPU），第 2 題成功組為第二組（二進位），其餘 4 題無成功組。
學生在 active 無他組答案或 results，ended 兩邊 results 相同。此案例是 API 用戶，
不是兩個實體學生裝置。該程式只適用本機已讀入、尚未確認開始且兩組皆空的六單題活動，
會實際選組、確認、開始、提交及結束，不會發出 Google 回寫。

2026-11-25 使用者已在原已授權老師頁按下第二份回寫。以下唯讀查核實際退出碼為 0，
活動為 ended、最新操作為 verified，兩個題目及各自單一目標均為 verified。
依本場已公布答案與原映射，確認 G5=CPU、G7=二進位，寫後讀回符合預期。
此次證據來自伺服端 Google 寫後讀回狀態，沒有另外宣稱原表全格或格式的人工可視核對。
唯讀查核僅 verified 退出成功，其他狀態均不當作通過：

```powershell
node tests/manual/check-connected-writeback.mjs e41904bd-bd4f-4cf8-a63a-5a514887b12e
```

### 成功條件狀態與剩餘人工驗收

| 成功條件 | 證據與限制 |
| --- | --- |
| SC-001 | 第一份已完成真實 Google 全流程，兩組為同機 Chrome/Edge；中介檔案為零 |
| SC-002 | 兩份真實題數與單題/題組配置均核對；第二份已更名為驗收學習單二且重讀六題完整，跨分頁另由合成測試覆蓋 |
| SC-003 | E2E、真實 API 及最新隔離 Chrome/Edge 測試通過 2 秒要求；依最新範圍不要求跨裝置 |
| SC-004 | 併發、去重、結束交錯與封包隱私自動測試通過，第一份真實先後提交裁決相符 |
| SC-005 | 兩份真實回寫均 verified；第一份三格另經可視抽核，第二份兩格依寫後讀回確認，失敗路徑由 adapter/SDK mock 覆蓋 |
| SC-006 | 併發唯一占用、命名、重連與新身分拒絕自動測試通過；真實瀏覽器兩組占用狀態相符 |
| SC-007 | 已在兩筆有效提交後實際重啟 Node.js；新 bootId、舊活動拒絕、空白新場及重新選組作答均通過 |

本段紀錄時 T051 尚未全數完成。兩份回寫均已完成，跨裝置已取消；當時仍待異名分頁真實對應，
以及有效提交後停止並重新啟動 Node.js 服務。
T052 的維護者人工文件核對也尚待完成；AI 已逐項對照程式、測試及上列實際結果，
修正 HTTP/HTTPS 能力、角色投影取得方式、Writeback 結構及測試建置順序等文件差異，
未把此 AI 核對當作維護者審查。Phase 6 不合併 main，Phase 7 尚未開始。

## 2026-11-25 驗收範圍更新

使用者確認先不測跨裝置，因此前述實體 LAN 待驗項目取消，並同步修正 spec 的 FR-001、
SC-003、plan、architecture.puml 與 T051/T059。先前同機 Chrome/Edge 的真實流程可作為
目前的多瀏覽器證據；API 用戶仍不冒充實際 UI 瀏覽器。

第二份試算表的分頁已經使用者明確授權，從「學習單」改為「驗收學習單二」並保留新名稱。
只更改分頁名稱，未修改題目或答案；2026-11-25 更名後重新讀取通過，6 個單題仍完整對應 G5、G7、G9、G11、G13、G15，並已確認對應。

異名分頁重新讀取、本機不同瀏覽器與 Node.js 服務重啟驗收均已完成；目前僅待維護者人工文件審查。
重啟驗收工具 tests/manual/restart-check.mjs 的 capture 模式會拒絕已結束活動；
已用既有 ended 活動確認拒絕（非零退出碼），不會誤認為有效的中斷驗收。
真正執行時，須先在 active 且至少一筆提交受理後 capture，再由使用者重新啟動電腦，
啟動空白服務後執行 verify。工具只在 validation-results 保存 bootId、activityId 與筆數，
不保存 Cookie、答案或 Google 權杖；該目錄已排除於 Git，應用不會讀取它來復原活動。

### 本機 IP 網址相容性修正與最新瀏覽器驗收

2026-11-25 真實測試定位到學生頁在一般 HTTP IP 來源中缺少 crypto.randomUUID，
所以 health 可用但學生訂閱失敗。已更新設計圖與契約，新增共用 request-id helper：
有原生方法時使用原生 UUID，否則以 Web Crypto getRandomValues 產生 UUID v4。
缺乏安全隨機來源則顯示明確錯誤，沒有使用 Math.random。訂閱、重送與回寫皆共用此實作。

`npm run test:unit` 34 項、`npm run test:integration` 20 項、`npm run test:contract` 7 項、
`npm run test:e2e` 5 項，共 66 項通過；typecheck、lint、format:check、建置與 PlantUML
檢查通過。E2E 主動移除 randomUUID，驗證缺少該方法時仍能訂閱、作答及回寫。

以下以實際服務、已更名且確認的教材，啟動隔離的 Chrome 與 Edge 測試設定檔。
不使用現有 Google 登入設定檔，不輸出 Cookie、不開啟 trace、截圖或錄影：

```powershell
node tests/manual/connected-browsers.mjs a096a12f-1c9d-417c-8ecc-50fbd9b8ed3c http://172.22.24.36:3001
```

實際 PASS：兩個瀏覽器持同一網址，各匿名占用一組；兩組各提交第 1 題一筆，
sequence 為 1、2，第一組成功；開始階段與老師進度均在 2 秒內更新。
active 學生實際 Socket 封包沒有 teacher:progress、sequence、receivedAt、results、submissions。
Chrome 重新整理後恢復原組受理狀態。測試完成後保留 active，供服務重啟測試。

已執行以下 capture 並通過，證據保存於 Git 排除的 validation-results/restart-evidence.json：

```powershell
node tests/manual/restart-check.mjs capture a096a12f-1c9d-417c-8ecc-50fbd9b8ed3c
```

實際結果為 CAPTURED、phase=active、submissionCount=2。capture 當時尚未重啟，不能把
capture 當成服務重啟通過。使用者實際停止並重啟 Node.js、啟動空白服務後，先不要建立活動，執行：

```powershell
node tests/manual/restart-check.mjs verify
```

verify 會先確認 bootId 已改變、舊活動回 ACTIVITY_UNAVAILABLE，再建立一個同組數的新場，
核對占用、組名與提交均未沿用。本階段已依使用者明確同意改測 Node.js 服務重新啟動，
最後再讀題並讓新身分完成新提交，才完成 SC-007。

### 服務重啟驗收完成

2026-11-25 使用者明確同意將本階段驗收改為「實際停止並重新啟動 Node.js 服務」，
並回覆已完成重啟。restart-check verify 實際退出碼 0：bootId 已改變，舊活動
a096a12f-1c9d-417c-8ecc-50fbd9b8ed3c 回 ACTIVITY_UNAVAILABLE；新活動
b0c5094b-e388-4943-8f8c-4f09da0bca40 的組別占用、組名與提交沿用數均為 0。

使用者重新授權後，由老師頁重新讀取更名後的線上教材，六題對應確認通過。
以下命令完成新場的不同瀏覽器選組、作答、重新整理及結束：

```powershell
node tests/manual/connected-browsers.mjs b0c5094b-e388-4943-8f8c-4f09da0bca40 http://172.22.24.36:3001 --complete
```

實際退出碼 0、PASS。Chrome/Edge 各重新占用一組，各受理一筆新提交，sequence 從
1、2 重新開始，第一組成功；開始、教師進度及結束畫面均在 2 秒內更新，兩邊公布結果一致。
這是服務重啟後的真實新場測試，不是重新建立同一個 store 物件的模擬測試。
Google 原表先前已回寫的內容仍保留，沒有當作新活動已提交的答案。

依目前使用者確認的範圍，T051 與 SC-001–SC-007 技術驗收已完成。T052 維護者回覆為
尚未核對，維持待審；Phase 6 不合併 main，Phase 7 尚未執行。

## 維護者人工審查完成

2026-11-25 維護者（使用者）明確回覆「文件已核對，內容一致」。T052 完成，
依 review-notes 所列文件與圖、實際操作及測試紀錄完成核對。Phase 6 的全部任務通過，
後續依原定每階段分支流程合併 main，再於 Phase 7 新分支進行最後收斂複核。
