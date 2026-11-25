# 第二版設計審查與驗證紀錄

日期：2026-11-25。憲章1.0.0。Phase 1–4已合併；Phase 5自動回填已實作並通過141項測試，待本階段文件人工核對。

## Review Status

AI 已核對現有程式接點、規格、研究、資料模型、契約與六圖的一致性，並執行下列工具驗證。
**新版人工設計審查T002及Phase 1–4實作後文件核對均已通過**；各Phase實測及合併紀錄見本文後文。
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

## Phase 5 Execution

2026-11-25從Phase 4已審查合併的main e4079ee建立codex/002-phase-5-writeback，T055完成。T056–T058先執行新增測試：三個案例因job／worker缺少而失敗，另worker套件尚不存在而無法載入；完成後以真正worker、控制時鐘及實體DB／獨立子行程故障點補足測試，沒有以最初的存在性測試作完成證據。

### Phase 5 Implementation and Validation

T055–T067完成，全部Gate通過。T068須本階段人工文件核對後才commit／merge main，未開始Phase 6。

| 範圍                 | 實作與核對證據                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T056–T058 測試先行   | 新end/job與HTTP案例因缺少功能失敗，worker檔不存在而無法載入；最初存在性測試已被實體DB／控制時鐘／真正子行程與功能斷言取代，不以模組存在宣稱完成                                                                                                                                                                                             |
| T059 原子end         | persistent-commands.ts復用command-service，ended／ended_at、固定逐題results、唯一job、完整expected／target及成功receipt同交易；job插入失敗全部rollback、重送同request回原結果、新request重複end拒絕、零成功組存verified零項工作。persistent-store依固定winner及expected投影，不重新按目前提交另選成功組                                     |
| T060–T062 worker     | writeback-worker.ts單行程序列化與持久attempt／cycle／計數／排程；claim writing和寫入次數先commit，Google在交易外；startup將writing轉pending先核對。writeback-check.ts只核對原sheetId題目／merge／baseline及全expected，整題組一batch stringValue，不能以單項成功報全組成功                                                                  |
| 原owner與授權        | oauth.forOwner只取原Google sub最新的記憶體grant，各API await後重驗代次；缺少或拒絕授權pending、不盲目用帳號B代寫；401同一失效grant不安排立即無界循環。原帳號重新授權喚醒，但不重設已暫停的讀取預算                                                                                                                                          |
| T063–T064 復原與狀態 | durable-writeback-service.ts及owner HTTP get/verify/retry；舊POST初次派發正式入口404。verify不送寫；retry先確認baseline才以receipt同交易開新cycle，只處理eligible failed/pending，同request不再遞增。job中有conflict仍可恢復其他安全failed題。writeback-projection.ts只提供安全碼／計數，未向student送job；儲存故障停止派發，查詢回安全錯誤 |
| T065–T066 UI與移轉   | 明示結束自動回填與暫停外部編輯，移除初次回填按鈕。WritebackPanel顯示持久整體／逐題狀態，只有例外提供查核／安全重試；老師關頁不取消工作。writeback.test、writeback-http及results-writeback已移轉自動流程，保留原表保護、網路／權限／未知及重送案例                                                                                           |

正式main有persistence時只建立durable worker／服務，不建立舊記憶體回寫服務；舊createWritebackService仍供單獨純核心fixture回歸使用。
Google安全錯誤轉譯抽至errors.ts並由sheets-client重新export，讀取退避及write 15秒／retry=false不變。
整體有任何pending／writing job時，包含已切換到其他目前活動的舊job，活動repository均阻擋新建，不只核對目前slot。
既有17表／110欄位schema未變，新增方法使用原欄位，不更動已保存migration checksum。

本Phase新增20項：durable-writeback 5、writeback-crash 12、automatic-writeback-http 2、automatic-writeback Edge 1。
正常案例含兩組有效提交、唯一首答、整題組文字回填、無成功組不改格、無第二按鈕及關老師頁後完成。
故障案例含end job插入失敗全回滾、原表prompt／merge／值衝突、mixed題組、錯誤及遺失回覆先查核、
三次寫入與2／4秒到期才派發、四次邏輯讀取與1／2／4秒後pending暫停、第三次未知不誤報failed、restart不歸零、
缺少原owner／同grant 401不耗預算、不以B授權代寫、晚到預檢後切帳號不寫、原帳號重授權接續、retry收據去重及DB失敗停止派發。

