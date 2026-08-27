# RayLingo Integrity Security — v0.5.1

RayLingo v0.5.1 使用 SHA-256 檔案清單與 Ed25519 簽章驗證受保護的套件檔案，包含執行檔、UI locale、文件與圖示。

- Runtime integrity：受保護檔案缺失、大小不符、Hash 不符或簽章驗證失敗時進入 locked state。
- Signed update metadata：`updates/latest.json` 會驗證 algorithm、Key ID、repository identity、版本格式與 release asset URL。
- Updater 只提供已驗證的版本資訊與下載入口，不會自行替換已安裝的擴充程式碼。
- Unpacked extension 仍可被擁有本機檔案寫入權限的人修改；瀏覽器層級的不可竄改仍依正式 CRX／商店／XPI／Safari 簽署機制。

v0.5.0 採用 signing identity v2。從 v0.4.8 過渡到 v0.5.0 是一次性的手動信任切換；後續 v0.5.x 版本使用 v2 identity 驗證。
