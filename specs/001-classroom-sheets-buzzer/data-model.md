# Data model

本文件為預定設計。所有伺服端實體只存於記憶體，程序重啟全部失效。

| 實體 | 欄位與關係 | 驗證與唯一性 |
| --- | --- | --- |
| Activity | id、bootId、phase、revision、groupCount、source、questions、groups、submissions、nextSequence、commandReceipts | 一個 active store，phase 為 waiting/active/ended |
| Source | spreadsheetId、sheetId 清單、baseline、mappingVersion、confirmed、loadState | URL 僅解析 docs.google.com/spreadsheets/d/ID，不 fetch 使用者 URL；loadState 為 empty/loading/ready/error |
| Question | id、displayNumber、kind、items | id 使用來源 sheetId 與題號格座標，跨分頁重複題號仍唯一 |
| Item | id、label、prompt、target、baselineValue | 完整題組內 id 唯一，目標不得重疊 |
| Target | sheetId、rowIndex、columnIndex、mergeRange | 零起算，合併格用左上格，保留結構基線 |
| Group | id、ordinal、name、browserSessionId | 每活動 ordinal 唯一；session 與 group 一對一 |
| BrowserSession | 隨機 session id、role、activityId | 由伺服端發給持續至瀏覽器工作階段結束的 cookie，不接受 client 自選 role；多分頁共用身分 |
| Submission | id、requestId、questionId、groupId、answers、receivedAt、sequence | groupId + questionId 唯一；answers 恰好包含全部 item id |
| Writeback | operationId、questionId、item statuses、expectedAnswers | idle/writing/pending/verified/conflict/failed |
| OAuthSession | state、teacherSessionId、expiresAt、accessToken、refreshToken、tokenExpiresAt | state 單次、五分鐘有效，綁定老師 session；僅教師後端記憶體，不進 DTO、日誌或快照 |

groupCount 為正的安全整數；超出可配置資源預算時明確拒絕建立。組名為選填純文字，trim 後 1–40 字；
答案為 trim 後 1–2000 字。傳輸大小上限 1 MiB，超限回可理解錯誤。
這些輸入防護預設值須在 UI 顯示，不限制教材題數。

Waiting 階段讀取與確認教材，組別可在 waiting/active 加入空組，ended 拒絕新加入。
start 要求 loadState=ready、題目對應 confirmed 且無進行中的來源讀取。
新的載入使舊 confirmed 失效，非同步載入的版本過期則丟棄其結果。
Active 接受有效提交；Ended 凍結成功組，允許建立下一場取代已結束場次，
但須待既有回寫或待確認操作處理完畢。新場使用全新 id，原組別綁定不帶入。
每項命令驗證及狀態 mutation 同步執行，不在臨界區 await。
sequence 按 reducer 入口收件順序遞增，避免系統時間回撥改變勝負。
命令收據以 activityId、sessionId、event、requestId 為鍵。
相同鍵與相同標準化 payload 回原收據；不同 payload 回 REQUEST_CONFLICT。
被拒絕的提交也快取其結果，修正答案後使用新的 requestId。
結束後重送舊 requestId 僅查回原收據，不新增提交；新請求拒絕。

快照以 revision 遞增。學生僅取得可選組別與占用狀態、題目、自組提交是否成功；
活動結束前連自組收件 sequence 和他組進度均不提供。
老師可取得各組提交及暫定結果。Ended 雙方取得成功組與各小題答案。
Google token 與 browserSessionId 永不出現在公開投影。
同一 cookie 的多分頁視為同一身分，共享一份提交限制。

重啟由新 bootId 與新 activityId 區分；舊 id 回 ACTIVITY_UNAVAILABLE。
新的空白伺服端無法判斷先前歷史，教師啟動畫面固定提示重啟後須重建活動。

Writeback 的每題狀態由 idle 到 writing，成功回讀為 verified；未知回覆為 pending，
明確失敗為 failed，來源變更為 conflict。pending 重新讀取後，全部答案相符為 verified，
全部仍為 baseline 才允許重新預檢及重送，任何其他或混合結果為 conflict。
題組任何小題預檢衝突則整題組停止回寫。禁止依內容相符推論原 Google 請求一定成功，
verified 僅表示最新讀回內容已符合公布答案。每個題組的所有更新置於同一原子批次。

writing、pending 為未完成回寫，須阻止取代目前活動；verified、conflict、failed 為終止狀態。
failed 僅適用可確定未寫入的失敗，未知結果仍為 pending。pending 查核仍失敗時保留原狀態
並允許重新授權或稍後查核，查核完成前持續阻止建立新活動。idle 表示尚未發起寫入。

教師重新整理頁面時，GET /api/session 由目前記憶體 store 導出 currentActivityId，
前端使用該 id 重新 subscribe。學生端不取得此欄位，仍以加入連結中的活動 id 訂閱。