四個實際child SIGKILL情境打包並執行目前persistent-commands／repositories／worker原始碼，不是手寫模擬worker流程：

1. end transaction commit後、worker前；2. writing及attempt commit後、送寫前；3. 送寫後、讀回前；4. 讀回後、本機保存前。
   child與parent共用同一臨時DB，外部狀態由合成JSON cloud double保留；parent讀回DB／receipt／計數，重建worker先查核，
   確認已套用答案不再送寫、未送出的已claim attempt仍消耗預算、唯一job不重建。子行程不繼承Google設定，stdout／stderr不擷取。

測試打包器esbuild 0.25.12已存在於目前安裝及lockfile，新增明確devDependency以免依賴Vite偶然hoist。
嘗試離線npm package-lock-only時因缺少registry metadata cache而ENOTCACHED，未下載套件；改同步package.json與lockfile根metadata，
以Node assert確認已安裝版本、既有lock entry及兩份root宣告一致。此失敗不是測試Gate通過結果，已明確區分。

| 實際指令                   | 結果                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| npm run typecheck          | exit0                                                                 |
| npm run lint               | exit0                                                                 |
| npm run format:check       | exit0                                                                 |
| npm run test:unit          | exit0，54項                                                           |
| npm run test:integration   | exit0，65項                                                           |
| npm run test:contract      | exit0，14項                                                           |
| npm run test:e2e           | exit0，8項Edge測試                                                    |
| npm run build              | 由test:e2e實際執行，三個workspace通過                                 |
| PlantUML -checkonly／-tsvg | exit0，六圖產生於validation-results/feature-002-phase-5/design-review |

合計141項。最終Gate後只更新文件，未再改程式。loopback案例在允許隔離本機連線的環境執行，DB／cloud double／child bundle均在專用臨時目錄，
未停止原有正式服務、未讀正式DB或真實Google授權，也未寫真實Google表。

設計對照：writeback.puml的end/result/job原子、原owner憑證、原sheetId預檢、整組送寫、未知先讀回、固定預算與restart保留均已接通；
submission與lifecycle的正常end及after-commit wake亦完成。architecture維持一個Node、雙listener與一個有序worker，無外部queue或ORM。
六圖原始檔未修改，沿用T002已通過設計；新增服務分檔、wire名稱沿用operationId/status映射持久jobId/currentStatus，契約已明確記載。

尚未完成範圍：history／settings頁與HTTP、三場已確認資料跨頁面／瀏覽器／真正服務重啟比對、active原兩學生續答的完整行程驗收、
兩份真實Google及兩帳號整體驗收仍在Phase 6；統一表格UI在Phase 7，安全備份與完整產物驗證在Phase 8。
本次worker child fault測試不能代替這些後續驗收。Convergence任務保留待辦，不提前勾整體收斂完成。

Phase 5人工文件核對範圍：本節、quickstart的Phase 5操作及限制、plan狀態、contracts新增wire mapping與tasks進度。
請以persistent-commands／writeback-worker／durable-writeback-service／writeback-projection、老師回填介面及上述實測核對；
確認後才T068合併並開始Phase 6。

Phase 5文件人工核對結論：維護者於2026-11-25回覆「核對完成」，T068人工審查門檻通過。

T068已完成：實作7cbf9e0，合併main 1cd40d7；T055–T068完成，補記後fast-forward回main，未push。

## Phase 6 Execution

2026-11-25從Phase 5已審查合併的main c79eb94建立codex/002-phase-6-history，T069完成。T070–T072先執行history/settings與隔離案例，兩項因缺少HTTP介面失敗，另一suite因history-service尚不存在無法載入；存在性測試已改為三場資料及真正main子行程重啟驗證。維護者已確認可準備兩個Google帳號，真實驗收尚未開始，T080–T083仍待完成。

### Phase 6 Implementation and Synthetic Validation（尚未完成真實驗收）

T073–T078已實作：history-service及HTTP依已驗證Google sub查詢SQLite，歷史詳情讀取已存來源、組名、答案、順序、固定結果與回填狀態，不重新讀取Google或切換目前活動。歷史分頁依created_at及id穩定排序，游標綁定帳號、瀏覽器session、授權代次、頁大小與期限；學生及其他owner不能讀取。

