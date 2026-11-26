# Data Model: SQLite 持久化與活動恢復

設計日期2026-11-25；已於Phase 2建立001-core migration，Phase 3–6接入正式流程。Phase 8對照110欄位／17表，schema未新增或變更；最終審查狀態見 [review-notes.md](review-notes.md)。
SQLite 使用版本化 migrations、foreign_keys=ON、WAL、synchronous=FULL。
所有識別及字串使用參數化 SQL；時間為伺服端 UTC epoch milliseconds，畫面依本機時區顯示。

## Entities and Relationships

| Table                     | 主要欄位與鍵                                                                                                                                                                                                                                          | 關聯及限制                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schema_migrations         | version PK、applied_at、checksum                                                                                                                                                                                                                      | 未知新版或 checksum 不符停止啟動，不降版覆蓋                                                                                                                           |
| teacher_accounts          | account_id PK（Google sub）、display_email、display_name、created_at                                                                                                                                                                                  | email 僅顯示，不作權限；不存 ID/access/refresh token                                                                                                                   |
| teacher_settings          | account_id PK/FK、settings_json、updated_at                                                                                                                                                                                                           | strict schema 白名單，只存已確認後台設定（如預設組數）；不存未送出草稿、機密或跨帳號偏好                                                                               |
| activities                | id PK UUID、owner_account_id FK、phase、created_at、started_at、ended_at、revision、next_sequence、group_count、spreadsheet_id、spreadsheet_title、source_sheet_id、source_sheet_title、source_snapshot_json、source_fingerprint、source_confirmed_at | owner 不變；phase waiting/active/ended；revision ≥0；next_sequence ≥1；group_count 1..MAX_GROUPS；保存原首張完整題目、mapping、merge及baseline                         |
| runtime_state             | slot PK（固定1）、current_activity_id FK nullable                                                                                                                                                                                                     | 全域一場 waiting/active 或未確認回填占用；歷史與 runtime slot 分離，結束且回填終止才可換場                                                                             |
| questions                 | activity_id FK、question_id、display_number、kind、ordinal                                                                                                                                                                                            | PK(activity_id,question_id)；UNIQUE(activity_id,ordinal)；single/group，不硬編碼題數                                                                                   |
| question_items            | activity_id、question_id、item_id、ordinal、label、prompt、sheet_id、row_index、column_index、baseline_json、merge_json                                                                                                                               | 複合 FK 至 questions；PK(activity_id,question_id,item_id)；同活動目標格唯一；sheet_id 必等活動原表；JSON 值經 schema 驗證                                              |
| participants              | id PK UUID、browser_token_digest UNIQUE、created_at                                                                                                                                                                                                   | SHA-256 高熵 opaque Cookie；不存 Cookie 原值、不公開 digest；browser-only Cookie 設持久有效期                                                                          |
| activity_groups           | activity_id FK、id、ordinal、participant_id FK nullable、name nullable、joined_at                                                                                                                                                                     | PK(activity_id,id)；UNIQUE(activity_id,ordinal)、UNIQUE(activity_id,participant_id)；participant/name/joined_at 同為空或同時有效；join 後 immutable                    |
| submissions               | activity_id、id、group_id、question_id、request_id、received_at、sequence                                                                                                                                                                             | PK(activity_id,id)；FK 限同場 group/question；UNIQUE(activity_id,group_id,question_id)、UNIQUE(activity_id,sequence)；sequence 正整數，requestId UUID                  |
| submission_answers        | activity_id、submission_id、question_id、item_id、answer                                                                                                                                                                                              | PK(activity_id,submission_id,item_id)；FK 同場 submission/question_item；整題組答案集合完全相符，每項trim後1–2000字                                                    |
| results                   | activity_id、question_id、winner_submission_id nullable                                                                                                                                                                                               | PK(activity_id,question_id)；同場 question/submission FK；無人提交保留 null；end 後 immutable，答案與完整組名由不可變關聯還原                                          |
| command_receipts          | activity_id、actor_key、event、request_id、payload_fingerprint、outcome_json、created_at                                                                                                                                                              | PK(activity_id,actor_key,event,request_id)；actor 為 account sub／participant UUID 的帶型別鍵；僅安全結果及業務資料，無 session/headers/tokens                         |
| account_command_receipts  | owner_account_id FK、event、request_id、payload_fingerprint、outcome_json、created_at                                                                                                                                                                 | PK(owner_account_id,event,request_id)；create活動／settings等尚無activityId的命令去重，保存安全結果與建立出的activityId                                                |
| writeback_jobs            | id PK UUID、activity_id UNIQUE/FK、owner_account_id FK、status、reason_code nullable、created_at、updated_at                                                                                                                                          | 只由 end 交易建立；owner=activity owner；一場一個正常 job，零題也有 verified job                                                                                       |
| writeback_question_states | job_id、activity_id、question_id、status、expected_answers_json、target_snapshot_json、safe_error_code nullable、retry_cycle、write_attempt_count、verification_failure_count、next_attempt_at nullable、updated_at                                   | PK(job_id,question_id)；複合 FK 確保 job 與題目同活動；只列有成功組的題目，題組作為同一寫入單位；重試欄位限制依下方 Retry Policy                                       |
| writeback_attempts        | id PK UUID、job_id、question_id、ordinal、retry_cycle、kind、started_at、finished_at nullable、outcome、safe_error_code nullable                                                                                                                      | retry_cycle為非負整數且對應該題已建立的重試週期；kind precheck/write/verify；UNIQUE(job_id,question_id,ordinal)；只存 allowlist code，不 dump Google request/exception |

