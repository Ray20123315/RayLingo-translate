# Browser compatibility

| Browser family | Package | Background | TTS | Browser AI | Install boundary |
|---|---|---|---|---|---|
| Chrome / Brave / Edge / Opera / Vivaldi (Chromium) | `RayLingo_v0.4.8_chromium.zip` | MV3 service worker | extension `tts`, then fallback | offscreen when supported | unpacked or signed store/CRX |
| Firefox | `RayLingo_v0.4.8_firefox.zip` | WebExtensions background scripts | Web Speech fallback | disabled if offscreen unavailable | temporary load; permanent requires Mozilla signing |
| Safari | `RayLingo_v0.4.8_safari-source.zip` | Safari Web Extension background scripts | Web Speech when available | no offscreen assumption | requires Apple/Xcode conversion and signing |

All packages share translation, i18n, selection UI, history, signed update metadata and integrity logic. Platform-only APIs are capability-detected and fall back instead of causing a hard failure.
