# 第二版設計審查與驗證紀錄

日期：2026-11-25。憲章1.0.0。Phase 1–3已合併；Phase 4學生流程已實作並完成Gate，待本階段文件人工核對，後續故事仍在開發中。

## Review Status

AI 已核對現有程式接點、規格、研究、資料模型、契約與六圖的一致性，並執行下列工具驗證。
**新版人工設計審查T002及Phase 1–3實作後文件核對均已通過**；各Phase實測及合併紀錄見本文後文。
依憲章 I 與 V，任務必須保留實作前設計審查及合併前依實際行為核對文件的門檻。
此處記錄待辦，不阻止本次產生可供審閱的規劃文件，也不要求重新確認使用者已指定的SQLite。

## Design Traceability

| 圖                  | 對應需求／設計                        | AI 核對重點                                                         |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| architecture.puml   | FR-001、FR-023–FR-024、FR-028、FR-031 | 單行程雙listener、owner guard、短交易、DB不含可重用機密             |
| account-source.puml | FR-002–FR-007、FR-025–FR-026、FR-028  | OAuth主鍵、分頁、唯讀、首張、確認前重驗、切帳號不洩漏               |
| lifecycle.puml      | FR-007–FR-009、FR-017、FR-026–FR-027  | active自動恢復、waiting不顯題、ended不重開、壞檔不重建空DB          |
| submission.puml     | FR-010–FR-018、FR-024                 | join鎖名、同搶組、共同排序、重送／逾時、end競爭、commit先於ack      |
| writeback.puml      | FR-017–FR-022、FR-027、FR-031         | end/results/job原子、原owner／sheetId、整題組、未知先查核、無答不寫 |
| teacher-ui.puml     | FR-013、FR-025、FR-029–FR-030         | 核心先過再優化、組別列與題目欄、完整名、文字狀態、例外操作          |

資料模型含活動級與帳號級收據：create/settings尚無activityId時仍可去重。
匿名participant UUID與Cookie digest分離；teacher sub不可由client提供。
工作表index只用於建場首張選取，後續用穩定sheetId，純改名／排序不切換到別表。
Google寫入不是跨系統exactly-once；outbox與readback避免漏工作及盲目重送。

## Tool Validation

使用本機已安裝Java及官方PlantUML v1.2026.10，JAR和渲染輸出位於Git排除的validation-results。
以下為本次實際執行的工具，不是新增npm script。

| 指令／檢查                                                                                                                                                                                                                                              | 結果                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `.specify/scripts/powershell/setup-plan.ps1 -Json`                                                                                                                                                                                                      | exit0，已為002解析並複製規劃範本，後續已完整填寫               |
| `node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync(':memory:'); process.stdout.write(JSON.stringify({node:process.version,...db.prepare('select sqlite_version() as sqlite').get()})); db.close();"` | exit0，Node v24.22.3／SQLite3.54.1；僅記憶體探測，不建立正式DB |
| `java -jar <工具路徑>/plantuml.jar -checkonly <功能目錄>/diagrams/*.puml`                                                                                                                                                                               | exit0，六圖語法檢查通過                                        |
| `java -jar <工具路徑>/plantuml.jar -tsvg -o <驗證輸出目錄> <功能目錄>/diagrams/*.puml`                                                                                                                                                                  | exit0，六圖SVG成功產生                                         |

上表工具路徑以描述表示本機安裝位置，實際可重現指令見quickstart的PLANTUML_JAR用法。
另執行 `node validation-results/feature-002-plan/check-artifacts.mjs`：11/11項通過，涵蓋必要產物、
範本完整性、連結、需求／釐清計數、SQLite指定、六張最新SVG與品質清單16/16。
執行 `node node_modules/prettier/bin/prettier.cjs --ignore-path .gitignore --check "specs/002-optimize-classroom-workflow/**/*.md"`：exit0。
六圖PNG已由AI檢視文字與流程；補正首張無題判斷及回填進行中顯示後重新語法檢查／渲染。
重新渲染覆蓋舊輸出時曾遇到寫檔警告，改用新的 `rendered-reviewed` 輸出目錄成功產生六圖；
產物檢查確認每張SVG時間均不早於原始puml，未把舊圖視為最終驗證。
未註冊 `.specify/extensions.yml`，before_plan／after_plan hooks 均無須執行。
本次僅文件／圖設計與runtime探測，不執行功能測試，不宣稱SQLite持久化或新版Google流程已通過。
真實Google授權、兩帳號隔離、UI、多瀏覽器、DB故障及服務重啟測試於實作階段依quickstart完成。

