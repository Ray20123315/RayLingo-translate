(() => {
  'use strict';

  const translatorCache = new Map();
  function nativeAvailable() {
    return typeof globalThis.Translator === 'function' || (typeof globalThis.Translator === 'object' && globalThis.Translator && typeof globalThis.Translator.create === 'function');
  }

  function chunkText(text, maxLength = 2800) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let current = '';
    for (const part of text.split(/(\n+|(?<=[.!?。！？])\s*)/u)) {
      if (!part) continue;
      if ((current + part).length <= maxLength) {
        current += part;
        continue;
      }
      if (current) chunks.push(current);
      if (part.length <= maxLength) {
        current = part;
      } else {
        for (let start = 0; start < part.length; start += maxLength) chunks.push(part.slice(start, start + maxLength));
        current = '';
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  async function getTranslator(sourceLanguage, targetLanguage, onStatus = () => {}) {
    if (!nativeAvailable()) {
      const error = new Error('Native Translator API unavailable');
      error.code = 'NATIVE_UNAVAILABLE';
      throw error;
    }
    const key = `${sourceLanguage}->${targetLanguage}`;
    if (translatorCache.has(key)) return translatorCache.get(key);
    const availability = await Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === 'unavailable') {
      const error = new Error('Native language pair unavailable');
      error.code = 'PAIR_UNAVAILABLE';
      throw error;
    }
    if (availability === 'downloadable' || availability === 'downloading') {
      onStatus({ type: 'preparing', availability });
    }
    const translator = await Translator.create({
      sourceLanguage,
      targetLanguage,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', event => {
          onStatus({ type: 'download', percent: Math.round(event.loaded * 100) });
        });
      }
    });
    translatorCache.set(key, translator);
    return translator;
  }

  async function translateRemote(text, sourceLanguage, targetLanguage, onStatus) {
    onStatus({ type: 'remote' });
    const response = await chrome.runtime.sendMessage({
      type: 'RAYLINGO_REMOTE_TRANSLATE',
      text,
      sourceLanguage,
      targetLanguage
    });
    if (!response?.ok) { const error = new Error(response?.error || 'Remote translation failed'); error.code = response?.errorCode || 'REMOTE_FAILED'; throw error; }
    return response.text;
  }

  async function translate({ text, sourceLanguage = 'auto', targetLanguage, remoteFallbackEnabled = true, onStatus = () => {} }) {
    if (globalThis.RayLingoIntegrityClient?.assertUnlocked) await RayLingoIntegrityClient.assertUnlocked();
    const trimmed = String(text || '').trim();
    if (!trimmed) return { text: '', sourceLanguage: null, targetLanguage, provider: 'none' };
    if (!RayLingoLanguages.isSupported(targetLanguage)) throw new Error('Unsupported target language');

    let resolvedSource = sourceLanguage;
    if (resolvedSource === 'auto') {
      onStatus({ type: 'detecting' });
      resolvedSource = await RayLingoLanguages.detect(trimmed, targetLanguage);
    } else {
      resolvedSource = RayLingoLanguages.normalizeCode(resolvedSource);
    }

    if (resolvedSource && resolvedSource === targetLanguage) {
      return { text: trimmed, sourceLanguage: resolvedSource, targetLanguage, provider: 'same' };
    }

    if (nativeAvailable() && resolvedSource && RayLingoLanguages.isSupported(resolvedSource)) {
      try {
        const translator = await getTranslator(resolvedSource, targetLanguage, onStatus);
        const chunks = chunkText(trimmed);
        const translated = [];
        for (let index = 0; index < chunks.length; index += 1) {
          onStatus({ type: 'native', index: index + 1, total: chunks.length });
          translated.push(await translator.translate(chunks[index]));
        }
        return { text: translated.join(''), sourceLanguage: resolvedSource, targetLanguage, provider: 'native' };
      } catch (error) {
        if (!remoteFallbackEnabled) throw error;
        console.debug('[RayLingo] native translation unavailable, fallback:', error);
      }
    }

    if (!remoteFallbackEnabled) throw new Error('REMOTE_FALLBACK_DISABLED');
    const remoteSource = resolvedSource || 'auto';
    const translated = await translateRemote(trimmed, remoteSource, targetLanguage, onStatus);
    return { text: translated, sourceLanguage: resolvedSource || 'auto', targetLanguage, provider: 'google-web' };
  }

  function isNativeAvailable() { return nativeAvailable(); }

  globalThis.RayLingoTranslator = Object.freeze({ translate, isNativeAvailable, chunkText });
})();
