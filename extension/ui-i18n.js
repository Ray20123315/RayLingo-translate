(() => {
  'use strict';

  const UI_LOCALES = Object.freeze([
    { code: 'zh_TW', label: '繁體中文', aliases: ['zh_tw', 'zh_hant', 'zh_hk', 'zh_mo'] },
    { code: 'zh_CN', label: '简体中文', aliases: ['zh_cn', 'zh_hans', 'zh_sg'] },
    { code: 'en', label: 'English', aliases: ['en'] },
    { code: 'ja', label: '日本語', aliases: ['ja'] },
    { code: 'ko', label: '한국어', aliases: ['ko'] },
    { code: 'es', label: 'Español', aliases: ['es'] },
    { code: 'fr', label: 'Français', aliases: ['fr'] },
    { code: 'de', label: 'Deutsch', aliases: ['de'] }
  ]);
  const SUPPORTED = Object.freeze(UI_LOCALES.map(locale => locale.code));
  const FALLBACK_LOCALE = 'en';
  const LAST_RESORT_LOCALE = 'zh_TW';
  const cache = new Map();
  let currentLocale = LAST_RESORT_LOCALE;
  let currentMessages = null;
  let fallbackMessages = null;

  function normalizeLocale(locale) {
    if (!locale || locale === 'auto') return null;
    const normalized = String(locale).replace('-', '_');
    if (SUPPORTED.includes(normalized)) return normalized;
    const lower = normalized.toLowerCase();
    for (const item of UI_LOCALES) {
      if (item.aliases.some(alias => lower === alias || lower.startsWith(`${alias}_`))) return item.code;
    }
    const base = lower.split('_')[0];
    return UI_LOCALES.find(item => item.code.toLowerCase() === base)?.code || null;
  }

  async function loadMessages(locale) {
    if (!locale) return null;
    if (cache.has(locale)) return cache.get(locale);
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const messages = await response.json();
      cache.set(locale, messages);
      return messages;
    } catch (error) {
      console.debug('[RayLingo] locale file load failed:', locale, error);
      cache.set(locale, null);
      return null;
    }
  }

  async function init(preference = undefined) {
    let preferred = preference;
    if (preferred === undefined) {
      try {
        const stored = await chrome.storage.local.get({ uiLocale: 'auto' });
        preferred = stored.uiLocale;
      } catch {
        preferred = 'auto';
      }
    }

    const browserLocale = chrome.i18n?.getUILanguage?.() || LAST_RESORT_LOCALE.replace('_', '-');
    currentLocale = normalizeLocale(preferred) || normalizeLocale(browserLocale) || LAST_RESORT_LOCALE;
    currentMessages = await loadMessages(currentLocale);
    fallbackMessages = currentLocale === FALLBACK_LOCALE ? currentMessages : await loadMessages(FALLBACK_LOCALE);

    if (!currentMessages) {
      if (fallbackMessages) {
        currentLocale = FALLBACK_LOCALE;
        currentMessages = fallbackMessages;
      } else {
        currentLocale = LAST_RESORT_LOCALE;
        currentMessages = await loadMessages(LAST_RESORT_LOCALE);
      }
    }
    return currentLocale;
  }

  function t(key, fallback = '') {
    const direct = currentMessages?.[key]?.message;
    if (direct) return direct;
    const english = fallbackMessages?.[key]?.message;
    if (english) return english;
    try {
      const browserMessage = chrome.i18n?.getMessage?.(key);
      if (browserMessage) return browserMessage;
    } catch {}
    return fallback || key;
  }

  function apply(root = document) {
    root.querySelectorAll?.('[data-i18n]').forEach(element => {
      element.textContent = t(element.dataset.i18n, element.textContent);
    });
    root.querySelectorAll?.('[data-i18n-placeholder]').forEach(element => {
      element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder, element.getAttribute('placeholder') || ''));
    });
    root.querySelectorAll?.('[data-i18n-title]').forEach(element => {
      element.setAttribute('title', t(element.dataset.i18nTitle, element.getAttribute('title') || ''));
    });
    root.documentElement?.setAttribute?.('lang', currentLocale.replace('_', '-'));
  }

  function languageLabel(code) {
    if (code === 'auto') return t('lang_auto', 'Auto');
    const language = globalThis.RayLingoLanguages?.get(code);
    return language ? t(language.labelKey, language.nativeName) : code;
  }

  function populateLanguageSelect(select, { includeAuto = false, selected = null } = {}) {
    if (!select) return;
    select.replaceChildren();
    if (includeAuto) {
      const option = document.createElement('option');
      option.value = 'auto';
      option.textContent = languageLabel('auto');
      select.append(option);
    }
    for (const language of globalThis.RayLingoLanguages?.list || []) {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = languageLabel(language.code);
      select.append(option);
    }
    if (selected && [...select.options].some(option => option.value === selected)) select.value = selected;
  }

  function populateUiLocaleSelect(select, preference = 'auto') {
    if (!select) return;
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = t('uiLocale_auto', 'Follow browser');
    select.replaceChildren(auto);
    for (const locale of UI_LOCALES) {
      const option = document.createElement('option');
      option.value = locale.code;
      option.textContent = locale.label;
      select.append(option);
    }
    select.value = preference === 'auto' || SUPPORTED.includes(preference) ? preference : 'auto';
  }

  function getLocale() { return currentLocale; }

  globalThis.RayLingoI18n = Object.freeze({
    supported: SUPPORTED,
    registry: UI_LOCALES,
    fallbackLocale: FALLBACK_LOCALE,
    init,
    t,
    apply,
    languageLabel,
    populateLanguageSelect,
    populateUiLocaleSelect,
    getLocale,
    normalizeLocale
  });
})();
