# Interface Contracts: 第二版預定介面

本文件為第二版目標契約。Phase 3–4已實作來源、owner隔離及持久學生流程；Phase 5已實作end/results/job同交易、原sheetId自動worker及verify/retry。完整history/settings仍待Phase 6。沿用 Express HTTP、Socket.IO、shared Zod strict schemas。
已完成範圍與合成測試證據見../review-notes.md；不得把本文件全部契約描述為現有服務已支援。

## Transport and Authorization

- teacher listener 只在 loopback；student listener 不註冊教師資料 routes。沿用 Host/Origin、CSRF、限流及 HttpOnly Cookie 保護。
- 教師資料要求後端驗證的 Google sub；所有 activity/settings/history/source/watch/write recovery 都驗 owner。不存在與非所屬均 `ACTIVITY_UNAVAILABLE`，不得洩漏存在性。
- 帳號切換失效舊 authGeneration、訂閱、搜尋 cursor、preview，清空前端舊資料；每次 teacher emit 重新核驗，非只核訂閱。
- mutations 使用 CSRF、UUID requestId。client 不提供 role/owner/participant/winner/sequence；嚴格拒絕額外欄位。
- 回應 `ok:true,data,revision` 或 `ok:false,error:{code,message,retryable},revision`；HTTP 使用對應400/401/403/404/409/429/503/502，Socket 以 ack envelope。錯誤不含 stack、headers、OAuth URL query、原始 Google response。
- `Cache-Control: no-store` 用於帳號、業務資料及 OAuth callback；不儲存認證回應。

## HTTP

下列 paths 均相對角色 listener。GET 分頁 cursor 是 opaque、驗證過的上下文，不允許用 cursor 改 owner。

| Method / Path                             | 輸入                                                | 成功輸出／行為                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/health                           | 無                                                  | available、bootId；DB 未就緒不可 available=true；不含活動／帳號資料                                                                                               |
| GET /api/session                          | 角色由 listener 決定                                | 新 CSRF、role、bootId；teacher 只回目前已授權帳號自己的 currentActivityId，未授權 null；student 用 Cookie digest 恢復穩定 participant，公開回應不含 digest        |
| GET /api/google/status                    | teacher session                                     | configured、authorized、account:{displayName,email}或null、authGeneration、能力狀態；無 tokens／sub 原始認證封包                                                  |
| POST /api/google/connect                  | CSRF                                                | 啟動現有 OAuth state 流程，加 nonce／scope；callback仍 /api/google/callback；完成後增加 authGeneration                                                            |
| POST /api/google/disconnect               | CSRF                                                | 解除本機帳號連結、失效舊訂閱與代次；不刪 DB、不宣稱撤銷 Google 帳號全部授權                                                                                       |
| GET /api/google/spreadsheets              | query可選≤200字、cursor可選                         | items:{id,name,modifiedTime,ownerLabel,canEdit}[]、nextCursor或null、incompleteSearch；固定每頁100，空頁有 cursor 仍可繼續                                        |
| POST /api/source-previews                 | spreadsheetId（非空≤256字）                         | previewId、source:{spreadsheetId,title,sheetId,sheetTitle}、完整teacher題目/mapping、fingerprint、expiresAt；只讀首張；preview綁 owner＋authGeneration、有效5分鐘 |
| POST /api/activities                      | requestId、previewId UUID、groupCount 1..MAX_GROUPS | 重新確認權限／首張／fingerprint，原子建立含教材的 waiting 活動；回 activityId、學生URL、teacher snapshot；不用先建空場再貼來源                                    |
| GET /api/activities                       | cursor可選、limit預設20最大100                      | 僅目前owner歷史摘要：id、來源快照名稱、日期、phase、writebackSummary、nextCursor；不列其他帳號                                                                    |
| GET /api/activities/:id                   | UUID                                                | own teacher snapshot、來源、組別、答案、結果、回填；資料取DB，不要求重讀原表                                                                                      |
| GET /api/settings                         | 無                                                  | 該帳號已保存的白名單設定，缺少時明確預設值                                                                                                                        |
| PUT /api/settings                         | requestId、strict設定（defaultGroupCount）          | commit後回已保存設定；不得包含Google credentials或session                                                                                                         |
| POST /api/activities/:id/writeback/verify | requestId、CSRF                                     | 只核對既有job，不新建正常工作；回jobId/currentStatus，後續以狀態更新                                                                                              |
| POST /api/activities/:id/writeback/retry  | requestId、CSRF                                     | 同owner、明確可重試題目才重新預檢；未知先verify、conflict不盲寫、verified不重寫                                                                                   |

