(() => {
  'use strict';

  const PIPER_ORIGIN = RayLingoTTS.piperOrigin;
  const frame = document.getElementById('piperFrame');
  const piperPending = new Map();
  const installPending = new Map();
  let piperVoices = [];
  let piperAdvertised = false;
  let currentAudio = null;
  let currentAudioUrl = null;
  let activeAudioRequestId = null;
  let currentUtterance = null;
  let currentEngine = null;
  let currentOwner = null;
  let currentSessionId = null;
  let playbackToken = 0;

  function emit(event, detail = {}) {
    chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_EVENT', event, owner: detail.owner ?? currentOwner, sessionId: detail.sessionId ?? currentSessionId, ...detail }).catch(() => null);
  }

  function cleanupAudio(resolveRequest = false) {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
      currentAudio = null;
    }
    if (currentAudioUrl) {
      try { URL.revokeObjectURL(currentAudioUrl); } catch {}
      currentAudioUrl = null;
    }
    if (resolveRequest && activeAudioRequestId) {
      sendPiperResponse(activeAudioRequestId, undefined, undefined);
      activeAudioRequestId = null;
    }
  }

  function stopAll({ emitEvent = true } = {}) {
    playbackToken += 1;
    cleanupAudio(true);
    try { speechSynthesis.cancel(); } catch {}
    currentUtterance = null;
    if (piperAdvertised) sendPiperRequest('stop').catch(() => null);
    currentEngine = null;
    const stoppedOwner = currentOwner;
    const stoppedSessionId = currentSessionId;
    if (emitEvent) emit('stopped', { owner: stoppedOwner, sessionId: stoppedSessionId });
    currentOwner = null;
    currentSessionId = null;
  }

  function postToPiper(message) {
    if (!frame?.contentWindow) throw new Error('PIPER_FRAME_UNAVAILABLE');
    frame.contentWindow.postMessage(message, PIPER_ORIGIN);
  }

  function sendPiperRequest(method, args = {}) {
    const id = `raylingo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        piperPending.delete(id);
        reject(new Error('PIPER_REQUEST_TIMEOUT'));
      }, method === 'speak' ? 15000 : 10000);
      piperPending.set(id, { resolve, reject, timer });
      postToPiper({ to: 'piper-service', type: 'request', id, method, args });
    });
  }

  function sendPiperResponse(id, result, error) {
    postToPiper({ type: 'response', id, result, error });
  }

  function resolvePiperResponse(message) {
    const pending = piperPending.get(message.id);
    if (!pending) return;
    piperPending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error?.message || String(message.error)));
    else pending.resolve(message.result);
  }

  function baseLanguage(tag) { return String(tag || '').toLowerCase().split(/[-_]/)[0]; }

  async function waitForSystemVoices(timeoutMs = 900) {
    let voices = speechSynthesis.getVoices();
    if (voices.length) return voices;
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; speechSynthesis.removeEventListener?.('voiceschanged', finish); resolve(); };
      speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true });
      setTimeout(finish, timeoutMs);
    });
    return speechSynthesis.getVoices();
  }

  function voiceScore(voice, lang) {
    const name = String(voice.name || '').toLowerCase();
    const voiceLang = String(voice.lang || '').toLowerCase();
    const wanted = String(lang || '').toLowerCase();
    let score = 0;
    if (voiceLang === wanted) score += 50;
    else if (baseLanguage(voiceLang) === baseLanguage(wanted)) score += 30;
    if (/natural|neural|online \(natural\)|premium|enhanced|high quality/.test(name)) score += 45;
    if (/microsoft|google/.test(name)) score += 12;
    if (voice.localService) score += 3;
    if (/compact|espeak/.test(name)) score -= 12;
    return score;
  }

  async function listSystemVoices(language = '') {
    const voices = await waitForSystemVoices();
    const speechCode = RayLingoLanguages.speechCode(language) || language || '';
    return voices.map(v => ({ name: v.name, lang: v.lang, localService: Boolean(v.localService), default: Boolean(v.default), score: voiceScore(v, speechCode) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  async function speakSystem({ text, language, speed = 1, systemVoice = 'auto' }, token = playbackToken) {
    const speechCode = RayLingoLanguages.speechCode(language) || language || 'en-US';
    const voices = await waitForSystemVoices();
    if (token !== playbackToken) return null;
    const exact = systemVoice && systemVoice !== 'auto' ? voices.find(v => v.name === systemVoice && baseLanguage(v.lang) === baseLanguage(speechCode)) : null;
    const candidates = voices.slice().sort((a, b) => voiceScore(b, speechCode) - voiceScore(a, speechCode));
    const voice = exact || candidates[0] || null;
    const utterance = new SpeechSynthesisUtterance(String(text || ''));
    currentUtterance = utterance;
    currentEngine = 'system';
    utterance.lang = speechCode;
    utterance.rate = RayLingoTTS.clampSpeed(speed);
    if (voice) utterance.voice = voice;
    utterance.onstart = () => emit('started', { engine: 'system', voice: voice?.name || null });
    utterance.onend = () => { if (token === playbackToken) { const owner = currentOwner; const sessionId = currentSessionId; currentUtterance = null; currentEngine = null; emit('ended', { engine: 'system', owner, sessionId }); currentOwner = null; currentSessionId = null; } };
    utterance.onerror = event => { if (token === playbackToken) { const owner = currentOwner; const sessionId = currentSessionId; currentUtterance = null; currentEngine = null; emit('error', { engine: 'system', owner, sessionId, error: event.error || 'SYSTEM_TTS_FAILED' }); currentOwner = null; currentSessionId = null; } };
    speechSynthesis.speak(utterance);
    return { engine: 'system', voice: voice?.name || null };
  }

  function compatiblePiperVoices(language) {
    return piperVoices.filter(voice => RayLingoTTS.voiceMatchesLanguage(voice, language));
  }

  function waitForPiperAdvertise(timeoutMs = 12000) {
    if (piperAdvertised) return Promise.resolve(true);
    return new Promise(resolve => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (piperAdvertised || Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve(piperAdvertised);
        }
      }, 150);
    });
  }

  function waitForCompatibleVoice(language, timeoutMs = 245000, token = playbackToken) {
    const existing = RayLingoTTS.choosePiperVoice(piperVoices, language, 'auto');
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (token !== playbackToken) { clearInterval(timer); reject(new Error('TTS_CANCELLED')); return; }
        const voice = RayLingoTTS.choosePiperVoice(piperVoices, language, 'auto');
        if (voice) { clearInterval(timer); resolve(voice); return; }
        if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('PIPER_INSTALL_TIMEOUT')); }
      }, 300);
    });
  }

  function requestInstall(language, token = playbackToken) {
    const spec = RayLingoTTS.piperTarget(language);
    if (!spec) return Promise.reject(new Error('PIPER_UNSUPPORTED_LANGUAGE'));
    const requestId = `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    emit('preparing', { engine: 'ai-browser', language });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        installPending.delete(requestId);
        reject(new Error('PIPER_INSTALL_TIMEOUT'));
      }, 245000);
      installPending.set(requestId, { resolve, reject, timer, language, token });
      postToPiper({ type: 'RAYLINGO_PIPER_INSTALL_REQUEST', requestId, spec });
    });
  }

  async function ensurePiperVoice(language, preferredVoice, token = playbackToken) {
    const ready = await waitForPiperAdvertise();
    if (!ready) throw new Error('PIPER_SERVICE_NOT_READY');
    let voice = RayLingoTTS.choosePiperVoice(piperVoices, language, preferredVoice);
    if (voice) return voice;
    const install = requestInstall(language, token);
    const voicePromise = waitForCompatibleVoice(language, 245000, token);
    // The page may advertise the voice before the content-script observes the 100% label.
    voice = await Promise.race([voicePromise, install.then(() => waitForCompatibleVoice(language, 15000, token))]);
    return voice;
  }

  async function playExternalPiperAudio(message) {
    const src = message.args?.src;
    if (!(src instanceof Blob)) throw new Error('PIPER_AUDIO_BLOB_MISSING');
    cleanupAudio(true);
    activeAudioRequestId = message.id;
    currentAudioUrl = URL.createObjectURL(src);
    currentAudio = new Audio(currentAudioUrl);
    if (Number.isFinite(message.args?.rate)) currentAudio.playbackRate = Math.max(0.5, Math.min(2, Number(message.args.rate)));
    if (Number.isFinite(message.args?.volume)) currentAudio.volume = Math.max(0, Math.min(1, Number(message.args.volume)));
    const audio = currentAudio;
    audio.onended = () => {
      const id = activeAudioRequestId;
      activeAudioRequestId = null;
      cleanupAudio(false);
      if (id) sendPiperResponse(id, undefined, undefined);
    };
    audio.onerror = () => {
      const id = activeAudioRequestId;
      activeAudioRequestId = null;
      cleanupAudio(false);
      if (id) sendPiperResponse(id, undefined, { message: 'PIPER_AUDIO_PLAYBACK_FAILED' });
    };
    await audio.play();
  }

  async function speakPiper({ text, language, speed = 1, voice = 'auto' }, token = playbackToken) {
    const selected = await ensurePiperVoice(language, voice, token);
    if (token !== playbackToken) throw new Error('TTS_CANCELLED');
    currentEngine = 'ai-browser';
    await sendPiperRequest('speak', {
      utterance: String(text || ''),
      voiceName: selected.voiceName,
      pitch: 1,
      rate: RayLingoTTS.clampSpeed(speed),
      volume: 1,
      externalPlayback: true
    });
    return { engine: 'ai-browser', voice: selected.voiceName };
  }

  async function startSpeak(payload) {
    stopAll({ emitEvent: false });
    currentOwner = payload?.owner || null;
    currentSessionId = payload?.sessionId || null;
    const text = String(payload?.text || '').trim();
    if (!text) return { ok: false, error: 'TTS_NO_TEXT' };
    const token = playbackToken;
    const engine = RayLingoTTS.normalizeEngine(payload.engine);
    const language = RayLingoLanguages.normalizeCode(payload.language) || payload.language || 'en';
    const speed = RayLingoTTS.clampSpeed(payload.speed);

    if (engine !== 'system' && RayLingoTTS.piperSupported(language)) {
      try {
        const result = await speakPiper({ text, language, speed, voice: payload.voice }, token);
        if (token !== playbackToken) return { ok: false, error: 'TTS_CANCELLED' };
        return { ok: true, ...result, fallback: false };
      } catch (error) {
        if (token !== playbackToken) return { ok: false, error: 'TTS_CANCELLED' };
        emit('fallback', { from: 'ai-browser', to: 'system', error: error?.message || 'PIPER_FAILED' });
        const system = await speakSystem({ text, language, speed, systemVoice: payload.systemVoice }, token);
        return { ok: true, ...system, fallback: true, aiError: error?.message || 'PIPER_FAILED' };
      }
    }

    const system = await speakSystem({ text, language, speed, systemVoice: payload.systemVoice }, token);
    return { ok: true, ...system, fallback: engine !== 'system', piperSupported: RayLingoTTS.piperSupported(language) };
  }

  async function status(payload = {}) {
    // Do not block the popup for long if the iframe is still warming up.
    await waitForPiperAdvertise(payload.force ? 5000 : 1200);
    const voices = await listSystemVoices(payload.language || '');
    return {
      ok: true,
      aiOnline: piperAdvertised,
      aiReady: Boolean(RayLingoTTS.choosePiperVoice(piperVoices, payload.language || 'en', 'auto')),
      piperSupported: RayLingoTTS.piperSupported(payload.language || 'en'),
      aiVoices: compatiblePiperVoices(payload.language || 'en'),
      allAiVoices: piperVoices.slice(),
      aiLanguages: RayLingoTTS.piperCatalog(),
      systemVoices: voices
    };
  }

  window.addEventListener('message', event => {
    if (event.origin !== PIPER_ORIGIN || event.source !== frame?.contentWindow) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'response') {
      resolvePiperResponse(message);
      return;
    }

    if (message.type === 'RAYLINGO_PIPER_INSTALL_PROGRESS') {
      const pending = installPending.get(message.requestId);
      if (pending && pending.token === playbackToken) emit('progress', { engine: 'ai-browser', phase: 'model-download', percent: Number(message.percent) || 0, language: pending.language });
      return;
    }

    if (message.type === 'RAYLINGO_PIPER_INSTALL_RESULT') {
      const pending = installPending.get(message.requestId);
      if (!pending) return;
      installPending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.ok) pending.resolve(message);
      else pending.reject(new Error(message.error || 'PIPER_INSTALL_FAILED'));
      return;
    }

    if (message.to !== 'piper-host') return;
    if (message.type === 'notification') {
      if (message.method === 'advertiseVoices') {
        piperVoices = Array.isArray(message.args?.voices) ? message.args.voices : [];
        piperAdvertised = true;
        emit('status', { engine: 'ai-browser', aiOnline: true, voices: piperVoices.length });
      } else if (message.method === 'onStart') {
        emit('started', { engine: 'ai-browser' });
      } else if (message.method === 'onSentence') {
        emit('sentence', { engine: 'ai-browser', ...message.args });
      } else if (message.method === 'onEnd') {
        const owner = currentOwner;
        const sessionId = currentSessionId;
        currentEngine = null;
        emit('ended', { engine: 'ai-browser', owner, sessionId });
        currentOwner = null;
        currentSessionId = null;
      } else if (message.method === 'onError') {
        const owner = currentOwner;
        const sessionId = currentSessionId;
        currentEngine = null;
        emit('error', { engine: 'ai-browser', owner, sessionId, error: message.args?.error?.message || 'PIPER_FAILED' });
        currentOwner = null;
        currentSessionId = null;
      } else if (message.method === 'audioPause') {
        try { currentAudio?.pause(); } catch {}
      } else if (message.method === 'audioResume') {
        currentAudio?.play?.().catch(() => null);
      }
      return;
    }

    if (message.type === 'request' && message.method === 'audioPlay') {
      playExternalPiperAudio(message).catch(error => sendPiperResponse(message.id, undefined, { message: error?.message || 'PIPER_AUDIO_FAILED' }));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'RAYLINGO_OFFSCREEN_TTS') return false;
    (async () => {
      if (message.action === 'speak') return startSpeak(message.payload || {});
      if (message.action === 'stop') { stopAll(); return { ok: true }; }
      if (message.action === 'status') return status(message.payload || {});
      return { ok: false, error: 'TTS_UNKNOWN_ACTION' };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || 'TTS_OFFSCREEN_FAILED' }));
    return true;
  });
})();
