(() => {
  'use strict';

  const PROVIDERS = Object.freeze({
    gemini: Object.freeze({ id: 'gemini', label: 'Gemini', defaultModel: 'gemini-3.7-flash', multimodal: true }),
    deepseek: Object.freeze({ id: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-v4-flash', multimodal: false })
  });

  function normalizeProvider(value) {
    return value === 'deepseek' ? 'deepseek' : 'gemini';
  }

  function normalizeTranslationProvider(value) {
    return ['auto', 'browser', 'gemini', 'deepseek'].includes(value) ? value : 'auto';
  }

  function defaultModel(provider) {
    return PROVIDERS[normalizeProvider(provider)].defaultModel;
  }

  async function request(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type, payload });
    if (!response?.ok) {
      const error = new Error(response?.error || 'AI_REQUEST_FAILED');
      error.code = response?.errorCode || 'AI_REQUEST_FAILED';
      throw error;
    }
    return response;
  }

  async function translate({ text, sourceLanguage = 'auto', targetLanguage, provider }) {
    return request('RAYLINGO_AI_TRANSLATE', { text, sourceLanguage, targetLanguage, provider: normalizeProvider(provider) });
  }

  async function processMedia({ fileUri = null, fileName = null, inlineData = null, mimeType, targetLanguage, provider = 'gemini', task = 'translate', displayName = '' }) {
    return request('RAYLINGO_AI_MEDIA_PROCESS', { fileUri, fileName, inlineData, mimeType, targetLanguage, provider: normalizeProvider(provider), task, displayName });
  }

  async function transcribeYouTube({ url, targetLanguage, provider = 'gemini' }) {
    return request('RAYLINGO_AI_YOUTUBE_TRANSCRIPT', { url, targetLanguage, provider: normalizeProvider(provider) });
  }

  async function status(provider = null) {
    return request('RAYLINGO_AI_STATUS', { provider: provider ? normalizeProvider(provider) : null });
  }

  async function test(provider) {
    return request('RAYLINGO_AI_TEST', { provider: normalizeProvider(provider) });
  }

  globalThis.RayLingoAI = Object.freeze({
    providers: PROVIDERS,
    normalizeProvider,
    normalizeTranslationProvider,
    defaultModel,
    translate,
    processMedia,
    transcribeYouTube,
    status,
    test
  });
})();
