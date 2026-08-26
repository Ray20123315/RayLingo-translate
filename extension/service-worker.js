'use strict';

if (typeof importScripts === 'function') importScripts('platform-compat.js', 'integrity-guard.js', 'language-registry.js', 'ui-i18n.js', 'tts-registry.js');

const integrityReady = RayLingoIntegrity.ensureVerified();
async function requireIntegrity() { const state = await RayLingoIntegrity.ensureVerified(); if (!state.ok) { const error = new Error('INTEGRITY_LOCKED'); error.code='INTEGRITY_LOCKED'; throw error; } return state; }

const MENU_ROOT = 'raylingo-root';
const MENU_OPEN = 'raylingo-open';
const MENU_TARGET_CODES = ['en', 'zh-Hant', 'zh', 'ja', 'ko', 'es', 'fr'];
const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const HISTORY_KEY = 'translationHistory';
const HISTORY_LIMIT = 30;
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreen = null;
let activeTtsOwner = null;
let activeTtsSessionId = null;
let activeTtsEngine = null;
let activeTtsMonitorToken = 0;
let activeWebSpeechUtterance = null;

async function hasOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) return false;
  if (chrome.offscreen?.hasDocument) return chrome.offscreen.hasDocument();
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  if (chrome.runtime?.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    return contexts.length > 0;
  }
  if (!globalThis.clients?.matchAll) return false;
  const matched = await clients.matchAll();
  return matched.some(client => client.url === offscreenUrl || client.url?.includes(chrome.runtime.id));
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) throw codedError('OFFSCREEN_UNAVAILABLE', 'Offscreen API unavailable');
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['AUDIO_PLAYBACK', 'BLOBS', 'IFRAME_SCRIPTING'],
      justification: 'Run RayLingo browser neural TTS in a hidden Piper iframe and play audio outside short-lived popup/content contexts.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function sendTtsAction(action, payload = {}) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ type: 'RAYLINGO_OFFSCREEN_TTS', action, payload });
}


function broadcastTtsEvent(event, detail = {}) {
  try { const sent = chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_EVENT', event, ...detail }); sent?.catch?.(() => null); } catch {}
}


function activeSessionMatches(owner, sessionId) {
  return (!owner || activeTtsOwner === owner) && (!sessionId || activeTtsSessionId === sessionId);
}

function finishActiveTts(event, detail = {}) {
  const owner = detail.owner ?? activeTtsOwner;
  const sessionId = detail.sessionId ?? activeTtsSessionId;
  if (!activeSessionMatches(owner, sessionId)) return false;
  activeTtsMonitorToken += 1;
  activeTtsOwner = null;
  activeTtsSessionId = null;
  activeTtsEngine = null;
  broadcastTtsEvent(event, { ...detail, owner, sessionId });
  return true;
}

async function monitorChromeTtsSession(owner, sessionId) {
  if (!chrome.tts?.isSpeaking) return;
  const token = ++activeTtsMonitorToken;
  let seenSpeaking = false;
  let falseChecks = 0;
  const startedAt = Date.now();
  while (token === activeTtsMonitorToken && activeSessionMatches(owner, sessionId)) {
    await new Promise(resolve => setTimeout(resolve, 180));
    if (token !== activeTtsMonitorToken || !activeSessionMatches(owner, sessionId)) return;
    let speaking = true;
    try { speaking = await chrome.tts.isSpeaking(); } catch { return; }
    if (speaking) { seenSpeaking = true; falseChecks = 0; continue; }
    falseChecks += 1;
    if ((seenSpeaking && falseChecks >= 2) || (!seenSpeaking && Date.now() - startedAt >= 900 && falseChecks >= 3)) {
      finishActiveTts('ended', { engine: 'chrome-tts', owner, sessionId, inferred: true });
      return;
    }
  }
}

function getChromeTtsVoices() {
  return new Promise(resolve => {
    if (!chrome.tts?.getVoices) { resolve([]); return; }
    try {
      chrome.tts.getVoices(voices => {
        if (chrome.runtime.lastError) { resolve([]); return; }
        resolve((voices || []).map(voice => ({
          name: voice.voiceName,
          voiceName: voice.voiceName,
          lang: voice.lang || '',
          remote: Boolean(voice.remote),
          extensionId: voice.extensionId || null,
          eventTypes: voice.eventTypes || [],
          score: 0
        })));
      });
    } catch { resolve([]); }
  });
}

async function getWebSpeechVoices() {
  if (!globalThis.speechSynthesis?.getVoices) return [];
  let voices = globalThis.speechSynthesis.getVoices() || [];
  if (!voices.length) {
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; try { globalThis.speechSynthesis.removeEventListener?.('voiceschanged', finish); } catch {} resolve(); };
      try { globalThis.speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true }); } catch {}
      setTimeout(finish, 280);
    });
    voices = globalThis.speechSynthesis.getVoices() || [];
  }
  return voices.map(voice => ({
    name: voice.name || voice.voiceURI || '',
    voiceName: voice.name || voice.voiceURI || '',
    lang: voice.lang || '',
    remote: !voice.localService,
    extensionId: null,
    eventTypes: ['start', 'end', 'error'],
    rawVoice: voice,
    score: 0
  }));
}