## Maintainer Review Checklist

- 核對三項釐清與SQLite指定均已反映於規格、模型、契約和圖。
- 核對組別與答案commit才成功、end與job同交易、所有owner授權與推播一致。
- 核對Phase順序、逐階段分支與測試合併門檻、UI最後優化符合預期。
- 實作後逐項對照程式、測試及真實操作，修正文案再記錄審查日期與結論。

此處為規劃階段原審閱範圍；最新人工審查與各Phase狀態以下方執行紀錄為準。

## Task Generation Validation

2026-11-25 已依speckit-tasks產生 tasks.md，共101項、8個實作Phase，全部尚未勾選。
US1有17項、US2有14項、US3有14項、US4有15項、US5有10項；其餘31項為Setup、Foundation及Final。
18項標記[P]，只適用同Phase、前置完成後不同測試檔的工作，不跨Phase並行。
plan.md 的實作階段表已同步至相同8Phase，未改變核心驗收通過後才統一優化UI的順序。

本次執行 `node validation-results/feature-002-tasks/check-tasks.mjs`，exit0、13/13項通過：
任務編號與格式、story標籤、明確檔案路徑、分支及merge門檻、105個canonical欄位逐項引用、
所有引用可解析、各故事平行例子與獨立測試、文件連結及範本完整性。
執行 `node node_modules/prettier/bin/prettier.cjs --ignore-path .gitignore --check "specs/002-optimize-classroom-workflow/**/*.md"` 驗證全部本版Markdown格式。

此為任務文件驗證，不是功能測試；未建立實作分支、未建正式DB、未呼叫真實Google或停止既有服務。
尚無before_tasks／after_tasks hooks設定；新版人審仍待完成，不因產生任務而標記通過。

## Analysis Remediation

2026-11-25 使用者明確要求調整唯讀分析提出的三項問題，已修改設計／任務文件，未修改業務程式。

| 問題                               | 修正與再次核對                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1 HIGH：Phase 3舊來源測試移轉缺漏 | T038明確納入source-http／source-preview、相關fixture及所有舊create／source呼叫；T039前完成，保留既有安全／錯誤案例，不延至後Phase                           |
| I2 HIGH：E2E隔離晚於SQLite正式接入 | T005於Phase 1配置Playwright絕對臨時DATABASE_PATH及清理；T034接入前必要完成。T078僅沿用並驗證重啟情境同DB，不再首次配置隔離                                  |
| U1 MEDIUM：重試策略未完整定義      | data-model.md新增Retry Policy，定義每cycle寫入3次及退避、查核失敗4次及退避、持久計數／排程、restart不歸零、未知滿限保持pending、owner明確retry去重開新cycle |

plan.md、research.md、contracts/interfaces.md、quickstart.md及writeback.puml已同步；
T017／T060／T062實作任務引用新增的五個canonical欄位，T058驗證上限／時鐘／crash／去重邊界。
任務維持101項、8個Phase、18項[P]，全未勾選；模型欄位由105增為110，逐項引用仍完整。

再次執行 `node validation-results/feature-002-tasks/check-tasks.mjs`：exit0，13/13通過，110/110欄位引用覆蓋。
PlantUML `-checkonly`與`-tsvg`均exit0，六張最新SVG產於validation-results/feature-002-remediation/rendered-v2。
Markdown以明確指定specs目錄的Prettier指令檢查；本次未執行新版功能測試，不宣稱重試或資料庫功能已實作。
人工設計／文件審查仍待維護者，修訂後圖須納入T002及各Phase既定人審門檻。