settings HTTP保存defaultGroupCount，嚴格驗證及帳號級requestId收據支援重送；保存後新建活動套用設定。老師歷史／詳情／設定頁目前提供基本操作，統一表格及視覺優化仍在Phase 7。首次載入有明確處理中提示，避免資料尚未回來先顯示空歷史或讓使用者編輯即將被載入值覆蓋的設定。

App在授權變動時立即移除舊帳號活動與歷史；新boot及老師session更換會重建相關頁面，拒絕舊請求晚到回覆。重新啟動後老師必須重新授權原Google帳號才查歷史，學生原網址及Cookie則可在沒有老師授權時恢復原組繼續作答。

新增history/settings契約1項、history隔離整合2項、實際main子行程重啟整合3項、history瀏覽器2項。子行程測試以目前TypeScript原始碼執行真正backend/src/main.ts，使用同一臨時DB及埠，兩場ended與一場active跨重啟保留；原兩學生重送不重複，後續序號接續，另驗waiting與ended不因重啟改階段。不繼承真實Google環境，不讀取正式Cookie或權杖。

| 實際指令                                          | 結果                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| npm run typecheck                                 | exit0                                                                 |
| npm run lint                                      | exit0                                                                 |
| npm run format:check                              | exit0                                                                 |
| npm run test:unit                                 | exit0，54項                                                           |
| npm run test:integration                          | exit0，70項                                                           |
| npm run test:contract                             | exit0，15項                                                           |
| npm run test:e2e                                  | exit0，10項Edge測試，包含三workspace build                            |
| node --check tests/manual/workflow-v2-restart.mjs | exit0，僅語法驗證                                                     |
| PlantUML -checkonly／-tsvg                        | exit0，六圖產生於validation-results/feature-002-phase-6/design-review |

合計149項自動化測試。最後一輪曾因新增載入role=status使foundation測試的全頁status定位不再唯一而失敗（9過、1失敗）；改為精確定位原老師／學生狀態文字後重跑，10項全過。沒有刪除載入訊息或忽略失敗。

新版manual capture/verify腳本已準備，只保存非機密活動ID、計數及業務資料雜湊，不匯出Cookie；尚未對正式資料執行。T079–T081真實Google、兩帳號、原Chrome／Edge及正式服務重啟驗收仍待辦；維護者需在保留Google設定的原終端機啟動新版並自行授權。上述合成測試不代替真實驗收，T082 Gate及T083人工文件審查／merge均未宣稱完成。

### Phase 6 Real Acceptance Progress（進行中）

2026-11-25維護者已啟動新版並自行授權帳號A。最初清單顯示GOOGLE_FORBIDDEN；維護者啟用Google Drive API後仍失敗，重新授權後確認可見試算表清單。此為操作恢復順序，未擷取Google原始錯誤，不能據此斷言唯一根因。帳號B已自行準備獨立可編輯教材，後續使用各自來源，避免不同活動回填同一份表的互相影響。

已由真實清單預覽「搶答系統\_題目\_1」第一張「學習單」，辨識四題（兩題組、兩單題），目前目標為第15欄第5／6／8／9列及第14欄第11／13列；未沿用舊驗收固定欄位。已建立兩組waiting活動，Chrome原學生頁顯示組別名稱輸入及兩個選組按鈕，尚未開放作答。

Windows UI驗收先遭工具無法辨識目前網址而停止；使用者回覆「繼續」後重連，可確認學生頁是目前活動，但視窗前景啟用兩次失敗（failed to activate captured window）。維護者手動還原Chrome／Edge後，改以直接指定已辨識欄位的set_value輸入，避免焦點誤判時向網址列輸入；恢復後完成下列兩場。另一次導航被工具中止，學生第二場網址由維護者自行開啟，未改用其他工具繞過限制。

| 真實場次                                      | 實際驗收結果                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A第一場，4f17ce5b-6276-4f11-aa19-e84818b5e459 | 來源「搶答系統\_題目\_1」／sheetId 1028924918「學習單」；Chrome第1組-咕咕嘎嘎、Edge第2組-測試乙隊。waiting無題目且已命名後無改名欄；start後出題，題組只填第一小題時送出鈕disabled。依序受理第一組Q1、Q2，第二組Q1、Q3；各自只見本組受理，第二組看不到第一組答案或順位。老師顯示兩組各2題，Q1／Q2第一組成功、Q3第二組成功、Q4無成功組。end一次後自動回填三題，整體及逐題均「讀回已確認」，未按第二個回填鈕。 |
| A第二場，db1cd0a3-b56e-4bc6-b19f-3d2f91eb8015 | 真實清單選「搶答系統\_題目\_2」，首張sheetId 1167716485「驗收學習單二」，辨識六單題。Chrome第1組-單題甲隊、Edge第2組-單題乙隊，waiting仍隱題；start後第一組先答Q3 IP，第二組後答Q3 IP及Q4作業系統。Q3仍第一組成功、Q4第二組成功，其餘四題無成功組。end自動回填兩題，整體及逐題「讀回已確認」。                                                                                                              |