async function speakWebSpeech(payload = {}) {
  if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) throw codedError('WEB_SPEECH_UNAVAILABLE', 'Web Speech TTS unavailable');
  const text = String(payload.text || '').trim();
  const owner = payload.owner || null;
  const sessionId = payload.sessionId || null;
  if (!text) throw codedError('TTS_NO_TEXT', 'No text to speak');
  const language = RayLingoLanguages.normalizeCode(payload.language) || payload.language || 'en';
  const lang = RayLingoLanguages.speechCode(language) || language || 'en-US';
  const voices = await getWebSpeechVoices();
  const selected = RayLingoTTS.chooseSystemVoice(voices, language, payload.systemVoice || 'auto');
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = RayLingoTTS.clampSpeed(payload.speed);
  if (selected?.rawVoice) utterance.voice = selected.rawVoice;
  utterance.onstart = () => broadcastTtsEvent('started', { engine: 'web-speech', language, voice: selected?.voiceName || null, owner, sessionId });
  utterance.onend = () => { activeWebSpeechUtterance = null; finishActiveTts('ended', { engine: 'web-speech', language, owner, sessionId }); };
  utterance.onerror = event => { activeWebSpeechUtterance = null; finishActiveTts('error', { engine: 'web-speech', language, owner, sessionId, error: event?.error || 'WEB_SPEECH_FAILED' }); };
  globalThis.speechSynthesis.cancel();
  activeWebSpeechUtterance = utterance;
  globalThis.speechSynthesis.speak(utterance);
  activeTtsEngine = 'web-speech';
  return { ok: true, engine: 'web-speech', voice: selected?.voiceName || null, lang, fallback: true };
}

async function speakSystemTts(payload = {}) {
  try { return await speakChromeTts(payload); }
  catch (nativeError) {
    try {
      const result = await speakWebSpeech(payload);
      return { ...result, nativeError: nativeError?.message || 'EXTENSION_TTS_UNAVAILABLE' };
    } catch (webError) {
      try {
        const fallback = await sendTtsAction('speak', { ...payload, engine: 'system' });
        activeTtsEngine = fallback?.engine || 'system';
        return { ...fallback, fallback: true, nativeError: nativeError?.message || 'EXTENSION_TTS_UNAVAILABLE', webSpeechError: webError?.message || 'WEB_SPEECH_UNAVAILABLE' };
      } catch {
        throw webError;
      }
    }
  }
}