DDL 實作須以 CHECK、UNIQUE、複合 FK 保護表內及同場約束；跨表 phase、owner、答案集合、不可變組名／結果
由唯一交易服務驗證，並以整合測試確認，不宣稱單一 FK 可表達所有業務規則。
索引：activities(owner_account_id,created_at,id)、submissions(activity_id,question_id,sequence)、
writeback_jobs(status,updated_at)、command_receipts 的主鍵。歷史使用 created_at/id cursor。

## Validation and Representation

- 組名 trim 後1–40字，沿用 shared Zod/JavaScript 字串長度規則（UTF-16 code units），前後端一致；不執行 HTML。空白、超長、額外欄位拒絕。
- 老師完整名稱由共用 formatter 根據固定 ordinal＋鎖定 name 產生；例「第一組-咕咕嘎嘎」。未加入顯示編號＋未加入。ordinal 顯示規則覆蓋設定允許的最大組數。
- 任意答案缺小題、多 item、空白、超長整筆拒絕，不分配 sequence、不占首答。不能只插入部分 submission_answers。
- 來源 snapshot 在建立前 schema 驗證；首張 properties.index=0，不跳過 hidden、不跳至首個 GRID。首張非 GRID、零題、歧義均不能建場。
- 自動回填固定建場 sheetId；排序／改名以穩定 sheetId 識別，預檢以題目語意、座標、merge、baseline 比較，不因純標題變動切換到另一張。
- Google sub 是後端驗證結果；API 不接受 owner_account_id、participant_id、sequence 或 winner 作可指定欄位。
- DB 檔包含教材與答案，屬本機業務資料；DB、WAL、SHM、備份排除 Git。SQLite 不儲存 Google tokens、Cookie、CSRF、OAuth state/code/nonce。

## Transactions and Ordering

1. **Create**：先在交易外完成 owner 綁定的預覽與可編輯／首張／mapping 重驗；短交易中重查全域 slot、授權代次仍一致，插入完整 waiting 活動、題目、空組及 slot。外部回覆過期不建立。
2. **Join**：驗角色、活動階段、名稱與原 actor；BEGIN IMMEDIATE 內核對未占組、未加入他組，原子綁定 participant＋name、revision＋receipt。相同 requestId 重送回原結果；不同內容同鍵 REQUEST_CONFLICT；新 requestId 嘗試改名拒絕。
3. **Submit**：共同命令入口依進入順序序列化。交易內重驗 active、已加入、完整答案、未答過，取 next_sequence，整筆插入答案、增 sequence/revision、存 receipt 後 commit。received_at 只是診斷，唯一勝負取 sequence；不能比較不同 socket 的客戶端時間。
4. **End**：與 submit 同一序列入口。交易內變 ended、以每題最小 sequence 固定 results、插唯一 job 與逐題 expected、revision＋receipt；commit 後公布結果並喚醒 worker。先 end 的晚答拒絕；先受理的答納入結果。
5. **Write progress**：每次外部寫前 commit writing/attempt；外部回覆後另開短交易更新 readback 結果。持久化失敗停止派發該工作，不能標 verified；重啟將未完成 writing 當 pending 查核。

任一 SQLite 失敗 rollback，失敗交易不可留下對外可見的記憶體 mutation，不 ack success。
若 commit 是否完成未知，以相同 requestId 查 DB 收據後決定，不盲目重建操作。
安全業務拒絕可保存 receipt；授權／限流／暫時 storage 失敗不緩存成永久成功。DB busy 限時失敗可重試。

## State Transitions

### Activity

`waiting → active → ended`；無重新開放、無加入後改名。
關頁不改 phase；重啟原樣載入 waiting/active/ended，active 自動開放原學生續答，
不因重啟 end 或寫回。活動 UUID／組別／sequence／revision 不依 bootId 重設。
bootId 是 process 診斷；原學生 Cookie digest 可恢復，新的老師 session 必須重做 Google 授權。
載入失敗停止服務可用狀態，不以空資料取代。Google 授權失效不阻擋本機原學生續答。

### Writeback

