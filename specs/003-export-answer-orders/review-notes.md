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
