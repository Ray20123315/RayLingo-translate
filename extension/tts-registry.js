(() => {
  'use strict';

  // Piper browser engine coverage. Languages not listed here automatically use system TTS.
  const PIPER_TARGETS = Object.freeze({
    en: { tag: 'en-US', keywords: ['English', 'United States'], preferred: ['lessac', 'hfc_female'] },
    'zh-Hant': { tag: 'zh-TW', voiceTag: 'zh-CN', compatibility: 'mandarin-traditional', keywords: ['中文', 'Chinese', 'China', '简体中文', '普通话'], preferred: ['huayan', 'xiao_ya'] },
    zh: { tag: 'zh-CN', keywords: ['中文', 'Chinese', 'China'], preferred: ['huayan'] },
    ja: { tag: 'ja-JP', keywords: ['日本語', 'Japanese', 'Japan'], preferred: ['hi_fi_captain'] },
    ko: { tag: 'ko-KR', keywords: ['한국어', 'Korean', 'South Korea'], preferred: ['kss'] },
    es: { tag: 'es-ES', keywords: ['Español', 'Spanish', 'Spain'], preferred: [] },
    fr: { tag: 'fr-FR', keywords: ['Français', 'French', 'France'], preferred: ['siwis'] },
    de: { tag: 'de-DE', keywords: ['Deutsch', 'German', 'Germany'], preferred: ['thorsten'] },
    it: { tag: 'it-IT', keywords: ['Italiano', 'Italian', 'Italy'], preferred: ['riccardo'] },
    pt: { tag: 'pt-BR', keywords: ['Português', 'Portuguese', 'Brazil'], preferred: [] },
    ru: { tag: 'ru-RU', keywords: ['Русский', 'Russian', 'Russia'], preferred: [] },
    uk: { tag: 'uk-UA', keywords: ['Українська', 'Ukrainian', 'Ukraine'], preferred: [] },
    pl: { tag: 'pl-PL', keywords: ['Polski', 'Polish', 'Poland'], preferred: [] },
    nl: { tag: 'nl-NL', keywords: ['Nederlands', 'Dutch', 'Netherlands'], preferred: [] },
    tr: { tag: 'tr-TR', keywords: ['Türkçe', 'Turkish', 'Turkey'], preferred: [] },
    vi: { tag: 'vi-VN', keywords: ['Tiếng Việt', 'Vietnamese', 'Vietnam'], preferred: [] },
    id: { tag: 'id-ID', keywords: ['Bahasa Indonesia', 'Indonesian', 'Indonesia'], preferred: [] },
    hi: { tag: 'hi-IN', keywords: ['हिन्दी', 'Hindi', 'India'], preferred: ['pratham'] },
    ar: { tag: 'ar-JO', keywords: ['العربية', 'Arabic', 'Jordan'], preferred: [] }
  });

  const SAMPLES = Object.freeze({
    en: 'Hello. This is a natural voice test from RayLingo.',
    'zh-Hant': '你好，這是 RayLingo 的自然語音測試。',
    zh: '你好，这是 RayLingo 的自然语音测试。',
    ja: 'こんにちは。RayLingo の自然な音声テストです。',
    ko: '안녕하세요. RayLingo 자연 음성 테스트입니다.',
    es: 'Hola. Esta es una prueba de voz natural de RayLingo.',
    fr: 'Bonjour. Ceci est un test de voix naturelle de RayLingo.',
    de: 'Hallo. Dies ist ein natürlicher Sprachtest von RayLingo.',
    hi: 'नमस्ते। यह RayLingo का प्राकृतिक आवाज़ परीक्षण है।',
    it: 'Ciao. Questo è un test della voce naturale di RayLingo.',
    pt: 'Olá. Este é um teste da voz natural do RayLingo.'
  });

  function normalizeTranslationCode(code) {
    return globalThis.RayLingoLanguages?.normalizeCode?.(code) || code || 'en';
  }

  function piperTarget(code) {
    return PIPER_TARGETS[normalizeTranslationCode(code)] || null;
  }

  function piperSupported(code) { return Boolean(piperTarget(code)); }

  function piperCatalog() {
    return Object.entries(PIPER_TARGETS).map(([code, spec]) => ({
      code,
      tag: spec.tag,
      voiceTag: spec.voiceTag || spec.tag,
      compatibility: spec.compatibility || null,
      label: globalThis.RayLingoLanguages?.get?.(code)?.nativeName || code,
      keywords: [...(spec.keywords || [])],
      preferred: [...(spec.preferred || [])]
    }));
  }

  function voiceMatchesLanguage(voice, code) {
    const target = piperTarget(code);
    if (!target || !voice) return false;
    const wanted = String(target.voiceTag || target.tag).toLowerCase();
    const lang = String(voice.lang || '').toLowerCase();
    if (lang === wanted) return true;
    const wantedBase = wanted.split('-')[0];
    return lang.split('-')[0] === wantedBase;
  }

  function rankPiperVoice(voice, code) {
    if (!voiceMatchesLanguage(voice, code)) return -10000;
    const target = piperTarget(code);
    const name = String(voice.voiceName || voice.name || '').toLowerCase();
    const lang = String(voice.lang || '').toLowerCase();
    const voiceTag = String(target.voiceTag || target.tag).toLowerCase();
    let score = lang === voiceTag ? 100 : 55;
    for (const token of target.preferred || []) if (name.includes(token.toLowerCase())) score += 40;
    if (name.includes('medium')) score += 15;
    if (name.includes('high')) score += 8;
    if (name.includes('low')) score -= 5;
    if (name.includes('libritts')) score -= 20;
    return score;
  }

  function choosePiperVoice(voices, code, preferred = 'auto') {
    const list = Array.isArray(voices) ? voices : [];
    if (preferred && preferred !== 'auto') {
      const exact = list.find(v => v.voiceName === preferred && voiceMatchesLanguage(v, code));
      if (exact) return exact;
    }
    return list
      .filter(v => voiceMatchesLanguage(v, code))
      .sort((a, b) => rankPiperVoice(b, code) - rankPiperVoice(a, code))[0] || null;
  }


  function normalizeVoiceLang(value) {
    return String(value || '').trim().replace(/_/g, '-').toLowerCase();
  }

  function systemVoiceMatchTier(voice, code) {
    if (!voice) return 'none';
    const wanted = normalizeVoiceLang(RayLingoLanguages.speechCode(code));
    const lang = normalizeVoiceLang(voice.lang);
    // Chrome documents TtsVoice.lang as optional. An untagged voice is usable,
    // but we must not pretend we know which language it belongs to.
    if (!lang) return 'untagged';
    if (!wanted) return 'none';
    if (lang === wanted) return 'exact';
    if (lang.split('-')[0] === wanted.split('-')[0]) return 'family';
    return 'none';
  }

  function systemVoiceMatchesLanguage(voice, code) {
    const tier = systemVoiceMatchTier(voice, code);
    return tier === 'exact' || tier === 'family';
  }

  function rankSystemVoice(voice, code) {
    if (!voice) return -10000;
    const tier = systemVoiceMatchTier(voice, code);
    if (tier === 'none') return -10000;
    const name = String(voice.voiceName || voice.name || '').toLowerCase();
    let score = tier === 'exact' ? 120 : tier === 'family' ? 80 : 8;
    if (/natural|neural|premium|enhanced|online/.test(name)) score += 45;
    if (/microsoft|google|apple/.test(name)) score += 12;
    if (/compact|espeak/.test(name)) score -= 15;
    if (voice.remote === false || voice.localService) score += 3;
    return score;
  }

  function chooseSystemVoice(voices, code, preferred = 'auto') {
    const list = Array.isArray(voices) ? voices : [];
    if (preferred && preferred !== 'auto') {
      const requested = list.find(v => (v.voiceName || v.name) === preferred);
      if (requested && systemVoiceMatchTier(requested, code) !== 'none') return requested;
    }
    // For Auto, only force a voice when its language metadata is trustworthy.
    // If Chrome/Brave returns only untagged voices, returning null deliberately
    // lets chrome.tts choose the best voice from options.lang.
    return list
      .filter(v => systemVoiceMatchesLanguage(v, code))
      .sort((a, b) => rankSystemVoice(b, code) - rankSystemVoice(a, code))[0] || null;
  }

  function summarizeSystemVoices(voices, code) {
    const summary = { exact: 0, family: 0, untagged: 0, other: 0 };
    for (const voice of Array.isArray(voices) ? voices : []) {
      const tier = systemVoiceMatchTier(voice, code);
      if (tier === 'none') summary.other += 1;
      else summary[tier] += 1;
    }
    return summary;
  }

  function normalizeEngine(value) {
    if (value === 'ai-local') return 'ai-browser'; // migrate v0.4 pre-release setting
    return ['auto', 'ai-browser', 'system'].includes(value) ? value : 'auto';
  }

  function clampSpeed(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.min(1.6, Math.max(0.65, Math.round(number * 20) / 20));
  }

  function sampleText(code) {
    const normalized = normalizeTranslationCode(code);
    return SAMPLES[normalized] || SAMPLES.en;
  }

  globalThis.RayLingoTTS = Object.freeze({
    PIPER_TARGETS,
    normalizeEngine,
    clampSpeed,
    piperTarget,
    piperSupported,
    piperCatalog,
    voiceMatchesLanguage,
    choosePiperVoice,
    normalizeVoiceLang,
    systemVoiceMatchTier,
    systemVoiceMatchesLanguage,
    rankSystemVoice,
    chooseSystemVoice,
    summarizeSystemVoices,
    sampleText,
    piperOrigin: 'https://piper.ttstool.com'
  });
})();
