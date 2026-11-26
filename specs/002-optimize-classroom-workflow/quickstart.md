# Quickstart and Validation: 第二版

2026-11-26狀態：Phase 1–7已通過測試、人工核對並合併main；清單建場、持久化、歷史／設定、自動回填及統一UI已實作。Phase 6已完成真實Google與服務重啟驗收。Phase 8進行備份恢復、安全產物與完整回歸，尚待本階段文件人工核對及後續Phase 9收斂核對。
資料與介面細節見 [data-model](data-model.md)、[contracts](contracts/interfaces.md)。

## Prerequisites

- Windows、Node.js 24；本次已探測 v24.22.3 及內建SQLite 3.54.1，實作固定支援版本並驗證內建SQLite修補。
- 同機 Chrome、Edge，使用兩個獨立瀏覽器或獨立 context；一般同瀏覽器分頁不是兩個組別身分。
- Google Cloud 啟用 Sheets API 及 Drive API；OAuth Web client callback維持 `http://127.0.0.1:3000/api/google/callback`。
- 設定 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REDIRECT_URI，真實值只由既有安全執行環境注入，不寫終端歷史、截圖、文件、測試報告或對話。
- 新scopes見research R4；Drive metadata scope的同意畫面及測試使用者必須可用；原有Sheets授權不等於已有清單和帳號scope。
- 準備兩個Google測試帳號，各有自己的可編輯驗收教材與活動；兩份不同題數、單題／題組教材，另有多工作表、首張零題、唯讀、歧義、衝突等合成資料。共用來源可能讓不同活動寫同一格，帳號歷史隔離不代表雲端儲存格隔離；本次B使用獨立教材。
- 真實流程會在結束時自動修改原試算表，應使用獲授權的驗收教材；寫入期間停止外部編輯，不以正式未授權教材測試。
- DATABASE_PATH 已加入設定；預設本機 `data/classroom.sqlite`，保留資料夾可寫且整目錄排除Git。測試使用獨立臨時目錄／埠，不碰使用者正式DB或既有服務。

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

## Phase 3 已實作範圍與合成驗證

正式啟動先開SQLite及migration，初始化失敗只記安全錯誤且不開始listen；不fallback空DB。
老師完成包含OIDC／Drive metadata／Sheets scopes的授權後，由清單搜尋、繼續載入、預覽第一工作表，
設定組數並確認建場；無URL／ID輸入欄位。唯讀來源不可建場，第一張沒有題目時不改讀第二張。
預覽與cursor綁教師session、Google owner、代次及5分鐘有效期；建立前重驗編輯權限及來源指紋。
requestId建場收據、來源、題目、空組與全域slot同交易保存；重送回同一活動。
切換／解除帳號會清舊畫面、斷開舊教師訂閱，晚到清單回覆不採用；其他owner看不到活動。

本階段測試完全使用隔離DB與合成OIDC／Google回應，未測真實Drive權限同意、未寫任何真實Sheets。
合成頁面操作：授權 Google Sheets → 預覽 教材一 → 確認題目並建立活動 → 重新整理，來源仍可恢復。
兩份不同配置教材由整合測試分別建立；瀏覽器測試另驗唯讀、空搜尋、預覽網路錯誤及回寫待確認時禁止新建。

舊URL來源HTTP入口在正式main不註冊；獨立純核心fixture仍保留第一版reducer，以保留排序／回寫錯誤回歸，
不代表新版學生持久化或自動回填已完成。source-http／source-preview、受影響的writeback-http／results-writeback、
secret-exposure均已改由合成授權→清單／preview→requestId建場。真正Google及故事1–4整體驗收在後續Phase。
具體測試指令、數量及圖對照見review-notes.md的Phase 3 Implementation and Validation。

## Phase 4 已實作範圍與合成驗證

老師從清單建場後，學生填寫組名，再點選空組一次完成加入。前後端共用trim後1–40 UTF-16字驗證；
送出後輸入欄位消失、名稱不可更改，重新整理及同Cookie多分頁回到原組；清Cookie不能接管已占用組。
完整名稱統一為「第1組-咕咕嘎嘎」形式，老師進度、全組答案、暫定／最終結果及現有回寫狀態均使用同一formatter。
waiting學生資料的questions為空，沒有題號／prompt／item／source；只見組別占用、自組名稱與等待訊息。
owner老師start交易提交後才公布題目。正式join／start／submit走SQLite及持久收據，保存成功後才ack與推播；
完整題組驗證及next_sequence不以客戶時間裁定，DB故障不先占組或受理答案。

跨boot重連先重取session再subscribe完整快照；新boot由session確認，舊boot／舊socket／舊授權代次回覆丟棄。
本次Edge以同一臨時DB、原學生網址／Cookie重建測試服務實例，確認原名稱、active及後續提交恢復；
這是同一測試行程內重建listener／sessions／store／connection的驗證，不是Phase 6要求的實際獨立Node行程重啟及三場歷史完整驗收。

