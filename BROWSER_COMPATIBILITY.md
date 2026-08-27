# Browser compatibility

| Browser family | Package | Background | TTS | Browser AI | Install boundary |
|---|---|---|---|---|---|
| Chrome / Brave / Edge / Opera / Vivaldi (Chromium) | `RayLingo_v0.5.1_chromium.zip` | MV3 service worker | extension `tts`, then fallback | feature-detected (`Translator` / offscreen), never inferred from Chromium version | unpacked or signed store/CRX |
| Firefox | `RayLingo_v0.5.1_firefox.zip` | WebExtensions background scripts | Web Speech fallback | disabled if API/offscreen unavailable | temporary load; permanent requires Mozilla signing |
| Safari | `RayLingo_v0.5.1_safari-source.zip` | Safari Web Extension background scripts | Web Speech when available | no Chromium AI assumption | requires Apple/Xcode conversion and signing |

Brave uses a Chrome-like UA for compatibility, so RayLingo uses Brave's `navigator.brave.isBrave()` signal for branding while continuing to detect translation/TTS APIs independently. All packages share translation, UI i18n, selection UI, history, signed update metadata and integrity logic.
