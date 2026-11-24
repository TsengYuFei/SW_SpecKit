# Research

## TypeScript 與本機執行

Decision — 前後端 TypeScript 5.x strict，Node.js 24 LTS，npm workspaces。
前端採 React + Vite，後端 Express + Socket.IO 4.x，同源提供正式前端。
實作時鎖定可相容的套件 patch 版本及 lockfile。
Rationale — 共享型別、單一 Node 行程和記憶體狀態足以完成本機課堂活動。
Alternatives considered — 多行程或資料庫需要額外一致性與持久化機制，與指定限制不符。

## 即時狀態與提交

Decision — 所有 join、submit、start、end 在單一同步 reducer 中驗證並變更狀態。
收件次序 sequence 是裁決依據，receivedAt 為伺服端時間供顯示。每筆命令有 requestId 去重。
Rationale — 跨連線順序須由共同收件點決定，Socket.IO 預設可能遺失事件。
重連後驗證 session 並取得角色快照，不啟用歷史封包恢復。
Alternatives considered — socket.id 不具跨重連穩定性；只依學生時間會失準。
Source — [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

## 老師與匿名組別身分

Decision — 教師控制面只在 loopback listener 提供，學生面由 LAN listener 提供。
兩者可在同一行程共享 store，但分開 session cookie 與事件權限。
學生以隨機匿名 session cookie 綁定 browser profile，不用瀏覽器指紋。
HttpOnly、SameSite、來源檢查與每 session 操作速率上限防止濫用。
老師端不信任代理轉送的 localhost 標頭。
Rationale — LAN 學生不能僅因選擇教師畫面而取得控制權。cookie 可跨重新整理，
清除後即視為新身分，符合既定綁定規則。
Alternatives considered — 個人登入或組別復原碼與已確認流程不符。

## Google 連線

Decision — Google Web application OAuth client，教師瀏覽器、固定 loopback callback、一次性 state。
callback 為 http://127.0.0.1:3000/api/google/callback，必須與 Google Console 登記值完全一致。
僅請求 Sheets 讀寫 scope，憑證由環境注入，access/refresh token 只留後端記憶體。
callback 使用後導向乾淨 URL，停用 callback query、請求本文與上游錯誤的原始日誌。
Rationale — URL/ID 導入任意老師可存取教材需要授權範圍涵蓋 Sheets，
而無資料庫設計允許重啟後重新授權。
Alternatives considered — Desktop client 與 PKCE 適用未來桌面封裝；本次以本機 Web 應用
及後端交換授權碼的流程對應 Web application client。API key 無法代表老師存取私有教材。
Source — [Google OAuth client types](https://developers.google.com/identity/protocols/oauth2/),
[Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

## 題目辨識與線上回寫

Decision — 讀取所有分頁的表頭、儲存格值、合併範圍。
依範例版型辨識單題與題組，穩定以 sheetId 與 grid coordinates 記錄目標。
寫入選 spreadsheets.batchUpdate 的 UpdateCellsRequest，
fields 僅限 userEnteredValue，答案使用 stringValue 防止公式執行。
每個題組以同一批次寫入其全部小題，成功後再讀回。
Rationale — 明確範圍與欄位可保留格式和非目標格；單題和題組共用同一題目模型。
Alternatives considered — values.batchUpdate RAW 也可寫入，但以分頁名稱參照需要額外處理重新命名。

回寫前重新讀取題目、合併範圍及目標原值，衝突時跳過整題或整個題組。
逾時先顯示待確認，核對目標再重試。Google 並未提供儲存格條件交換寫入，
故老師須在回寫時暫停外部編輯，檢查與寫入間仍存在競爭空窗。
Source — [Sheet resource](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets),
[batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)

## 設計限制與決策細節

- 題組每題一個 batchUpdate，內含各小題精確單格的 UpdateCellsRequest。
  使用 start 座標與一格 rows，避免寬範圍更新清空其他值。僅設 stringValue 和
  fields=userEnteredValue。合併格以左上座標寫入，預檢須驗證原合併範圍。
- 所有讀取帶 field mask，依分頁實際範圍分段讀取，直到完整掃描。遇配額、過大教材或
  掃描失敗，保留錯誤並阻止確認；不能把部分結果宣告為全部題目。
- 依表頭而非固定欄號識別作答區。題組使用跨列題號與小題標記，標記旁的空白格為目標。
  單題的空白作答合併區用其左上角。標記重複、答案格重疊、未知結構皆回歧義錯誤。
- 教師讀取、確認對應與回寫操作須按活動序列化，並綁定 activityId、sourceRevision。
  非同步 Google 回覆返回時重新核對狀態，禁止舊來源覆蓋新來源，禁止讀取中開始活動。
- 網路逾時、429 與暫時性 5xx 的讀取至多重試三次，採有抖動的指數退避。
  401 需重新授權，403 區分可辨識的權限與配額原因。404 無法可靠區分不存在及不可見，
  對使用者說明兩種可能，避免誤導。寫入不明時先查核，禁止盲目重送。
- Google scope 為 https://www.googleapis.com/auth/spreadsheets，提供指定私人試算表的
  讀寫能力。OAuth 對外發布或測試使用者設定由老師在 Google Console 完成。

以上為從官方行為推導的應用設計。Node.js 同步事件處理可作為本機共同裁決邊界，
Socket.IO 的順序保證適用單一連線；跨組次序由 reducer 入場順序建立。
使用相同 cookie 的分頁共享身分，socket.id 變動不影響組別綁定。
來源見 [Node.js events](https://nodejs.org/api/events.html),
[Socket identity](https://socket.io/docs/v4/server-socket-instance/),
[Socket TypeScript](https://socket.io/docs/v4/typescript/),
[Sheets limits](https://developers.google.com/workspace/sheets/api/limits),
[Google error semantics](https://developers.google.com/workspace/drive/api/guides/handle-errors),
[UpdateCellsRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#UpdateCellsRequest)。

Node.js 採仍受支援的 24 LTS，套件確切版本在實作安裝時核對並鎖定。
來源見 [Node.js releases](https://nodejs.org/en/about/previous-releases)。

## 驗證工具

Decision — Vitest 單元與整合測試、Socket.IO client 契約測試、
Playwright 雙組別端到端測試。每項功能包含正常及特殊情境。
真實 Google 授權與回寫驗收由本機操作者完成，測試憑證不得進入截圖或追蹤檔。
Rationale — 模擬可穩定覆蓋錯誤，真實試算表驗收證明直接讀寫流程。
Alternatives considered — 僅測假資料無法證明真實 Google 互通。
