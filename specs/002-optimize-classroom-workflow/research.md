# Research: 課堂搶答流程與歷史管理優化

日期：2026-11-25。以下為預定設計；唯讀檢查既有程式及官方文件，未操作真實 Google 資料。

## R1 SQLite driver 與交易

- **Decision**: SQLite、Node 24 `node:sqlite` 的 `DatabaseSync`、repository 封裝。短 BEGIN IMMEDIATE、WAL、FULL、foreign_keys，busy_timeout=2000，單一寫入連線。
- **Rationale**: 既有 store.command 是同步 reducer，可沿用序列化入口。提交／sequence／revision／receipt 同交易；commit 後才 ack/publish，不先改可見 Map 再異步落盤。API 仍會演進，封裝並以已驗證 Node v24.22.3 作基線。
- **Alternatives considered**: better-sqlite3 增加 native ABI／安裝成本；ORM 非必要；整場 JSON 不易以唯一鍵保護順序；定時存檔不符合已受理不可遺失。
- **Evidence**: 記憶體 DB runtime probe exit 0：Node v24.22.3、SQLite 3.54.1、DatabaseSync 可用。升級時重驗 runtime 及 WAL 修補版本。
- **Sources**: [Node 24 SQLite](https://nodejs.org/download/release/v24.10.0/docs/api/sqlite.html)、[transactions](https://www.sqlite.org/lang_transaction.html)、[WAL](https://www.sqlite.org/wal.html)、[PRAGMA](https://www.sqlite.org/pragma.html)。

## R2 檔案、migration 與啟動

- **Decision**: DATABASE_PATH 預設 `data/classroom.sqlite`；DB/WAL/SHM/備份排除 Git。版本化 migration 同交易，啟動確認設定、schema、quick_check 及 active slot 後才 listen。壞檔／新版 schema／唯讀／磁碟滿明確失敗，不改成空 DB。
- **Rationale**: WAL 伴隨 sidecars，運作中只複製主檔不是可靠備份。備份使用 SQLite backup API，或正常關閉且確認 checkpoint 後複製；恢復時先停服務。
- **Alternatives considered**: 網路磁碟不符合本機 WAL 條件；錯誤時自動重建會隱藏資料遺失。
- **Sources**: [SQLite backup](https://www.sqlite.org/backup.html)、[WAL](https://www.sqlite.org/wal.html)。

## R3 匿名恢復與命令重送

- **Decision**: browser 持有32-byte CSPRNG opaque HttpOnly Cookie，一年持久有效期、沿用 SameSite；DB 只存 SHA-256 digest、獨立 participant UUID 與非機密關聯。teacher session、CSRF、rate counter 記憶體限定。收據鍵 activity＋穩定 actor＋event＋requestId，含 canonical payload fingerprint 與安全結果。
- **Rationale**: `security/sessions.ts` 目前 Map 在重啟後無法恢復；digest 可辨識原學生而不保存可直接重用 Cookie。老師 actor 用已驗證 account sub，不用短暫 session。清除 Cookie 不能接管原組，學生不需 Google 授權即可續答。
- **Alternatives considered**: Cookie 原值入 DB 違反 FR-031；IP／User-Agent 會混淆瀏覽器；Socket id 不是持久身分。不得 dump 原始封包／session 到 receipt，DB rollback 不留成功收據。

## R4 Google identity 與 scopes

- **Decision**: OAuth 加 `openid email`、`https://www.googleapis.com/auth/drive.metadata.readonly`，保留 `https://www.googleapis.com/auth/spreadsheets`。後端驗 ID token 簽章／issuer／audience／expiry／nonce，以 sub 作 immutable owner。state 綁 session、限時一次性；tokens/code/nonce 只在記憶體，callback query 不記錄。
- **Rationale**: 目前 oauth 沒有帳號主鍵、只有 Sheets scope；email 可變，前端 account 不能作權限。Drive metadata scope 足以列來源與檢查 canEdit，但屬 restricted scope，須確認 Drive API、同意畫面與真實授權環境。
- **Alternatives considered**: drive.file 不涵蓋所有帳號可存取檔案；drive.readonly 過大；email/session 不適合作 owner key。
- **Sources**: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、[OIDC](https://developers.google.com/identity/openid-connect/openid-connect)、[後端驗證](https://developers.google.com/identity/sign-in/web/backend-auth)。

## R5 清單及第一工作表

- **Decision**: Drive files.list 篩 native Sheets 及 trashed=false；name contains 查詢須跳脫。回最小辨識資訊、canEdit、nextPageToken、incompleteSearch。支援個人／共用檔與可存取 shared drives；不完整搜尋要標明並引導縮小查詢，不能假稱列完。建場前 files.get 重新檢查可編輯。
- **Rationale**: nextPageToken 存在時空頁亦非完成；cursor 綁 account generation/query，不跨帳號重用。每頁100、query最多200字、provider token最多4096字；包成 server opaque cursor，驗證長度及上下文。
- **Decision**: 首張按 properties.index=0，隱藏表仍是第一張；非 GRID／無題直接拒絕，不跳後續。只向該 sheetId 讀格值與 merges。確認預覽時重讀首張及 mapping，變更要求重預覽。建場保存 sheetId，後續核對／回填固定原表，不重新選首張。
- **Alternatives considered**: 自選分頁已被使用者排除；陣列首筆／第一個 GRID 不精確；固定名稱違反需求。
- **Sources**: [files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)、[search](https://developers.google.com/workspace/drive/api/guides/search-files)、[capabilities](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)、[SheetProperties](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets#SheetProperties)。

## R6 帳號隔離與 worker 權限

- **Decision**: 所有教師查詢／修改及每次推播驗 owner。帳號切換遞增授權代次、清除前端來源／歷史／活動、取消舊 socket 訂閱。非所屬活動同樣 ACTIVITY_UNAVAILABLE，設定亦按 owner 隔離。全域 busy 時其他帳號只見通用訊息。
- **Rationale**: 不刪其他帳號資料，但不保留其畫面；直接 URL、API、socket 亦不可越權。worker 依 job owner 取記憶體憑證，不能拿「目前帳號」任意 token。
- **Decision**: 帳號切換／解除連結取消舊 session 授權及未送出工作；已送出的請求仍依原 owner 處理安全狀態。無原帳號憑證時 pending，原帳號重新授權後查核再繼續，不借用新帳號權限。
- **Alternatives considered**: 全域單一 token、前端傳 owner、只在訂閱時核權限，都會造成跨帳號使用。

## R7 自動回填與不明結果

- **Decision**: end 同交易保存 ended、固定結果、唯一 job、逐題 expected、receipt；commit 後 worker 處理。送寫前持久記 writing；逾時／崩潰改查核 pending。無有效答案也保存零項 verified 工作，不送寫。
- **Rationale**: outbox 防止 ended 無工作；每題組一次 batchUpdate 多個 updateCells，以 stringValue／userEnteredValue mask 保留非目標與格式。不宣稱 SQLite 與 Google exactly-once。
- **Recovery**: 結構一致且全 expected→verified；全 baseline→可安全限次重試；混合／異值／結構變化→整題 conflict；讀取／授權失敗→pending並明示原因。讀/list 可限次退避，寫禁用通用自動重試。
- **Retry policy**: 固定預設及欄位定義見 [data-model.md Retry Policy](data-model.md#retry-policy)：每題每cycle最多3次寫入、連續4次暫時性查核失敗後pending暫停；計數／排程持久化、重啟不重設。只有owner明確retry可原子開新cycle，未知結果不能當作確定失敗。
- **Alternatives considered**: end 直接 await Google 綁住頁面與網路；先 end 後另建 job 有 crash 缺口；盲重寫可能覆蓋外部變更。
- **Sources**: [batchUpdate 原子性與協作限制](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)、[usage limits](https://developers.google.com/workspace/sheets/api/limits)。

## R8 Socket 與 UI

- **Decision**: 保留 Socket.IO ack／穩定 requestId；重連向 DB 取角色投影，不靠 packet buffer。bootId 僅診斷，跨 boot 接受完整快照後重建基準，同場 revision 單調；舊 socket／授權代次回覆捨棄。
- **Rationale**: Socket.IO 預設 at-most-once，記憶體 recovery 不能替代 DB。waiting 學生根本收不到題目欄位內容，不只 CSS 隱藏；teacher-only 提交、來源、工作不進學生 projection。
- **Alternatives considered**: 以 connection recovery 當持久化、boot 不符強制新場、送完整 teacher 資料後前端裁切都不符需求。
- **UI decision**: 功能驗收後以語意 table，組別為列／題目為欄，完整名稱換行、長表捲動。每格狀態有文字，保留鍵盤操作、載入／空／錯誤／例外查核。
- **Sources**: [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)、[connection recovery](https://socket.io/docs/v4/connection-state-recovery/)。

## Remaining Unknowns

沒有待釐清需求。真實 scope 同意、兩帳號驗收、故障注入及人工設計／文件核對是後續執行門檻，
未記為已通過。本次未改現有服務、未讀機密、未操作真實 Google Sheets。
