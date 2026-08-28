(() => {
  'use strict';

  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const DEEPSEEK_CHAT = 'https://api.deepseek.com/chat/completions';
  const DEFAULTS = Object.freeze({
    aiEnabled: false,
    aiProvider: 'gemini',
    translationProvider: 'auto',
    geminiApiKey: '',
    geminiModel: 'gemini-3.7-flash',
    deepseekApiKey: '',
    deepseekModel: 'deepseek-v4-flash'
  });

  function codedError(code, message) { const error = new Error(message); error.code = code; return error; }
  function normalizeProvider(value) { return value === 'deepseek' ? 'deepseek' : 'gemini'; }
  function cleanModel(value, fallback) { const text = String(value || '').trim(); return /^[a-zA-Z0-9._:-]{2,100}$/.test(text) ? text : fallback; }

  async function config() {
    const stored = await chrome.storage.local.get(DEFAULTS);
    return {
      ...stored,
      aiProvider: normalizeProvider(stored.aiProvider),
      geminiModel: cleanModel(stored.geminiModel, DEFAULTS.geminiModel),
      deepseekModel: cleanModel(stored.deepseekModel, DEFAULTS.deepseekModel)
    };
  }

  function languageName(code) {
    try { return globalThis.RayLingoLanguages?.get(code)?.nativeName || code || 'the target language'; }
    catch { return code || 'the target language'; }
  }

  function extractGeminiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
    if (!text) throw codedError('AI_EMPTY_RESPONSE', 'Gemini returned no text.');
    return text;
  }

  async function geminiGenerate({ apiKey, model, parts, responseMimeType = null }) {
    if (!apiKey) throw codedError('AI_KEY_MISSING', 'Gemini API key is not configured.');
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
    const body = { contents: [{ role: 'user', parts }] };
    if (responseMimeType) body.generationConfig = { responseMimeType };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw codedError('AI_HTTP', data?.error?.message || `Gemini HTTP ${response.status}`);
    return extractGeminiText(data);
  }

  async function deepseekChat({ apiKey, model, system, user }) {
    if (!apiKey) throw codedError('AI_KEY_MISSING', 'DeepSeek API key is not configured.');
    const response = await fetch(DEEPSEEK_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        thinking: { type: 'disabled' },
        temperature: 0.1,
        stream: false
      }),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw codedError('AI_HTTP', data?.error?.message || `DeepSeek HTTP ${response.status}`);
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw codedError('AI_EMPTY_RESPONSE', 'DeepSeek returned no text.');
    return text;
  }

  async function translate(payload = {}) {
    const cfg = await config();
    const provider = normalizeProvider(payload.provider || cfg.aiProvider);
    const text = String(payload.text || '').trim();
    if (!text) throw codedError('AI_NO_INPUT', 'No text to translate.');
    const target = languageName(payload.targetLanguage);
    const source = payload.sourceLanguage === 'auto' ? 'auto-detect the source language' : `source language ${languageName(payload.sourceLanguage)}`;
    const system = 'You are a translation engine. Preserve meaning, tone, formatting, names, numbers, URLs and paragraph breaks. Return only the translated text, without commentary or quotation marks.';
    const user = `Translate the following text to ${target}; ${source}.\n\n${text}`;
    let translated;
    if (provider === 'deepseek') translated = await deepseekChat({ apiKey: cfg.deepseekApiKey, model: cfg.deepseekModel, system, user });
    else translated = await geminiGenerate({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel, parts: [{ text: `${system}\n\n${user}` }] });
    return { text: translated, provider: `ai-${provider}`, sourceLanguage: payload.sourceLanguage || 'auto', targetLanguage: payload.targetLanguage };
  }

  function mediaPrompt(task, targetLanguage, displayName = '') {
    const target = languageName(targetLanguage);
    const label = displayName ? ` File name: ${displayName}.` : '';
    if (task === 'transcribe_translate') {
      return `Transcribe all spoken content accurately, then translate it into ${target}. Preserve meaningful timestamps when available and speaker changes when useful. Output readable translated transcript only.${label}`;
    }
    if (task === 'extract_translate') {
      return `Extract all readable text and meaningful labels from this content, including text in images, tables, diagrams and slides when visible, then translate it into ${target}. Preserve headings, lists and structure. Output translated content only.${label}`;
    }
    return `Understand this content and translate all user-facing text into ${target}. Preserve structure and do not add commentary.${label}`;
  }

  function geminiFileName(payload = {}) {
    const explicit = String(payload.fileName || '').trim();
    if (/^files\/[A-Za-z0-9._-]+$/.test(explicit)) return explicit;
    try {
      const url = new URL(String(payload.fileUri || ''));
      const match = url.pathname.match(/\/(files\/[A-Za-z0-9._-]+)$/);
      return match?.[1] || null;
    } catch { return null; }
  }

  async function waitForGeminiFile(payload, apiKey, { timeoutMs = 240000 } = {}) {
    const name = geminiFileName(payload);
    if (!name || !apiKey) return;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw codedError('AI_FILE_STATUS_FAILED', data?.error?.message || `Gemini file status HTTP ${response.status}`);
      const state = String(data?.state || data?.file?.state || '').toUpperCase();
      if (!state || state === 'ACTIVE') return;
      if (state === 'FAILED') throw codedError('AI_FILE_PROCESSING_FAILED', 'Gemini failed to process the uploaded file.');
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
    throw codedError('AI_FILE_PROCESSING_TIMEOUT', 'Gemini file processing timed out.');
  }

  async function processMedia(payload = {}) {
    const cfg = await config();
    const provider = normalizeProvider(payload.provider || cfg.aiProvider);
    if (provider !== 'gemini') throw codedError('AI_MULTIMODAL_PROVIDER_REQUIRED', 'This media input requires Gemini or another multimodal provider.');
    if (payload.fileUri) await waitForGeminiFile(payload, cfg.geminiApiKey);
    const media = payload.fileUri
      ? { fileData: { fileUri: payload.fileUri, mimeType: payload.mimeType || undefined } }
      : payload.inlineData
        ? { inlineData: { data: payload.inlineData, mimeType: payload.mimeType } }
        : null;
    if (!media) throw codedError('AI_MEDIA_MISSING', 'No media payload was supplied.');
    const task = payload.task || 'extract_translate';
    if (task === 'transcribe_translate') {
      const target = languageName(payload.targetLanguage);
      const label = payload.displayName ? ` File name: ${payload.displayName}.` : '';
      const prompt = `Transcribe ALL spoken content accurately in its original language, then translate the complete transcript into ${target}. Return ONLY one JSON object with exactly two string fields: transcript and translation. Preserve paragraph/speaker boundaries when useful, names, numbers and meaningful spoken punctuation. Do not summarize and do not omit repeated speech.${label}`;
      const raw = await geminiGenerate({
        apiKey: cfg.geminiApiKey,
        model: cfg.geminiModel,
        parts: [media, { text: prompt }],
        responseMimeType: 'application/json'
      });
      let parsed;
      try { parsed = JSON.parse(stripJsonFence(raw)); }
      catch { throw codedError('AI_TRANSCRIPT_PARSE_FAILED', 'Gemini transcript JSON could not be parsed.'); }
      const transcript = String(parsed?.transcript || '').trim();
      const translation = String(parsed?.translation || '').trim();
      if (!transcript || !translation) throw codedError('AI_TRANSCRIPT_EMPTY', 'Gemini did not return both transcript and translation.');
      return { text: translation, transcript, translation, provider: 'ai-gemini', targetLanguage: payload.targetLanguage };
    }
    const prompt = mediaPrompt(task, payload.targetLanguage, payload.displayName);
    const text = await geminiGenerate({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel, parts: [media, { text: prompt }] });
    return { text, provider: 'ai-gemini', targetLanguage: payload.targetLanguage };
  }

  function stripJsonFence(text) {
    return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  async function youtubeTranscript(payload = {}) {
    const cfg = await config();
    const provider = normalizeProvider(payload.provider || cfg.aiProvider);
    if (provider !== 'gemini') throw codedError('AI_MULTIMODAL_PROVIDER_REQUIRED', 'YouTube transcription currently requires Gemini.');
    const url = String(payload.url || '').trim();
    if (!/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(url)) throw codedError('AI_YOUTUBE_URL_REQUIRED', 'A public YouTube URL is required.');
    const target = languageName(payload.targetLanguage);
    const prompt = `Transcribe the spoken content of this public YouTube video and translate each segment into ${target}. Return ONLY a JSON array. Each item must have numeric start and end seconds plus string source and translation fields. Use compact segments, preserve names/numbers, and cover the full spoken content. Example: [{"start":0,"end":4.2,"source":"...","translation":"..."}]`;
    const text = await geminiGenerate({
      apiKey: cfg.geminiApiKey,
      model: cfg.geminiModel,
      parts: [{ fileData: { fileUri: url } }, { text: prompt }],
      responseMimeType: 'application/json'
    });
    let segments;
    try { segments = JSON.parse(stripJsonFence(text)); }
    catch { throw codedError('AI_TRANSCRIPT_PARSE_FAILED', 'Gemini transcript JSON could not be parsed.'); }
    if (!Array.isArray(segments)) throw codedError('AI_TRANSCRIPT_PARSE_FAILED', 'Gemini transcript response was not an array.');
    segments = segments.map(item => ({
      start: Math.max(0, Number(item?.start) || 0),
      end: Math.max(0, Number(item?.end) || 0),
      source: String(item?.source || '').trim(),
      translation: String(item?.translation || '').trim()
    })).filter(item => item.translation && item.end >= item.start).slice(0, 5000);
    return { segments, provider: 'ai-gemini', targetLanguage: payload.targetLanguage };
  }

  async function status(payload = {}) {
    const cfg = await config();
    const provider = payload.provider ? normalizeProvider(payload.provider) : cfg.aiProvider;
    return {
      provider,
      aiEnabled: cfg.aiEnabled === true,
      translationProvider: cfg.translationProvider || 'auto',
      geminiConfigured: Boolean(String(cfg.geminiApiKey || '').trim()),
      deepseekConfigured: Boolean(String(cfg.deepseekApiKey || '').trim()),
      geminiModel: cfg.geminiModel,
      deepseekModel: cfg.deepseekModel
    };
  }

  async function testProvider(payload = {}) {
    const cfg = await config();
    const provider = normalizeProvider(payload.provider || cfg.aiProvider);
    if (provider === 'deepseek') {
      const text = await deepseekChat({ apiKey: cfg.deepseekApiKey, model: cfg.deepseekModel, system: 'Reply with exactly OK.', user: 'Connectivity test.' });
      return { provider, text };
    }
    const text = await geminiGenerate({ apiKey: cfg.geminiApiKey, model: cfg.geminiModel, parts: [{ text: 'Reply with exactly OK.' }] });
    return { provider, text };
  }

  globalThis.RayLingoAIWorker = Object.freeze({ translate, processMedia, youtubeTranscript, status, testProvider });
})();
