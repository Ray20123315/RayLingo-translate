(() => {
  'use strict';

  const ua = String(globalThis.navigator?.userAgent || '');
  const isFirefox = /Firefox\//i.test(ua);
  const isSafari = /Safari\//i.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox)\//i.test(ua);
  const isChromium = !isFirefox && !isSafari && /(Chrome|Chromium|CriOS|Edg|OPR)\//i.test(ua);
  // Brave intentionally uses a Chrome-like UA. Its documented JS detection API
  // is navigator.brave.isBrave(); the presence check keeps the synchronous label
  // correct while `isBrave()` remains available for callers that need confirmation.
  const isBrave = Boolean(globalThis.navigator?.brave && typeof globalThis.navigator.brave.isBrave === 'function');

  if (isFirefox && globalThis.browser) {
    try { globalThis.chrome = globalThis.browser; } catch {}
  }

  const api = globalThis.chrome || globalThis.browser || null;
  const family = isFirefox ? 'firefox' : isSafari ? 'safari' : isChromium ? 'chromium' : 'webextension';
  const packageKey = family === 'firefox' ? 'firefox' : family === 'safari' ? 'safari' : 'chromium';

  function browserLabel() {
    if (isBrave) return 'Brave';
    if (/Edg\//i.test(ua)) return 'Microsoft Edge';
    if (/OPR\//i.test(ua)) return 'Opera';
    if (/Vivaldi/i.test(ua)) return 'Vivaldi';
    if (isFirefox) return 'Firefox';
    if (isSafari) return 'Safari';
    if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua)) return 'Chromium';
    return 'WebExtension';
  }

  async function confirmBrave() {
    if (!isBrave) return false;
    try { return Boolean(await globalThis.navigator.brave.isBrave()); }
    catch { return true; }
  }

  function capabilities() {
    return Object.freeze({
      extensionTts: Boolean(api?.tts?.speak),
      offscreen: Boolean(api?.offscreen?.createDocument),
      webSpeech: Boolean(globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance),
      translator: Boolean(globalThis.Translator),
      languageDetector: Boolean(globalThis.LanguageDetector),
      contextMenus: Boolean(api?.contextMenus),
      storage: Boolean(api?.storage?.local),
      tabs: Boolean(api?.tabs),
      clipboard: Boolean(globalThis.navigator?.clipboard)
    });
  }

  globalThis.RayLingoPlatform = Object.freeze({
    family,
    packageKey,
    label: browserLabel(),
    isFirefox,
    isSafari,
    isChromium,
    isBrave,
    confirmBrave,
    api,
    capabilities
  });
})();