第一份原表UI回填前可見O5／O6／O8／O9及N11:O11答案空白，回填後分別為CPU／作業系統／演算法／堆疊及0；Q4 N13:O13仍空白。第二份原表UI回填前G9:H9與G11:H11空白，回填後分別為IP／作業系統；G13:H13、G15:H15仍空白。兩份可見題目、邊框與合併配置前後一致；這是可見範圍UI核對，未宣稱逐一比較所有格式屬性或未顯示的儲存格。第一場ended後Edge公布與老師一致的四題結果，原作答欄已disabled。

A保存預設參與組數4，畫面回報「老師設定已保存」；按更新歷史後出現兩筆已結束活動，兩筆皆「回填已確認」，名稱及來源與上述一致。帳號B切換與設定隔離尚待維護者自行完成OAuth，尚未開始代操作授權畫面。

T080尚缺真正多分頁與建立後重排驗證，已提出新增空白分頁、暫時重排並恢復原首張的具體操作範圍，待維護者答覆後才進行。T079／T081仍缺三場資料、正式服務重啟及原學生續答；T082／T083 Gate、人審與merge未完成，未開始Phase 7。

維護者自行授權B後，老師頁教材清單可見獨立來源「搶答系統*帳號B*題目\_1」，歷史為空且沒有A兩場，預設組數2並未沿用A的4。將B預設組數保存為3，預覽其首張「工作表1」辨識六道資料結構單題，建場預設值確為3，建立活動f10c5a73-4b6a-47ba-bffc-9602ac6a10a1（三空組）。開始後無人作答即結束，六題均無成功組／未作答，狀態直接讀回已確認、沒有逐題待寫項目。此零項狀態由既有原子end規則產生，不能將其當成實際Google答案寫入成功證據；B實際寫入仍未測，本Phase兩份有答案的真實回填證據是A的上述兩場。

B更新歷史後只列一筆自己的已結束／回填已確認活動，不出現A的兩場；設定仍為3。已請維護者自行切回A，後續確認A兩筆及預設4恢復。此刻共三場已結束（A兩場、B一場），尚未建立含兩組答案的active重啟測試場，故尚未執行manual capture/verify，T079／T081不勾完成。

第三場後續重啟準備：維護者在原Chrome／Edge開啟第三場後，兩瀏覽器分別加入第1組-重啟甲隊、第2組-重啟乙隊，另外兩組保持空組。老師start後兩組依序提交Q1完整CPU／作業系統，均回報本組答案已受理；活動保持active，未end。實際執行Node 24 `tests/manual/workflow-v2-restart.mjs capture` exit0：activities=4、ended=3、activeSubmissions=2、nextSequence=3，比對檔在Git忽略路徑，只含非機密ID／計數／雜湊。重啟前公開health bootId為1330fe97-6def-428f-9db9-7cf13bafdd83、available=true；首次沙箱health連線因socket權限被拒，改用允許loopback讀取後成功，不將失敗請求記為成功。

已請維護者從保留Google設定的原服務終端機真正停止並重啟Node，先不重新授權、不操作學生答案；verify及兩組續答尚待執行，T079／T081仍未勾完成。

維護者自行切回A後，歷史自動恢復原兩筆「搶答系統\_題目\_1／2」已結束／回填已確認活動，不包含B活動；預設組數仍為4。A再次從清單預覽第一份題組教材，建場欄位自動為4，實際建立第三場83a0a401-69c3-42f5-83a3-291ce77a034b，四組waiting。已請維護者在原Chrome／Edge學生分頁自行開啟此場連結，以避開先前工具導航遭強制停止的問題；此時尚無第三場學生提交，未執行重啟capture。

## Phase 6 Core Acceptance and Review Gate

本節為Phase 6目前結論；前述Real Acceptance Progress保留各次操作的當時狀態，不以早期「尚未」取代本節已完成結果。T069–T081已完成，T082仍待本階段文件人工核對，T083尚未commit／merge。分支為codex/002-phase-6-history，未開始Phase 7。

