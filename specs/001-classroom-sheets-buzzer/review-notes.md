# 維護者文件核對資料

此檔由 AI 整理，供維護者依實作與實際操作審查，不等同已完成的人工審查。
憲章版本為 1.0.0；Phase 6 位於 codex/phase-6-validation，尚未合併 main。

## 文件與行為的核對重點

| 文件 | 維護者應核對的內容 | 實作或證據 |
| --- | --- | --- |
| [spec.md](spec.md) | 首次有效提交決定成功組，不判斷答案對錯；題組不得拆送；學生結束前無他組資料 | 兩份真實教材流程、activity-ordering 與 activity-sockets 測試 |
| [plan.md](plan.md) | TypeScript、Socket.IO、單一應用行程、無資料庫；目前只支援 HTTP | npm workspaces、backend/src/main.ts、同一 PID 監聽兩埠 |
| [research.md](research.md) | OAuth 使用固定 loopback callback；寫入未知時先查核；回寫期間暫停外部編輯 | oauth.ts、sheets-client.ts、writeback-service.ts、google-flow.puml |
| [data-model.md](data-model.md) | session 與組別一對一；sequence 為共同順序；結果凍結；回寫狀態與新場限制 | group/submission/lifecycle reducers、store.ts、writeback-service.ts |
| [contracts/interfaces.md](contracts/interfaces.md) | 教師限本機 listener；學生從同機學生 listener 加入；角色投影、CSRF、Origin、去重與安全錯誤 | session/server/security/sockets 實作與契約測試 |
| [quickstart.md](quickstart.md) | 安裝及啟動指令可執行；測試數與真實驗收限制有正確區分 | 66 項自動測試；兩份真實回寫 verified；各階段驗收紀錄 |
| [diagrams](diagrams/) | 架構、階段、搶答與 Google 流程符合實際行為，例外路徑未省略 | 四份 PlantUML 均已檢查及渲染；AI 已對照實作，待人審 |

## 已核對的具體結果

- 第一份含 4 題、2 個題組、6 個作答項目；H5=CPU、H6=作業系統、G11=0
  已真實回寫並讀回；H8、H9、G13 的可視抽核仍空白。
- 第二份含 6 個單題；G5=CPU、G7=二進位已真實回寫並讀回。
- 同 Cookie 多分頁共用身分；清除 Cookie 後不能接管已占用組別。
- 活動與 Google token 僅在記憶體；重新啟動後須重新授權、建場與選組。
  已寫入 Google Sheets 的答案會留在 Google Sheets。
- 寫入僅更新目標格 userEnteredValue，答案為 stringValue，等號開頭也保持文字。
- writing/pending 阻擋新場；verified/conflict/failed 為終止狀態。
  verified 代表最新讀回內容相符，不代表能證明某一次逾時請求一定已成功執行。
- 機密測試使用無效合成值；日誌只保留允許欄位，Google 真實權杖未被匯出。

## 尚待實際證據

同機不同瀏覽器的網址加入與異名分頁重讀已完成，具體結果見 quickstart 最新紀錄。
HTTP IP 缺少 randomUUID 的實際問題也已修正並加入回歸測試。
2026-11-25 已在兩筆有效提交後實際重啟 Node.js，完成新 bootId、舊活動拒絕、
空白新場與新身分重新選組作答驗證。技術驗收已完成，目前僅待本文件所列的維護者核對。
API 用戶不能取代實際不同瀏覽器的 UI 驗收；
最新驗收使用隔離的真實 Chrome 與 Edge 瀏覽器；跨裝置 LAN 已依使用者要求取消。

維護者完成核對後，應提供審查日期、通過或需修正的項目。取得實際回覆前，
T052 維持待審；取得實際審查結論後記錄日期與結果，發現差異先修正。
