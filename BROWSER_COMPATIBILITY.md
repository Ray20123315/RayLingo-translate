# Browser compatibility

| Browser family | Package | Background | TTS | Translator capability | Install boundary |
|---|---|---|---|---|---|
| Chrome / Brave / Edge / Opera / Vivaldi | `RayLingo_v0.5.0_chromium.zip` | MV3 service worker | extension TTS then fallback | feature-detected from actual API presence | unpacked or signed store/CRX |
| Firefox | `RayLingo_v0.5.0_firefox.zip` | WebExtensions background scripts | Web Speech fallback | remote fallback when native API is unavailable | temporary load; permanent requires Mozilla signing |
| Safari | `RayLingo_v0.5.0_safari-source.zip` | Safari Web Extension background | Web Speech when available | no Chromium API assumption | Apple/Xcode conversion and signing |

Brave uses a Chrome-like user agent for compatibility. RayLingo therefore keeps browser-brand detection separate from Translator/TTS capability detection.