### 真正服務重啟與三場歷史

- Node 24執行 `node tests/manual/workflow-v2-restart.mjs capture` exit0：4場、3 ended、1 active；active為83a0a401-69c3-42f5-83a3-291ce77a034b，兩組Q1受理共2筆、nextSequence=3。A兩場正常結束、A第三場進行中，B另有一場零答案結束。
- 維護者實際停止並重啟原Node服務；重新授權或續答前執行 `node tests/manual/workflow-v2-restart.mjs verify` exit0，所有固定業務表雜湊、ID、計數與原序號一致。health bootId由1330fe97-6def-428f-9db9-7cf13bafdd83改為43f36b52-0a75-4c71-9e37-26882181e95d，available=true，確認是新行程。
- 老師未重新授權時，原Chrome／Edge網址及瀏覽器身分自動恢復；原名第1組-重啟甲隊、第2組-重啟乙隊、active階段、Q1答案CPU／作業系統及已受理狀態均保留。原Edge先送Q2演算法／堆疊，原Chrome後送Q2同答案，均成功受理。
- 對正式SQLite唯讀assert通過：仍active，submission sequences=[1,2,3,4]，next_sequence=5；原兩筆沒有遺失或重複，後續兩筆接續，未因重啟end或建立回填工作。
- 老師重啟後未授權畫面僅顯示授權入口，無歷史／設定；維護者自行授權A後，A三場清單（兩ended、一active）、設定4及原組名／兩組各2題／成功組恢復，無B活動。逐一開啟三場詳情：第一場咕咕嘎嘎／測試乙隊及三題固定結果、第二場單題甲隊／單題乙隊及Q3 IP／Q4作業系統與已確認回填、第三場重啟甲乙兩組原Q1及新Q2答案／收件序號均可讀。查看舊場未替換目前active。
- 上述比對完成後，才由老師結束第三場，兩題回填工作亦讀回已確認。B先前實際切換驗證為自己的空歷史與預設2，保存3並建立自己的零答案活動後只見自己的1筆；切回A恢復原4及原活動。B零答案場不是Google寫入證據，真實答案回填由A兩份來源及重排場驗證。

### 多工作表、首張空白與回填原分頁

維護者明確同意在 `搶答系統_題目_2` 新增空白分頁 `驗收備用空白頁`、暫時重排、測後恢復原教材第一張並保留空白頁。新增分頁sheetId=593612241，原 `驗收學習單二` sheetId=1167716485不變。

兩張分頁存在、原教材第一張時，由真實清單預覽六題並建立A第四場8f8c91d9-0647-413a-837f-c3971bd4418d（兩組）；之後才將空白頁移到第一張，原教材第二張。Chrome第1組-重排甲隊提交Q5堆疊，Edge第2組-重排乙隊提交Q6演算法；老師end後，整體及兩題均讀回已確認，未按第二個回填按鈕。

直接核對線上Google UI：第一張空白頁A1起的可見範圍（包含G13／G15）仍空白；第二張原教材G13:H13新增堆疊、G15:H15新增演算法，既有G9 IP／G11作業系統保持，題目、邊框與合併配置可見範圍一致。這是新答案寫入原sheetId的真實證據，不僅是既有值查核。

首張仍空白時，重新從清單預覽相同檔案，明確顯示「無法確認全部題目與作答位置，請修正來源教材後重讀」，沒有改讀第二張題目。已將原教材移回第一張，保留空白頁第二張，重新預覽再次成功讀出六題。未刪除分頁、未改共用權限，未下載／上傳試算表中介檔。

### 成功條件對照與實際限制

