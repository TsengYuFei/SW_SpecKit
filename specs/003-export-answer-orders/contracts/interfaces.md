# Interface Contracts: CSV 匯出與教師順位／複製介面

預定契約，尚未實作。需求與模型以 [spec.md](../spec.md)、[data-model.md](../data-model.md) 為準；數值上限集中參照 [research R4](../research.md#r4-有界匯出與完整性)。既有HTTP JSON及Socket命令／投影不做破壞性變更。

## Teacher HTTP Download

### GET /api/activities/:id/export.csv

- 只在teacher listener註冊，支援目前或任一歷史活動，不受current slot限制。student listener固定沒有此route。
- path id為完整UUID；query與body為空，額外owner／format／filename等皆拒絕INVALID_INPUT。
- 同源fetch使用既有HttpOnly teacher session及`x-csrf-token`，可送`Accept: text/csv`；不將Cookie、CSRF、OAuth或下載權杖放URL或檔名。不新增可繞過帳號權限的公開下載網址。
- 順序：Host／Origin→teacher session→CSRF→UUID／空query/body→已授權Google帳號→owner限定metadata／ended→頻率與生成slot→預檢／一致唯讀快照→驗資料／共用順位→完整安全CSV→送出前再核authGeneration／owner。
- 資源閘門只有拿到全域slot時記本session一次嘗試，其他人忙碌不增加其次數。每5秒2次，只有1件生成；失敗亦不立即自動重試。SQL／快照讀取中不await，編碼以有界chunk讓出事件迴圈並檢查取消、授權代次及協作式10秒deadline。deadline不宣稱能強制中斷正在執行的同步SQL。
- 讀取時不使用會installActivity的refresh、不創receipt，不讀Google或回填job。metadata的owner檢查在載入source snapshot前完成；在同一readSnapshot核對source／正規化題目／groups／submissions／answers／frozen results及next_sequence。

### 200 Response

| Header／body           | 精確規則                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Content-Type           | `text/csv; charset=utf-8`                                                                                                |
| Content-Disposition    | `attachment; filename="buzzer_results_<完整UUID>_<YYYYMMDD-HHmmss>.csv"; filename*=UTF-8''<percent-encoded完整中文檔名>` |
| Content-Length         | 最終Buffer bytes長度，含BOM                                                                                              |
| Cache-Control          | no-store                                                                                                                 |
| X-Content-Type-Options | nosniff                                                                                                                  |
| Referrer-Policy        | no-referrer                                                                                                              |
| ETag／Last-Modified    | 不提供；不因條件請求回304或重用舊帳號檔案                                                                                |
| Body                   | 已完整驗證的BOM＋CSV bytes，不是JSON envelope；整份產生前不送attachment headers或部分body                                |

最終中文檔名固定為`搶答結果_活動名稱_活動ID_YYYYMMDD-HHmmss.csv`。活動名稱僅取建場保存的source.spreadsheetTitle；將`< > : " / \ | ? *`、C0及DEL替換為底線，去末尾空白／句點，空值用未命名活動。basename超過240 UTF-8 bytes或240 UTF-16 code units時只以Unicode code point邊界縮短名稱段；若縮短為空亦用fallback並再驗上限。完整UUID、Taipei格式時間、固定前綴及.csv不可被截短。時間在本次工作開始一次擷取，hourCycle:h23，午夜為000000；locale或作業系統時區不能改變結果。filename\*遵守RFC8187 attr-char及UTF-8百分比編碼，使用encodeURIComponent時須額外處理其未編碼但不屬於attr-char的單引號、括號及星號，並納入檔名測試。

### Errors and Other Methods

所有GET失敗回既有`{ok:false,error:{code,message,retryable},revision:0}`，Content-Type為JSON且沒有attachment／CSV body。已終止連線不再嘗試回成功，已生成的記憶體內容應釋放。

| 情況                                   | HTTP／code                                    | 行為                                             |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| 缺teacher session                      | 401 UNAUTHORIZED                              | 不揭露內容                                       |
| 缺Google授權或代次已變                 | 401 GOOGLE_AUTH_REQUIRED                      | frontend忽略舊scope、不建立下載                  |
| Host／Origin／CSRF不符                 | 403 FORBIDDEN                                 | 不產生CSV                                        |
| id／query／body無效                    | 400 INVALID_INPUT                             | 不處理額外欄位                                   |
| 非owner／不存在                        | 404 ACTIVITY_UNAVAILABLE                      | 同安全回覆，不透露存在性                         |
| waiting／active                        | 409 INVALID_PHASE                             | 提示活動結束後才能匯出                           |
| 頻率超限                               | 429 RATE_LIMITED                              | Retry-After為5秒窗剩餘整秒，最小1                |
| 生成slot忙或工作協作式逾時             | 503 EXPORT_BUSY（新增，retryable=true）       | Retry-After:1，明示稍後手動重試，不排隊          |
| 任一Excel／專案大小界線超過            | 422 EXPORT_TOO_LARGE（新增，retryable=false） | 明示未產生檔案與限制說明，不截斷資料             |
| 缺題／缺答案／sequence或frozen結果矛盾 | 503 STORAGE_CORRUPT                           | 不假造空答案；無SQL、路徑或原始資料              |
| 暫時讀取失敗                           | 503 STORAGE_UNAVAILABLE                       | 保持原資料，安全失敗                             |
| 其他非預期失敗                         | 500 INTERNAL_ERROR                            | allowlist訊息                                    |
| HEAD                                   | 405，Allow: GET                               | 明確在GET前註冊，無body、不生成CSV、不讀活動內容 |
| POST／PUT／DELETE                      | 不新增route，沿用404                          | 不將下載當成活動mutation                         |

新增EXPORT_BUSY／EXPORT_TOO_LARGE同步至shared/src/schemas/common.ts與safe-errors.ts；兩者訊息只描述操作與限制，不帶payload。logger只沿用request_failed事件、code、durationMs白名單；不記組名、題目、答案、下載bytes、title、Cookie或headers。沒有新增下載持久紀錄。

## CSV Payload Contract

欄位順序、Amax/Umax及例子沿用 [spec CSV欄位契約](../spec.md#csv-欄位契約)。每列的單題子題欄固定空，題組label依data-model正規化；對應prompt與answers依item順序。對已受理資料缺欄位必須拒絕，只有不存在的順位／未作答欄位slot才補空字串。快照中N筆受理的sequence須恰為1..N、next_sequence=N+1，全部組別ordinal須恰為1..group_count；整筆非winner提交與其答案遺失，即使FK與winner仍一致亦回STORAGE_CORRUPT。

序列化順序固定：原邏輯值→excel-tab-v1判斷並必要時前置一個TAB→cell文字／LF上限→內部雙引號加倍及全欄雙引號包覆→逗號連接→CRLF記錄→UTF-8編碼且一次BOM。bytes累加超限就失敗，最後仍不送半份檔案。全場零受理時Amax=0，但每題與所有組別的未作答欄均保留；若不同題使Amax與Umax分別最大，保留兩區全部欄位。

安全文字政策：原字串以C0控制字元起始，或忽略前置Unicode空白及BOM後首字為`= + - @ ＝ ＋ － ＠`，均在原字串前加TAB。字串原有空白／控制內容不移除，已含TAB也不把它視為已安全而跳過。普通字串與空字串不加前綴；這個函數只執行一次。quoted欄位內的保護TAB是下載內容一部分，原DB不變。任何Excel實測不符安全文字預期，該驗收不得勾選，需先修訂設計。

## Shared Answer Order Contract

`deriveAnswerOrder(input: AnswerOrderInput): AnswerOrderView`為純函數，欄位詳見[data-model](../data-model.md#planned-transient-entities)。不修改input，不讀時間／網路／DB，不產生新sequence，也不自行把不完整題組當成受理。資料錯誤產生可由呼叫者攔截的型別化錯誤；backend轉STORAGE_CORRUPT，frontend顯示局部錯誤。

CSV encoder與AnswerOrderPanel共用此函數，保證同一input的all、per-question順序一致；既有成功組選擇仍按sequence且需回歸驗證兩者第一名一致。學生snapshot、teacher:progress、activity:subscribe及其他Socket wire格式均不新增欄位，也不把完整teacher input交給student再前端裁切。

## Teacher UI Contract

### AnswerOrderPanel

- ActivityPage與HistoryDetailPage使用同一元件，取代目前單純div答案紀錄；既有ProgressTable、最終結果及回填面板仍保留。
- 預設「全部收件」，一般button的aria-pressed標示目前視角；另一button為「依題目」。逐題有清楚label的原順序題目select，可鍵盤切換。
- 全部視角按全場sequence列出題號、完整組名、全場收件序號、本題順位及完整各子題label／prompt／answer。逐題視角按本題rank呈現，亦保留可查對的全場序號，未作答另區且不列rank。
- 無受理以文字提示；四組六題40字名／多行答案可完整閱讀，長欄換行或有focusable橫捲region，不能只靠色彩或截斷後沒有完整內容。
- waiting/active歷史詳情透過live wrapper使用既有useActivity同步teacher snapshot，不只保留首次GET資料；收到ended後重取detail一次以更新時間，答案維持同一順序。若原場已非current，重讀已保存詳情一次後停止live，不自動建場。ended歷史不需訂閱。

### ExportResultsButton and Binary Download

- 目前活動與所選歷史詳情均提供單場匯出。waiting／active不可匯出且顯示原因；ended即使回填未完成仍可操作。顯示research R3固定安全文字說明。
- 狀態idle/loading/started/error，loading停用重複點擊；started只說「已開始下載」，不宣稱已存入磁碟。
- 專用download helper帶CSRF及AbortSignal，同源GET；非200先驗安全JSON envelope，200須同時有正確CSV content type及可解析的attachment檔名，否則不觸發下載。不把JSON錯誤、HTML或body讀取失敗當作CSV。
- 使用response.blob()保留BOM，不使用response.text()重編碼。優先解filename*；無filename*才用ASCII fallback；無法解析、含路徑／控制字元或缺.csv拒絕。
- 下載scope為activityId／bootId／sessionVersion／authGeneration／元件epoch，fetch後、body完成、建立objectURL前及anchor觸發前檢查仍有效；切換／卸載abort並忽略舊結果。objectURL在觸發後下一個macrotask清理，卸載／失敗亦清理；不可把csrf或Cookie放React key。
- App的teacher Classroom亦以非機密scope key或等效取消context隔離；學生元件key不擴改。已交給瀏覽器的下載不能承諾撤回，但舊response不得在新scope啟動新的下載。

### CopyActivityLinkButton

- 只從畫面同一份有效完整studentUrl複製；不要重新拼不同host、教師URL或新導入URL query。顯示的link與copy共用同一值。
- 使用者啟用後立即writeText，不先await fetch、不讀clipboard。pending停用連點；resolve確認才顯示「已複製活動連結」，失敗／能力缺少顯示role=alert並提供可選網址及手動複製提示。
- feedback於已知結果後1秒內出現，成功用role=status，不只色彩。URL、帳號、boot或元件epoch變更忽略舊promise，不能將舊結果套新場；不宣稱能取消瀏覽器已接收的clipboard寫入。

## Compatibility and Acceptance

無新migration、Google scopes、Google API呼叫、學生route或Socket資料；舊活動及恢復規則保留。CSV只是結果下載，不能輸入成Guided Notes或改變end自動回填。此契約正常、拒絕、資料損壞、大小邊界、晚回覆及Excel人工驗收均須列入後續tasks與[quickstart](../quickstart.md)，不得以研究文件或前版168項結果替代。