目前end已保存phase／ended_at／receipt，結果仍由來源與提交投影；固定results與唯一job的原子保存及自動worker於Phase 5完成。
舊手動回寫僅保留至Phase 5移轉；記憶體回寫進度橋接不代表持久job或自動回填已完成。
歷史與設定頁、完整子行程恢復及真實Google／兩帳號整體驗收仍依原Phase執行。未讀寫真實Sheets或正式DB。

## Phase 5 已實作範圍與合成驗證

老師按「結束搶答並自動回填」即停止收答，結束／固定結果／唯一job及收據同交易保存；不要求第二次確認或回填按鈕。
結束前畫面明示須暫停從其他視窗編輯原表。關閉老師頁不停止Node服務，worker會繼續；重開可看目前逐題狀態。
無成功組亦保存零項verified工作，不呼叫Google寫入。僅有成功組的原目標會以整題組stringValue batch更新，讀回全expected才verified。

遇pending／failed可「查核原表」或「安全重試回填」；查核不送寫，安全重試先讀baseline再決定，衝突題不覆寫。
原Google帳號缺少授權時保留pending、不耗讀寫預算；由來源頁重新授權原帳號才喚醒，另一帳號不代寫。
自動寫入每cycle最多3次，後續延遲2／4秒；連續暫時讀取最多4次，延遲1／2／4秒後暫停待確認。
未知結果不因達上限而直接failed；重啟不重設預算，writing先轉pending查核；只有owner明確retry才開新cycle。
DB進度保存失敗停止派發並回安全儲存錯誤；保留原DB處理儲存問題，服務重新啟動後按原狀態查核，不盲目重寫。

本次四個真正獨立Node子行程強制中斷點：end提交後worker前、writing提交後送寫前、送寫後讀回前、讀回後保存前。
測試以本機合成JSON模擬外部Google狀態，正式產品仍直接呼叫Google Sheets API，未使用試算表中介檔案。
Edge亦驗兩學生作答後自動確認回填、老師關頁後續作、pending阻擋新建及只查核不重寫。
上述均為合成來源；兩份真實Google、兩個真實帳號、三場歷史及active真正服務重啟續答仍須Phase 6驗收，不以本次worker故障測試代替。

## Phase 6 歷史、設定與核心驗收（已審查合併）

老師授權後可使用「歷史活動」分頁載入已存活動，查看來源快照、完整組名、答案、順序、結果及回填紀錄；讀取歷史不需要重新連線原Google表。查看舊場不會取代目前活動。歷史及老師設定依Google帳號隔離，其他帳號即使可編輯同一試算表，也不能取得原帳號的活動。

「預設參與組數」保存至SQLite，重新開頁或重新授權原帳號後保留，之後的新活動使用保存值。授權切換立即移除原帳號資料。真正服務重啟後，老師需重新授權才可查歷史；學生保留原瀏覽器資料與網址，可在老師尚未授權時恢復原組及active作答。

自動化已驗證三場資料、真正main子行程停止及同DB／埠重新啟動、原學生Cookie續答與序號接續，以及waiting／ended階段不變。這些測試使用隔離臨時DB與合成Google，不代表兩個真實帳號及正式服務已驗收。

真實驗收時先保留至少兩場ended與一場含兩組答案的active活動，再於Node 24執行：

```powershell
node tests/manual/workflow-v2-restart.mjs capture
# 在原服務終端機停止並重新啟動服務；先不要作答或重新授權。
node tests/manual/workflow-v2-restart.mjs verify
```

預設讀取data/classroom.sqlite；若服務使用其他DATABASE_PATH，兩次指令皆需在capture或verify後傳入同一DB路徑。腳本唯讀查詢，保存非機密ID、計數與業務資料雜湊至被Git忽略的validation-results/workflow-v2-restart-evidence.json，不保存Cookie、憑證或原始答案。verify後才使用原Chrome／Edge接續提交，核對組名、已受理答案與新序號，再由使用者重新授權原Google帳號核對歷史。

2026-11-25真實驗收已完成：重啟前4場（3 ended、1 active），active有兩組Q1共2筆答案、nextSequence=3；維護者實際停止並重啟Node後，verify exit0，業務資料雜湊與計數全部一致，health bootId已更換。老師未授權時原Edge先續答Q2、原Chrome再續答Q2，資料庫序號為1、2、3、4，nextSequence=5且仍active。重新授權A後，三場歷史詳情、原答案、設定4與回填紀錄均恢復，沒有B活動；B先前只見自己的活動及設定3。第三場完成上述驗收後才由老師end，亦顯示讀回已確認。

