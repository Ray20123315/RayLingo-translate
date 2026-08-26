# RayLingo v0.4.8

RayLingo 是跨瀏覽器即時翻譯擴充套件。Popup 專注翻譯，完整 Workspace 管理多語言 TTS、反白翻譯、外觀、歷史、更新與安全診斷。

## 瀏覽器支援

- Chromium：Chrome、Brave、Microsoft Edge、Opera、Vivaldi 等目前 Chromium WebExtension 瀏覽器使用 `manifest.json`，提供 MV3 service worker、擴充 TTS、offscreen Browser AI（瀏覽器能力允許時）。
- Firefox：使用 `manifest.firefox.json` 建置；背景改用 WebExtensions `background.scripts`，TTS 以 Web Speech API fallback。永久安裝仍需 Firefox/AMO 簽署。
- Safari：提供 `manifest.safari.json` 共用核心入口；Safari Web Extension 仍需透過 Apple 工具/Xcode 轉換與簽署，不能把 Chromium ZIP 直接當 Safari 擴充安裝。

翻譯本身會優先使用瀏覽器提供的 Translator API；沒有該 API 時，可使用 Google Translate web endpoint 遠端備援。遠端模式會將待翻譯文字送到 Google。

## 強調色

RayLingo 內建 8 組預設強調色：violet、blue、cyan、green、amber、orange、rose、magenta，也支援自訂 Hex 顏色。顏色只在完整 Workspace 設定，會同步 Popup 與反白浮窗。

## 反白翻譯

反白觸發器可顯示「譯」或小圓點，大小 14–56px。v0.4.8 修正小圓點預覽的 baseline/padding 跑版，預覽與實際 content-script trigger 都使用置中 grid。

## 檢查更新

Workspace 的「安全與診斷」可手動讀取：

`https://raw.githubusercontent.com/Ray20123315/RayLingo-translate/main/updates/latest.json`

更新 metadata 使用與 RayLingo 防偽相同的 Ed25519 金鑰做 detached signature。只有簽章、repository identity 與版本格式全部驗證後，UI 才會顯示新版資訊。RayLingo 不會自行注入或替換程式碼；真正的自動安裝更新仍遵守各瀏覽器的商店/簽署機制。

## 防偽與完整性

受保護檔案在 `integrity-manifest.json` 中記錄 SHA-256，整份清單再以 Ed25519 簽章。任何受保護檔案修改、缺失、大小或 Hash 不符，啟動後都會進入 LOCK。合法修改必須持有獨立的 `RayLingo_AI_CHANGE_AUTHORIZATION.md` 重新簽署；該私鑰檔不應進 ZIP、GitHub、Ray_Chen memory 或郵件。

注意：unpacked extension 的驗證器本身仍可被擁有本機檔案寫入權限的人修改。真正瀏覽器層級的不可竄改仍需商店/CRX/XPI/Safari 正式簽署。

## GitHub

Canonical repository：`Ray20123315/RayLingo-translate`。

- `extension/`：Chromium signed source
- `platform/`：Firefox / Safari manifest templates
- `updates/latest.json`：signed stable update metadata

## 安裝

### Chromium
1. 解壓 `RayLingo_v0.4.8_chromium.zip`。
2. 打開瀏覽器的 Extensions 管理頁，開啟 Developer mode。
3. Load unpacked，選擇解壓後資料夾。

### Firefox 開發測試
使用 `RayLingo_v0.4.8_firefox.zip`，在 `about:debugging` 載入 Temporary Add-on。正式永久安裝需 Firefox 簽署。

### Safari
使用 `RayLingo_v0.4.8_safari-source.zip` 作為 Safari Web Extension 轉換來源；需 Apple 工具完成 app-extension 封裝與簽署。
