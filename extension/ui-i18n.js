(() => {
  'use strict';

  const SUPPORTED = Object.freeze(['zh_TW', 'zh_CN', 'en', 'ja', 'ko']);
  const cache = new Map();
  let currentLocale = 'zh_TW';
  let currentMessages = null;

  function normalizeLocale(locale) {
    if (!locale || locale === 'auto') return null;
    const normalized = String(locale).replace('-', '_');
    if (SUPPORTED.includes(normalized)) return normalized;
    const lower = normalized.toLowerCase();
    if (lower.startsWith('zh_tw') || lower.startsWith('zh_hant') || lower.startsWith('zh_hk')) return 'zh_TW';
    if (lower.startsWith('zh_cn') || lower.startsWith('zh_hans') || lower.startsWith('zh_sg')) return 'zh_CN';
    const base = lower.split('_')[0];
    return SUPPORTED.find(item => item.toLowerCase() === base) || null;
  }

  async function loadMessages(locale) {
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
    const browserLocale = chrome.i18n?.getUILanguage?.() || 'zh-TW';
    currentLocale = normalizeLocale(preferred) || normalizeLocale(browserLocale) || 'zh_TW';
    currentMessages = await loadMessages(currentLocale);
    if (!currentMessages && currentLocale !== 'zh_TW') {
      currentLocale = 'zh_TW';
      currentMessages = await loadMessages(currentLocale);
    }
    return currentLocale;
  }

  function t(key, fallback = '') {
    const entry = currentMessages?.[key];
    if (entry?.message) return entry.message;
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
    const labels = {
      auto: t('uiLocale_auto', 'Follow browser'),
      zh_TW: '繁體中文',
      zh_CN: '简体中文',
      en: 'English',
      ja: '日本語',
      ko: '한국어'
    };
    select.replaceChildren();
    for (const code of ['auto', ...SUPPORTED]) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = labels[code];
      select.append(option);
    }
    select.value = labels[preference] ? preference : 'auto';
  }

  function getLocale() { return currentLocale; }

  globalThis.RayLingoI18n = Object.freeze({
    supported: SUPPORTED,
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
