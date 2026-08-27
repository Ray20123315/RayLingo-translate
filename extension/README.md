# RayLingo v0.5.1

RayLingo 是跨瀏覽器即時翻譯擴充套件。Popup 專注翻譯；Workspace 管理多語言 TTS、反白翻譯、外觀、歷史、更新與診斷。

## v0.5.1 重點

- 修正 Workspace 更新檢查的 verifier context 問題，避免把執行環境錯誤誤報為 `UPDATE_SIGNATURE_INVALID`。
- Update Checker 直接在頁面執行環境驗證 Ed25519 metadata，並區分不支援、Key ID 不符、repository 不符與真正簽章錯誤。
- Brave 品牌辨識與 Translator capability 分離：品牌使用 Brave 提供的偵測訊號，翻譯能力仍以實際 `Translator` API 是否存在為準。
- 強調色改為 semantic tint：深黑表面搭配 accent 的 active／hover／focus／status 狀態，不再用整塊漸層填滿主要導覽。
- 反白翻譯保留來源／目標語言、可選取／複製結果、TTS 與逐字顯示。
- UI locale registry 目前包含繁體中文、簡體中文、English、日本語、한국어，缺少字串時使用 deterministic English fallback。

## 瀏覽器

- Chromium：Chrome、Brave、Edge、Opera、Vivaldi。
- Firefox：開發測試可使用 WebExtensions build；永久安裝仍依 Mozilla 簽署規則。
- Safari：提供 Safari Web Extension conversion source；需 Apple/Xcode 完成封裝與簽署。

## 安裝

Chromium / Brave：解壓 `RayLingo_v0.5.1_chromium.zip`，到 Extensions 管理頁開啟 Developer mode，使用 Load unpacked 載入解壓後資料夾。
