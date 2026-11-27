# Quickstart: 本功能實作後的驗證流程

本文件是驗證指南，不是所有功能已驗收的證明。003 Phase 1–4已合併，CSV及Excel直接開啟證據有效；Phase 5已建立複製連結及手動備援，本階段UI／文件核對與合併仍待完成，最終驗收待Phase 6。結果與限制見review-notes.md，具體欄位與數字以 [data-model](data-model.md)、[contracts](contracts/interfaces.md)、[research R4](research.md#r4-有界匯出與完整性) 為準。

## Prerequisites

- Node24.22.3（支援>=24.22.3 <25）、既有npm依賴及本機可寫臨時目錄，從儲存庫根目錄執行。
- teacher預設127.0.0.1:3000，student預設3001。自動化E2E沿用3010／3011、獨立臨時DATABASE_PATH、合成授權與Google adapter；不得使用正式DB、瀏覽器profile或既有憑證作fixture。
- 完成 [四張設計圖](plan.md#phase-1-design-and-handoff) 的維護者人工設計審查，並在每個實作Phase合併前依憲章V核對AI文件。以各新codex分支串行測試、核對、合併，不跨Phase先做後補。
- Excel人工驗收需可用的桌面Excel，記錄產品名稱、版本／build與地區設定。沒有Excel時可做自動化但不得記SC-004已通過。
- 手動以正常Google帳號試用時，只由使用者在原安全環境授權，不貼密碼、client secret或token。單純結果匯出不需再讀Google教材，亦不需為測下載結束其他正式活動。

## Install, Check and Run

以下既有指令已可包含目前完成的新增測試；先確認node --version是已支援版本。安裝依賴只在環境需要時執行，不為驗收重裝已有依賴。

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

同一Phase全數exit0才具備技術Gate；仍需本階段文件人工核對後合併。原系統已在服務時，不要為plan自行停止或重啟，避免清除記憶體Google授權。新實作部署至本機時的重啟時機由使用者原終端操作。

## Canonical Synthetic Acceptance Fixture

Phase 1已新增`tests/helpers/result-export.ts`的`resultExportFixture()`與6項fixture測試。helper沿用catalog-server、正式repositories與受驗證的臨時SQLite目錄；使用合成Google／隨機loopback埠，不讀正式資料或憑證。`kind: 'performance'`建立30組／20個雙子題題組的資料；`historyCount`、`active`及`jobStatus`可準備歷史與進行中場景。背景worker停止以固定測試資料，job狀態為合成預置，不代表Google實際回填驗收；`injectFault`限定操作本fixture建立的活動，`close()`僅清理其自有臨時目錄。後續需按實際HTTP下載驗收性能，不能將fixture建立耗時當成匯出耗時。

可單獨執行`node node_modules/vitest/vitest.mjs run tests/unit/result-export-fixture.test.ts`。此測試會開啟隔離本機HTTP listener，執行環境須允許loopback連線；RED／GREEN及完整Phase Gate結果見review-notes.md。

建立三組：第1組-甲組、第2組-乙組均已加入，第3組未加入。兩題：第1題單題「3+4？」；第2題兩子題「水的化學式？」及「水的沸點？」。共同受理順序如下，各題組都是一次完整送出：

| 全場sequence | 組別／題號   | 受理答案   |
| ------------ | ------------ | ---------- |
| 1            | 第1組，第2題 | H₂O、100°C |
| 2            | 第2組，第1題 | 7          |
| 3            | 第2組，第2題 | HO₂、90°C  |
| 4            | 第1組，第1題 | 8          |

預期第1題順位為乙、甲，第2題為甲、乙；答案正誤不影響排名。全場仍顯1–4。第3組每題皆未作答，只顯系統組號。Amax=2、Umax=1，CSV一列表頭＋三資料列、每列9欄；第1題子題空，題組兩列共用甲／乙順位。欄內引號或換行的額外案例另用獨立fixture，不以逗號split當CSV驗證器。

## End-to-End Scenarios

Phase 2／3測試及CSV入口可持續驗證；老師目前或歷史單場活動已結束後可按「下載本場 CSV」，等待／active停用並說明原因；失敗不假下載，成功只說「已開始下載」。Phase 4兩處老師頁均有「全部收件」／「依題目」，選中視角有勾號與aria-pressed，逐題以有label的選單選題；兩種視角都區別全場序號及本題順位，題組各小題完整展示，未作答另區。表格可聚焦橫向捲動，長文字保留換行；學生資料不擴增。waiting／active歷史訂閱原場，進度表與答案一併更新；ended或非current唯一重讀一次detail後停止訂閱，不輪詢、不建立活動。切帳號／boot取消舊請求。Phase 5目前活動連結旁提供「複製活動連結」：pending停用、resolve才成功；失敗顯示可選取的唯讀網址與手動操作提示，無有效連結停用並說明。以下CSV、雙視角與複製情境均可執行。

1. teacher A於目前活動進行中查看「全部收件」及「依題目」，對照上表；送出新的完整答案後，兩個視角及仍active的歷史詳情皆2秒內更新。切題、切視角、長文及鍵盤焦點不得影響排名。
2. waiting／active匯出按鈕不可用且有原因；直接請求也409。正常結束該合成場後，從目前場下載，再從歷史選同一場下載；兩者內容相同，不必匯出其他活動，回填pending／conflict／failed也可下載。
3. 用標準CSV解析器檢查BOM及每列數量、單題空子題、題組順序、全組未作答；不要只看Excel格色或成功下載提示。依紀錄比對所有答案及原完整組名。
4. 將Google adapter讀／寫設為會失敗，仍能匯出合法本機ended歷史；確認沒有呼叫Google、增加job／receipt、改current slot或phase／revision。另測重啟後原老師重新授權可下載同場，學生URL與身分規則不變。損壞fixture須先刪非winner的submission_answers再刪其submission，保留winner及next_sequence：應拒絕STORAGE_CORRUPT，不得列成未作答；亦驗組別ordinal缺號或超出group_count。
5. 以學生、無session、無Google授權、老師B、無效UUID、非空query／body、缺CSRF、錯Origin測拒絕；HEAD405且不生成。所有失敗不得帶CSV attachment或觸發anchor，其他owner與不存在同404。
6. 增加30組／20題／40資料列正常規模，記下載生成耗時≤5秒；另測尺寸超限、同時生成、5秒窗限流、失敗／取消釋放slot、deadline與切帳號，對照契約安全錯誤，不截斷資料。
7. 在老師目前場用滑鼠及鍵盤複製顯示URL，確認同一完整studentOrigin、port及UUID；模擬writeText resolve／reject／不存在能力，成功或已知失敗後1秒內回饋。自動化以隔離context的模擬writeText及可控制promise檢查參數，不讀寫使用者實際剪貼簿；產品亦不讀clipboard。
8. 下載fetch／body或clipboard promise延遲時切活動、帳號、boot或卸載，舊結果不能觸發新下載／新回饋；blob URL必須清理。已送進瀏覽器的下載／剪貼簿操作不宣稱可撤回。

## Validation Matrix

| 層級／測試檔（完成狀態依tasks.md）       | 正常與特殊範圍                                                                                                                           | 覆蓋                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| unit/answer-order.test.ts                | 交錯sequence、同timestamp、題組、所有預設組、空受理、完整集合／重複／缺漏拒絕、不突變輸入、與固定winner一致                              | FR-003–FR-009、FR-019–FR-020；SC-001–SC-003、SC-006                 |
| unit/csv-export.test.ts                  | BOM僅一次、全欄quoting／CRLF、逗號／引號／多行／emoji、Amax與Umax來自不同題、零rank或零未答欄、excel-tab-v1與LF／cell邊界                | FR-007–FR-011、FR-014–FR-015；SC-001–SC-004                         |
| unit/export-filename.test.ts             | source建場名不受雲端改名、空名、禁字／CRLF／長emoji、雙預算不切code point、完整UUID、UTC15:59:59／16:00:00對Taipei跨日                   | FR-012–FR-013；SC-005                                               |
| unit/export-gate.test.ts                 | 每session兩次／5秒窗、全域1、忙不排隊、錯誤／取消釋放、協作deadline、授權代次更動及有限狀態清理                                          | FR-015、FR-024；SC-009                                              |
| integration/export-read-snapshot.test.ts | 真實臨時SQLite的唯讀一致snapshot、無寫入、不可巢狀／Promise、拋錯rollback；缺源／item／answer／winner矛盾拒絕，不用空格補齊              | FR-003–FR-006、FR-015–FR-016；SC-001、SC-010                        |
| integration/result-export.test.ts        | 真實teacher service及同一DB反覆匯出、不同job狀態、Google離線、原場／全部table rows不變、重啟及原帳號、容量／1,000,000格／32MiB           | FR-001–FR-017、FR-024、FR-026；SC-003、SC-009–SC-010                |
| contract/result-export-http.test.ts      | teacher GET成功binary、CSRF／owner／phase／id／query／body／Host拒絕、student無route、HEAD405無生成、429／422／503 JSON非CSV、晚授權失效 | FR-001–FR-002、FR-010、FR-015–FR-017、FR-024–FR-026；SC-003、SC-010 |
| e2e/result-export.spec.ts                | 目前／單一歷史下載、保留BOM bytes、正確filename\*與UTF8檔名、JSON／HTML／body錯誤不下載、scope取消、objectURL釋放                        | FR-001–FR-002、FR-010–FR-016、FR-024；SC-001、SC-005、SC-009–SC-010 |
| e2e/answer-order.spec.ts                 | 全場與逐題獨立順序、live history≤2秒、ended固定、四組六題40字／長文字／鍵盤與空狀態，學生隱私回歸                                        | FR-018–FR-021、FR-025；SC-006–SC-007、SC-010                        |
| e2e/copy-activity-link.spec.ts           | 精確URL、click／Enter／Space、成功／拒絕／不支援、manual備援、連點、切場／帳號晚promise及不讀clipboard                                   | FR-022–FR-024、FR-026；SC-008、SC-010                               |
| 合成機密掃描及既有回歸                   | 新response／header／filename／CSV／log無OAuth、Cookie或digest；原匿名／角色／完整題組／首答／worker／持久化全部保留                      | FR-025–FR-026；SC-003、SC-007、SC-010                               |
| Excel人工                                | 下節實際桌面開啟、版本記錄與無外連合成文字安全案例                                                                                       | FR-010–FR-014；SC-004–SC-005                                        |

超限精確案例至少包含16,383欄可接受／16,385欄拒絕的layout邊界、總列含表頭、cell32,767／32,768 UTF-16、253／254 LF，以及prefix／quoting後大小跨界；需與其他更小資源界線隔離測試，不能因早先限制擋住就冒稱測到Excel邊界。只用合成字串，不使用真實公式外連或可執行命令。

## Excel Manual Acceptance

已建立 `tests/manual/export-results-fixture.mjs`，以隔離合成服務真正呼叫teacher下載端點產生檔案，只保存合成教材與無效示範授權，不需真實Google憑證。以下命令已實際執行：

```powershell
node tests/manual/export-results-fixture.mjs --output validation-results/feature-003-acceptance
```

helper輸出scope限定於Git排除的validation-results目錄，報告只含合成檔名、列／欄數及檢查結論，不能保存cookie／CSRF／OAuth值或trace。不得覆寫正式DB、讀取原瀏覽器或操作Google。

每次產生獨立run子目錄，normal為3資料列／9欄，safe-text為40資料列／63欄；manifest記安全文字於E2:E15。請用檔案總管直接開啟CSV，若詢問程式選Excel「僅一次」，不要改預設程式或安全設定。此次桌面Excel的舊式文字匯入精靈雖可用UTF-8／逗號／一般格式顯示一般檔，但含CR／LF的安全文字案例觀察到拆列，該路徑不記通過。維護者已實際直接開啟新合成檔並確認文字未計算、特殊內容及40資料列／63欄正確。Excel執行檔版本16.0.20625.20108、Windows使用者文化設定zh-TW；不推論所有Excel版本或另存後重開皆安全。檔案與人工結論見review-notes.md的Phase 3紀錄。

1. 以實際Excel開啟一般檔，記錄版本／build／地區；確認中文、H₂O、emoji、多行及引號／逗號都在正確格，各欄表頭與答案／未作答正確。須讀CSV解析結果與Excel可見內容互相核對。
2. 以獨立安全文字檔測`=1+1`、`+1+1`、`-1+1`、`@SUM(1,1)`、全形字首及前置空白／TAB／CR／LF，確認沒有公式計算，必要時在公式列檢查文字內容；不使用外部網址、DDE或系統命令。
3. 記錄quoted TAB是匯出文字一部分，原DB字串／先後不變，介面有安全說明。若有任何案例被執行，SC-004不通過，先修設計及測試再重驗。
4. 若另測Excel另存CSV再重開，單獨記錄結果；不能將該結果推論為所有Excel版本、其他試算表或一般資料交換皆安全。此特性目前不以自動化HTML畫面代替桌面Excel驗收。
5. 驗收檔名取建場來源名＋完整ID＋臺灣當次匯出時間；UTC2026-11-26T15:59:59Z對20261126-235959，下一秒為20261127-000000。

沒有人工結果時此節保持未完成，不以研究來源、Node probe或002人審填入通過。

## Diagram and Documentation Validation

使用本機官方PlantUML jar（Git排除）及Java；本次已存在的工具位置只用於驗證，不放入產品：

```powershell
$env:PLANTUML_JAR='C:/Users/sophi/SW_SpecKit/validation-results/feature-002-plan/plantuml.jar'
$planDiagramOutput=Join-Path (Get-Location) 'validation-results/feature-003-plan/rendered'
java -jar $env:PLANTUML_JAR -checkonly specs/003-export-answer-orders/diagrams/*.puml
java -jar $env:PLANTUML_JAR -tsvg -o $planDiagramOutput specs/003-export-answer-orders/diagrams/*.puml
node node_modules/prettier/bin/prettier.cjs --ignore-path .gitignore --check specs/003-export-answer-orders/*.md specs/003-export-answer-orders/contracts/*.md specs/003-export-answer-orders/checklists/*.md
```

實際驗證輸出置於validation-results/feature-003-plan，不提交生成圖或jar；重複驗證可換新的輸出子目錄。檢查四份非空SVG而非只看exit0。連結、章節、需求覆蓋及未填範本另由本機文件檢查器驗證，結果見review-notes。

## Evidence and Phase Gate

每Phase記實際指令、exit code、測試數及限制；人工設計／AI文件核對、Excel版本與操作結論各自記錄，不混成自動化通過。每Phase測試全過、人工文件核對後才commit／merge main，再新建下一Phase分支。失敗先修正，不自動push／部署、不變更未授權Google教材。
