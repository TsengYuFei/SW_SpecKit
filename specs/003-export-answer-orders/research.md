# Research: CSV 結果下載、逐題順位與活動連結複製

日期：2026-11-27。依已釐清的 [spec.md](spec.md) 規劃，僅唯讀檢查現有程式及官方／原始來源，未操作正式DB、Google教材或剪貼簿。本文件是設計決策，不是功能已實作或Excel已驗收的證明。

## R1 沿用資料與順位，不新增持久化模型

- **Decision**: TypeScript／React／Express／Socket.IO與SQLite沿用現有版本。組名、建場來源名稱、教材順序、完整答案與唯一sequence均已有保存；不新增migration、活動命名欄、排名表、export_jobs、下載收據或CSV快取。
- **Rationale**: `activity-repository.ts`保存source.spreadsheetTitle及題目快照；`persistent-store.ts`／history service可還原全部預設組與submissions。新建排名表會讓同一答案有兩份先後真相。
- **Alternatives considered**: 重新讀Google、依目前雲端名稱命名、另存CSV或下載任務皆無必要；不使用會安裝目前活動的refresh／store.installActivity路徑讀歷史。
- **Evidence**: 現有 `backend/src/activity/history-service.ts`、`backend/src/activity/persistent-store.ts`、`backend/src/persistence/activity-repository.ts`；資料模型仍為17表／110欄。

## R2 匯出唯讀快照與共同純順位