| 範圍               | 核對依據                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US1／SC-001        | A兩份真實清單選表、4題混合題組及6單題、不同分頁名稱、目前第14／15欄與第7欄動態位置；多頁首張讀取、建場後重排原sheetId寫入、首張空白不fallback及復原均完成。                                                                                 |
| US2／SC-002–SC-004 | 真實Chrome／Edge命名且鎖名、waiting隱題、start出題、題組漏一項不能送、先後首答及學生不見他組進度。2秒同步、重連及資料管道隱私、空白／超長名、同時搶組、併發／重送／end交錯由unit、contract、integration、E2E驗證，不宣稱人工UI有精密計時。  |
| US3／SC-005–SC-006 | A兩來源及重排場正常end無第二操作自動回填；原表可見目標／非目標及格式核對，整組答案全部確認；錯誤／衝突／timeout／回覆遺失／DB故障不假成功、退避預算及唯一job由合成故障整合測試覆蓋。真實清單曾403且修正授權後恢復，未擷取上游原始機密錯誤。 |
| US4／SC-007–SC-008 | 正式capture／verify雜湊100%一致、實際Node重啟、原兩學生無教師授權續答、重新授權A三場詳情與設定恢復。waiting／ended不改階段、pending worker跨SIGKILL及未知先核對、歷史讀取不呼叫Google／不重新派發由隔離自動化覆蓋。                         |
| SC-010核心         | 清單→命名→開放→兩組答案→end自動回填→重啟續答與重新授權查歷史已完成；統一UI後回歸仍在Phase 7，不能宣稱SC-009與SC-010最終UI部分完成。                                                                                                         |
| SC-011             | 真實A／B切換畫面歷史與設定隔離、未授權清空、A重授權恢復；直接HTTP／Socket跨owner與student拒絕、游標綁定與合成敏感值不進錯誤／DB／logger由自動化覆蓋。Phase 8仍須最終建置產物與備份驗證。                                                    |

實作／測試對應已審查architecture、account-source、lifecycle、submission、writeback及teacher-ui六圖，無新增設計流程或schema變更；六圖checkonly／SVG已通過。Phase 6新增HTTP／前端／共享schema均延用既有owner guard、白名單投影與可靠命令，正式Google設定未讀取或複製，OAuth始終由維護者自行操作。

### 最終自動化驗證與人工核對範圍

補強history-recovery第一個案例：實際關閉老師page再於同browser context新開頁，確認設定4與歷史仍可用，另保留reload、切換owner與Google來源不可用的詳情讀取。補強後第一次兩項追加執行曾出現1過、1項重啟案例逾時，不以先前完整149項通過掩蓋此結果。

檢查發現catalog-server測試支援程式只disconnectSockets再關HTTP，與正式main的io.close不同；改為等待兩個Socket.IO listener完整io.close後才關DB，避免測試中的舊連線／立即重連干擾替換服務。正式main關閉方式未變。修正後history-recovery兩項以repeat-each=3連跑，6次全過，再執行下列完整Gate。

| 實際指令                                                                                          | 最終結果                                                    |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| npm run typecheck                                                                                 | exit0                                                       |
| npm run lint                                                                                      | exit0                                                       |
| npm run format:check                                                                              | exit0                                                       |
| npm run test:unit                                                                                 | exit0，54項                                                 |
| npm run test:integration                                                                          | exit0，70項                                                 |
| npm run test:contract                                                                             | exit0，15項                                                 |
| npm run test:e2e                                                                                  | exit0，10項Edge案例，包含實際關頁重開與runtime重建          |
| npm run build                                                                                     | exit0，shared／backend／frontend三workspace                 |
| node node_modules/@playwright/test/cli.js test tests/e2e/history-recovery.spec.ts --repeat-each=3 | exit0，6次通過，不重複計入149個獨立案例                     |
| node tests/manual/workflow-v2-restart.mjs capture／verify                                         | 各exit0，正式服務與SQLite實際比對及原兩學生續答完成         |
| PlantUML -checkonly／-tsvg                                                                        | checkonly通過；新目錄final-design-review產生六份非空有效SVG |

共149項自動化測試通過。指令透過已驗證Node 24 runtime執行同名npm scripts；測試服務只使用隔離埠／臨時DB／合成授權，未停止正式服務或繼承真實Google設定。正式重啟由維護者在原終端機完成，manual唯讀查詢且不保存原始答案或機密。

最後圖驗證曾遇既有design-review SVG無法覆寫訊息，工具仍回exit0；因此未僅憑exit code宣稱重產成功，改產生至validation-results/feature-002-phase-6/final-design-review，另斷言六檔皆非空且含svg標記通過。舊圖未刪除。

另核對118個task ID不重複，正式SQLite與restart evidence均被Git忽略且沒有追蹤runtime資料；四份修改規劃／操作Markdown另外明確執行Prettier，git diff --check通過。專案無.specify/extensions.yml，無before／after implement hook可執行。

