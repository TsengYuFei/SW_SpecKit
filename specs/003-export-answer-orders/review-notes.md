# Review Notes: 003 規劃證據與設計審閱包

## Phase 1 Start and T002 Design Review Scope

維護者於本次implement回覆「審核完成」，確認上述003設計包；T002據此完成，非沿用002結論。後續Phase 1實作文件核對仍依T007另行進行。

2026-11-27開始speckit-implement。T001已完成：從main基線`89d12688b6f6a46ed5a40630d44d7e70466a9d91`建立`codex/003-phase-1-setup`。開始時僅有未追蹤的`specs/003-export-answer-orders/`設計文件，全部保留；未變更產品程式、正式資料或Google教材，尚未提交或合併。

前置腳本解析本功能目錄正確；requirements.md為16項已勾、0項未勾。沒有extensions.yml，無before_implement／after_implement hooks。先前analyze未發現阻塞問題，但分析結果不替代維護者的設計核對。

T002核對範圍為本文件下方Design Decisions Requiring Review及Diagram Review Package、[plan.md](plan.md)、[data-model.md](data-model.md)（含113欄位引用索引）、[contracts/interfaces.md](contracts/interfaces.md)與四張PlantUML。重點包括：所屬老師單場已結束活動的唯讀CSV、題組共順位／所有預設組別的未作答、Excel安全文字及臺灣時間檔名、共同順位與歷史即時更新、連結複製及晚回覆隔離。所有產品行為目前均為預定設計。

開始時僅完成T001與審閱包定位；取得本次人工核對後才執行T003–T006。最新進度與結果見下方Phase 1 Implementation and Validation；002的人工核對不適用本次功能。