## Phase 1 Execution: T001 and T002 Review Package

2026-11-25 已從main的 `042728d` 建立 `codex/002-phase-1-setup`，T001完成。
開始前只有 `specs/002-optimize-classroom-workflow/` 為未追蹤的本版規劃產物；已原樣保留，未reset或覆寫使用者修改。
requirements.md清單16/16通過，未變更清單標記；沒有extensions hooks。
目前只準備T002審閱資料及驗證佐證，尚未變更業務程式、正式資料庫或既有Google服務。

### T002 Design Review Scope

維護者核對以下六圖與所引用的預定契約，確認設計符合教學活動需求後，才可將T002標記完成。
這是新版實作前設計審查，不代表尚未開發的功能已驗收通過。

| 圖與文件                                                                                 | 本次需確認的決策                                                                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [architecture.puml](diagrams/architecture.puml)、[plan.md](plan.md)                      | 維持TypeScript／Socket.IO、單行程雙角色listener；SQLite保存業務資料，成功ack先commit                      |
| [account-source.puml](diagrams/account-source.puml)、[介面契約](contracts/interfaces.md) | 授權後由清單選表、永遠讀index=0工作表；保存原sheetId回填；唯讀或首張無題不能建場                          |
| [lifecycle.puml](diagrams/lifecycle.puml)、[資料模型](data-model.md)                     | active重啟自動續答、原組名／答案／順序不變；教師歷史須授權原建立帳號，學生續答不需等OAuth                 |
| [submission.puml](diagrams/submission.puml)                                              | 必填名稱一次占組後鎖定；waiting不送題目；完整題組同送；共同序列裁決且重送不重複受理                       |
| [writeback.puml](diagrams/writeback.puml)、[Retry Policy](data-model.md#retry-policy)    | end/results/job同交易、自動精確回填；每題每輪寫入上限3、連續查核失敗上限4，持久計數，未知不盲重寫／不誤報 |
| [teacher-ui.puml](diagrams/teacher-ui.puml)、[tasks.md](tasks.md)                        | 故事1–4核心驗收通過後才統一UI；教師完整組名表格；每Phase新分支、通過測試及人審後merge main                |

另確認T005已提前Playwright臨時DB隔離、T038已同Phase移轉舊來源測試；不在測試中讀寫正式DB。
新版OAuth增加Drive清單及帳號識別能力，需要使用者在瀏覽器重新授權，不匯出權杖。

T002人工審查結論：維護者於2026-11-25明確回覆「已核對，設計符合需求」，新版設計審查通過，T002完成。
此結論限於上述預定設計；各Phase實作後文件仍須依實際結果核對，不能先宣稱未實作功能通過。

### Phase 1 Implementation and Validation

T003–T006完成，T007待本階段文件核對後合併。此階段不改業務流程，正式活動仍沿用第一版行為。

| 任務       | 實際變更與核對                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T003       | package.json與package-lock.json根套件engines一致改為Node >=24.22.3 <25；runtime probe v24.22.3、SQLite3.54.1，僅用記憶體DB                                                                      |
| T004       | .gitignore／.prettierignore排除data、SQLite主檔及sidecars／備份；eslint忽略validation-results、data、backups。8個示範產物路徑均被git忽略，migration原始碼不被忽略                               |
| T005       | tests/helpers/temporary-database.ts只刪核對過的本次臨時子目錄；process-harness.ts以獨立Node及IPC執行、不繼承任意父行程機密；合成帳號／工作表／長名fixture已建立                                 |
| T005 E2E   | playwright.config.ts在測試服務啟動前取得專屬絕對DATABASE_PATH；worker沿用該run的目錄、不註冊刪除，config主行程結束且web server已停止後清理；不使用既有正式服務或Google瀏覽器設定檔              |
| T005 tests | 新增tests/unit/test-support.test.ts共4項：隔離與sidecars清理／保留另一測試資料、拒絕正式DB覆寫、子行程IPC／restart續用測試資料、行程先退出時拒絕未完成等待。先因helper不存在失敗，實作後4/4通過 |

| 本次實際指令               | 結果                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| npm run typecheck          | exit0                                                                       |
| npm run lint               | exit0                                                                       |
| npm run format:check       | exit0                                                                       |
| npm run test:unit          | exit0，38項（原34加新4）                                                    |
| npm run test:integration   | exit0，20項                                                                 |
| npm run test:contract      | exit0，7項                                                                  |
| npm run test:e2e           | exit0，5項；3010／3011及獨立臨時DATABASE_PATH                               |
| npm run build              | 已由test:e2e先行實際執行，shared／backend／frontend全通過，不額外重複建置   |
| PlantUML -checkonly／-tsvg | exit0，六圖已重新產生於validation-results/feature-002-phase-1/design-review |
| git diff --check           | exit0；涉及的文字檔已保持LF                                                 |

合計70項自動測試。第一次沙箱執行integration／contract因127.0.0.1連線EACCES失敗；
在允許隔離本機測試連線的環境重跑後20／7項全通過，未修改測試來略過安全檢查。
E2E結束後檢查本次classroom-buzzer-test-\*臨時目錄無殘留；兩次測試資源建立取得不同路徑的情境由新測試驗證。
沒有建立正式SQLite DB、執行新版自動回填或變動Google原表；本次70項不代表第二版業務功能已完成。
Node24執行npm CLI時使用本機runtime的node及明確PATH，未讀取或複製原服務憑證環境。

Phase 1維護者文件核對範圍為本節、上述6個新增測試支援／fixture／測試檔，以及runtime／ignore／Playwright設定。
核對本節是否與實際變更及結果一致；通過後才執行T007 commit／merge main，並開始Phase 2。
Phase 1文件核對結論：維護者於2026-11-25明確回覆「Phase 1 文件已核對，內容一致」，本階段實作後文件核對通過。
T007已完成：實作commit `daa6900`，合併main commit `774bebc`，T001–T007全數完成。
此後僅於同一Phase 1分支補記上述既成結果，再fast-forward回main；未改已通過測試的程式。未push遠端。

## Phase 2 Execution

2026-11-25從最新main `ce5e516` 建立 `codex/002-phase-2-foundation`，T008完成。
Phase 1測試／新版設計與實作後文件審查均已通過；本Phase先撰寫SQLite實檔／交易／匿名身分測試，
再完成基礎實作。尚不將新持久化服務接入正式listener，正式切換留US1。

### Phase 2 Implementation and Validation

T008–T022完成，T023待本階段文件人工核對後合併。以下為已實作的基礎API，非已上線的新版UI／Google流程。

| 範圍                   | 實作與測試證據                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T009–T011 測試先行     | 三份新增測試先因connection／persistence helper不存在而失敗；實作後共16項新案例通過                                                                                                        |
| T012 SQLite            | connection.ts／migrate.ts及001-core.ts：本機檔案、WAL／FULL／FK／busy_timeout、checksum與版本、quick_check／FK與slot檢查；未知／壞檔拒絕，不fallback空DB                                  |
| T013–T017 repositories | account、activity、participation、receipt、writeback repository及factory；17張表含migration registry，依110個模型欄位定義PK／FK／唯一性／JSON／狀態約束，業務方法補充UTF-16長度及跨表驗證 |
| T018 可靠命令          | unit-of-work與command-service：同步BEGIN IMMEDIATE、commit後hook、指紋與穩定requestId去重；業務拒絕先rollback再保存安全拒絕收據，暫時儲存失敗不保存成功收據                               |
| T019 匿名恢復          | createSessions可注入participation repository；student Cookie原值只在瀏覽器／記憶體，DB存SHA-256摘要與UUID；重開session找回原身分並重建CSRF；teacher session不持久化。未注入時保留既有行為 |
| T020 安全錯誤          | 新增契約指定錯誤碼及SQLite錯誤轉譯，不輸出SQL／檔案路徑／原始例外；receipt只保存白名單業務結果，敏感欄位拒絕並rollback                                                                    |
| T021 測試注入          | tests/helpers/persistence.ts提供臨時DB／repos／commands及cleanup；classroom-server、source-server、writeback helpers可選接入此隔離上下文，原Google double與舊流程仍保留                   |

新增5項SQLite連線測試、2項持久身分測試、9項durable command整合測試，共16項。
實檔涵蓋唯讀／鎖忙／壞檔／未知schema／checksum／新版本／磁碟滿、首答與全域slot、命令去重／rollback、
匿名原值不落盤、設定按帳號分離、組名鎖定、完整成功題組與job／retry欄位上限／過期cycle拒絕。
另以真正獨立Node子行程在commit前及commit後確認遺失前SIGKILL，分別確認回滾與原成功收據可讀回；未終止既有正式服務。
敏感欄位測試使用無效合成值，確認拒絕的outcome不進DB／WAL／SHM，並保持原revision。

| 本次實際指令             | 結果                                          |
| ------------------------ | --------------------------------------------- |
| npm run typecheck        | exit0                                         |
| npm run lint             | exit0                                         |
| npm run format:check     | exit0                                         |
| npm run test:unit        | exit0，45項                                   |
| npm run test:integration | exit0，29項                                   |
| npm run test:contract    | exit0，7項                                    |
| npm run test:e2e         | exit0，5項                                    |
| npm run build            | 已由test:e2e先行實際執行，三個workspace全通過 |
| git diff --check         | exit0                                         |

合計86項。需本機HTTP／Socket連線的測試在允許隔離loopback連線環境執行；測試DB／子行程皆為本次建立資源。
另以Node記憶體SQLite執行已建置的coreSchema，逐表PRAGMA table_info對照data-model.md：110欄位／17表全部相符，exit0。
任務／欄位文件檢查器已支援執行中的[X]進度標記，13/13通過；本版Markdown明確格式檢查亦通過。
E2E後classroom-buzzer-test-\*臨時目錄無殘留。根目錄正式DATABASE_PATH未啟用，仍保留第一版記憶體store與原Google服務。
worker排程／重試的欄位及CAS存取基礎已建立，但自動回填、OAuth清單、正式活動續答及歷史頁尚待後續故事；不把此基礎測試當作其驗收。

Phase 2文件核對範圍為本節、backend/src/persistence/全部模組、backend/src/activity/command-service.ts、
security/sessions.ts／participants.ts／safe-errors.ts、config.ts、shared錯誤schema與新增三份測試／隔離helper。
請以程式及上述結果核對本節；通過後才T023 commit／merge main，並開始Phase 3。
Phase 2文件核對結論：維護者於2026-11-25明確回覆「Phase 2 文件已核對，內容一致」。
T023已完成：實作commit `000ff01`，合併main commit `4f35e7e`，T008–T023全數完成。
其後只在同一Phase 2分支補記既成結果，再fast-forward回main，未改已驗證程式、未push遠端。

## Phase 3 Execution

2026-11-25從最新main `11085ca` 建立 `codex/002-phase-3-catalog`，T024完成。
先撰寫Google清單／OAuth／preview／create契約、清單邊界與首張選取測試；正式main只註冊新版來源入口，
獨立舊核心測試fixture可保留其既有記憶體服務，以便US2／US3分階段移轉，不能從正式HTTP選擇legacy入口。

### Phase 3 Implementation and Validation

T024–T039完成，全部Gate通過；T040須本階段文件人工核對後才commit／merge main。
本Phase只驗US1與既有回歸，不宣稱學生新規則、自動回填、歷史或全站UI已完成。

| 範圍                     | 實作與核對                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T025–T027 測試先行       | 新增catalog契約／清單整合／首張unit先因缺少模組失敗，再完成服務；補OIDC／Drive SDK、過期／權限變動／來源變動／競爭建場／owner訂閱與E2E                                                                                                                                                                                              |
| T028–T030 帳號及清單     | oauth.ts保存state、nonce、5分鐘期限與代次；sheets-client經Google SDK驗ID token audience／簽章／issuer／期限後比對nonce，僅公開帳號upsert DB。drive-client只列原生未刪除試算表，跳脫query、支援shared drives、canEdit與incompleteSearch；cursor不暴露provider token                                                                  |
| T031 首張                | worksheet-selection按properties.index=0且唯一選取，hidden照讀，非GRID／無題不fallback；sheets-client僅下載選中sheet的cells，以sheetId讀回時不隨重排／改名換表                                                                                                                                                                       |
| T032–T033 預覽及建立     | catalog-service.ts集中預覽與原子建場協調，避免拆分後重複權限／代次規則；復用source-service的teacher preview投影、activity-repository與command-service，未另建重複create-activity.ts。preview綁session／owner／generation／expiry，建立前重讀權限、首張與指紋；來源與題目／組別／slot／account receipt同交易；重送不重建，競爭只一場 |
| T034 正式接入            | main先初始化SQLite及repos／persistent sessions，再註冊新來源入口及雙listener；初始化失敗只記安全碼、不listen。來源快照持久保存並可重新載入；學生命令完整持久化與跨boot續答在US2／US4，不以此過渡store bridge冒充完成                                                                                                                |
| T035–T036 schema及基本UI | strict account／catalog schemas、搜尋與分頁、同名識別、唯讀提示、首張mapping核對、組數確認建場與錯誤文字；未做全站美化。沒有URL／ID輸入欄位                                                                                                                                                                                         |
| T037 owner與代次         | HTTP及每次教師subscribe／command／push核owner；bootstrap只回自己的currentActivityId，未授權／他人不透露revision。切帳號清cache與前端舊資料、斷開舊教師socket，晚到清單回覆拒絕                                                                                                                                                      |
| T038 測試移轉            | source-server改為隔離SQLite catalogServer；activity.ts加入catalogClassroom合成授權→清單／preview→requestId建場；source-http、source-preview、writeback-http、results-writeback、secret-exposure均移轉。保留無效額外欄位、越權、網路錯誤、機密排除與待確認阻擋下一場；舊source／confirm及空create入口由契約測試明確拒絕              |

純reducer排序／Google來源演算法及回寫演算法fixture不註冊production listener，仍獨立測第一版核心；
正式main一律注入persistence，無HTTP參數可選擇legacy source分支。手動回寫路由在US3改為自動job；
本階段移轉回歸測試的建場入口，不把其舊手動回寫成功當作新版自動回填驗收。
所有Google值皆為無效示範／合成值；未讀正式DB、未讀取原服務權杖、未操作真實Google。

| 實際指令                   | 結果                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| npm run test:unit          | exit0，53項                                                               |
| npm run test:integration   | exit0，44項                                                               |
| npm run test:contract      | exit0，10項                                                               |
| npm run test:e2e           | exit0，6項Edge測試；測試專用DB及埠                                        |
| npm run build              | test:e2e內已實際執行，shared／backend／frontend全通過                     |
| PlantUML -checkonly／-tsvg | exit0，六圖重新產生於validation-results/feature-002-phase-3/design-review |

合計113項。首輪新增owner測試因預期錯誤碼寫為不存在的ACTIVITY_NOT_FOUND失敗，改用既定ACTIVITY_UNAVAILABLE後通過；
首次E2E有5通過／1失敗，原因是舊回寫測試仍找已移除的「建立下一場活動」按鈕；已改由新版preview確認建場檢查待回寫時禁用，6/6通過。
移轉writeback-http清理段遺留舊server變數曾被typecheck抓出並修正，重跑契約及E2E通過。未刪除安全案例或略過失敗。

六圖原始檔未修改；已對照T002通過設計：account-source與architecture的帳號／清單／首張／建場／owner路徑已實作；
lifecycle及submission本Phase僅接資料橋接與權限檢查，完整durable start／join／submit／resume待US2／US4；
writeback自動工作待US3，teacher-ui統一表格待US5。無新增未審查的業務流程。

Phase 3人工文件核對範圍：本節、quickstart新狀態與Phase 3節、plan狀態、contracts開頭的部分實作標示及tasks進度；
請以實際來源／帳號模組、前端SourcePage、SQLite建場及上述測試結果核對。確認後才執行T040合併並開始US2。

Phase 3最後複查另修正共用HTTP錯誤與session envelope可能帶出全域revision：未授權／他人活動及學生bootstrap均為0；
owner-isolation把目前活動revision設為7，確認他人bootstrap、HTTP拒絕與Socket拒絕仍回0，舊訂閱切換後無進度。
修正後重跑44項integration、10項contract及6項E2E皆通過；未重新宣稱尚未實作的學生題目隱藏已驗收。
最後format檢查發現4份檔案排版需更新，已Prettier修正後全數通過；無業務邏輯變更。

| 最後靜態／文件檢查                                                                       | 結果                               |
| ---------------------------------------------------------------------------------------- | ---------------------------------- |
| npm run typecheck                                                                        | exit0                              |
| npm run lint                                                                             | exit0                              |
| npm run format:check                                                                     | exit0                              |
| Prettier --ignore-path .gitignore --check specs/002-optimize-classroom-workflow/\*_/_.md | exit0                              |
| node validation-results/feature-002-tasks/check-tasks.mjs                                | exit0，13/13、101任務、110模型欄位 |
| git diff --check                                                                         | exit0                              |

此處程式核對由AI完成，尚不代替維護者的本階段文件人工核對。T040保留未完成，分支尚未合併。

Phase 3文件核對結論：維護者於2026-11-25明確回覆「Phase 3 文件已核對，內容一致」。T040人工文件核對通過，接續完成本階段合併；converge追加任務仍依原Phase順序執行。

T040已完成：Phase 3實作commit ca4da6f，合併main commit a9f5e4b；T024–T040全部完成。此後僅在原Phase分支補記既成結果再fast-forward回main，未push。

## Phase 4 Execution

2026-11-25從已完成Phase 3審查及合併的main cae2ce3建立codex/002-phase-4-students，T041完成。T042／T043先執行五個新測試：四個因waiting洩題或join未接受必填名稱而失敗；一個儲存失敗測試當時先被舊schema拒絕，後續須確認確實觸及SQLite故障，不能把該初始通過當作耐久性證據。依既有已審查submission／lifecycle圖實作，不改設計流程。

### Phase 4 Implementation and Validation

T041–T053完成，T054待本階段文件人工核對後才commit／merge main。Phase 5尚未開始。

| 任務                 | 實際變更與證據                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T042–T043 測試先行   | student-projections兩案例、atomic-group-answer初三案例先執行，四個按預期失敗；後加真正Socket競爭案例。儲存故障案例加強為必須回STORAGE_UNAVAILABLE，確認觸及SQLite，不接受單純schema錯誤當作故障證據                                                                                                 |
| T044–T046 驗證與交易 | groupNameSchema共用trim／1–40 UTF-16字；persistent-commands.ts整合既有command-service／repositories，正式join／start／submit持久保存、穩定participant及teacher owner actor收據、保存後刷新投影。group-reducer保留純核心fixture入口但共用命名規則與鎖定要求；rename對有效已授權角色均拒絕NAME_LOCKED |
| T047 投影與推播      | waiting學生questions空陣列、不含題號／item／來源；他組自訂名稱不出現在尚未結束的學生快照。teacher保留完整教材及進度。Socket原統一入口於持久命令返回後才ack／publish，自組receipt不含答案／sequence／時間                                                                                            |
| T048–T049 基本介面   | GroupPage先填名再點空組，一次確認後無改名控制；AnswerPage等待不建題目表單。fullGroupName統一第1組-名稱格式，老師全組答案明細、暫定／最終結果及現有回寫狀態均含完整名；特殊字元React純文字，尚不做作答表格美化                                                                                       |
| T050 重連            | 重新連線先取session確認boot／教師授權代次，subscribe完整快照；接受已確認新boot、拒絕舊boot／舊socket／舊代次與過期subscribe/retry回覆。服務端關閉連線後主動重新連接，不再要求換活動連結                                                                                                             |
| T051–T052 測試移轉   | classroom-server改用合成OIDC→preview→持久建場；舊匿名無名加入、改名成功及重啟必須新活動的預期已移轉。保留同Cookie多分頁／清Cookie不可接管、私密完整題組、原首答／排序／權限／限流及安全回寫案例；結果unit改驗鎖定組名仍保留在固定結果投影                                                           |

本Phase新增8項：student-projections 2、atomic-group-answer 4、跨boot比較器unit 1、anonymous-join-privacy Edge 1。
新測試涵蓋空白／41字拒絕不占組、40字／特殊字名、名稱trim、老師與學生rename拒絕、同request不同payload、
ack遺失重放、同搶一組只一成功、兩組近乎同時完整提交、漏答不配置序號、時鐘回撥仍按序號排序、end後提交拒絕、
SQLite query_only故障rollback且不先改Map、waiting封包無題目、開放兩學生≤2秒顯題與跨runtime原組名續答。
兩個既有瀏覽器案例也移轉至正式持久入口；clearCookie不可接管與同身分跨頁恢復仍保留。

| 實際指令                   | 結果                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| npm run typecheck          | exit0                                                                 |
| npm run lint               | exit0                                                                 |
| npm run format:check       | exit0                                                                 |
| npm run test:unit          | exit0，54項                                                           |
| npm run test:integration   | exit0，48項                                                           |
| npm run test:contract      | exit0，12項                                                           |
| npm run test:e2e           | exit0，7項Edge測試，隔離DB／埠與合成OAuth                             |
| npm run build              | 由test:e2e實際執行，三個workspace通過                                 |
| PlantUML -checkonly／-tsvg | exit0，六圖產生於validation-results/feature-002-phase-4/design-review |

合計121項。完整Gate之後未再改程式。最初回歸曾因舊結果測試仍預期空白組名失敗，修正為已確認名稱後通過；
首輪E2E 5通過／2失敗，一處仍嘗試填已移除的改名欄位，另一處發現server disconnect後未自動重連。
已移轉舊控制項並實作重連，最後7/7通過；未刪掉重啟情境或放寬為要求學生換網址。

圖對照：submission的atomic join／complete submit／receipt、lifecycle的waiting隱題與start、architecture的交易後ack均已接入；
原圖end/results/job、持久worker及history／完整行程恢復驗收仍由Phase 5–6完成，teacher-ui統一表格由Phase 7完成。
本Phase未改六圖原始檔及設計流程；新增persistent-commands.ts為既定交易入口的協調層，不新增業務規則或多行程服務。

範圍限制：end目前持久保存phase／ended_at／receipt，固定results與唯一job同交易在T059；不把目前end視為完整US3。
現有手動回寫的Map進度暫作橋接以保留回歸，跨訂閱保留但不宣稱可耐久恢復；Phase 5會以持久工作取代。
跨runtime Edge案例在同一測試行程內關閉舊listener／DB連線，再由同一臨時DB建立新store／sessions／listener並保留原埠／Cookie。
它驗證T050重訂閱層；Phase 6仍須三場歷史、真正獨立Node服務重啟、原答案與序號完整比較、真實Google及兩帳號驗收。
本次沒有停止既有正式服務、讀取正式DB／真實授權、操作真實Google或做統一UI美化。
Convergence T102–T118仍保留待辦，待原Phase全部完成後逐項以實測關閉，不能提前宣稱整體收斂。

Phase 4人工文件核對範圍為本節、quickstart新增Phase 4節與狀態、plan及contracts的部分完成標示、tasks進度；
請對照persistent-commands／角色投影、GroupPage／socket transport、完整組名及上述實測結果。確認後才T054合併並開始Phase 5。

Phase 4最後文件檢查：本功能Markdown明確Prettier檢查exit0，git diff --check exit0；任務結構唯讀檢查通過，118個唯一連續ID、9個Phase，T001–T053完成、T054–T118待辦，沒有提前勾選Convergence任務。E2E後本次臨時測試目錄無殘留。未設定extension hooks。

Phase 4文件人工核對結論：維護者於2026-11-25回覆「核對完成」，確認本階段實作與文件一致。T054人審門檻通過。

T054已完成：實作9317545，合併main b3da52f8，T041–T054完成；補記既成結果後fast-forward回main，未push。
