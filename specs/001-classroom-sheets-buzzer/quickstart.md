# Quickstart validation guide

本文件記錄各階段的啟動與驗收。Phase 1–2 已建立工具與本機服務，完整課堂功能依後續階段交付。
PlantUML 設計圖已在規劃階段實際渲染；尚待維護者人工審查。

## 前置條件

- 老師 Windows 電腦安裝 Node.js 24 LTS、npm，學生使用現代瀏覽器並能連線到老師 LAN 位址。
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
- 預設 LAN HTTP 的適用環境為可信課堂網路。需要加密時設定本機 HTTPS 與對應來源。

## 啟動與自動驗證

在儲存庫根目錄執行以下預定指令。依序通過型別、格式、測試及建置後啟動。

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
上述自動測試使用合成資料與 Google adapter，真實 Google 互通另依下一節驗收。

預期各測試退出碼皆為 0。建置後 npm start 以單一 Node.js 行程啟動兩個 listener，
正式前端由各 listener 同源提供。停止後重新啟動時，活動與 Google 授權均須重新建立。

## 真實線上端到端驗收

1. 老師在本機開啟 http://127.0.0.1:3000，透過系統瀏覽器完成 Google 授權。
   授權期間停用 trace、HAR、錄影及含機密畫面的截圖，禁止匯出 token 檔案。
2. 老師建立兩組的活動。第一次以 Google Sheets URL 讀取第一份教材，核對四個題號、
   六個作答項目與六個目標格。確認無硬編碼座標。依 [資料模型](data-model.md)
   及 [契約](contracts/interfaces.md) 檢查老師可見預覽與學生投影的差異。
3. 老師複製畫面中的學生加入連結。兩個學生裝置分別點選空組，免登入加入。
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
10. 另開活動，在至少一組有效提交後重新啟動老師電腦。舊連結不可繼續操作，老師建立
    新活動後，原組名、綁定、答案與順位皆為空，學生須重新選組並作答。

整個驗收全程直接存取線上 Sheets，中介檔案數須為零。

## 正常與特殊情境的覆蓋

| 需求 | 正常情境 | 特殊情境與預期結果 | 驗證層級 |
| --- | --- | --- | --- |
| FR-001 | 本機老師與兩組 LAN 學生使用同場 | 學生無法連線時顯示中斷 | e2e、真實 LAN |
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

已驗證同步選組裁決、完整題組、首次受理與重送去重、時間回撥及結束交錯、角色封包隱私、同 Cookie 多分頁、清除 Cookie 不可接管、斷線恢復與全新 store/bootId 拒絕舊活動。Edge 的兩個獨立學生瀏覽器身分與老師端在 2 秒內同步階段。這些是自動化瀏覽器情境，實體學生裝置及整機重新開機仍依 T051 驗收。
