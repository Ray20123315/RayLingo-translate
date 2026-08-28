(() => {
  'use strict';

  const ROOT_ID = '__raylingo_media_overlay__';
  let host = null;
  let shadow = null;
  let overlay = null;
  let prefs = null;
  let currentVideo = null;
  let translatedToken = 0;
  let lastCaption = '';
  let transcriptSegments = null;
  let observer = null;
  const cache = new Map();
  const trackBound = new WeakSet();

  async function loadPrefs() {
    const stored = await chrome.storage.local.get({
      videoSubtitleEnabled: false,
      videoSubtitleTargetLanguage: null,
      selectionTargetLanguage: null,
      targetLanguage: 'zh-Hant',
      translationProvider: 'auto',
      remoteFallbackEnabled: true,
      selectionAccentColor: '#7c5cff'
    });
    prefs = {
      enabled: stored.videoSubtitleEnabled === true,
      targetLanguage: RayLingoLanguages.normalizeCode(stored.videoSubtitleTargetLanguage || stored.selectionTargetLanguage || stored.targetLanguage) || 'zh-Hant',
      translationProvider: globalThis.RayLingoAI?.normalizeTranslationProvider?.(stored.translationProvider) || 'auto',
      remoteFallbackEnabled: stored.remoteFallbackEnabled !== false,
      accent: stored.selectionAccentColor || '#7c5cff'
    };
    return prefs;
  }

  function ensureOverlay() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial}.rl-media-sub{position:fixed;display:none;max-width:min(82vw,980px);padding:9px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--accent) 44%,#fff0);border-top:2px solid var(--accent);background:rgba(8,9,12,.88);backdrop-filter:blur(10px);box-shadow:0 12px 35px rgba(0,0,0,.34);color:#f6f7fb;text-align:center;font:700 clamp(15px,2vw,25px)/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-shadow:0 2px 5px #000;white-space:pre-wrap;word-break:break-word;transform:translateX(-50%)}
      .rl-media-sub[data-state="working"]{opacity:.72;font-weight:600}.rl-media-sub small{display:block;margin-top:4px;color:#a9adb8;font-size:.55em;font-weight:500}
    </style><div class="rl-media-sub" role="status" aria-live="polite"></div>`;
    overlay = shadow.querySelector('.rl-media-sub');
    overlay.style.setProperty('--accent', prefs?.accent || '#7c5cff');
    document.documentElement.appendChild(host);
  }

  function findPrimaryVideo() {
    const videos = [...document.querySelectorAll('video')].filter(video => {
      const r = video.getBoundingClientRect();
      return r.width > 180 && r.height > 100 && r.bottom > 0 && r.top < innerHeight;
    });
    videos.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
    return videos[0] || document.querySelector('video');
  }

  function placeOverlay(video = currentVideo) {
    if (!overlay || !video) return;
    const rect = video.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > innerHeight) { overlay.style.display = 'none'; return; }
    overlay.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    overlay.style.bottom = `${Math.max(14, Math.round(innerHeight - rect.bottom + rect.height * .07))}px`;
    overlay.style.maxWidth = `${Math.max(220, Math.round(rect.width * .88))}px`;
  }

  function show(text, state = 'ready', source = '') {
    ensureOverlay();
    currentVideo = currentVideo || findPrimaryVideo();
    if (!text) { overlay.style.display = 'none'; return; }
    overlay.dataset.state = state;
    overlay.replaceChildren(document.createTextNode(text));
    if (source && source !== text) { const small = document.createElement('small'); small.textContent = source; overlay.append(small); }
    overlay.style.display = 'block';
    placeOverlay();
  }

  async function translateCaption(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean === lastCaption) return;
    lastCaption = clean;
    if (cache.has(clean)) { show(cache.get(clean), 'ready', clean); return; }
    const token = ++translatedToken;
    show('…', 'working', clean);
    try {
      const result = await RayLingoTranslator.translate({
        text: clean,
        sourceLanguage: 'auto',
        targetLanguage: prefs.targetLanguage,
        remoteFallbackEnabled: prefs.remoteFallbackEnabled,
        provider: prefs.translationProvider
      });
      if (token !== translatedToken) return;
      cache.set(clean, result.text);
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      show(result.text, 'ready', clean);
    } catch (error) {
      if (token !== translatedToken) return;
      show(`RayLingo: ${error?.message || 'subtitle translation failed'}`, 'ready', clean);
    }
  }

  function bindTextTracks(video) {
    if (!video?.textTracks) return false;
    let bound = false;
    for (const track of [...video.textTracks]) {
      if (!['captions', 'subtitles'].includes(track.kind)) continue;
      bound = true;
      if (!trackBound.has(track)) {
        trackBound.add(track);
        try { if (track.mode === 'disabled') track.mode = 'hidden'; } catch {}
        track.addEventListener('cuechange', () => {
          const text = [...(track.activeCues || [])].map(cue => cue.text || '').join('\n').trim();
          if (text) translateCaption(text);
        });
      }
    }
    return bound;
  }

  function observeYouTubeCaptions() {
    if (!/\b(?:youtube\.com|youtu\.be)$/i.test(location.hostname.replace(/^www\./,'')) && !location.hostname.endsWith('.youtube.com')) return;
    observer?.disconnect();
    observer = new MutationObserver(() => {
      if (!prefs?.enabled) return;
      const nodes = [...document.querySelectorAll('.ytp-caption-segment')];
      const text = nodes.map(node => node.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) translateCaption(text);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  function bindVideos() {
    currentVideo = findPrimaryVideo();
    if (currentVideo) {
      bindTextTracks(currentVideo);
      currentVideo.addEventListener('timeupdate', updateTranscriptOverlay, { passive: true });
    }
    for (const video of document.querySelectorAll('video')) bindTextTracks(video);
    observeYouTubeCaptions();
  }

  function updateTranscriptOverlay() {
    if (!transcriptSegments?.length) return;
    currentVideo = currentVideo || findPrimaryVideo();
    if (!currentVideo) return;
    const time = currentVideo.currentTime || 0;
    const segment = transcriptSegments.find(item => time >= item.start && time <= item.end);
    if (segment) show(segment.translation, 'ready', segment.source);
  }

  async function startTranscriptFromCurrentPage() {
    await loadPrefs();
    const url = location.href;
    show('AI transcription…', 'working');
    const result = await RayLingoAI.transcribeYouTube({ url, targetLanguage: prefs.targetLanguage, provider: 'gemini' });
    transcriptSegments = result.segments || [];
    currentVideo = findPrimaryVideo();
    currentVideo?.addEventListener('timeupdate', updateTranscriptOverlay, { passive: true });
    updateTranscriptOverlay();
    return { segments: transcriptSegments.length };
  }

  async function refresh() {
    await loadPrefs();
    if (!prefs.enabled) { if (overlay) overlay.style.display = 'none'; observer?.disconnect(); return; }
    ensureOverlay();
    bindVideos();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'RAYLINGO_MEDIA_TRANSCRIBE_CURRENT') return false;
    startTranscriptFromCurrentPage().then(result => sendResponse({ ok: true, ...result })).catch(error => sendResponse({ ok: false, error: error?.message || 'TRANSCRIPT_FAILED', errorCode: error?.code || 'TRANSCRIPT_FAILED' }));
    return true;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (['videoSubtitleEnabled','videoSubtitleTargetLanguage','selectionTargetLanguage','targetLanguage','translationProvider','remoteFallbackEnabled','selectionAccentColor'].some(key => key in changes)) refresh().catch(() => null);
  });
  window.addEventListener('scroll', () => placeOverlay(), { passive: true });
  window.addEventListener('resize', () => placeOverlay(), { passive: true });
  new MutationObserver(() => { if (prefs?.enabled) bindVideos(); }).observe(document.documentElement, { childList: true, subtree: true });
  refresh().catch(() => null);

  globalThis.RayLingoMediaTranslation = Object.freeze({ refresh, startTranscriptFromCurrentPage, translateCaption });
})();