async function speakChromeTts(payload = {}) {
  if (!chrome.tts?.speak) throw codedError('CHROME_TTS_UNAVAILABLE', 'chrome.tts unavailable');
  const text = String(payload.text || '').trim();
  const owner = payload.owner || null;
  const sessionId = payload.sessionId || null;
  if (!text) throw codedError('TTS_NO_TEXT', 'No text to speak');
  const language = RayLingoLanguages.normalizeCode(payload.language) || payload.language || 'en';
  const lang = RayLingoLanguages.speechCode(language) || language || 'en-US';
  const voices = await getChromeTtsVoices();
  const selected = RayLingoTTS.chooseSystemVoice(voices, language, payload.systemVoice || 'auto');
  const options = {
    lang,
    rate: RayLingoTTS.clampSpeed(payload.speed),
    enqueue: false,
    onEvent(event) {
      const type = event?.type;
      if (type === 'start') {
        broadcastTtsEvent('started', { engine: 'chrome-tts', language, voice: selected?.voiceName || null, owner, sessionId });
      } else if (type === 'end') {
        finishActiveTts('ended', { engine: 'chrome-tts', language, owner, sessionId });
      } else if (type === 'error') {
        finishActiveTts('error', { engine: 'chrome-tts', language, owner, sessionId, error: event?.errorMessage || 'CHROME_TTS_FAILED' });
      } else if (type === 'cancelled' || type === 'interrupted') {
        finishActiveTts(type, { engine: 'chrome-tts', language, owner, sessionId });
      } else if (type === 'word' || type === 'sentence') {
        broadcastTtsEvent(type, { engine: 'chrome-tts', language, owner, sessionId, charIndex: event?.charIndex, length: event?.length });
      }
    }
  };
  if (selected?.voiceName) options.voiceName = selected.voiceName;
  await new Promise((resolve, reject) => {
    try {
      chrome.tts.stop();
      chrome.tts.speak(text, options, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(codedError('CHROME_TTS_FAILED', error.message));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
  activeTtsEngine = 'chrome-tts';
  monitorChromeTtsSession(owner, sessionId).catch(() => null);
  return { ok: true, engine: 'chrome-tts', voice: selected?.voiceName || null, lang, fallback: false };
}

async function speakTts(payload = {}) {
  const engine = RayLingoTTS.normalizeEngine(payload.engine);
  activeTtsMonitorToken += 1;
  activeTtsOwner = payload.owner || null;
  activeTtsSessionId = payload.sessionId || null;
  activeTtsEngine = null;
  // Reliable zero-setup path first. Language is always routed from the translation target.
  if (engine === 'auto' || engine === 'system') return speakSystemTts(payload);
  // Browser AI is optional. Platforms without an offscreen document fall back to
  // the best available system/Web Speech backend instead of becoming silent.
  try {
    const result = await sendTtsAction('speak', payload);
    activeTtsEngine = result?.engine || engine;
    return result;
  } catch (error) {
    const fallback = await speakSystemTts(payload);
    return { ...fallback, fallback: true, aiError: error?.message || 'AI_TTS_UNAVAILABLE' };
  }
}

async function stopTts(owner = null, sessionId = null) {
  if (owner && activeTtsOwner && owner !== activeTtsOwner) return { ok: true, stopped: false };
  if (sessionId && activeTtsSessionId && sessionId !== activeTtsSessionId) return { ok: true, stopped: false };
  const stoppedOwner = activeTtsOwner || owner || null;
  const stoppedSessionId = activeTtsSessionId || sessionId || null;
  activeTtsMonitorToken += 1;
  activeTtsOwner = null;
  activeTtsSessionId = null;
  activeTtsEngine = null;
  try { chrome.tts?.stop?.(); } catch {}
  try { globalThis.speechSynthesis?.cancel?.(); activeWebSpeechUtterance = null; } catch {}
  try {
    if (await hasOffscreenDocument()) await chrome.runtime.sendMessage({ type: 'RAYLINGO_OFFSCREEN_TTS', action: 'stop', payload: { owner: stoppedOwner, sessionId: stoppedSessionId } });
  } catch {}
  broadcastTtsEvent('stopped', { engine: 'all', owner: stoppedOwner, sessionId: stoppedSessionId });
  return { ok: true, stopped: true };
}

async function ttsStatus(payload = {}) {
  let voices = await getChromeTtsVoices();
  let ttsBackend = voices.length || chrome.tts?.speak ? 'extension-tts' : null;
  if (!voices.length && globalThis.speechSynthesis) { voices = await getWebSpeechVoices(); ttsBackend = 'web-speech'; }
  const language = RayLingoLanguages.normalizeCode(payload.language) || payload.language || 'en';
  const selected = RayLingoTTS.chooseSystemVoice(voices, language, 'auto');
  const voiceSummary = RayLingoTTS.summarizeSystemVoices(voices, language);
  let speaking = false;
  try { speaking = Boolean(await chrome.tts?.isSpeaking?.()); } catch {}
  // TtsVoice.lang is optional. Lack of a tagged match is not a capability failure:
  // chrome.tts can still choose the best voice from options.lang automatically.
  let aiStatus = null;
  if (chrome.offscreen?.createDocument) { try { aiStatus = await sendTtsAction('status', { language, force: Boolean(payload.force) }); } catch {} }
  return {
    ok: true,
    speaking,
    activeTtsOwner,
    activeTtsSessionId,
    activeTtsEngine,
    nativeTtsAvailable: Boolean(chrome.tts?.speak || globalThis.speechSynthesis),
    ttsBackend: ttsBackend || 'offscreen',
    platform: globalThis.RayLingoPlatform?.family || 'webextension',
    matchingSystemVoice: selected?.voiceName || null,
    systemVoiceMode: selected ? RayLingoTTS.systemVoiceMatchTier(selected, language) : 'browser-auto',
    systemVoiceSummary: voiceSummary,
    systemVoices: voices.map(v => ({ ...v, matchTier: RayLingoTTS.systemVoiceMatchTier(v, language), score: RayLingoTTS.rankSystemVoice(v, language) })),
    aiOnline: Boolean(aiStatus?.aiOnline),
    aiReady: Boolean(aiStatus?.aiReady),
    piperSupported: RayLingoTTS.piperSupported(language),
    aiVoices: Array.isArray(aiStatus?.allAiVoices) ? aiStatus.allAiVoices : [],
    aiLanguages: RayLingoTTS.piperCatalog()
  };
}


const t = (key, fallback = '') => RayLingoI18n.t(key, fallback);

async function createMenus() {
  const stored = await chrome.storage.local.get({ uiLocale: 'auto' });
  await RayLingoI18n.init(stored.uiLocale);
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU_ROOT, title: t('contextRoot', 'RayLingo'), contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU_OPEN, parentId: MENU_ROOT, title: t('selectionTitle', 'Selection translation'), contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'raylingo-sep', parentId: MENU_ROOT, type: 'separator', contexts: ['selection'] });
  for (const code of MENU_TARGET_CODES) {
    chrome.contextMenus.create({
      id: `raylingo-target-${code}`,
      parentId: MENU_ROOT,
      title: `${t('contextTranslateTo', 'Translate to')} ${RayLingoI18n.languageLabel(code)}`,
      contexts: ['selection']
    });
  }
}

function chunkRemoteText(text, maxLength = 1500) {
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
    if (part.length <= maxLength) current = part;
    else {
      for (let start = 0; start < part.length; start += maxLength) chunks.push(part.slice(start, start + maxLength));
      current = '';
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function codedError(code, message) { const error = new Error(message); error.code = code; return error; }

function parseGoogleTranslation(payload) {
  const segments = payload?.[0];
  if (!Array.isArray(segments)) throw codedError('REMOTE_RESPONSE_CHANGED', 'Remote translation response format changed.');
  const text = segments.map(segment => Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '').join('');
  if (!text) throw codedError('REMOTE_NO_TEXT', 'Remote translation returned no text.');
  return text;
}

async function translateRemoteChunk(text, sourceLanguage, targetLanguage) {
  const source = RayLingoLanguages.googleCode(sourceLanguage);
  const target = RayLingoLanguages.googleCode(targetLanguage);
  if (!source || !target) throw codedError('REMOTE_UNSUPPORTED', 'Remote fallback does not support this language.');
  const params = new URLSearchParams({ client: 'gtx', sl: source, tl: target, dt: 't', ie: 'UTF-8', oe: 'UTF-8', q: text });
  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`, {
    method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
  });
  if (!response.ok) {
    if (response.status === 429) throw codedError('REMOTE_RATE_LIMITED', 'Google Translate is temporarily rate-limiting requests.');
    throw codedError('REMOTE_HTTP', `Remote translation failed (HTTP ${response.status}).`);
  }
  return parseGoogleTranslation(await response.json());
}

async function translateRemote(text, sourceLanguage, targetLanguage) {
  if (!text || typeof text !== 'string') throw codedError('REMOTE_NO_INPUT', 'No text to translate.');
  const chunks = chunkRemoteText(text, 1500);
  const translated = [];
  for (const chunk of chunks) translated.push(await translateRemoteChunk(chunk, sourceLanguage, targetLanguage));
  return translated.join('');
}

function sanitizeHistoryEntry(entry) {
  const sourceLanguage = entry?.sourceLanguage === 'auto' ? 'auto' : (RayLingoLanguages.normalizeCode(entry?.sourceLanguage) || 'auto');
  const targetLanguage = RayLingoLanguages.normalizeCode(entry?.targetLanguage);
  if (!targetLanguage) return null;
  const sourceText = String(entry?.sourceText || '').trim().slice(0, 12000);
  const resultText = String(entry?.resultText || '').trim().slice(0, 12000);
  if (!sourceText || !resultText) return null;
  return {
    sourceText,
    resultText,
    sourceLanguage,
    targetLanguage,
    provider: ['native', 'google-web', 'same'].includes(entry?.provider) ? entry.provider : 'unknown',
    createdAt: Number.isFinite(entry?.createdAt) ? entry.createdAt : Date.now()
  };
}

async function saveHistory(entry) {
  const sanitized = sanitizeHistoryEntry(entry);
  if (!sanitized) return false;
  const stored = await chrome.storage.local.get({ historyEnabled: true, [HISTORY_KEY]: [] });
  if (stored.historyEnabled === false) return false;
  const entries = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  const deduped = entries.filter(item => !(
    item.sourceText === sanitized.sourceText &&
    item.resultText === sanitized.resultText &&
    item.targetLanguage === sanitized.targetLanguage
  ));
  deduped.unshift(sanitized);
  await chrome.storage.local.set({ [HISTORY_KEY]: deduped.slice(0, HISTORY_LIMIT) });
  return true;
}

async function getHistory() {
  const stored = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY].slice(0, HISTORY_LIMIT) : [];
}

chrome.runtime.onInstalled.addListener(() => { integrityReady.then(state => state.ok && createMenus()).catch(error => console.error('[RayLingo] menu init failed:', error)); });
chrome.runtime.onStartup?.addListener(() => { createMenus().catch(error => console.error('[RayLingo] menu startup failed:', error)); });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.uiLocale) createMenus().catch(error => console.debug('[RayLingo] menu locale refresh failed:', error));
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const integrity = await RayLingoIntegrity.ensureVerified();
  if (!integrity.ok) return;
  if (!tab?.id || !info.selectionText) return;
  let targetLanguage = null;
  if (info.menuItemId === MENU_OPEN) {
    const stored = await chrome.storage.local.get({ selectionTargetLanguage: null, targetLanguage: 'zh-Hant' });
    targetLanguage = RayLingoLanguages.normalizeCode(stored.selectionTargetLanguage || stored.targetLanguage) || 'zh-Hant';
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('raylingo-target-')) {
    targetLanguage = RayLingoLanguages.normalizeCode(info.menuItemId.slice('raylingo-target-'.length));
  }
  if (!targetLanguage) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'RAYLINGO_TRANSLATE_SELECTION',
      text: info.selectionText,
      targetLanguage,
      autoStart: true
    });
  } catch (error) {
    console.debug('[RayLingo] content script unavailable on this page:', error);
  }
});

chrome.runtime.onConnect.addListener(port => {
  const owner = port.name === 'raylingo-popup' ? 'popup' : port.name === 'raylingo-app' ? 'app' : null;
  if (!owner) return;
  port.onDisconnect.addListener(() => {
    stopTts(owner).catch(() => null);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'RAYLINGO_INTEGRITY_STATUS') {
    RayLingoIntegrity.ensureVerified(Boolean(message.force)).then(sendResponse).catch(error => sendResponse({ ok:false, state:'locked', reason:error?.message||'INTEGRITY_FAILED' }));
    return true;
  }

  if (message?.type === 'RAYLINGO_TTS_SPEAK') {
    requireIntegrity().then(() => speakTts(message.payload || {})).then(sendResponse).catch(error => { activeTtsOwner = null; activeTtsSessionId = null; sendResponse({ ok: false, error: error?.message || 'TTS_FAILED' }); });
    return true;
  }

  if (message?.type === 'RAYLINGO_TTS_STOP') {
    stopTts(message.owner || null, message.sessionId || null).then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || 'TTS_STOP_FAILED' }));
    return true;
  }

  if (message?.type === 'RAYLINGO_TTS_STATUS') {
    requireIntegrity().then(() => ttsStatus(message.payload || {})).then(sendResponse).catch(error => sendResponse({ ok: false, aiOnline: false, systemVoices: [], error: error?.message || 'TTS_STATUS_FAILED' }));
    return true;
  }

  // Messages forwarded to the offscreen document are not handled by the worker. Terminal TTS events clear owner state.
  if (message?.type === 'RAYLINGO_TTS_EVENT') {
    if (['ended', 'stopped', 'error', 'cancelled', 'interrupted'].includes(message.event) && (!message.owner || message.owner === activeTtsOwner) && (!message.sessionId || message.sessionId === activeTtsSessionId)) { activeTtsOwner = null; activeTtsSessionId = null; }
    return false;
  }
  if (message?.type === 'RAYLINGO_OFFSCREEN_TTS') return false;
  if (message?.type === 'RAYLINGO_REMOTE_TRANSLATE') {
    (async () => {
      try {
        await requireIntegrity();
        const text = await translateRemote(message.text, message.sourceLanguage || 'auto', message.targetLanguage);
        sendResponse({ ok: true, text, provider: 'google-web' });
      } catch (error) {
        console.debug('[RayLingo] remote translation failed:', error);
        sendResponse({ ok: false, errorCode: error?.code || 'REMOTE_FAILED', error: error?.message || 'Remote translation failed.' });
      }
    })();
    return true;
  }

  if (message?.type === 'RAYLINGO_SAVE_HISTORY') {
    requireIntegrity().then(() => saveHistory(message.entry)).then(saved => sendResponse({ ok: true, saved })).catch(error => sendResponse({ ok: false, error: error?.message }));
    return true;
  }

  if (message?.type === 'RAYLINGO_GET_HISTORY') {
    requireIntegrity().then(() => getHistory()).then(entries => sendResponse({ ok: true, entries })).catch(error => sendResponse({ ok: false, entries: [], error: error?.message }));
    return true;
  }

  if (message?.type === 'RAYLINGO_CLEAR_HISTORY') {
    requireIntegrity().then(() => chrome.storage.local.set({ [HISTORY_KEY]: [] })).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error?.message }));
    return true;
  }

  return false;
});