日期2026-11-27。本次僅執行speckit-plan Phase 0研究與Phase 1設計，未改產品程式、資料庫schema、正式資料或Google教材。功能規格已有兩項使用者釐清，詳見 [spec.md](spec.md#clarifications)。

## Setup and Scope

- setup-plan.ps1 -Json解析FEATURE_SPEC／IMPL_PLAN／FEATURE_DIR為003目錄；script回報BRANCH=003-export-answer-orders是功能識別，實際git branch --show-current仍為main，不宣稱建立了同名Git分支。
- .specify/feature.json已定位003；.specify/extensions.yml不存在，before_plan／after_plan無需派發。
- 依技能Phase 0明確要求派發兩個研究子任務：CSV／Excel與檔名原始來源、現有資料／權限／UI整合。皆唯讀、不改檔、不讀正式DB或憑證、不控制使用者瀏覽器。
- 現有三workspace、依賴、Node要求、SQLite schema、teacher routes／guards／history／projection、ActivityPage／HistoryDetail／App／http helper已核對。研究結果集中 [research.md](research.md)，實作設計見 [plan.md](plan.md)。

## Design Decisions Requiring Review

| 設計範圍     | 決策與核對重點                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 使用者已確認 | 活動名稱取建場來源快照名、不新增命名欄；全部預設組別（含未加入）均納入未作答，只有系統組號、不占rank                                                         |
| 原資料與權限 | teacher-only單場ended下載，原owner與CSRF／Host／Origin／generation強制檢查；歷史與current皆可，不改slot／phase／receipt／job，不讀Google                     |
| 一致唯讀     | metadata先限owner及大小，query_only暫設ON、BEGIN DEFERRED短同步快照、finally恢復，與寫交易互斥；缺題／缺答案或固定winner矛盾拒絕，不補造完整答案             |
| 共同排名     | 純AnswerOrderView同時供CSV及兩個teacher UI；全場保留原sequence，各題rank從1，題組所有items共用，不擴student DTO或Socket wire                                 |
| CSV與檔名    | Amax／Umax獨立取全題最大、固定列寬；UTF-8 BOM、全欄quoting、必要quoted TAB文字安全；240雙預算檔名只縮來源名，完整UUID及Taipei時間保留，RFC8187中文attachment |
| 大小與資源   | Excel列／欄／cell／LF與本機格數／input／bytes上限，整份預檢，不靜默截斷；5秒2次／session、全域一個工作、有界讓出event loop、協作deadline與完整finally清理    |
| 晚回覆       | binary helper不用JSON http()，保留BOM，嚴格檢查成功MIME／filename與scope後才anchor；取消、失敗、卸載清理URL，不誤報已保存磁碟                                |
| 教師歷史     | 原HistoryDetail只首次讀取；本次規劃active/waiting原場live wrapper、ended一次刷新，避免目前頁即時而歷史永久陳舊                                               |
| 複製         | 使用顯示同一studentUrl、點擊後立即writeText、不讀clipboard；resolve才成功、reject／無能力可手動選URL；忽略舊context，不承諾撤回已交給瀏覽器的寫入            |
| 既有流程     | Google直接讀題／自動回填、匿名分組、題組完整提交、成功組與歷史保存不變；沒有migration、CSV匯入、批次下載、背景job或代發訊息                                  |

## Diagram Review Package

| PlantUML原始碼                                        | 主要審查情境                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| [architecture.puml](diagrams/architecture.puml)       | 新功能唯讀邊界、shared純順位、student／Google舊流程不擴改                |
| [export-sequence.puml](diagrams/export-sequence.puml) | 權限／phase拒絕、限流／busy、read snapshot、缺漏／超限、晚授權與下載清理 |
| [answer-order.puml](diagrams/answer-order.puml)       | 交錯全場與本題rank、題組完整性、未加入組、兩種UI與active history即時     |
| [copy-link.puml](diagrams/copy-link.puml)             | 鍵盤／啟用、無clipboard、resolve／reject、切活動或帳號後舊promise        |

本機SVG／PNG產物在Git排除的validation-results/feature-003-plan。已檢視architecture PNG，元件與資料路徑可讀；這是本次工具／圖稿檢查，不代表維護者已完成設計人審。

## Validation Performed During Planning

| 實際操作                                         | 結果／證據界線                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .specify/scripts/powershell/setup-plan.ps1 -Json | exit0，解析003並產生已完整填寫的plan                                                                                                                    |
| Node runtime-probe.mjs                           | 僅記憶體SQLite，17表／110欄；Node24.22.3／SQLite3.54.1；BEGIN DEFERRED、query_only拒絕寫與恢復、Taipei午夜formatToParts核對；非產品readSnapshot實作測試 |
| PlantUML -checkonly／-tsvg                       | 最終四圖有效SVG；首次answer-order的sequence note用了不適用的bottom語法，修成over後四圖皆通過，不把先前失敗隱藏或當產品錯誤                              |
| architecture PNG                                 | 已實際檢視版面，無需操控使用者瀏覽器                                                                                                                    |
| 文件Prettier／本機設計稽核                       | exit0，8份Markdown格式檢查及check-plan.mjs 73/73通過；39個相對連結含anchor、26 FR／10 SC矩陣覆蓋、2釐清、4有效SVG與範本殘留0                            |

本次沒有執行新的unit／integration／contract／E2E、性能、真實Google或Excel驗收。002已有168項通過是前版歷史證據，本功能仍須按quickstart及後續tasks重新測試。研究僅核對官方資料，沒有Excel版本／build／可見結果，SC-004保持未驗收。

## Human Review Gate

依 [憲章I與V](../../.specify/memory/constitution.md)，實作前須核對上述四圖與plan／data-model／contracts的角色、資料及例外路徑；AI文件亦需人工核對。此為尚待維護者的結論，未標記已通過。本次計畫命令可交付設計並結束，不因此直接進入產品實作；後續speckit-tasks應把設計人審作首個實作Gate。

審閱包還包含 [quickstart驗收矩陣](quickstart.md#validation-matrix)、Excel人工／資源限制及 [contracts](contracts/interfaces.md)。如人工審查改動設計，先同步PlantUML並重新驗證，再實作。每個實作Phase照既定新branch、測試、文件人審、merge串行，不能把002核對當003審查。

設計覆核修正：研究子代理最後指出，單驗FK／完整題組／winner仍可能漏掉整筆非winner提交遺失。已核對participation-repository成功提交同交易遞增next_sequence，設計補入N筆序號恰為1..N、next_sequence=N+1及group ordinal恰為1..group_count；同步data-model、contracts、quickstart及匯出圖。損壞案例以先刪非winner答案再刪提交、保留winner及counter驗拒絕，沒有改正式資料或schema。其餘owner、唯讀、live history、scope、job獨立性及limits跨文件未發現阻塞矛盾。

## Final Planning Validation

- `node validation-results/feature-003-plan/check-plan.mjs`：exit0，73/73項文件與設計結構檢查，8份Markdown、39個本機連結／錨點、26 FR及10 SC驗證矩陣覆蓋、4圖、2項釐清與無範本殘留。
- `node validation-results/feature-003-spec/check-spec.mjs`：exit0，14/14，內含規格品質16/16；品質核取項語意未變，不把它改成產品實作驗收。
- `node validation-results/feature-003-plan/runtime-probe.mjs`：exit0，Node24.22.3、SQLite3.54.1、記憶體17表110欄、讀交易及query_only恢復、臺灣午夜格式核對。這不是尚未存在的新service測試。
- PlantUML `-checkonly`及`-tsvg`：exit0；最終四份SVG位於validation-results/feature-003-plan/rendered-reviewed，來源SHA256另存diagram-source-hashes.json。architecture最終PNG已檢視。
- 明確Prettier check涵蓋003的spec／plan／research／data-model／contracts／quickstart／review-notes／requirements，exit0；git diff --check為0。check-prerequisites -Json可供下一步解析research、data-model、contracts及quickstart。
- 實際Git分支仍main，產品原始碼修改0；沒有tasks.md、程式碼commit、push、部署、正式DB恢復或Google／剪貼簿操作。所有validation-results工具與生成產物均Git排除。

Phase 0／1技術規劃輸出完成，沒有未解技術決策或憲章例外；維護者設計／AI文件核對、實作功能測試與真實Excel驗收仍是後續明確門檻。下一步可產生speckit-tasks，不自行執行產品實作。

## Task Generation Validation

2026-11-27執行speckit-tasks，setup-tasks.ps1 -Json正確解析003與組合TASKS_TEMPLATE_CONTENT；依範本整理tasks.md，沒有開始實作、建立Git分支或改變產品碼。before_tasks／after_tasks無設定hooks。

清單共74項、6個Phase、19個同Phase可並行項目，全部未勾。分布為Setup 7、Foundational 10、US1 CSV 27、US2順位介面11、US3複製9、Final 10。每Phase都有獨立codex分支、獨立驗收、完整Gate／AI文件人審及合併門檻；設計審查明列T002、人工Excel在US1交付時T041完成，Final核對仍有效的證據，僅輸出政策改變才重測受影響項目，不重複索取無關人工操作。

為使欄位引用可逐項解析，data-model.md補Field Citation Index，展開40個本功能讀取的既有DB欄位與73個導出／暫態／UI欄位，共113個selector。只補原有定義的追溯索引，不新增DB表或欄；題目／子題輸入識別明確使用既有snapshot的id，導出實體的questionId／itemId不變。索引也說明先顯式pick所需欄，避免strict schema誤拒絕teacher既有requestId／receivedAt等metadata。plan.md同步六個實作Phase及tasks交接，功能需求、設計圖與產品行為未變；T002需核對含此索引的完整設計包。

MVP為完成Setup／Foundational及US1，即所屬老師單場ended活動CSV，含目前／歷史各自下載入口、完整列欄／題組／未加入組、權限／錯誤／文字安全／容量與Excel驗收，不依賴US2的新答案Panel或US3複製功能。US2以交錯四筆、兩題各1–2順位、目前與active history即時、鍵盤長文及CSV一致驗收；US3以精確URL、鍵盤、正常／拒絕／無能力與晚promise驗收。

實際執行的文件檢查：

- `node validation-results/feature-003-tasks/check-tasks.mjs`：exit0，145/145項檢查；74項ID連續唯一／全部未勾、story標籤／檔案路徑、6個唯一分支與獨立門檻、19個[P]檔案隔離、113/113 implementing task欄位引用、40個既有欄位對照built SQLite schema、26 FR／10 SC覆蓋及74個相對文件／anchor連結通過，未知引用／範本殘留／產品修改均0。
- `node validation-results/feature-003-spec/check-spec.mjs`：規格品質檢查仍可重跑；本清單不改已完成的兩項使用者釐清，也不將需求品質核取16/16當成產品通過。
- 明確Prettier check涵蓋003全部9份Markdown，git diff --check及check-prerequisites -Json -RequireTasks -IncludeTasks於最後交付前執行確認。

以上只驗任務文件與引用，沒有跑新的應用程式測試、Excel或真實Google驗收；002的168項結果仍只作基線歷史。設計／文件人審、各Phase測試與分支／合併、Excel結論均維持待辦，不提前替維護者核准。下一步適合speckit-analyze做跨文件一致性分析，再進入受門檻控制的implement。

## Phase 1 Implementation and Validation

2026-11-27，分支`codex/003-phase-1-setup`，main基線`89d12688b6f6a46ed5a40630d44d7e70466a9d91`。維護者已回覆「審核完成」，T002設計包核對完成；本節的實作後文件核對仍待T007，尚未commit／merge，也尚未開始Phase 2。

### Completed Scope: T001–T006

- T001–T002：保留原未追蹤003設計文件，建立獨立分支，記錄本次人工設計核對。沒有extensions.yml，沒有需派發的implementation hooks。
- T003：確認package.json要求Node>=24.22.3 <25，使用Node24.22.3及原有npm scripts，未新增依賴。實際重新執行基線：55 unit＋77 integration＋16 contract＋20 E2E＝168項通過，所有靜態檢查與build exit0。
- T004：既有.gitignore已排除validation-results、DB／WAL／SHM／journal／backup、.env及憑證；.prettierignore與ESLint ignores已涵蓋生成目錄，無需修改。以無效示範路徑git check-ignore確認下載CSV、DB、sidecar與憑證會被排除，而合成CSV fixture示範路徑與migration原始碼不被排除。專案private:true，不新增發佈用.npmignore或無關技術的ignore檔。
- T005：先新增tests/unit/result-export-fixture.test.ts，執行專用Vitest指令exit1，原因是result-export helper尚不存在（收集失敗，沒有宣稱6個案例均已執行失敗）。RED紀錄位於Git排除的validation-results/feature-003-phase-1/fixture-red.log。
- T006：新增tests/helpers/result-export.ts，沿用catalog-server／既有persistence與temporary-database。合成帳號授權、隨機loopback埠、真實SQLite；資料透過既有repository準備，背景worker停止避免競爭。canonical為3組／2題／4筆交錯受理，題組完整、第三組未加入；性能資料為30組／20個雙子題題組／600筆受理／1200個答案。支援1–10個ended歷史、另1個active場、合成job狀態、Google離線與限定本fixture活動的缺答案／缺整筆非winner／缺結果故障注入。job狀態是測試預置，不冒充Google實際回填驗證。

6項fixture測試全部通過：canonical題目／完整答案／未加入組／固定winner及counter、多歷史與active／job／離線、性能資料完整數量、非winner整筆遺失仍保留winner及counter且FK有效、拒絕子路徑及只清理自身臨時目錄／另一fixture不受影響／重複close、無效場次數在建立資源前拒絕。既有安全清理helper驗證目錄為系統tmp直接子目錄與固定prefix，拒絕symbolic link／realpath偏移；新增helper不接收任意DB路徑、不執行自行拼接的遞迴刪除。程式對照審查確認沒有產品程式、schema、wire或正式資料變更。

### Full Phase Gate Results

| 指令                     | 最終結果                           |
| ------------------------ | ---------------------------------- |
| npm run typecheck        | exit0                              |
| npm run lint             | exit0                              |
| npm run format:check     | exit0                              |
| npm run test:unit        | exit0，19檔／61項（原55＋新6）     |
| npm run test:integration | exit0，17檔／77項                  |
| npm run test:contract    | exit0，8檔／16項                   |
| npm run test:e2e         | exit0，20項，24.2秒；包含重新build |
| npm run build            | exit0，三workspace建置成功         |

合計174項通過，不將fixture生成耗時視為SC-009的HTTP匯出性能。基線首次在受限環境的integration出現43項失敗／34通過，主要為EACCES 127.0.0.1連線封鎖及子行程逾時；當時立即停止後續Gate。經工具核准在可連線環境重跑integration／contract／E2E／build全部通過；最終全Gate亦在允許隔離loopback的環境重新執行。初始與重跑紀錄均保留於Git排除的validation-results/feature-003-phase-1，不掩蓋先前失敗。未停止現有正式服務、讀取正式DB／憑證或修改教材。

四張原設計圖未改；Java／PlantUML -checkonly與-tsvg皆exit0，四份非空有效SVG在validation-results/feature-003-phase-1/diagrams。003九份Markdown另以Prettier明確檢查，文件連結／任務狀態／範本殘留以該目錄check-documents.mjs核對，git diff --check另驗。工具／渲染／測試紀錄不提交。

### T007 Maintainer Review Pending

請維護者核對本節、quickstart.md的已實作範圍，以及spec.md／plan.md／tasks.md的進度狀態，確認與兩個新增測試檔、指令及結果一致。憲章V要求「AI產生或修改的文件必須由人工審查」；T007明定本階段核對後才能合併。此為實作後文件核對，T002的設計核對不替代本項。

目前T001–T006已勾，T007與Phase 2以後維持未勾；本Phase尚未提交或合併，沒有merge hash可填。CSV下載／順位UI／複製尚未實作；沒有Excel實測、真實Google測試或新端點性能結論。取得本階段核對後才commit／merge main、補記實際hash並進入Phase 2。

維護者於本次回覆「審核完畢」，確認Phase 1實作後文件與結果一致。T007的人工核對已完成；據此提交並合併，實際hash於合併後補記。

Phase 1實作提交：b6d6f40；合併main：10e4e3b1bba1be132f06ae564046667a452e04da。依T007補記hash，無產品行為變更，未push。

## Phase 2 Implementation and Validation

Phase 1維護者核對及合併完成後，於main的hash紀錄提交`e82cbf26ab8ac30fce0e1791dd1c12269a13a52f`建立`codex/003-phase-2-foundation`，T008完成。本階段依原四張已審閱設計實作，未改流程／設計圖、沒有migration／新資料表／Google呼叫或學生wire欄位。

### Completed Scope: T008–T016

- T009／T013／T014：先建立純順位測試，再實作shared/src/schemas/result-export.ts與shared/src/projections/answer-order.ts。顯式pick既有teacher資料，接受合法requestId／receivedAt等metadata但不帶入輸入模型；缺少submissions不是零受理。canonical輸入19欄、OrderedAnswer 11欄、QuestionOrder 9欄、AnswerOrderView 2欄皆依data-model索引實作。共同sequence必須恰為1..N，各題連續rank，完整題組共一rank；未加入組依ordinal列未作答、使用既有完整組名formatter，不複製名稱規則、不突變輸入。關聯／唯一性／完整答案集合錯誤一律拋固定訊息AnswerOrderError，不附原始資料。組名重用原groupNameSchema並拒絕被trim才合法的保存值；答案沿用既有長度常數與非空規則，驗證時不trim保存文字。
- T010／T015：先建立真實SQLite測試，再於connection新增同步readSnapshot。保存query_only、暫設ON、BEGIN DEFERRED／COMMIT，拋錯ROLLBACK並finally恢復query_only／讀旗標；與既有BEGIN IMMEDIATE寫交易互斥。拒絕直接寫入、巢狀讀／寫、afterCommit、requireTransaction、關閉連線、Promise與thenable。對原生rejected Promise先掛安全catch再拒絕，避免未處理拒絕；不await，不記錄例外payload。既有寫交易的提交與afterCommit語意保留。
- T011／T016：先驗兩種尚缺的錯誤碼，再加入shared common與safe-errors allowlist。EXPORT_BUSY為503／retryable=true；EXPORT_TOO_LARGE為422／retryable=false；固定訊息說明未產生檔案，不含原始資料。既有logger從shared碼白名單辨識新碼，仍只記event／code／durationMs，不新增敏感輸出。
- T012：新增真實隔離teacher history snapshot契約測試，確認顯式pick能接受既有額外metadata、第三組未加入空名、teacher輸入無突變，且active student無submissions時拒絕輸入、不誤當零受理。不新增HTTP或Socket欄位。

### TDD and Review Evidence

四份測試檔先行執行：2個suite因缺schema／projection而收集失敗，另外4個已執行案例因缺readSnapshot與錯誤碼失敗，整體exit1；記錄為validation-results/feature-003-phase-2/red.log。實作後首輪4檔／20項exit0，之後補5個重複／多餘資料拒絕案例與rejected Promise邊界，納入最終完整Gate。沒有把收集失敗冒稱所有尚未載入的案例已逐項失敗。

純順位共20項，涵蓋同timestamp及倒退時間仍按sequence、題組、零受理、未加入組、全名40 UTF-16、保存空白／換行不變、重複submission／sequence／group-question／group／ordinal／question／item、缺或多item／未知關聯／空或超長答案拒絕。唯讀快照2項含真實第二SQLite連線WAL提交，交易內兩次讀值維持舊值、結束後才見新值；各失敗後讀／寫可繼續，query_only原值為0及1皆還原。安全錯誤2項、teacher／student契約1項。程式對照審查確認新順位尚未接到產品介面，既有學生投影與首答選擇不變；結果讀取器與next_sequence／frozen winner完整性檢查仍屬Phase 3，未冒稱已完成。

### Full Phase 2 Gate Results

| 指令                     | 最終結果                         |
| ------------------------ | -------------------------------- |
| npm run typecheck        | exit0                            |
| npm run lint             | exit0                            |
| npm run format:check     | exit0                            |
| npm run test:unit        | exit0，21檔／83項                |
| npm run test:integration | exit0，18檔／79項                |
| npm run test:contract    | exit0，9檔／17項                 |
| npm run test:e2e         | exit0，20項，25.2秒；含重新build |
| npm run build            | exit0，三workspace成功           |

合計199項（Phase 1的174項＋本階段25項）通過。第一次完整Gate已全過；其後補上rejected Promise安全catch及對應失敗情境，再重新執行上述全部Gate，以validation-results/feature-003-phase-2/verified-\*.log與verified-results.json為最終證據，不沿用修改前結果。所有測試用臨時DB、合成授權與隔離loopback；未讀正式憑證、DB或瀏覽器profile，不停止正式服務，不存認證原值。

四張未改的PlantUML重新-checkonly／-tsvg皆exit0，四份非空有效SVG在validation-results/feature-003-phase-2/diagrams。003九份Markdown明確Prettier檢查通過；check-documents.mjs核對九文件／77個連結／74項任務／完成16項／待辦58項／四有效SVG／範本殘留0；git diff --check通過。這些工具與產物均Git排除。

### T017 Maintainer Review Pending

T008–T016已完成，T017因本階段文件人工核對及合併未完成而保持未勾。請核對本節、quickstart.md及spec／plan／data-model／contracts／tasks的已實作與待辦狀態，確認與新增schema／純順位／connection變更、四份測試及結果一致。依憲章V「AI產生或修改的文件必須由人工審查」與T017，本Phase確認後才能commit／merge main；Phase 1核對不替代本次。

目前分支codex/003-phase-2-foundation，尚未commit／merge，故沒有Phase 2合併hash；未push或部署。CSV端點、結果讀取器、CSV／檔名／資源閘門、教師順位UI及複製按鈕仍未交付，不執行或宣稱Excel／下載性能驗收。維護者核對後才合併本Phase、記實際hash並開始Phase 3。

維護者已回覆「Phase 2 文件已核對，內容一致」，T017人工核對完成，據此提交及合併，實際hash於合併後補記。

Phase 2實作提交db5985b，合併main為0dd838cac8e7d9c058ab9999629bcf94233e3c57；本補記不新增產品行為，未push。

## Phase 3 Implementation and Validation

分支`codex/003-phase-3-csv-export`從Phase 2已合併並補記證據的main `9b90cf1386f772da6fcda814b9407dd07d910081`建立。T018–T042已完成；T043的本階段文件人工核對及T044提交／合併尚未完成，未提前進入Phase 4。

### Delivered US1 Scope

- backend/export/limits.ts集中原設計數值；csv.ts以共同AnswerOrderView輸出單題／子題各一列、獨立Amax與Umax、全部預設組別未作答、固定列寬，UTF-8 BOM僅一次、全欄quoting／雙引號跳脫／CRLF。excel-tab-v1保護所有可變欄位；超出Excel列／欄／格字數／LF與本機格數／input／output上限即拒絕，不截答案或拆檔。
- filename.ts使用建場保存名稱、完整UUID與當次臺灣時間；禁字／C0／DEL替換、尾端空白點移除、空名fallback、240 UTF-8 bytes與UTF-16雙預算且不破code point。提供ASCII fallback及RFC8187 filename\*，不把原文字直接插入header。
- persistence/result-export-reader.ts以owner限定metadata先預檢原始bytes，再於readSnapshot讀取並核對來源fingerprint／解析結果／正規化題目、所有組別、全部受理與子題答案、next_sequence及固定winner。依T027／T028所列40個來源欄位及既有target／baseline／merge輔助資料核對，不讀participant digest或回填job作匯出前提；不使用會installActivity的歷史恢復路徑。缺資料、整筆非winner遺失、來源結構或固定結果矛盾皆安全拒絕。
- result-export-service.ts與export-gate.ts實作每session 5秒2次、全行程1個生成slot、busy不排隊且不計次、期限／取消／授權代次檢查及finally釋放。編碼至多4096格或4ms讓出事件迴圈；10秒為協作deadline，不假稱能中斷同步SQL。沒有DB遷移、下載job／receipt／持久CSV cache或Google呼叫。
- teacher-only GET /api/activities/:id/export.csv強制session、GET明確CSRF、UUID、空query／body、Google授權、owner及ended；既有Host／Origin guard保留。HEAD先註冊405／Allow:GET，不生成內容。完整bytes驗證及送出前scope重驗後才設attachment並end，無ETag／304；失敗回安全JSON，不誤附CSV。回填pending／conflict／failed不阻下載。
- frontend binary helper驗200、MIME、attachment、UTF-8檔名及BOM，使用blob保留原bytes，處理fetch／body失敗、AbortSignal、晚回覆與objectURL清理。ExportResultsButton接到目前活動及單一歷史詳情；waiting／active停用並說明原因，成功只說「已開始下載」，固定顯示安全文字說明。App的teacher Classroom key及HistoryPage傳遞boot／sessionVersion／authGeneration護欄；student key及projection不變，CSRF不入key或URL。

尚未新增US2的全場／逐題Panel、active history live wrapper或US3複製按鈕，原進度表、結果與自動回填仍保留。正式服務未由本次操作重啟，測試只用隔離服務。

### TDD and Validation Evidence

先新增unit／HTTP／integration／E2E，再實作。初始受限環境的HTTP失敗不當成有效RED；重跑允許loopback後，缺CSV／filename／gate／reader的suite收集失敗、缺端點回404及缺下載按鈕的E2E失敗皆有實際紀錄。其後新能力測試通過；新安全／性能回歸首次通過者不偽造RED。

驗證包含：精確canonical整份CSV bytes、中文／emoji／逗號／引號／多行與危險字首、零受理、不同題獨立最大欄、16383／16385欄、含表頭Excel列邊界、32767／32768 UTF-16、253／254 LF、前綴／轉義後bytes邊界；臺灣跨午夜、禁字／長emoji／RFC8187；頻率／busy／取消／期限／釋放；所有owner／phase／Host-Origin-CSRF／無授權／student／query-body／HEAD拒絕、422／429／503、條件請求仍200且無ETag、送出前授權變更；同場／多歷史、真實DB重開、全表rows不變、Google離線且calls0、job／receipt不增加、來源與全部答案損壞拒絕。

前端unit及Edge E2E驗目前／歷史下載BOM及完整檔名、等待／active不可下載、200 JSON／HTML／wrong MIME／body失敗不下載、過期scope不觸發anchor或顯示舊成功、objectURL撤銷及安全檔名。另補截短body缺BOM與無效filename\*拒絕。持久來源結構無法解析但fingerprint仍匹配的案例先RED，再修為STORAGE_CORRUPT，避免誤回來源匯入的MAPPING_AMBIGUOUS。

本階段曾修正測試問題並保留紀錄：檔名中的星號先按Windows禁字替換，所以測試不得期待原星號編碼；新增重啟案例最初誤放在另一test callback內，改為頂層後通過；第二個瀏覽器下載需等待path完成再關context，否則Edge下個context建立會失敗。最終回歸另抓到既有results-writeback.spec的背景重試／手動查核競爭：合成待確認job的next_attempt_at設NULL以固定該案例前置，保留全部原斷言及產品自動重試規則；原案例單獨重跑通過，再重跑整套E2E。沒有用增加timeout或刪斷言掩蓋失敗。

### T041 Desktop Excel Acceptance

- 工具實際啟動本機桌面Excel並檢視一般CSV；執行檔ProductName為Microsoft Office，ProductVersion／FileVersion為16.0.20625.20108，Windows使用者文化設定Get-Culture為zh-TW，Excel介面繁中。未更改地區、預設應用程式或安全／隱私設定。
- `node tests/manual/export-results-fixture.mjs --output validation-results/feature-003-acceptance`實際經臨時teacher端點產檔，兩次輸出皆成功。最新合成檔在Git排除的`validation-results/feature-003-acceptance/run-BQojl7/`：normal為活動`2adf90f2-2366-4794-b1c5-8e1249dfeb6c`，3資料列／9欄；safe-text為活動`9efe15f3-91f7-41f7-9fcd-fe8439dc138e`，40資料列／63欄，14個安全文字案例列在manifest的E2:E15。檔名包含完整ID及臺灣113216／113217時間，檔頭BOM已核對；bundle僅用於合成工具並在輸出後刪除，不記認證headers或原值。
- 一般檔實際可讀中文、H₂O／100°C、完整組名、單題空子題、題組共順位及未作答。舊式「匯入字串精靈」以UTF-8／逗號／一般格式處理安全文字檔時，CR／LF案例觀察到拆列；該路徑不列通過，保留為操作限制。
- 維護者依要求從檔案總管直接開啟最新safe-text CSV，明確回覆「已直接開啟，文字未計算且列欄正確」，確認E2:E15公式樣式未計算、逗號／引號／換行留同格，40資料列／63欄正確，T041據此完成。不以工具檢視或解析器冒充人工確認，也不推論其他Excel版本、另存重開或其他試算表程式皆安全。

### T042 Performance

真實臨時HTTP／SQLite驗30組、20題、40資料列、600筆受理／1200個答案，完整下載含最後一組最後一子題，未截斷。指定測試首輪46ms、最終整合Gate實測95ms，均≤5000ms；中止後slot可再次使用。純fixture建立耗時不作下載性能證據；匯出與另一active活動同時收件／即時更新的最終並行情境仍待T067。

### Full Phase 3 Gate Results

| 指令                     | 最終結果                         |
| ------------------------ | -------------------------------- |
| npm run typecheck        | exit0                            |
| npm run lint             | exit0                            |
| npm run format:check     | exit0                            |
| npm run test:unit        | exit0，25檔／115項               |
| npm run test:integration | exit0，21檔／95項                |
| npm run test:contract    | exit0，10檔／19項                |
| npm run test:e2e         | exit0，26項，35.9秒；含重新build |
| npm run build            | exit0，三workspace成功           |

合計255項通過（Phase 2為199項，本Phase新增56項）。最終單元／整合證據為validation-results/feature-003-phase-3/verified-_.log；最後只修改舊E2E的合成排程前置及補充GET body／條件請求契約斷言後，重跑typecheck、lint、format、全contract、全E2E與build，結果為recovery-_.log／recovery-results.json。產品程式與unit／integration測試未再修改，故不無故重跑未受影響的層級。先前252項通過、後續E2E競爭失敗與修正結果均保留，不拿修改前結果冒充最終通過。

四張未改的PlantUML重新-checkonly／-tsvg皆exit0，四份非空有效SVG在validation-results/feature-003-phase-3/diagrams。003九份Markdown另以Prettier明確檢查；check-documents.mjs核對9文件／77連結／74項任務／完成42項／待辦32項／4有效SVG／範本殘留0；git diff --check通過。所有驗收產物、日誌、合成CSV與工具均Git排除，沒有正式憑證／DB／Google教材或個人檔案變更。

### T043 Maintainer Review Pending

請核對本Phase交付範圍、程式／四份主要設計文件、quickstart／tasks狀態、上述完整測試與Excel結果／限制是否一致。T041的直接開啟人工驗收已完成，不要求重做；本次仍需依憲章V「AI產生或修改的文件必須由人工審查」及T043核對實作後文件，Phase 2核對不替代本項。

目前T001–T042完成，T043／T044及後續Phase未勾。分支codex/003-phase-3-csv-export尚未commit或merge，無Phase 3合併hash；未push、部署或重啟正式服務。維護者確認本階段文件後才依T044提交、合併main並記hash，再建立Phase 4新分支。

維護者回覆「確認完成繼續」，完成本次Phase 3文件與實作／結果一致性核對。T043完成，據此依T044提交並合併，實際hash於合併後補記。Excel已確認結果不需重做。

Phase 3實作提交6a2a254，合併main為d1cc14d9a88671639b28a765e98d3f114886e841。依T044補記hash，無產品行為變更，未push。

## Phase 4 Implementation and Validation

維護者確認Phase 3文件完成後，從已合併並補記hash的main `bbe79d0aa189c20059fc01c65641aee327a0da0b`建立`codex/003-phase-4-answer-order`。T045–T053完成，T054本階段UI／文件核對及T055提交／合併仍待辦。沒有開始Phase 5，不沿用Phase 3核對替代本階段人審。

### Delivered US2 Scope

- T046／T048：先新增answer-order.spec.ts，再建立共用AnswerOrderPanel。直接使用shared deriveAnswerOrder，不重算排名；預設全部收件，另有aria-pressed一般按鈕切逐題、有label及唯一id的題目select。保留原全場sequence、本題rank、完整組名與完整子題prompt／answer；未作答另區，不給順位。空受理顯示文字，資料錯誤只顯該區固定錯誤，保留進度、結果、匯出等操作。view與selectedQuestionId對應data-model既有欄位。
- T047／T049：先新增answer-order-history.spec.ts，再建立HistoryLiveAnswers。waiting／active詳情以原useActivity訂閱原場，答案面板及原進度表同步；收到ended先保存snapshot，再唯一重讀detail更新保存資訊；非current訂閱拒絕也只重讀一次後停止。初始ended不訂閱，不輪詢、不建立活動。HistoryLive.state為live／refreshing／saved；卸載或scope變更AbortSignal取消請求、忽略舊回覆，按boot／authGeneration比對snapshot。
- useActivity只新增前端本機errorCode以辨別ACTIVITY_UNAVAILABLE與暫時網路錯誤，沒有改Socket payload或學生DTO；http helper僅新增可選AbortSignal，所有原呼叫相容。HistoryDetailPage初次讀取亦取消舊請求，scope仍由Phase 3的teacher邊界隔離；student key不擴改。
- T050–T051：ActivityPage與HistoryDetailPage取代舊散列div，保留ProgressTable、ResultsView、WritebackPanel及單場CSV下載。兩種序號使用明確欄名及不同文字標章，題組子題以分隔呈現；選中視角有可見勾號及aria-pressed，不僅靠顏色。長名／答案可換行，答案pre-wrap保留多行，表格可聚焦橫捲、焦點可見；不將全部答案設為aria-live廣播。
- T052：student-projections.test.ts及anonymous-join-privacy.spec.ts無需改動，完整原斷言保留。完整回歸發現history-recovery.spec.ts原先期待已移除的「完整組名：已加入」散列文字，改以原ProgressTable具名rowheader及「已加入」狀態定位，保留完整名／重開／設定／帳號隔離／不讀Google全部斷言，不放寬權限或2秒目標。沒有backend、DB schema、Google、成功組或受理規則變更。

### TDD and UI Evidence

初次RED執行因max-failures=2在兩個歷史案例停止：缺少已受理答案面板、非current詳情停留舊active階段均實際失敗，其餘5項未執行不算RED。另單跑canonical全場／逐題案例，因面板／表格不存在而失敗；之後才實作。原紀錄在validation-results/feature-003-phase-4/red.log與panel-red.log。首輪實作後6過1敗，唯一重讀計數誤包含原SourcePage初始化讀取；測試等待教材頁初始化後才開始計數，保留「詳情初讀一次＋結束一次＝2次」斷言，7項通過，不透過改成3次來掩蓋輪詢。

7項新Edge E2E涵蓋：canonical全場1–4與兩題各1–2、題組完整答案／未加入組及同場CSV一致；1280×720四組六題、40 UTF-16完整名及多行長答案、Enter／Space切視角、label選題、可聚焦橫捲與空狀態；缺submissions只顯局部錯誤；waiting／active歷史答案及進度2秒內同步、ended唯一一次重讀；stale非current詳情一次重讀且活動數／current不變；切帳號晚回覆拒收；實際停止／重啟隔離服務、boot改變後拒收舊詳情，重新合成授權才能恢復原帳號歷史。截圖及測試只含合成資料，沒有實際Google或個人瀏覽器profile操作。

實際產生並檢視兩張Panel截圖，文字與子題可讀，兩種序號可辨，已補可見選中勾號：

- validation-results/feature-003-phase-4/answer-order-global.png：四筆交錯全場收件與各題獨立rank。
- validation-results/feature-003-phase-4/answer-order-question.png：第2題兩組完整子題與未加入第3組未作答，保留全場1／3而本題為1／2。

截圖可由新E2E重建，均Git排除；這是工具視覺檢查，不替代T054維護者核對。鍵盤測試使用真實Edge按鍵與焦點操作；選單另以標籤定位切題驗值，沒有宣稱做過完整輔助科技人工認證。

### Full Phase 4 Gate Results

| 指令                     | 最終結果                         |
| ------------------------ | -------------------------------- |
| npm run typecheck        | exit0                            |
| npm run lint             | exit0                            |
| npm run format:check     | exit0                            |
| npm run test:unit        | exit0，25檔／115項               |
| npm run test:integration | exit0，21檔／95項                |
| npm run test:contract    | exit0，10檔／19項                |
| npm run test:e2e         | exit0，33項，31.8秒；含重新build |
| npm run build            | exit0，三workspace成功           |

合計262項（Phase 3的255＋本Phase 7項）通過。完整Gate的unit／integration／contract記錄於validation-results/feature-003-phase-4/final-_.log；E2E首輪32過1敗為上述舊文字定位失效，修正唯一test檔後重跑typecheck／lint／format／全E2E／build，最終為recovery-_.log與recovery-results.json。產品程式及unit／integration／contract未再變更，不無故重跑未受影響層級。舊失敗紀錄保留，未增加timeout或刪核心斷言。

四張原已審閱PlantUML未改，重新-checkonly／-tsvg皆exit0，四份非空有效SVG在validation-results/feature-003-phase-4/diagrams；003九份Markdown格式與本機連結／任務狀態／範本殘留另驗，git diff --check通過。沒有extensions.yml，before／after_implement無hooks。所有測試用自身臨時DB／埠／合成授權，未重啟正式服務、讀正式憑證或修改Google教材；Phase 3 Excel政策與bytes未變，不重做已有效人工驗收。

### T054 Maintainer Review Pending

請核對兩張可見UI、上述鍵盤／即時／CSV一致性證據，以及本節、quickstart／spec／plan／data-model／contracts／tasks與實作及結果是否一致。T054與憲章V要求本階段人工核對，Phase 3確認不替代本項；未回覆不記通過。

目前T001–T053已勾、T054及以後未勾；本Phase尚未commit或merge，因此無Phase 4合併hash，未push或部署。取得本階段核對後才依T055提交、合併main並補hash，再開始Phase 5複製活動連結。

維護者回覆「確認一致，繼續」，完成Phase 4 UI／鍵盤驗證紀錄及文件的一致性核對。T054完成，據此依T055提交並合併，實際hash於合併後補記。

Phase 4實作提交ca784c9，合併main為5e19c4df64900caf06bd599249c217b198b9c0e4。依T055補記hash，無產品行為變更，未push。

## Phase 5 Implementation and Validation

T056：Phase 4已通過測試及維護者核對並合併main，補記hash後基準為677449fbd035902e124ef7b60951d7462f2fdcb6。本階段建立codex/003-phase-5-copy-link分支，僅處理US3複製活動連結。沿用已人工審查的copy-link.puml；不更動Google流程或資料庫。T057／T058先建立兩份E2E及隔離剪貼簿fixture，先執行RED再寫產品元件。

### Copy UI and Scope Evidence

ActivityPage以單一studentUrl提供顯示文字、anchor href及CopyActivityLinkButton；只允許HTTP／HTTPS、對應當場的student路徑且無userinfo／query／fragment，沒有有效連結時停用並說明。使用者click、Enter或Space直接呼叫writeText，沒有先等待網路。pending停用且以ref防同步連點；resolve後才顯示role=status「已複製活動連結」，拒絕或能力缺少顯示固定role=alert及可選取的唯讀網址，不顯示底層exception。URL可換行、焦點可辨識，回饋不只靠顏色。

兩份新增E2E共10項：copy-activity-link.spec.ts驗精確URL、三種啟用方式、使用者activation、pending、resolve／reject／能力缺少、手動完整選取、已知結果後1秒內回饋與零read；copy-link-scope.spec.ts以真實元件隔離host驗URL／活動、帳號authGeneration、bootId、sessionVersion、卸載及無連結。舊promise完成不解鎖新pending或顯示新成功，不再次主動寫入舊URL；不宣稱撤回已交給瀏覽器的寫入。所有剪貼簿呼叫都是context注入的模擬物件，沒有讀寫使用者實際剪貼簿或使用正式瀏覽器profile。

先跑兩份新增測試，10項均RED：4項因按鈕不存在，6項因尚無元件導致隔離host bundle失敗；紀錄red.log保留。完成實作後10項皆通過（10.8秒），再執行完整Gate，沒有刪斷言或放寬時間門檻。

已實際檢視兩張合成資料截圖：

- 成功及鍵盤焦點：validation-results/feature-003-phase-5/copy-resolve.png
- 失敗及已完整選取的手動網址：validation-results/feature-003-phase-5/copy-reject.png

### Phase 5 Gate Results

| 指令                     | 實際結果               |
| ------------------------ | ---------------------- |
| npm run typecheck        | exit0                  |
| npm run lint             | exit0                  |
| npm run format:check     | exit0                  |
| npm run test:unit        | exit0，25檔115項       |
| npm run test:integration | exit0，21檔95項        |
| npm run test:contract    | exit0，10檔19項        |
| npm run test:e2e         | exit0，43項，36.1秒    |
| npm run build            | exit0，三workspace成功 |

合計272項（Phase 4的262＋10項新增E2E）通過，涵蓋原CSV下載、雙視角、歷史更新、授權隔離、學生隱私與自動回填回歸。完整結果在validation-results/feature-003-phase-5/final-results.json及final-\*.log。四張已審閱PlantUML未修改，重新-checkonly及-tsvg皆exit0，四份非空有效SVG位於同目錄diagrams。003九份Markdown另做明確格式、連結、任務及範本檢查，git diff --check通過。

本階段只新增UI／測試與同步文件，沒有新API、Socket欄位、資料表、migration、Google scope或Google呼叫；未停止正式服務、修改Google教材或讀取正式資料與憑證。Phase 3 Excel已有效的人工作業及限制繼續適用，CSV bytes／安全文字政策未變。extensions.yml仍不存在，沒有before／after_implement hooks。

### T063 Maintainer Review Pending

請核對本節、quickstart及上述兩張介面截圖與實作／測試結果是否一致。T063及憲章V要求本階段UI／AI文件人工核對，Phase 4確認不能替代。現在T001–T062完成，T063／T064及Phase 6保持未勾；本階段尚未commit或merge，無Phase 5合併hash，未push或部署。取得本階段確認後，才依T064提交合併並開始Phase 6最終驗收。

維護者明確回覆「Phase 5 文件與介面已核對，內容一致」，T063完成。依T064提交並合併main，實際hash於合併後補記。

Phase 5實作提交6fc2e0b，合併main為522f5a9a9c27083574138625faaa111cfef25251。依T064補記hash，未push或部署。

## Phase 6 Final Validation and Review

T065：Phase 5測試、人審及合併完成，補記hash後從main基準0caaf1ece9862befa960d4184311f05c1eb891aa建立codex/003-phase-6-final。本階段未修改產品程式或設計流程，只補跨功能／並行／精確畫面驗收及同步文件；四張原已審閱PlantUML保持一致並重新檢查及渲染。

### T066–T067 Continuous and Concurrent Acceptance

result-export-workflow.spec.ts第一案例從兩組完整題組作答開始，結束後worker自動回填並讀回確認，只寫一次。接著核對全場／逐題順位、目前CSV、同場歷史CSV bytes一致、複製正確學生URL，再重新整理並開啟同場歷史。這些新增操作前後比較SQLite所有資料表完整rows相同，原回填答案及寫入次數相同。Google adapter為隔離合成來源；沒有CSV教材中介流程。

第二案例精確補驗SC-007：四組、六題且末題有兩個子題，40字自訂組名、多行完整答案、1280×720，Space切視角、選題、聚焦可捲動表格，完整組名及兩子題皆可辨識。實際檢視的畫面為validation-results/feature-003-phase-6/four-groups-six-questions.png。原先各案例分別覆蓋六題及題組，最終核對後另補此組合，不以分散案例冒充指定組合。

result-export-performance.test.ts使用真實臨時HTTP／SQLite／Socket.IO及實際時鐘。標準30組、20題、40資料列、600筆受理／1200答案的完整匯出最終59ms；並行案例在同規模fixture的合法答案增加1800個中文字，以觸發產品encoder合作式讓出：匯出121ms，另一老師活動受理答案並送達教師更新100ms，受理ack發生時生成仍在進行（answerDuringGeneration=true）。另一owner不能下載該歷史；同session兩次後429，另一同owner session可下載。真實HTTP取消傳入生成中，實際得到EXPORT_BUSY並完成finally釋放後可再次生成；沒有mock時間、替換encoder或放寬5秒／2秒門檻。

初次並行測試因預覽與建場必要讀取共兩次，誤寫固定Google read=1而失敗；改為在活動開始後保存Google計數、比較匯出前後不變，保持「新增功能不呼叫Google」的原斷言目的。第二案例最初合成教材錯將題組標籤與答案格合併，修正fixture；下一次因文字定位漏掉實際顯示的「（2）」標籤而失敗，改為精確核對帶標籤的完整題目。錯誤紀錄保留，沒有更動產品來迎合fixture、刪除核心斷言或增加timeout。

### T068 Final Gate Results

| 指令                     | 實際結果               |
| ------------------------ | ---------------------- |
| npm run typecheck        | exit0                  |
| npm run lint             | exit0                  |
| npm run format:check     | exit0                  |
| npm run test:unit        | exit0，25檔115項       |
| npm run test:integration | exit0，21檔96項        |
| npm run test:contract    | exit0，10檔19項        |
| npm run test:e2e         | exit0，45項，37.8秒    |
| npm run build            | exit0，三workspace成功 |

合計275項（Phase 5的272＋1項整合＋2項E2E），未取代的既有案例全部保留。首次完整Gate八指令皆exit0（當時44項E2E）；補精確SC-007後只修改測試及UI fixture，再執行typecheck／lint／format／全部45項E2E／build皆exit0。unit／integration／contract及產品未再改，沿用同Phase有效實測，不重跑未受影響層級。結果在validation-results/feature-003-phase-6/final-results.json、final-_.log及recovery-results.json、recovery-_.log。

四圖-checkonly及-tsvg皆exit0，四份非空有效SVG在同目錄diagrams；九份003 Markdown明確Prettier、77本機連結、74項連續任務、範本殘留與git diff --check另驗。另執行audit-source.ts生成的隔離SQLite核對：17表110欄、data-model 40處資料庫欄位引用正確、26項FR／10項SC均有驗收矩陣引用、需求品質清單16／16。移除spec標題仍殘留的範本操作提示，沒有未填內容。

### T069–T071 Requirement and Model Reconciliation

| 範圍                                  | 核對證據                                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001–FR-009；SC-001–SC-003          | answer-order／csv-export unit、export-read-snapshot integration、result-export HTTP／schema contract；完整題組共用順位，零／全／部分受理及未加入組，整筆非winner提交遺失拒絕，不誤列未作答                |
| FR-010–FR-014；SC-004–SC-005          | csv-export／export-filename unit、真實下載bytes及Phase 3 T041 Excel人工；BOM／逗號／引號／多行／安全文字／臺灣午夜／完整ID與整理名稱                                                                      |
| FR-015–FR-017；SC-009                 | result-export／export-read-snapshot／performance integration、export-gate unit及HTTP錯誤contract；1,000,000格／32MiB、Excel邊界、busy／限流／deadline／取消、離線Google仍可下載，無教材中介檔             |
| FR-018–FR-021；SC-006–SC-007          | answer-order／answer-order-history E2E、精確四組六題含題組案例；兩視角與CSV一致、live history≤2秒、ended唯一同步、長文與鍵盤焦點                                                                          |
| FR-022–FR-023；SC-008                 | copy-activity-link／copy-link-scope E2E；同一完整URL、三種啟用、真實user activation、pending／成功／拒絕／無能力、手動選取與1秒回饋                                                                       |
| FR-024–FR-026；SC-003、SC-007、SC-010 | 下載／歷史／複製晚回覆E2E、owner-isolation／secret-exposure／persistent-secret-exposure／result-export-secret-exposure、atomic-group-answer及原worker／重啟回歸；新操作前後所有DB rows／Google writes不變 |

data-model的DB引用已實際對照schema；AnswerOrderInput／OrderedAnswer／QuestionOrder／AnswerOrderView對照shared schemas及projection，Download／Copy／OperationScope對照frontend元件及download，HistoryLive對照原場訂閱與一次重讀狀態。typecheck及contract確保實際使用欄位，既有wire未變；沒有新增DB欄位、永久排名、migration、Google API scope或新Google呼叫。

T069引用Phase 3有效人工Excel證據：Microsoft Office執行檔16.0.20625.20108、zh-TW，維護者從檔案總管直接開啟40列／63欄CSV，確認公式樣式文字未計算、逗號／引號／換行同格。git比對Phase 3實作提交6a2a254至目前，csv.ts及filename.ts無改動，因此不重做未受影響人工驗收。舊式文字匯入精靈的CR／LF拆列限制仍保留，不能推論其他Excel版本或另存重開皆安全。

### T072 Final Review Package and Limits

支援及本次驗證版本為Node24.22.3（引擎>=24.22.3 <25）、TypeScript5.9.3、React19.2.0、Express5.1.0、Socket.IO4.8.1、Vitest4.0.13、Playwright1.56.1的本機Edge channel與node:sqlite。此數據是本機合成驗收實測，非所有硬體的效能保證；容量超限明確拒絕，不截斷。剪貼簿能力受瀏覽器限制，有手動備援；已交給瀏覽器的寫入／下載不能承諾撤回。CSV可能有安全文字前綴，原答案保持不變，轉存／其他程式仍須確認文字處理。

所有新增驗收只用自身臨時資料庫、埠、合成Google及模擬Clipboard，不重啟正式服務、不使用正式資料／憑證或寫Google教材；驗收產物與logs均Git排除，git check-ignore已確認。沒有截圖、trace、DB、Google憑證或可重用cookie新增至Git；秘密檢查測試只比對合成標記，不輸出其值。extensions.yml不存在，before／after_implement沒有hooks。未push、部署或再變更教材。

### T073 Final Maintainer Review Pending

請核對本Phase新增驗收、指定畫面截圖、完整Gate、FR／SC／欄位對照、Excel人工證據沿用與限制，以及quickstart／spec／plan／data-model／contracts／tasks是否與實際結果一致。依T073與憲章V「AI產生或修改的文件必須由人工審查」，Phase 5核對不替代最終審查。目前T001–T072完成，T073及T074未完成；Phase 6尚未commit／merge，沒有最終合併hash。確認後才提交合併main並補hash，核對全部74項及工作樹。

維護者針對上述最終審閱包回覆「沒問題，繼續」，確認內容一致並授權完成合併；T073完成。依T074提交Phase 6並合併main，實際hash與最終狀態於合併後補記。

### T074 Final Merge Evidence

Phase 6實作與驗收提交為fcdd310，合併main為9a30eae152a9395c90cd91b58ce6dd793ad7a7e8。T001–T074全數完成，六個Phase各自使用新分支並於測試及人工核對後依序合併。合併後只同步完成狀態與hash，未修改產品或測試；重新檢查九份文件格式、77連結、74項任務／零待辦、四圖及欄位對照。工作樹於最後文件提交後核對，未push或部署。前述待審段落保留各階段歷史狀態，以本節最終證據為準；既有Excel及瀏覽器限制不變。

## Phase 7 Convergence Fix and Validation

T075來自converge F1：非200且宣告application/json的損壞回應，使response.json()拋出包含本文片段的SyntaxError，原按鈕將error.message直接顯示。從main基準916dacbc55118cbb15b6ecf95c30bec2602e91af建立codex/003-phase-7-safe-download-errors，保留已追加任務及原有成果。requirements品質清單16／16，沒有未完成清單項目；既有ignore已涵蓋臨時DB、build、測試產物及機密，不另新增依賴。

實作前核對原已審閱export-sequence.puml的safe error及JSON失敗路徑、architecture的safe JSON error邊界。此次只落實既有錯誤契約，沒有改互動、wire、API、活動狀態或資料流程，四圖不須改動；重新checkonly／tsvg皆exit0，四份非空有效SVG在validation-results/feature-003-phase-7/diagrams。

### T075 Test-First and Error Boundary

先新增6項E2E：非200損壞JSON、空白JSON、response.json()非預期例外、成功CSV回應的body讀取例外、合法EXPORT_BUSY及未知錯誤碼。實作前4項失敗、2項既有行為通過（40.5秒）；不是將合法錯誤碼案例造假為RED。新增單元邊界案例也先失敗，因downloadErrorMessage尚不存在，其餘16項當次未執行、不計為失敗。

download.ts現在只由模組內DownloadFailure承載本地固定訊息：合法JSON只取allowlist code，維持原有安全提示；損壞JSON及非預期例外轉固定中文「無法匯出結果，未開始下載。」；TypeError維持固定連線失敗提示，沒有帶入原始exception或cause。ExportResultsButton透過downloadErrorMessage顯示訊息，任意Error或字串，即使偽造DownloadFailure的name，也不被當成安全訊息。原scope、epoch、AbortSignal及objectURL清理保持有效，不增加logger。

修正後新增6項E2E皆通過（12.6秒），實際驗證畫面與browser console／pageerror不含無效合成標記、下載事件為0、不顯示已開始下載且按鈕恢復；合法EXPORT_BUSY維持原中文訊息。下載單元測試17項全過，含新增的任意錯誤與偽造name防護，合法模組錯誤仍可取得指定提示。紀錄red.log、red-unit.log、target-e2e.log保留在本Phase validation-results子目錄；僅使用自身臨時DB／埠／合成Google，不讀正式資料、憑證或瀏覽器profile。

### Phase 7 Full Gate Results

| 指令                     | 實際結果               |
| ------------------------ | ---------------------- |
| npm run typecheck        | exit0                  |
| npm run lint             | exit0                  |
| npm run format:check     | exit0                  |
| npm run test:unit        | exit0，25檔116項       |
| npm run test:integration | exit0，21檔96項        |
| npm run test:contract    | exit0，10檔19項        |
| npm run test:e2e         | exit0，51項，41.2秒    |
| npm run build            | exit0，三workspace成功 |

合計282項（原275＋1項unit＋6項E2E），所有未取代既有案例保留。首次完整執行的前六指令均exit0，之後驗證行程在E2E內的frontend建置途中中斷，沒有該段完成結果，不計為通過；保留final-test-e2e.log，重新執行全部E2E及build皆exit0，結果在validation-results/feature-003-phase-7/recovery-results.json、recovery-_.log。前六指令證據在同目錄final-results.json、final-_.log，產品與測試未在兩次執行間改動。未把行程中斷稱作產品測試失敗，也未沿用前Phase測試數冒充本Phase。

本Phase原正常匯出、BOM／檔名、兩視角、Clipboard、重啟與帳號隔離、scope取消、Google直接讀寫／自動回填回歸均通過。原指定規模標準匯出42ms，並行匯出101ms、另一場收答及教師更新84ms，沒有新增效能限制或DB／Google副作用。CSV編碼／安全文字／檔名未修改，沿用原有效Excel人工證據及舊式匯入精靈CR／LF限制，無須重做不受影響人工開檔。

九份003 Markdown明確Prettier、77本機連結、75項連續任務、四張有效SVG、範本殘留0及git diff --check另驗。T001–T074完成，T075仍包含本階段人工文件核對與合併，故保持未勾，不能只因程式測試通過就提前完成。沒有新增套件、DB表、migration、HTTP／Socket欄位、Google呼叫、診斷log或真實憑證；所有驗收產物仍Git排除，未主動停止或重啟正式服務、修改Google教材、push或部署。extensions.yml不存在，沒有before／after_implement hooks。

### T075 Maintainer Review Pending

請核對本Phase的缺口、修正、先失敗後通過證據、最新282項測試結果與執行中斷說明，以及spec／plan／contracts／quickstart／tasks與實作是否一致。T075明確要求本階段人工文件核對後才合併，憲章V規定「AI產生或修改的文件必須由人工審查」。先前Phase 6核對不替代本項；目前尚未commit／merge，沒有Phase 7實作／合併hash。取得核對後才完成提交合併main、補hash及勾選T075。

維護者回覆「確認無誤」，完成Phase 7文件與實測一致性核對。據此依T075提交並合併main；實際hash與任務完成狀態於合併後補記。

### T075 Final Merge Evidence

Phase 7實作提交6722c67，合併main為8f6fd0ecab717926a3283112cadbc347ef060d4a。維護者核對完成後才合併，T001–T075全部完成。合併後僅同步完成狀態與hash，沒有產品或測試變更；重新檢查九份文件格式、77連結、75項任務／零待辦、四張有效SVG及git diff --check，最後文件提交後確認main工作樹乾淨。前述待審文字保留階段歷史，以本節為最終狀態。未push或部署，既有Excel與瀏覽器限制不變。