對外狀態保留 `writing / pending / verified / conflict / failed`，額外 reasonCode 區分 queued、需授權、未知結果。
end 建 job=`pending/queued`；worker取得 owner 憑證與預檢後 writing；寫後讀回完全匹配才 verified。
未知結果／重啟 writing→pending→verify；全 expected→verified，全 baseline且結構相符→安全重試，
混合／異值／結構變更→conflict，讀取／授權失敗→pending並明確原因。
明確拒絕、或寫入預算耗盡且查核確認全baseline→failed；結果仍未知則維持pending並暫停自動派發。
只有老師明確例外重試可恢復failed，且須再預檢；conflict不自動覆寫。
只有同 owner 可查核／重試；原帳號授權後自動喚醒 pending。每題組一次 batch，無部分成功宣稱。
aggregate status 按 writing→pending→conflict→failed→verified 優先；writing/pending 阻擋新場。

## Retry Policy

下列為worker的固定預設與canonical欄位定義，實作／測試皆引用此處，不自行設定另一組上限。

| Field                                                  | 限制與初始值                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `writeback_question_states.retry_cycle`                | 非負安全整數，初始0；只有owner明確retry命令接受時加1，restart／reauthorize／verify不改變                                     |
| `writeback_question_states.write_attempt_count`        | 0–3，初始0；每個cycle送出batch前與writing／attempt同交易加1；即使加1後尚未送出即崩潰也不退回                                 |
| `writeback_question_states.verification_failure_count` | 0–4，初始0；連續暫時性預檢／查核讀取失敗加1，完整成功讀取歸0；無原owner授權不計入                                            |
| `writeback_question_states.next_attempt_at`            | nullable UTC epoch milliseconds；排程重試時保存下次最早派發時間，等待授權／人工處理或終止時null；restart保留，逾期只喚醒一次 |
| `writeback_attempts.retry_cycle`                       | 非負安全整數，建立attempt時取該題當前cycle；既有attempt不可因開新cycle而改寫                                                 |

- 每題每cycle最多3次外部寫入，包含首次；第2／3次的最早時間分別為前次寫入attempt開始後2／4秒。每次再次寫入前都須重新確認結構一致且全baseline；全expected直接verified，混合／異值直接conflict。
- 每次worker的完整預檢／查核讀取為一次邏輯嘗試；連續暫時性失敗最多4次，重試間隔1／2／4秒並保存next_attempt_at。滿4次仍讀不到，保留pending、reasonCode=VERIFICATION_PAUSED、清除排程，等待owner明確verify或retry，不自動循環。
- Google單個read/list API呼叫沿用最多4次實際嘗試（首次加3次重試），退避250／500／1000ms，額外jitter為0–99ms。這是單次API的界限；worker的4次邏輯讀取界限另計，不能增加無界外層重試。write仍timeout15秒、retry=false。
- 寫入次數滿3後仍須查核：全expected→verified；結構一致且全baseline→failed，reasonCode=AUTO_RETRY_EXHAUSTED；未知→pending而非failed；衝突→conflict。不能以未知寫入達次數上限為由釋放新場阻擋。
- 缺少授權→pending／GOOGLE_AUTH_REQUIRED、next_attempt_at=null，不消耗讀寫預算。原帳號授權後接續原計數；已因讀取上限暫停的工作不因重授權或restart而重設上限。
- owner明確verify只重設查核失敗計數、讀回既有工作，不改cycle或寫入預算，不自行送寫。owner明確retry只對failed或可安全復原的pending開新cycle，先查核再決定寫入；新cycle的兩個計數歸0，排程時間為目前時間。
- retry命令的cycle遞增／計數重設／排程與command_receipts同交易，stable requestId重送回同一cycle；verified／conflict拒絕新增cycle。每個cycle仍遵守相同上限，歷史attempt保留，只有owner明確新retry能開下一cycle。
- next_attempt_at到期後必須重新核對phase、owner授權、status、cycle及預算，不能由舊timer派發已過期工作。DB進度保存失敗即停止派發。

## Account Boundary and Projections

每筆教師查詢以 session 的 verified sub 限制，不用 email／前端 owner。
未授權不能看歷史；帳號B無法取得A詳情，即使兩者共用原試算表。
切換帳號遞增 authGeneration，取消舊訂閱、清空畫面快取、拒收舊非同步回覆。
學生只以 activity URL 和自己的 Cookie 取投影；waiting 不含題目內容／題號／targets；active 才顯題，
學生始終沒有來源／baseline／sequence／他組提交／回填內部狀態；ended 才有公開結果。
教師設定按 account_id 保存；token 可用性與 OAuth session 不因 settings 持久化而保存。

## Recovery and Migration

啟動先開正確檔案、套 migration、驗 DB、重建 slot；不可偷偷 fallback :memory:。
沒有已存 DB 的首次啟動才建立新 schema；第一版已遺失記憶體資料不追溯。
原 active 在 listener 可用後自動恢復；正常 ended 的 pending 工作等 owner 授權後先 verify。
保留預期答案及 target 的工作足以恢復，不需保存 Google token。
故障測試至少覆蓋 commit前、commit後ack前、end commit後worker前、writing commit後送寫前、
送寫後讀回前及讀回後本機保存前；真實子行程與實體檔驗證。
