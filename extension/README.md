# RayLingo v0.7.1

RayLingo 是跨瀏覽器即時翻譯工作台。除了手動／反白翻譯，v0.7.1 加入常駐懸浮翻譯器、Gemini／DeepSeek AI、AI 結果 TTS、多模態檔案、影片字幕翻譯，以及沒有字幕時的影片取文字翻譯。

## v0.7.1 功能

- **常駐懸浮翻譯器**：可開啟／關閉、縮成小點、hover 展開，並記住展開狀態。反白文字仍可直接帶入同一個浮窗。
- **AI Provider**：Gemini 與 DeepSeek 共用 provider abstraction，可設定 provider、model 與 API key；文字翻譯可選 Browser/Remote/Gemini/DeepSeek。
- **AI + TTS**：AI 翻譯結果直接進既有結果區，因此複製、歷史與 TTS 不需要第二套流程；影片轉錄會保留原文與譯文，兩邊都可朗讀。
- **多模態**：DOCX/PPTX/TXT/Markdown/CSV/HTML/SRT/VTT 等優先在本機抽文字；圖片、PDF、audio/video 可在明確同意後上傳 Gemini 處理。
- **影片字幕翻譯**：支援 HTML5 `textTracks`、常見 YouTube DOM captions，並以 RayLingo overlay 呈現翻譯字幕。
- **影片取文字翻譯**：公開 YouTube 可直接交給 Gemini 理解；Chromium/Brave 對其他目前分頁可由使用者明確開始／停止 tab capture，錄成低碼率 WebM 後取得完整原始 transcript 與翻譯。
- **多語言**：翻譯 registry 36 種語言；UI registry 8 種（繁中、簡中、English、日本語、한국어、Español、Français、Deutsch），缺漏字串 deterministic fallback 到 English。
- **外觀**：Popup、Workspace、反白／常駐浮窗共用 YouTube Speed Studio 風格 semantic accent：近黑 surface、局部 tint、focus ring 與 hover glow，而不是整塊填滿強調色。

## 隱私與成本邊界

- API key 只儲存在瀏覽器 `chrome.storage.local`，不應提交至 Git、Ray_Chen memory、Release 或通知郵件。
- DOCX/PPTX 等可本機抽字的格式不會為了抽字而上傳原檔。
- 圖片/PDF/audio/video 與目前分頁錄製只有在使用者開啟遠端媒體同意後才會送往 Gemini。
- 目前分頁 capture 是 Chromium-family 能力；Firefox/Safari 不宣稱提供此能力，仍可使用公開 YouTube URL 或使用者上傳的受支援媒體。
- RayLingo 不繞過 DRM、付費牆或網站存取控制；瀏覽器／DRM 不允許擷取的影片可能無法轉錄。

## 瀏覽器支援

請見 `BROWSER_COMPATIBILITY.md`。Browser Translator API 與 TTS 都以實際 capability detection 為準，不以 UA/Chromium 版本字串冒充支援。

## 完整性與更新

套件內受保護檔案會列入 `integrity-manifest.json` 的 SHA-256 inventory，整份 inventory 由 signing identity v2 使用 Ed25519 簽章。`updates/latest.json` 也使用同一 identity 簽署；Updater 只提供已驗證版本／下載入口，不會自行替換擴充程式碼。

從 v0.5.0 起使用的 signing identity v2 延續到 v0.7.1，沒有再次 trust rollover。私鑰授權檔不得進 ZIP、GitHub、Ray_Chen memory 或郵件。

## 安裝

- Chromium / Brave：解壓 `RayLingo_v0.7.1_chromium.zip`，在 Extensions 管理頁開啟 Developer mode 後 Load unpacked。
- Firefox：`RayLingo_v0.7.1_firefox.zip` 可供 Temporary Add-on 測試；永久安裝仍需 Mozilla 簽署。
- Safari：使用 `RayLingo_v0.7.1_safari-source.zip` 作為 Safari Web Extension 轉換來源，仍需 Apple/Xcode 封裝與簽署。
