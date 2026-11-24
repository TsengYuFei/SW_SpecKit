# HTTP 與 Socket.IO 契約

本文件為預定實作契約。shared 型別及 Zod runtime schema 皆從此設計落實。

## 傳輸與權限

教師 listener 預設 127.0.0.1:3000；學生 listener 預設 LAN:3001。
設定 STUDENT_BIND_HOST 與 STUDENT_PUBLIC_ORIGIN 明確指定 LAN 位址及來源；
老師畫面顯示包含 activityId 的學生加入連結。GET /student/:activityId 載入學生畫面。
教師以 http://127.0.0.1:3000 開啟；開發前端資產透過對應 listener 同源代理。
學生 listener 不提供教師操作及 OAuth callback。兩個 listener 僅允許設定中的 Host/Origin，
HTTP mutation 採 session 綁定 CSRF token，Socket handshake 驗證 cookie 與 Origin。
Cookie 分別命名 teacher_session、student_session，均設 HttpOnly、Path=/，不設 Domain。
teacher_session 採 SameSite=Lax，讓 Google 頂層 GET callback 可帶回 session 並驗證 state；
student_session 採 SameSite=Strict。HTTPS 時加 Secure。教師身分僅由 loopback listener 發行。
LAN HTTP 僅適用可信課堂網路，需保密傳輸時以本機 HTTPS 憑證啟動，不傳 Google token 至學生端。

所有 JSON 回應及 ack 統一為 {ok:true,data,revision} 或
{ok:false,error:{code,message,retryable},revision}。message 不含原始上游錯誤或機密。
未知欄位、無效型別、越權的 activityId 或 groupId 須拒絕。
HTTP 狀態碼採輸入錯誤 400、未授權 401、越權 403、活動不存在 404、狀態衝突 409、
頻率限制 429、外部服務失敗 502 或 503。Google 原始狀態不直接透傳，使用穩定 error.code。

## HTTP

| Method/path | 身分 | 輸入 | 成功結果 |
| --- | --- | --- | --- |
| GET /api/session | 各 listener | 無 | 初始化角色 cookie，回公開角色、CSRF token 及 bootId；教師另取得 currentActivityId 或 null |
| POST /api/google/start | 教師 | CSRF header | 產生一次性 state，回系統瀏覽器使用的授權 URL |
| GET /api/google/status | 教師 | 無 | 回授權與設定是否存在的布林值及安全錯誤訊息，供乾淨 URL 重新載入後使用 |
| GET /api/google/callback | loopback | code、state | 換取 token 後導向不帶 query 的教師頁 |
| POST /api/activities | 教師 | groupCount | 建立新 activityId；既有未結束場次回衝突 |
| GET /api/activities/:id | 教師 | 無 | 回目前階段、組數及安全來源預覽，供重新整理恢復讀題頁面 |
| POST /api/activities/:id/source | 教師 | spreadsheetUrlOrId | 教材預覽及 mappingVersion |
| POST /api/activities/:id/source/confirm | 教師 | mappingVersion | 確認未過期對應 |
| POST /api/activities/:id/writeback | 教師 | requestId | Ended 才建立操作，回 operationId |
| GET /api/activities/:id/writeback/:op | 教師 | 無 | 各目標確認、待確認或錯誤 |
| POST /api/activities/:id/writeback/:op/verify | 教師 | 無 | 重新讀取，再判定 verified/conflict/retryable |
| GET /api/health | 兩者 | 無 | bootId 與服務可用狀態 |

回寫操作同一活動最多一個執行中，重複 requestId 回同一 operation。
Google URL/ID 只擷取合法 spreadsheetId，伺服端僅向固定 Google API 網域送出請求。
只在 waiting 讀取及確認來源；重載來源使舊 mappingVersion 失效。
建立新場只允許目前無場次，或已結束且無未完成回寫。進行中回衝突。
writing、pending 阻擋新場；verified、conflict、failed 視為已終止，idle 表示未開始回寫。
只有確定未寫入的失敗可標示 failed。pending 無法查核時保留活動及答案，允許重新授權
或稍後重試查核，維持阻擋新場。教師重新整理後以 currentActivityId 恢復訂閱與控制。
授權 URL 僅存在教師瀏覽器短暫導向及後端記憶體，排除測試追蹤與存取日誌。
上游 404 可能同時表示不存在或不可見，顯示「找不到試算表，或目前帳號無權存取」，
不得假稱已辨識不可見資源存在。403 提示權限或配額問題，429/5xx 及網路錯誤提供重試。
讀取最多三次退避，寫入未知結果先 verify，再決定是否重送。
來源預覽的版本值統一位於 data.source.mappingVersion，沒有重複的頂層版本欄位。
OAuth callback 成功或失敗均導向不含機密的根路徑，錯誤由教師 status 端點讀取。
MAX_SOURCE_CELLS 預設為 2000000，超過則回 SOURCE_TOO_LARGE，拒絕整次讀取。