清單 cursor 最大8192字，包含／映射至 provider token（最大4096字）及帳號代次、query；跨代次／過期回 CURSOR_INVALID。
preview過期／帳號切換／來源變化回 PREVIEW_EXPIRED／SOURCE_CONFLICT，不插半場。
create 的持久收據鍵為 owner＋requestId；相同內容重送回原活動，即使preview已消耗；不同內容 REQUEST_CONFLICT。
settings 的收據同樣以 owner＋event＋requestId 保存於獨立 account command receipt 範圍，資料模型實作需加入 account_command_receipts 表。
所有成功 mutation 先 commit；臨時儲存失敗回 STORAGE_UNAVAILABLE，不假稱成功。

### Existing Interface Changes

主要流程取代先建空場及手貼 URL/ID 的 source route；不保留會繞過 first-sheet/owner/preview檢查的舊入口。
舊 `group:rename` 必須明確拒絕且不變更資料；正常 UI 移除改名。
舊手動初次 writeback 入口不再建立 job，避免與 end 自動工作競爭；只提供 verify/retry 例外操作。
現有 Google connect route 若採 redirect 型式，可保留入口外形，但必須具備本契約 state/nonce/role/代次要求。

## Socket.IO Client Commands

共用 `{activityId:UUID,requestId:UUID}`；重送必須保留原 requestId及payload。
所有 mutations 由單一命令佇列入 SQLite 短交易，commit 後 ack；subscribe只查詢不持久記收據。

| Event              | 角色／額外輸入                                         | 結果                                                                                              |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| activity:subscribe | student；或已授權owner teacher                         | DB目前角色snapshot；teacher核owner，student不列活動歷史                                           |
| group:join         | student；groupId UUID、name trim後1–40字               | groupId、ordinal、name、fullName；原子綁組＋名稱；重連同身分回原組，不能重命名                    |
| group:rename       | 所有角色                                               | 拒絕 NAME_LOCKED，不修改名稱                                                                      |
| activity:start     | owner teacher                                          | waiting且來源已確認→active；commit後顯題；重複request回原成功                                     |
| answer:submit      | 已加入student；questionId≤200字、answers:itemId→string | 完整題組驗證，每項1–2000字；回自組receipt，不回sequence/receivedAt/他組狀態                       |
| activity:end       | owner teacher                                          | active→ended，固定結果＋唯一job同交易；回 ended/jobQueued，不宣稱Google已成功；自動worker後續處理 |

event大小沿用既有 transport 防護，另限制題目itemId及答案集合為本場已知項目；額外項目拒絕。
併發提交與end依共同入口接收次序；同組同題換request重送仍 ALREADY_SUBMITTED，不改首答。

## Server Events and Projections

| Event                         | 可見者                  | 限制                                                                           |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| activity:snapshot             | 該場已訂閱角色          | activityId、revision、phase、bootId；每次投影並核權限；teacher帶authGeneration |
| activity:phase                | 該場所有角色            | phase與revision，不夾帶題目；開始後另發允許題目snapshot                        |
| self:receipt                  | 同participant的學生分頁 | 僅自組submissionId/questionId/accepted                                         |
| teacher:progress              | owner teacher           | 完整組名、受理答案、暫定結果、sequence；學生不訂閱也不收到                     |
| writeback:status              | owner teacher           | job及逐題status、safe reason、完整成功組名；無憑證／原始API紀錄                |
| results:published             | 該場所有角色且ended     | 題號、完整成功組名、成功答案或無成功組，不暴露其他未成功答案                   |
| teacher:authorization-changed | 該teacher session       | 新authGeneration；清掉舊資料並重查session；不含其他帳號資料                    |