兩份真實教材均從清單選取，使用原Chrome／Edge命名作答並自動回填，未要求教師輸入Spreadsheet URL／ID或使用中介檔。另經維護者同意，在第二份教材新增「驗收備用空白頁」；原教材首張時建第四場，再把空白頁移至第一張。第四場Q5／Q6仍回填原sheetId 1167716485的G13／G15，分別為堆疊／演算法，空白頁對應範圍保持空白。首張空白時新預覽明確失敗，未改讀第二張；已將「驗收學習單二」恢復第一張並確認可再讀六題，保留空白頁於第二張。

T069–T083已完成，維護者已回覆「審閱完成」，Phase 6合併main 9f47bf9。完整檢查及人工文件核對依review-notes.md的Phase 6 Core Acceptance and Review Gate為準；接續Phase 7統一UI。上述UI格式核對只涵蓋可見題目、邊框與合併配置，完整自動化原表保護另由整合測試驗證。

## Phase 7 統一介面與作答表（已審查合併）

老師頁以目前活動為優先，上方導覽可前往活動、教材、歷史與設定。活動內顯示已加入組數、已保存答案筆數及教材題目數；各組作答表以組別為列、題目為欄，列出完整組名、加入、提交總數、尚未作答、已受理、搶答成功及收件序號。長組名換行，窄視窗可橫向捲動，固定組名欄與表頭；查看歷史詳情也使用相同表格，不改變目前活動。

教材清單在固定高度內捲動，顯示名稱、擁有者、日期與唯讀原因；預覽按鈕保留來源識別的可存取名稱，畫面不需要輸入ID。預覽只展示第一張題目與位置，可用鍵盤捲動。開始、結束、建立下一場、學生送出與加入受限時，附近有不可用原因。

載入、連線、設定保存與回填結果均有文字。回填中提示保留本機服務；待確認先查核、失敗可安全重試、來源衝突不直接覆寫，讀回確認後才顯示成功；無成功答案則明示原表不需更新。只有pending／failed題目提供既有查核／安全重試操作，沒有新增第二個正常回填按鈕。

學生頁保留匿名必填鎖名、waiting無題目及整題組送出規則，加入／等待／作答／結果統一版面；已受理後顯示保存狀態並鎖定送出。390×844學生鍵盤加入及作答、640×720老師橫向捲動與1280×720四組六題40字名均有E2E驗證。

新增測試指令（使用Node 24環境）：

```powershell
npm run test:e2e
```

全套20項通過（原10項核心加10項UI）；另unit 54、integration 70、contract 15，共159項。typecheck、lint、format:check、build及六圖驗證通過，詳細結果見review-notes.md最後的Phase 7 Implementation and Validation。舊匿名隱私案例已改從語意table核對，未移除原隱題、完整組名與2秒同步斷言。

合成畫面位於validation-results/feature-002-phase-7：teacher-desktop.png、teacher-table.png、teacher-narrow.png、student-waiting.png、student-answer.png；不包含真實Google授權或憑證。這些檔案被Git忽略。真實Google及正式重啟證據仍見Phase 6；本階段沒有更改後端、角色投影或資料契約，也沒有再次改寫真實Google教材。

本機服務已啟動時，只需重新整理老師頁即可載入新前端，不必重啟Node或重新授權。人工核對時可用Tab將焦點移到「歷史活動」導覽連結，再按Enter，確認可前往歷史區；不要為核對導覽而結束或另建活動。維護者已完成Phase 7可見UI／鍵盤與文件核對，T084–T093完成，合併main 9602880；接續Phase 8最終整合。

## Phase 8 SQLite Operations

支援Node `>=24.22.3 <25`，本次使用24.22.3及內建node:sqlite，SQLite 3.54.1；其他Node版本不列為已驗證。從儲存庫根目錄啟動，未指定DATABASE_PATH時實際檔案為 `C:/Users/sophi/SW_SpecKit/data/classroom.sqlite`；指定相對路徑亦以啟動時工作目錄解析。要換工作目錄時請設定絕對路徑，不能用記憶體DB、URI或網路共用路徑。單一服務行程管理同一檔案，資料夾需本機可寫。

### 一致性備份

以下是可重現的維護操作，不是本階段已對正式資料庫執行的紀錄。先暫停使用者操作；若同時有其他連線持續寫入，備份可能重新開始、完成時間增加。SQLite backup API會讀取完整已提交快照，包含WAL中的資料；不能只在運作中複製classroom.sqlite。備份含組名及答案，應限制本機檔案存取並排除Git，不傳到AI對話。

在正確Node 24環境、專案根目錄的PowerShell執行此區塊。它使用既有DATABASE_PATH或上述預設值，產生唯一備份檔，驗證完整性與外鍵後才回報成功；不讀取OAuth設定。

