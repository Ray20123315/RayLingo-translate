# Browser compatibility — v0.7.1

| Browser family | Package | Background | AI / multimodal | Current-tab video transcription | TTS | Install boundary |
|---|---|---|---|---|---|---|
| Chrome / Brave / Edge / Opera / Vivaldi (Chromium) | `RayLingo_v0.7.1_chromium.zip` | MV3 service worker + offscreen | Gemini + DeepSeek text; Gemini image/PDF/media | Yes, explicit `tabCapture` start/stop + Gemini; public YouTube can use URL path | extension TTS, Web Speech/offscreen fallback | unpacked or signed store/CRX |
| Firefox | `RayLingo_v0.7.1_firefox.zip` | WebExtensions background scripts | Gemini + DeepSeek text; Gemini uploaded media | No `tabCapture` claim; public YouTube/uploaded media remain available | Web Speech/fallback where available | temporary load; permanent requires Mozilla signing |
| Safari | `RayLingo_v0.7.1_safari-source.zip` | Safari Web Extension background | Gemini + DeepSeek text; Gemini uploaded media | No Chromium `tabCapture` claim; public YouTube/uploaded media remain available | Web Speech where available | requires Apple/Xcode conversion and signing |

Brave branding uses `navigator.brave.isBrave()` when present, while Translator/TTS/media capabilities are feature-detected independently. The persistent floating translator, selection UI, 36-language translation registry, 8-language UI registry, AI provider configuration, subtitle overlay, history and signed-update logic share the same core where platform APIs permit.