waiting student：group選擇（編號、占用）、自組已確認名稱、phase及等待訊息，questions省略或空陣列；
不包含題號清單、prompt/item、source/baseline/target、submissions/tentativeResults/results/writeback。
active student：允許題目prompt、item id/label、自組receipt；其他組沒有答案進度／順位。
ended student：加公開results；教師詳細history仍禁止。
teacher：完整資料但省匿名digest、Cookie、tokens。完整組名各處共用 formatter，不能顯示只有自訂名稱。

跨boot重連先以原URL及Cookie重新取session/CSRF，再subscribe完整DBsnapshot。
boot變動不使activityId失效；同場revision不得倒退。關閉舊socket並拒收舊連線／舊authGeneration回覆，
不能用現有新版快照比較器直接拒絕所有新boot。teacher重啟後必須重新Google授權，student不需等待。

## Safe Errors

沿用既有 INVALID_INPUT、UNAUTHORIZED、FORBIDDEN、GROUP_OCCUPIED、ALREADY_JOINED、
ALREADY_SUBMITTED、INCOMPLETE_ANSWERS、REQUEST_CONFLICT、INVALID_PHASE、ACTIVITY_UNAVAILABLE、
MAPPING_AMBIGUOUS、SOURCE_CONFLICT、SOURCE_TOO_LARGE、GOOGLE_AUTH_REQUIRED、GOOGLE_FORBIDDEN、
SHEET_NOT_FOUND_OR_INACCESSIBLE、NETWORK_ERROR、GOOGLE_ERROR、WRITE_PENDING、RATE_LIMITED。
新增 NAME_LOCKED、CURSOR_INVALID、PREVIEW_EXPIRED、SOURCE_READ_ONLY、SOURCE_UNSUPPORTED、
STORAGE_UNAVAILABLE、STORAGE_CORRUPT、SYSTEM_BUSY。storage錯誤不含SQL／路徑／答案／token。
來源404不區分不存在或不可存取；list incomplete是明確非完整結果，不報成功列完。

## Google Adapter Contract

新增 verifiedIdentity、listSpreadsheets、getFileCapability、readFirstSheet、readSheetById。
first按index=0，byId用原sheetId；不可共用「每次重新選第一張」實作。
read/list有限次 exponential backoff；write(timeout15s,retry=false)每題組一次batchUpdate。
精確次數、退避、計數及重啟語意依 [data-model.md Retry Policy](../data-model.md#retry-policy)。
逐題reasonCode另允許VERIFICATION_PAUSED與AUTO_RETRY_EXHAUSTED，分別表示未知結果暫停查核、以及已確認全baseline但本輪寫入預算耗盡；不得由未知結果推導failed。
verify僅讀回，不重設cycle／寫入預算；retry對可復原failed／pending原子開新cycle，與命令收據一併提交，重送不重複開輪。verified／conflict不允許retry開新cycle。
所有updateCells以stringValue寫userEnteredValue，不改格式。寫後readback是verified必要條件。
授權按owner取得，切換帳號不改job owner；未知結果先讀回，無授權pending等原帳號，不用其他帳號代寫。

## Phase 5 Wire Mapping

正常end回 `{phase:'ended',jobId,jobQueued}`；僅表示本機交易已保存，不表示Google已成功。
GET `/api/activities/:id/writeback` 為owner限定的既有工作狀態查詢，不建立工作；未結束且無job回INVALID_PHASE。
POST同一路徑的舊手動初次派發入口在正式main不註冊。verify/retry均為POST `/api/activities/:id/writeback/verify` 或 `/retry`，strict輸入 `{requestId:UUID}`。
為沿用既有shared回填envelope，回傳資料中的operationId就是持久jobId、status就是整體currentStatus；
包含activityId、questions、reasonCode，逐題另有retryCycle、writeAttemptCount、verificationFailureCount與nextAttemptAt。
這些資訊及expectedAnswers只提供owner teacher；學生結果投影沒有回填job或內部資料。
verify只查核現有工作且不送寫；retry先確認baseline，僅對可安全恢復的pending／failed題目開新cycle，
verified／conflict題目不變，同requestId不再開cycle。整體有conflict時仍可復原其他安全failed題目。