```powershell
@'
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
let source, checked;
try {
  const sourcePath = resolve(process.env.DATABASE_PATH || 'data/classroom.sqlite');
  if (!existsSync(sourcePath)) throw new Error();
  mkdirSync('backups', { recursive: true });
  const target = resolve(join('backups', 'classroom-' + randomUUID() + '.sqlite.bak'));
  if (existsSync(target)) throw new Error();
  source = new DatabaseSync(sourcePath, { readOnly: true });
  await backup(source, target);
  checked = new DatabaseSync(target, { readOnly: true });
  if (checked.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok') ||
      checked.prepare('PRAGMA foreign_key_check').all().length) throw new Error();
  console.log(target);
} catch {
  console.error('備份未確認成功，請保留原資料並檢查路徑、權限與檔案。');
  process.exitCode = 1;
} finally { checked?.close(); source?.close(); }
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw '備份失敗，不進行恢復。' }
```

只把exit0且通過查核的輸出路徑記為可用備份。失敗時可能留下不完整檔案，不得選用。此操作不改變活動階段；備份不含記憶體Google授權，日後老師仍需自行重新授權。

### 停服務後恢復

1. 在原執行服務的終端按Ctrl+C，等 `server_stopped` 且Node退出；不得只關網頁。確定沒有其他服務或維護工具連到待恢復DB。
2. 保留原DB與所有sidecars，不刪除、不把備份直接覆蓋到它。選擇上一步已確認成功的備份。下列指令用互動輸入檔案路徑，不需填任何密碼；建立全新UUID候選檔，避免混入舊WAL／SHM。

```powershell
$classroomBackupPath = Read-Host '輸入已驗證的本機備份完整路徑'
$classroomRestorePath = Join-Path (Get-Location) ('data/restored-' + [guid]::NewGuid().ToString() + '.sqlite')
if (!(Test-Path -LiteralPath $classroomBackupPath -PathType Leaf)) { throw '備份不存在。' }
if (Test-Path -LiteralPath $classroomRestorePath) { throw '候選檔已存在。' }
[System.IO.File]::Copy($classroomBackupPath, $classroomRestorePath, $false)
$env:CLASSROOM_RESTORE_CANDIDATE = $classroomRestorePath
@'
import { openDatabase } from './backend/dist/persistence/connection.js';
let connection;
try {
  connection = openDatabase(process.env.CLASSROOM_RESTORE_CANDIDATE);
  if (connection.database.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok'))
    throw new Error();
  console.log('候選資料庫版本、外鍵、活動狀態與完整性查核通過。');
} catch {
  console.error('候選資料庫無法安全恢復；保留原資料，不切換服務。');
  process.exitCode = 1;
} finally { connection?.close(); }
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw '恢復查核失敗。' }
$env:DATABASE_PATH = $classroomRestorePath
npm start
```

3. 用新服務的health、原學生URL／Cookie及原老師帳號檢查資料；原活動階段、已受理答案和序號應依備份時點恢復。老師重新授權才可看歷史及查核未完成回填；學生續答不需等授權。這是回到備份時點，備份之後的新提交不會憑空存在。
4. 此環境變數只作用於該終端；以後啟動亦需使用同一已選定絕對路徑。驗證失敗時停新服務、保留候選及原資料，再以原DATABASE_PATH啟動；不要合併兩套WAL／SHM。未知回填先查核，不以手動重新寫入取代復原。

### 升級與回退

先依上節備份並停服務，再更新程式、`npm ci`、完整檢查及build。啟動時openDatabase核對migration版本／checksum、quick_check、FK及活動slot，再listen；不相容、損壞、唯讀或不可寫時明確失敗，不建立空白替代資料。現在只有001-core；未來migration必須版本化、同交易，不能修改已套用checksum。回退程式若不認得新版DB，應用該版本相符的已驗證備份建立新候選並驗證，不手改schema_migrations或刪DB。此階段沒有新增migration、排程自動備份或雲端備份服務。

Phase 8的隔離測試以尚未checkpoint的WAL資料執行backup API，停止兩個HTTP／Socket listeners後恢復至全新臨時DB，逐列比較17表（含組別、提交、收據、結果及job），並檢查integrity/FK。另驗損壞檔拒絕且原bytes不變、可讀但FK破壞的備份拒絕。沒有對正式DB實施恢復；故障及安全測試皆只使用合成值。詳細指令結果與文件審查包見review-notes.md的Phase 8節。

本階段實際Gate：typecheck、lint、format:check、build均exit0；test:unit 54、test:integration 75、test:contract 15、test:e2e 20，共164項通過。六圖checkonly及SVG渲染、8份本版Markdown明確格式檢查、欄位／連結稽核亦通過。T099文件人工核對及T101合併尚待完成，Phase 9仍未開始。