- **Decision**: 新增有界結果讀取器，先驗已授權teacher／owner、UUID及ended，再做大小預檢；以同步BEGIN DEFERRED唯讀快照讀取並驗證所需資料，COMMIT後才非同步編碼。不得在該交易中await、改runtime slot、建立receipt或喚醒worker。先針對owner限定metadata檢查source快照與答案原始bytes，避免先載入無界payload。來源快照與正規化題目欄位必須一致，缺題／缺答案不得用空白補成成功。
- **Rationale**: 一個SELECT的自動交易不足以保證多次SELECT為同一快照；SQLite讀取交易在期間看到一致已提交資料。現有connection.transaction使用BEGIN IMMEDIATE，應另加明確同步readSnapshot入口，禁止與寫交易／另一讀交易巢狀使用，不改既有寫入語意。[SQLite transactions](https://www.sqlite.org/lang_transaction.html)、[SQLite isolation](https://www.sqlite.org/isolation.html)。
- **Decision**: `shared/src/projections/answer-order.ts`只接受teacher可見的questions／groups／submissions，以sequence排序一次，按questionId分桶後給連續questionRank，供CSV與兩種教師介面共用；全部組別減已受理組別為unansweredGroups，未加入者只有系統組號。題組只有一份排序，各item取對應答案。
- **Alternatives considered**: 依receivedAt再排、前後端各寫排名、以第一名results取代全組答案，都會偏離規格。學生projection與Socket事件不新增排名欄位。
- **Read-only enforcement**: readSnapshot入口保存原query_only、暫設ON，完成或失敗均finally恢復；讀／寫交易旗標互斥，避免callback或repository誤升級寫交易。這只改連線暫態設定，不改資料列，不在交易中await。
- **Integrity refinement**: 核對現有participation-repository成功提交在同交易遞增next_sequence，因此ended快照必須滿足N筆sequence恰為1..N、activities.next_sequence=N+1，組別ordinal恰為1..group_count。這可拒絕整筆非winner提交遺失卻仍滿足FK／winner的情況；不增加Socket欄位，next_sequence只供backend完整性比對。

## R3 CSV 編碼及Excel文字保護

- **Decision**: 每一格含空字串皆以雙引號包覆，內部雙引號加倍，記錄分隔為CRLF、最後一筆亦結尾CRLF；一份檔案僅開頭一次UTF-8 BOM。Amax、Umax分別取全題最大，整份固定欄數；仍保留CSV逗號分隔，不加sep=、額外說明列或不同格式內容。[RFC 4180 §2](https://www.rfc-editor.org/rfc/rfc4180.html#section-2)、[Microsoft UTF-8 CSV](https://support.microsoft.com/en-us/excel/opening-csv-utf-8-files-correctly-in-excel)。
- **Decision**: 採`excel-tab-v1`文字政策：對以TAB／CR／LF／其他C0控制字元起始，或移除前置Unicode空白／BOM後以`= + - @ ＝ ＋ － ＠`起始的欄位，在原字串前增加一個TAB，再做CSV quoting。不trim／刪原字串；普通文字完全不加前綴。所有可變欄位均經同一函數，不只答案。這是匯出顯示保護，不更新DB。
- **Rationale**: CSV quoting只保護欄位邊界。OWASP指出quoted field內TAB是Excel上較可靠的已觀察策略，單引號或單靠引號不宜當成通用公式防護。[OWASP WSTG CSV Injection](https://wstg.owasp.org/latest/11-Injection/20-CSV_Injection/)。
- **Alternatives considered**: 盲加單引號、刪除等號、把內容包成公式或改XLSX不採用。無法保證所有外部軟體或使用者另存後重開仍保護；後續必須用實際Excel版本，以無外部連線的合成算式驗證直接開啟，記錄版本／build／地區。若失敗，先回到設計修訂及審查，不降低FR-014、SC-004。
- **UI notice**: 下載前固定可見「CSV供Excel檢視；可能被當成公式的內容會加安全文字前綴，原受理答案不變。轉存或供其他程式處理時請重新確認文字解讀。」不承諾匯出特殊值逐byte等於原值。

## R4 有界匯出與完整性

- **Decision**: `EXPORT_LIMITS`固定於backend/export/limits.ts：含表頭總列≤1,048,576；欄≤16,384；安全前綴後每格≤32,767 UTF-16 code units及≤253個LF。這些Excel數值依[Microsoft specifications and limits](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits)，UTF-16計數屬本專案保守選擇，不宣稱是Microsoft對所有字元的完整定義。
- **Decision**: 本機資源界線另設總邏輯格≤1,000,000（含表頭及空格）、快照JSON與原答案UTF-8 bytes合計≤32 MiB、最終BOM／quoting／CRLF計入的CSV≤32 MiB。所有檢查都用完整資料，超限回EXPORT_TOO_LARGE，不截答案、拆檔、省略組或改XLSX。CSV以有界chunks產生，至多每4,096格或4ms讓出事件迴圈，從載入至產生總工作逾時10秒，回安全失敗；30組／20題／40列驗收仍須達5秒。
- **Rationale**: 欄數必須計算3+2Amax+2Umax；例如4,096組且不同題分別全部作答／全部未答會有16,387欄，不能只用單題組數估計。先拒絕再下載，可避免Excel靜默裁切或單一匯出阻塞搶答。
- **Decision**: 同一teacher session固定5秒窗最多2次有效匯出嘗試，獨立於mutation budget；全行程同時生成最多1件。忙碌回EXPORT_BUSY、Retry-After:1；頻率超過回RATE_LIMITED，Retry-After為剩餘整秒。成功、失敗、中斷、授權變更均finally釋放生成slot；不建立佇列或自動重試。頻率狀態只留記憶體，過期清理，不保存認證資料。

## R5 下載介面、中文檔名與臺灣時間

- **Decision**: teacher-only `GET /api/activities/:id/export.csv`；同源fetch帶既有x-csrf-token，無query／body。既有Host／Origin及no-store保留，明確HEAD 405避免Express自動走GET大量產生。所有成功headers等完整CSV通過驗證後才送；錯誤仍是安全JSON envelope。[Express application](https://expressjs.com/en/api/application/index)。
- **Decision**: 檔名取建場source.spreadsheetTitle，替換Windows禁用字元及C0／DEL、去尾端ASCII空白與句點，空字串用未命名活動。完整basename同時≤240 UTF-8 bytes及≤240 UTF-16 code units，僅按Unicode code point縮短活動名稱，保留完整UUID與時間。240為專案保守預算，不是所有檔案系統通用保證。[Windows naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)。
- **Decision**: `Intl.DateTimeFormat`指定Asia/Taipei與hourCycle:h23，從formatToParts組YYYYMMDD-HHmmss；exportedAt在開始處理一次擷取，不用裝置時區或活動時間。HTTP attachment給ASCII fallback `buzzer_results_<完整UUID>_<時間>.csv`及UTF-8 percent-encoded filename\*；不能直接將中文／控制字元插入header。[RFC 6266](https://www.rfc-editor.org/rfc/rfc6266.html#section-4.3)、[RFC 8187](https://www.rfc-editor.org/rfc/rfc8187.html#section-3.2)。
- **Alternatives considered**: window.location直接導航下載難處理錯誤及帳號切換；既有http helper固定JSON，不能直接重用於CSV。新binary helper只在200及正確CSV／attachment後讀blob，保留BOM bytes；JSON錯誤不觸發下載。

## R6 兩種教師視角及歷史即時性

- **Decision**: 共用AnswerOrderPanel，提供「全部收件」／「依題目」兩個一般button切換視角（aria-pressed，不自造不完整ARIA tabs），逐題有原教材順序的有標籤select。全部顯示全場序號及本題順位，逐題以順位列出完整組名及各子題label／prompt／answer，未作答另區。長文字換行、需要時表格橫捲有可聚焦region，無受理時仍顯題目與未作答。
- **Decision**: ActivityPage用既有live teacher snapshot；HistoryDetail已結束用保存snapshot，仍在waiting／active的所屬活動另以既有useActivity訂閱原活動，使歷史視角亦2秒內更新。收ended後以世代防護重取detail一次以更新結束時間；若原場變成非current而subscribe拒絕，重讀一次保存detail，不做無限重試或新增寫入。
- **Decision**: teacher Classroom與新下載／複製元件以bootId／sessionVersion／authGeneration／activityId作scope fence；學生key與projection不改。取消fetch及忽略舊epoch結果，blob完成後、建立objectURL前和啟動下載前再次核對context。[WHATWG body.blob](https://fetch.spec.whatwg.org/#dom-body-blob)、[W3C File API revokeObjectURL](https://w3c.github.io/FileAPI/#dfn-revokeObjectURL)。

## R7 複製是寫入剪貼簿，不讀取剪貼簿

- **Decision**: CopyActivityLinkButton使用畫面同一份studentUrl；在使用者click／Enter／Space處理直接呼叫navigator.clipboard.writeText，resolve才成功，不先await網路也不讀clipboard驗證。失敗／不支援保留可選完整網址與明確手動方式，回饋role=status／alert。
- **Rationale**: 剪貼簿有安全context及使用者啟用／權限條件；loopback HTTP不宜一律判定不可用，要feature detection及實際promise結果。[W3C Clipboard API](https://www.w3.org/TR/clipboard-apis/#dom-clipboard-writetext)、[W3C Secure Contexts](https://www.w3.org/TR/secure-contexts/Overview.html)。
- **Decision**: pending時阻止重複啟用，URL／授權／boot變更使舊epoch回饋失效。瀏覽器已啟動的剪貼簿寫入沒有通用取消保證，不能承諾撤回既已寫入內容；本系統不會在新scope再次寫舊URL或誤報舊成功。

## R8 驗證與交付界線

- **Decision**: 保留現有完整回歸，新增純順位／CSV／檔名unit、真實隔離SQLite及teacher HTTP安全／無寫入integration／contract、下載與複製延遲／鍵盤／隱私E2E及Excel人工合成檔案驗收。新增錯誤碼與DTO須在shared嚴格schema同步。
- **Rationale**: 現有tests/helpers/catalog-server.ts與production-process.ts已可不用真實Google憑證測正式流程；既有168項是前版已完成結果，本次只規劃、不把它算本功能通過。
- **Alternatives considered**: 不讀正式DB或瀏覽器授權，不為結果下載重做真實Google回填。所有待實作、實測及人工設計／文件／Excel核對都明確保持待辦。

## Resolved Technical Decisions

所有研究未知項已有具體方案：CSV安全文字政策與驗收、大小上限、檔名編碼與時區、唯讀快照、權限／資源閘門、共用排名、歷史即時訂閱、binary下載及剪貼簿備援。沒有待使用者再釐清的需求；Excel實測及設計／文件人審為後續驗收門檻，不偽裝為研究已完成的測試。
