# RayLingo v0.5.1

RayLingo 是跨瀏覽器即時翻譯擴充套件。Popup 專注翻譯；完整 Workspace 管理多語言、TTS、反白翻譯、外觀、歷史、更新與安全診斷。

## v0.5.1 重點

- 修正「檢查更新」把 verifier 不存在誤判成 `UPDATE_SIGNATURE_INVALID` 的問題。更新 metadata 現在在 Update Checker 自己的執行環境完成 Ed25519 驗章，並區分 WebCrypto/Ed25519 不可用、Key ID 不符與真正簽章錯誤。
- Brave 不再只被標成 Chromium；使用 Brave 官方提供的 `navigator.brave.isBrave()` 能力來辨識品牌，翻譯能力仍以 `Translator` API 是否真的存在為準。
- 強調色改為 semantic tint：深色介面使用更接近 YouTube Speed Studio 的深黑表面、半透明 accent active/hover/focus/status，而不是把整塊 UI 塗滿強調色。
- 反白翻譯保留直接開啟／先顯示觸發器兩種模式；浮窗內可選來源與目標語言、可複製／朗讀，譯文使用可選取文字區域。啟用「結果逐字顯示」時，Popup、Workspace 與反白翻譯都以逐字效果呈現結果。
- 翻譯語言 registry 與 UI locale registry 仍完全分離：翻譯目前提供 20 種語言；UI 提供繁中、簡中、English、日本語、한국어，架構可獨立擴充，不把 UI 語言硬綁到翻譯語言。

## 瀏覽器支援

- Chromium：Chrome、Brave、Microsoft Edge、Opera、Vivaldi 使用 `manifest.json`，提供 MV3 service worker、擴充 TTS、offscreen Browser AI（瀏覽器能力允許時）。
- Firefox：使用 `manifest.firefox.json` 建置；背景改用 WebExtensions `background.scripts`，TTS 以 Web Speech API fallback。永久安裝仍需 Firefox/AMO 簽署。
- Safari：提供 `manifest.safari.json` 共用核心入口；Safari Web Extension 仍需透過 Apple 工具/Xcode 轉換與簽署。

翻譯優先使用瀏覽器實際提供的 Translator API；沒有該 API 時，可使用 Google Translate web endpoint 遠端備援。遠端模式會將待翻譯文字送到 Google。

## 強調色

RayLingo 內建 8 組預設強調色：violet、blue、cyan、green、amber、orange、rose、magenta，也支援自訂 Hex 顏色。v0.5.1 保留既有預設色值相容性，但重新定義它在 active、hover、focus、badge、狀態與反白浮窗中的使用方式。

## 檢查更新

Workspace 的「安全與診斷」會讀取：

`https://raw.githubusercontent.com/Ray20123315/RayLingo-translate/main/updates/latest.json`

metadata 使用 RayLingo signing identity v2 的 Ed25519 detached signature。只有簽章、Key ID、repository identity、版本格式與官方 GitHub Release asset URL 都通過才顯示新版資訊。Updater 只提供版本／下載入口，不會自行替換擴充程式碼。

## 防偽與完整性

受保護檔案在 `integrity-manifest.json` 中記錄 SHA-256，整份清單再以 Ed25519 簽章。任何受保護檔案修改、缺失、大小或 Hash 不符，啟動後都會進入 LOCK。

v0.5.0 已完成 signing identity v2 的一次性 trust rollover。v0.4.8 的 Update Checker 本身有 verifier-context bug，因此從 v0.4.8 直接升級到 v0.5.x 仍需手動安裝一次；已安裝 v0.5.0 的使用者可由同一 v2 identity 正常驗證 v0.5.1。私鑰授權檔不得進 ZIP、GitHub、Ray_Chen memory 或郵件。

注意：unpacked extension 的驗證器本身仍可被擁有本機檔案寫入權限的人修改。真正瀏覽器層級的不可竄改仍需商店/CRX/XPI/Safari 正式簽署。

## 安裝

### Chromium / Brave
1. 下載並解壓 `RayLingo_v0.5.1_chromium.zip`。
2. 打開 `brave://extensions`（Brave）或 `chrome://extensions`（Chrome/Chromium）。
3. 開啟 Developer mode。
4. 選擇 Load unpacked，指定解壓後資料夾。

### Firefox 開發測試
使用 `RayLingo_v0.5.1_firefox.zip`，在 `about:debugging` 載入 Temporary Add-on。正式永久安裝需 Firefox 簽署。

### Safari
使用 `RayLingo_v0.5.1_safari-source.zip` 作為 Safari Web Extension 轉換來源；需 Apple 工具完成 app-extension 封裝與簽署。