T082人工文件核對範圍：本節及Phase 6 Implementation and Synthetic Validation、quickstart的Phase 6節、plan的Status與tasks的T069–T083進度；以history-service／history與settings HTTP、共享schema、三個老師頁與App、production-process及重啟／歷史測試、真實操作結果核對。憲章V要求AI文件由維護者以實際程式、設定或結果審查，先前Phase核對不替代本Phase。尚未收到此次核對結論，T082／T083保留待辦，未commit／merge，未開始Phase 7。

Phase 6人工文件核對結論：維護者於2026-11-25回覆「審閱完成」，本階段審查門檻通過，T082完成；接續T083 commit／merge，不再要求重複核對同一審閱範圍。

T083已完成：實作5b5a247，Phase 6合併main 9f47bf9；T069–T083完成，合併紀錄補記後fast-forward回main，未push。

## Phase 7 Execution

2026-11-25從Phase 6已審查合併的main 684c9a4建立codex/002-phase-7-ui，T084完成。沿用T002已審查teacher-ui.puml的組別列／題目欄、長名換行／捲動及狀態／鍵盤流程，先新增表格與操作介面E2E再實作；不變更角色投影或資料契約。

T085／T086先行八項E2E全部因缺少表格、導覽或新狀態說明失敗（非fixture錯誤），確認RED後才開始T087–T090。資料使用合成四組、六單題與40字特殊字元名稱，未操作真實Google或授權。

## Phase 7 Implementation and Validation

T084–T090已完成；T091待維護者可見UI／鍵盤核對，T092自動化部分通過但人工門檻未完成，T093尚未commit／merge。分支codex/002-phase-7-ui，Phase 8未開始。此節為本階段實作後的審閱包。

### 實作與需求對照

- T085／T086先新增四組六題表格與狀態／鍵盤案例，八項均先因缺少table、導覽或說明失敗，確認RED後才實作。後續補充一項390×844學生鍵盤加入、waiting隱題及完整答案送出，新增共10項E2E。
- T087 ProgressTable使用現有teacher snapshot，以group列／question欄顯示完整名、參與狀態、已提交總數、尚未作答、已受理、搶答成功與序號。由提交與結果建立索引，不複製首答判定；ended採固定results、進行中採tentativeResults。語意table、rowheader／columnheader、文字badge及可focus的橫捲region；固定組名欄及對應表頭，40字特殊字名稱不截斷。
- ActivityPage目前活動優先，摘要數據、開始／結束與原因同頁；已受理答案details保留，成功答案仍由ResultsView公布。表格與CSS不新增學生端可見資料。App提供教師導覽，未授權只提示連結帳號，已授權不再重複要求授權。
- T088 SourcePage清單限制高度、顯示日期／唯讀原因與可編輯預覽；第一張題目預覽可用鍵盤捲動。歷史／目前活動導覽及完整來源／組名保留，HistoryDetailPage加同一ProgressTable，不把舊場設為目前場。SettingsPage說明帳號級保存與下一場套用。
- T089 OperationStatus統一loading／success／warning／error與文字，ConnectionStatus保留即時連線狀態。WritebackPanel區分進行中、待確認、失敗、衝突、讀回確認及零成功答案，只有既有pending／failed題提供復原操作。所有成功訊息仍依server receipt／readback，不把UI本機輸入當保存成功。
- T090 GroupPage、AnswerPage與共享ResultsView（由ResultsPage使用）統一版面、長名換行及可讀結果；學生只見自己的鎖名／受理提示。等待不render題目，accepted／ended／busy／斷線／未填齊均有原因；無新增改名或單獨小題送出入口。
- 原anonymous-join-privacy案例從舊段落斷言移轉至table row核對完整名、加入及0題，原空名不得占組、Cookie恢復、waiting資料無題／mapping、兩瀏覽器2秒開放同步仍保留。後端、SQLite schema、Google API、角色投影及契約沒有修改。

### UI與鍵盤證據

`teacher-progress-table.spec.ts`使用真正SQLite／HTTP／Socket.IO測試入口，合成四組、六單題，前三組已加入、第四未加入。第一組40字名（含<、&及>）完整顯示；初始尚未作答，再提交兩組Q1與第二組Q2，表格即時更新成功組、受理及2題總數。1280×720表頭9欄、含表頭共5列，40字名稱不被裁切；640×720表格有水平溢位、ArrowRight可捲，整個document不水平溢出。

