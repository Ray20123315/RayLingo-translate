(() => {
  'use strict';

  const LANGUAGES = Object.freeze([
    { code: 'en', nativeName: 'English', labelKey: 'lang_en', google: 'en', speech: 'en-US' },
    { code: 'zh-Hant', nativeName: '繁體中文', labelKey: 'lang_zhHant', google: 'zh-TW', speech: 'zh-TW' },
    { code: 'zh', nativeName: '简体中文', labelKey: 'lang_zhHans', google: 'zh-CN', speech: 'zh-CN' },
    { code: 'ja', nativeName: '日本語', labelKey: 'lang_ja', google: 'ja', speech: 'ja-JP' },
    { code: 'ko', nativeName: '한국어', labelKey: 'lang_ko', google: 'ko', speech: 'ko-KR' },
    { code: 'es', nativeName: 'Español', labelKey: 'lang_es', google: 'es', speech: 'es-ES' },
    { code: 'fr', nativeName: 'Français', labelKey: 'lang_fr', google: 'fr', speech: 'fr-FR' },
    { code: 'de', nativeName: 'Deutsch', labelKey: 'lang_de', google: 'de', speech: 'de-DE' },
    { code: 'it', nativeName: 'Italiano', labelKey: 'lang_it', google: 'it', speech: 'it-IT' },
    { code: 'pt', nativeName: 'Português', labelKey: 'lang_pt', google: 'pt', speech: 'pt-BR' },
    { code: 'ru', nativeName: 'Русский', labelKey: 'lang_ru', google: 'ru', speech: 'ru-RU' },
    { code: 'uk', nativeName: 'Українська', labelKey: 'lang_uk', google: 'uk', speech: 'uk-UA' },
    { code: 'pl', nativeName: 'Polski', labelKey: 'lang_pl', google: 'pl', speech: 'pl-PL' },
    { code: 'nl', nativeName: 'Nederlands', labelKey: 'lang_nl', google: 'nl', speech: 'nl-NL' },
    { code: 'tr', nativeName: 'Türkçe', labelKey: 'lang_tr', google: 'tr', speech: 'tr-TR' },
    { code: 'vi', nativeName: 'Tiếng Việt', labelKey: 'lang_vi', google: 'vi', speech: 'vi-VN' },
    { code: 'th', nativeName: 'ไทย', labelKey: 'lang_th', google: 'th', speech: 'th-TH' },
    { code: 'id', nativeName: 'Bahasa Indonesia', labelKey: 'lang_id', google: 'id', speech: 'id-ID' },
    { code: 'hi', nativeName: 'हिन्दी', labelKey: 'lang_hi', google: 'hi', speech: 'hi-IN' },
    { code: 'ar', nativeName: 'العربية', labelKey: 'lang_ar', google: 'ar', speech: 'ar-SA' }
  ]);

  const byCode = new Map(LANGUAGES.map(language => [language.code, language]));
  const aliases = new Map([
    ['zh-Hans', 'zh'], ['zh-CN', 'zh'], ['zh-SG', 'zh'], ['zh_CN', 'zh'],
    ['zh-Hant', 'zh-Hant'], ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'], ['zh_TW', 'zh-Hant'],
    ['pt-BR', 'pt'], ['pt-PT', 'pt'], ['pt_BR', 'pt'], ['pt_PT', 'pt'],
    ['iw', 'he']
  ]);

  const TRAD_HINTS = new Set('體臺灣國學會來時這個為與說後發麼開關點裡還過進長間見將無於從對實當樣義氣應經種總區電書門車東風頁廣網線語譯繁簡選擇顯示處理裝置輸入結果複製啟用偵測歷史釘選');
  const SIMP_HINTS = new Set('体台湾国学会来时这个为与说后发么开关点里还过进长间见将无于从对实当样义气应经种总区电书门车东风页广网线语译繁简选择显示处理装置输入结果复制启用侦测历史钉选');

  function normalizeCode(code) {
    if (!code) return null;
    if (byCode.has(code)) return code;
    if (aliases.has(code)) return aliases.get(code);
    const base = String(code).split(/[-_]/)[0];
    if (base === 'zh') return 'zh';
    return byCode.has(base) ? base : null;
  }

  function inferChineseVariant(text) {
    let traditional = 0;
    let simplified = 0;
    for (const char of text || '') {
      if (TRAD_HINTS.has(char)) traditional += 1;
      if (SIMP_HINTS.has(char)) simplified += 1;
    }
    if (traditional > simplified) return 'zh-Hant';
    if (simplified > traditional) return 'zh';
    return null;
  }

  async function detect(text, targetLanguage) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;
    const chineseVariant = inferChineseVariant(trimmed);
    if (chineseVariant) return chineseVariant;

    try {
      if (globalThis.chrome?.i18n?.detectLanguage) {
        const result = await chrome.i18n.detectLanguage(trimmed.slice(0, 2000));
        const candidates = result?.languages || [];
        for (const candidate of candidates) {
          if (!candidate || candidate.percentage < 15) continue;
          const normalized = normalizeCode(candidate.language);
          if (!normalized) continue;
          if (normalized === 'zh') return targetLanguage === 'zh' ? 'zh-Hant' : 'zh';
          return normalized;
        }
      }
    } catch (error) {
      console.debug('[RayLingo] chrome.i18n detection unavailable:', error);
    }

    if (/^[\x00-\x7F\s\p{P}\p{N}]+$/u.test(trimmed) && /[A-Za-z]/.test(trimmed)) return 'en';
    if (/[\u3400-\u9fff]/u.test(trimmed)) return targetLanguage === 'zh' ? 'zh-Hant' : 'zh';
    return null;
  }

  function get(code) {
    return byCode.get(normalizeCode(code));
  }

  function googleCode(code) {
    if (code === 'auto') return 'auto';
    return get(code)?.google || null;
  }

  function speechCode(code) {
    return get(code)?.speech || normalizeCode(code) || 'en-US';
  }

  function isSupported(code) {
    return Boolean(get(code));
  }

  globalThis.RayLingoLanguages = Object.freeze({
    list: LANGUAGES,
    get,
    normalizeCode,
    inferChineseVariant,
    detect,
    googleCode,
    speechCode,
    isSupported
  });
})();