## Socket.IO

Client commands 皆含 activityId、requestId，ack 回統一格式。
requestId 為每個邏輯命令的 UUID，重送沿用，修正無效輸入則產生新的 UUID。
學生提交不接受指定 groupId，以 session 所屬組別為準。

| 事件 | 角色 | 其他 payload | 效果 |
| --- | --- | --- | --- |
| activity:subscribe | 已建立 session | 無 | 加入該角色房間並回完整投影 |
| group:join | 學生 | groupId | 原子占用，原 session 可回原組 |
| group:rename | 已加入學生 | name | 更改自組名稱 |
| activity:start | 教師 | 無 | waiting 且 mapping confirmed 才開始 |
| answer:submit | 已加入學生 | questionId、answers 以 itemId 對應字串 | 完整驗證、去重、收件裁決 |
| activity:end | 教師 | 無 | active 轉 ended 並凍結結果 |

Server events 包含 activity:snapshot（角色投影）、activity:phase、
teacher:progress（僅教師）、self:receipt（僅提交者）、results:published（僅 ended）、
writeback:status（僅教師）。payload 皆含 activityId、revision，
客戶端捨棄舊 revision，斷線後主動重新 subscribe。
接收結果逾時呈現「尚未確認」，用同一 requestId 重試；不得顯示未確認的成功。
受理收據僅含 submissionId、questionId、accepted，不洩露 sequence 或是否領先。
每 session 每秒最多 10 個 mutation，超過回 RATE_LIMITED；
Google 操作依活動序列化，避免重複按鈕產生並行寫入。

## 投影與事件資料

- StudentSnapshot 含 activityId、bootId、revision、phase、questions（題號、類型、小題內容）、
  groups（id、編號、名稱、是否占用）、self（自組 id 與提交收據）。結束後才增加 results。
- TeacherSnapshot 另含來源對應預覽、全組提交、共同收件時間與 sequence、暫定結果及回寫狀態。
- Result 含 questionId、題號、winnerGroup（編號及名稱或 null）、answers（itemId 對應文字）。
- activity:phase 含 phase；teacher:progress 含全組提交與結果；self:receipt 含原收據。
  這些事件及快照全部帶 activityId、revision。相同 revision 的不同事件仍須處理，
  只丟棄較舊 revision。最終狀態以 subscribe 的完整快照校正。
- 題目 target、原值、spreadsheetId、cookie、CSRF、OAuth 資料不進學生快照或廣播。
  占用狀態只用於選組，不能附帶作答進度。伺服端先產生角色 DTO，再送至獨立房間。
- 所有文字以純文字呈現；答案以字串寫入 Google，包含以等號開頭的答案也不執行公式。
- 日誌只保留錯誤碼、事件名稱、耗時等允許欄位。禁止原樣記錄 header、cookie、payload、
  callback query、授權 URL 或 Google SDK error。測試使用合成機密驗證過濾，真實 OAuth
  測試停用 trace、HAR、錄影及敏感畫面截圖。

錯誤碼至少包括 INVALID_INPUT、FORBIDDEN、GROUP_OCCUPIED、ALREADY_JOINED、
INCOMPLETE_ANSWERS、ALREADY_SUBMITTED、REQUEST_CONFLICT、INVALID_PHASE、
ACTIVITY_UNAVAILABLE、MAPPING_AMBIGUOUS、SOURCE_CONFLICT、GOOGLE_AUTH_REQUIRED、
GOOGLE_FORBIDDEN、SHEET_NOT_FOUND_OR_INACCESSIBLE、NETWORK_ERROR、GOOGLE_ERROR、
WRITE_PENDING、RATE_LIMITED。錯誤回覆不可附帶其他組答案。