`workflow-usability.spec.ts`驗未授權、清單loading／empty、歷史empty、導覽Enter、writing／pending／failed／conflict／verified五種說明及有效復原按鈕、開始／結束鍵盤操作與無成功答案不更新原表。五種回填狀態的UI案例攔截安全public DTO作畫面狀態測試，不代替後端worker故障測試；後者仍在既有integration／contract。

390×844學生案例以鍵盤加入第4組-鍵盤學生，waiting無textarea，老師start後填答並Enter送出，顯示本組已受理與disabled，不水平溢出。測試產生下列合成截圖，本代理已逐張檢視長名、狀態、桌面與窄視窗，未宣稱此AI檢視就是維護者人工審查：

- validation-results/feature-002-phase-7/teacher-desktop.png：1280×720教師活動與導覽。
- validation-results/feature-002-phase-7/teacher-table.png：四組六題完整表格、特殊字40字長名及逐題文字。
- validation-results/feature-002-phase-7/teacher-narrow.png：640×720固定組別欄、橫捲及鍵盤焦點。
- validation-results/feature-002-phase-7/student-waiting.png：390×844鎖名等待、沒有題目。
- validation-results/feature-002-phase-7/student-answer.png：390×844答案已受理後不可重送。

截圖僅合成資料，未記錄真實Google OAuth；不要求維護者提供機密。可重新整理已啟動的本機老師頁檢查新前端，再用Tab到「歷史活動」並Enter核對導覽；不用重啟Node或重新授權。

### 最終驗證

| 實際指令                   | 結果                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| npm run typecheck          | exit0                                                                    |
| npm run lint               | exit0                                                                    |
| npm run format:check       | exit0                                                                    |
| npm run test:unit          | exit0，54項                                                              |
| npm run test:integration   | exit0，70項                                                              |
| npm run test:contract      | exit0，15項                                                              |
| npm run test:e2e           | exit0，20項，包含核心隱私／持久化／自動回填與新UI                        |
| npm run build              | exit0，三workspace                                                       |
| PlantUML -checkonly／-tsvg | exit0，六份有效SVG於validation-results/feature-002-phase-7/design-review |

共159項獨立測試。最後僅固定橫捲時組別表頭的CSS，重建及受影響teacher-progress-table案例另執行確認，不將重複執行算成新增測試。所有npm scripts透過已驗證Node 24 runtime執行；測試使用隔離DB／埠與合成Google，沒有停止正式服務或再次回填真實教材。

設計對照：沿用已審查teacher-ui.puml的核心驗收後才優化、同表比較、換行／捲動、復原提示與鍵盤；其他五圖流程不變，未發現需新增設計流程或契約。SC-009四組六題40字1280×720可從同表比較、窄螢幕捲動有上述證據；SC-010統一UI後完整瀏覽器核心回歸通過，真實Google／重啟／原sheetId重排驗收依Phase 6已核對紀錄，不冒稱本階段再次執行真實寫入。

T091／T092人工核對範圍：上述合成畫面、在本機老師頁以Tab／Enter進入歷史區的可見操作、此節、quickstart Phase 7、plan Status及tasks進度。依憲章V與Common Phase Gate，維護者需確認實作、畫面及AI文件一致；Phase 6「審閱完成」不替代Phase 7核對。目前尚未收到此階段結論，T091–T093保持待辦，不合併或開始Phase 8。

Phase 7補充長表邊界：另先新增桌面1280×720十二題案例，原固定最小寬度使題目欄被壓縮、無橫捲，案例RED。ProgressTable改依題數計算最小寬度，十二題各欄至少100px、超出桌面時橫捲，題數不限於六。第一次修正後20項中19過，十二題的欄寬及溢位已通過，但測試使用End鍵未水平捲動；改為介面標示的向右鍵，保留scrollLeft必須增加的斷言，最後完整20項全部通過，隨後三workspace build亦exit0。這是新增第10項UI E2E，不將先前重跑當成新增項目；後端與shared仍無diff。

四份修改Markdown另明確Prettier check通過，git diff --check通過，118個task ID保持唯一；無extension hook。合成圖與鍵盤步驟已可供T091人工核對，尚未收到Phase 7維護者結論，沒有合併。

Phase 7人工核對結論：維護者於2026-11-25回覆「審核完畢」，確認本階段畫面、鍵盤與文件審閱完成，T091／T092人工門檻通過，接續T093合併。

T093已完成：實作799da6d，合併main 9602880；T084–T093完成，補記後fast-forward回main，未push。
