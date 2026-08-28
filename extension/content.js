(() => {
  'use strict';

  const ROOT_ID = '__raylingo_root__';
  const MAX_SELECTION = 5000;

  let host = null;
  let shadow = null;
  let actionButton = null;
  let dockButton = null;
  let panel = null;
  let selectedRect = null;
  let selectedText = '';
  let pinned = false;
  let prefs = null;
  let panelDebounce = null;
  let translateSerial = 0;
  let animationSerial = 0;
  let historyTimer = null;
  let uiReady = null;
  let ttsSpeaking = false;
  let activeSpeechKind = null;
  let activeTtsSessionId = null;
  let selectionTtsWatchdogTimer = null;
  let lastPanelSourceLanguage = 'auto';
  let persistentPanel = false;
  let hoverOpened = false;
  let hoverCloseTimer = null;

  const t = (key, fallback = '') => RayLingoI18n.t(key, fallback);


  function localizedError(error) {
    const byCode = {
      REMOTE_RATE_LIMITED: 'remoteRateLimited',
      REMOTE_HTTP: 'remoteHttpFailed',
      REMOTE_RESPONSE_CHANGED: 'remoteResponseChanged',
      REMOTE_NO_TEXT: 'remoteNoText',
      REMOTE_UNSUPPORTED: 'remoteUnsupported',
      REMOTE_NO_INPUT: 'remoteNoInput'
    };
    if (error?.name === 'NotAllowedError') return t('statusNeedGesture');
    if (error?.message === 'REMOTE_FALLBACK_DISABLED') return t('statusRemoteDisabled');
    if (byCode[error?.code]) return t(byCode[error.code]);
    return error?.message || t('statusTranslationFailed');
  }

  async function loadPreferences() {
    const stored = await chrome.storage.local.get({
      selectionMode: null,
      selectionEnabled: true,
      selectionSourceLanguage: 'auto',
      selectionTargetLanguage: null,
      targetLanguage: 'zh-Hant',
      typingEffectEnabled: true,
      historyEnabled: true,
      remoteFallbackEnabled: true,
      uiLocale: 'auto',
      ttsEngine: 'auto',
      ttsVoice: 'auto',
      systemVoice: 'auto',
      ttsSpeed: 1,
      selectionTriggerStyle: 'label',
      selectionTriggerSize: 36,
      selectionSurfaceTheme: 'black',
      selectionAccentColor: '#7c5cff',
      translationProvider: 'auto',
      floatingWidgetEnabled: false,
      floatingWidgetHoverExpand: true,
      floatingWidgetStartCollapsed: true,
      floatingWidgetCollapsed: null
    });
    prefs = {
      selectionMode: stored.selectionMode || (stored.selectionEnabled === false ? 'off' : 'auto'),
      selectionSourceLanguage: stored.selectionSourceLanguage === 'auto' ? 'auto' : (RayLingoLanguages.normalizeCode(stored.selectionSourceLanguage) || 'auto'),
      selectionTargetLanguage: RayLingoLanguages.normalizeCode(stored.selectionTargetLanguage || stored.targetLanguage) || 'zh-Hant',
      typingEffectEnabled: stored.typingEffectEnabled !== false,
      historyEnabled: stored.historyEnabled !== false,
      remoteFallbackEnabled: stored.remoteFallbackEnabled !== false,
      uiLocale: stored.uiLocale || 'auto',
      ttsEngine: RayLingoTTS.normalizeEngine(stored.ttsEngine),
      ttsVoice: typeof stored.ttsVoice === 'string' ? stored.ttsVoice : 'auto',
      systemVoice: typeof stored.systemVoice === 'string' ? stored.systemVoice : 'auto',
      ttsSpeed: RayLingoTTS.clampSpeed(stored.ttsSpeed),
      translationProvider: globalThis.RayLingoAI?.normalizeTranslationProvider?.(stored.translationProvider) || 'auto',
      floatingWidgetEnabled: stored.floatingWidgetEnabled === true,
      floatingWidgetHoverExpand: stored.floatingWidgetHoverExpand !== false,
      floatingWidgetStartCollapsed: stored.floatingWidgetStartCollapsed !== false,
      floatingWidgetCollapsed: stored.floatingWidgetCollapsed == null ? null : stored.floatingWidgetCollapsed === true,
      ...RayLingoSelectionAppearance.fromStored(stored)
    };
    return prefs;
  }

  function destroyUi() {
    if (ttsSpeaking || activeTtsSessionId) chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STOP', owner: 'selection', sessionId: activeTtsSessionId }).catch(() => null);
    setSelectionSpeakState(false);
    host?.remove();
    host = shadow = actionButton = dockButton = panel = null;
    pinned = false;
    persistentPanel = false;
    hoverOpened = false;
    uiReady = null;
  }

  async function ensureUi() {
    if (host?.isConnected) return;
    if (uiReady) return uiReady;
    uiReady = (async () => {
      await loadPreferences();
      await RayLingoI18n.init(prefs.uiLocale);

      host = document.createElement('div');
      host.id = ROOT_ID;
      host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host{all:initial}.lf-root,.lf-root *{box-sizing:border-box}.lf-root{font-family:Inter,"Noto Sans TC","Noto Sans SC","Noto Sans JP","Noto Sans KR",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--rl-selection-text)}
          .lf-action{position:fixed;width:var(--rl-selection-trigger-size);height:var(--rl-selection-trigger-size);border:2px solid var(--rl-selection-accent);border-radius:11px;background:var(--rl-selection-surface);color:var(--rl-selection-accent);font:800 clamp(10px,calc(var(--rl-selection-trigger-size) * .38),18px)/1 inherit;box-shadow:0 8px 24px rgba(0,0,0,.24);cursor:pointer;pointer-events:auto;display:none;place-items:center;padding:0;transition:transform .15s ease,background .15s ease,border-color .15s ease}.lf-action:hover{transform:translateY(-1px);background:var(--rl-selection-accent-soft)}.lf-action-point{display:none}.lf-action[data-style="dot"]{border:0;background:transparent;box-shadow:none;border-radius:999px;line-height:0;padding:0;margin:0}.lf-action[data-style="dot"] .lf-action-label{display:none}.lf-action[data-style="dot"] .lf-action-point{display:block;width:72%;height:72%;margin:0;border-radius:50%;background:var(--rl-selection-accent);box-shadow:0 0 0 3px var(--rl-selection-surface),0 5px 17px rgba(0,0,0,.28)}
          .lf-dock{position:fixed;right:16px;bottom:112px;min-width:36px;height:36px;border:1px solid var(--rl-selection-accent-ring);border-radius:999px;background:radial-gradient(circle at 20% 20%,var(--rl-selection-accent-soft),transparent 70%),var(--rl-selection-surface);color:var(--rl-selection-accent-strong);box-shadow:0 10px 30px rgba(0,0,0,.28);pointer-events:auto;cursor:pointer;display:none;align-items:center;gap:8px;padding:0 11px;font:800 11px/1 inherit;transition:width .18s ease,transform .18s ease,background .18s ease}.lf-dock:hover{transform:translateY(-1px);background:var(--rl-selection-accent-soft)}.lf-dock .lf-dock-dot{width:10px;height:10px;border-radius:999px;background:var(--rl-selection-accent);box-shadow:0 0 0 3px var(--rl-selection-accent-soft)}.lf-dock[data-collapsed="true"]{width:22px;min-width:22px;height:22px;padding:0;justify-content:center}.lf-dock[data-collapsed="true"] .lf-dock-label{display:none}.lf-dock[data-collapsed="true"] .lf-dock-dot{width:9px;height:9px;box-shadow:0 0 0 4px var(--rl-selection-surface),0 0 16px var(--rl-selection-accent-ring)}
          .lf-panel{position:fixed;width:min(440px,calc(100vw - 20px));max-height:min(560px,calc(100vh - 20px));display:none;overflow:hidden;border:1px solid var(--rl-selection-line);border-radius:17px;background:radial-gradient(circle at 8% -6%,var(--rl-selection-accent-soft),transparent 40%),var(--rl-selection-panel);box-shadow:var(--rl-selection-shadow);pointer-events:auto;color:var(--rl-selection-text)}
          .lf-head{height:42px;display:flex;align-items:center;gap:8px;padding:0 10px 0 13px;border-bottom:1px solid var(--rl-selection-line)}.lf-brand{font-size:12px;font-weight:800;letter-spacing:.2px}.lf-dot{width:7px;height:7px;border-radius:50%;background:var(--rl-selection-accent)}.lf-spacer{flex:1}.lf-tool{height:28px;border:1px solid var(--rl-selection-line);border-radius:8px;background:var(--rl-selection-surface);color:var(--rl-selection-muted);padding:0 8px;font:700 10px/1 inherit;cursor:pointer}.lf-tool:hover{color:var(--rl-selection-accent-strong);background:var(--rl-selection-accent-soft)}.lf-tool[data-active="true"]{color:var(--rl-selection-accent-strong);background:var(--rl-selection-accent-soft);border-color:var(--rl-selection-accent-ring)}.lf-minimize,.lf-close{width:28px;padding:0;font-size:15px}
          .lf-body{padding:11px;overflow:auto;max-height:calc(min(560px,100vh - 20px) - 42px)}
          .lf-langs{display:grid;grid-template-columns:1fr 34px 1fr;gap:7px;align-items:end}.lf-field{display:grid;gap:4px}.lf-field>span{font-size:9.5px;font-weight:700;color:var(--rl-selection-muted)}.lf-select{width:100%;height:34px;border:1px solid var(--rl-selection-line);border-radius:9px;background:var(--rl-selection-surface);color:var(--rl-selection-text);padding:0 27px 0 8px;font:500 11px/1 inherit;outline:none}.lf-select:focus{border-color:var(--rl-selection-accent);box-shadow:0 0 0 3px var(--rl-selection-accent-soft)}.lf-swap{height:34px;border:1px solid var(--rl-selection-line);border-radius:9px;background:var(--rl-selection-surface);color:var(--rl-selection-muted);cursor:pointer;font-size:15px}.lf-swap:hover{color:var(--rl-selection-accent-strong);background:var(--rl-selection-accent-soft)}
          .lf-section{margin-top:9px;border:1px solid var(--rl-selection-line);border-radius:11px;overflow:hidden;background:var(--rl-selection-surface)}.lf-section-head{min-height:30px;padding:4px 9px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--rl-selection-line);color:var(--rl-selection-muted);font-size:9.5px;font-weight:700}.lf-source{display:block;width:100%;min-height:72px;max-height:145px;resize:vertical;border:0;outline:0;padding:9px 10px;background:var(--rl-selection-surface);color:var(--rl-selection-text);font:500 12px/1.55 inherit}.lf-result{user-select:text;-webkit-user-select:text;cursor:text;min-height:68px;max-height:150px;overflow:auto;padding:9px 10px;white-space:pre-wrap;word-break:break-word;font:500 12px/1.58 inherit;color:var(--rl-selection-text)}.lf-result.placeholder{color:var(--rl-selection-muted)}.lf-result-actions{display:flex;gap:5px}.lf-link{border:1px solid var(--rl-selection-line);border-radius:7px;background:var(--rl-selection-surface);color:var(--rl-selection-accent-strong);padding:4px 7px;font:700 9.5px/1 inherit;cursor:pointer}.lf-link:hover{border-color:var(--rl-selection-accent);background:var(--rl-selection-accent-soft);text-decoration:none}
          .lf-status{min-height:30px;display:flex;align-items:center;gap:6px;color:var(--rl-selection-muted);font:500 10px/1.35 inherit;padding:4px 2px}.lf-status-dot{width:6px;height:6px;border-radius:50%;background:var(--rl-selection-accent);flex:0 0 auto}.lf-status.working .lf-status-dot{background:#c38a17;animation:lfPulse 1s infinite}.lf-status.error{color:#d76868}.lf-status.error .lf-status-dot{background:#d76868}.lf-status-text{min-width:0}.lf-progress{margin-left:auto;font-variant-numeric:tabular-nums}.lf-privacy{display:none;margin-top:1px;padding:7px 8px;border-radius:8px;background:var(--rl-selection-surface-muted);color:var(--rl-selection-muted);border:1px solid var(--rl-selection-line);font:500 9.5px/1.4 inherit}.lf-privacy.visible{display:block}
          @keyframes lfPulse{50%{opacity:.35;transform:scale(.72)}}
        </style>
        <div class="lf-root">
          <button class="lf-dock" type="button" aria-label="RayLingo"><span class="lf-dock-dot"></span><span class="lf-dock-label">RayLingo</span></button>
          <button class="lf-action" type="button"><span class="lf-action-label">${t('selectionAction', '譯')}</span><span class="lf-action-point" aria-hidden="true"></span></button>
          <section class="lf-panel" role="dialog" aria-label="RayLingo">
            <header class="lf-head">
              <span class="lf-dot"></span><span class="lf-brand">RayLingo</span><span class="lf-spacer"></span>
              <button class="lf-tool lf-pin" type="button">${t('selectionPin')}</button>
              <button class="lf-tool lf-minimize" type="button" title="${t('floatingWidgetMinimize','縮小')}">−</button>
              <button class="lf-tool lf-close" type="button" title="${t('selectionClose')}">×</button>
            </header>
            <div class="lf-body">
              <div class="lf-langs">
                <label class="lf-field"><span>${t('sourceLanguage')}</span><select class="lf-select lf-source-lang"></select></label>
                <button class="lf-swap" type="button" title="${t('swap')}">⇄</button>
                <label class="lf-field"><span>${t('targetLanguage')}</span><select class="lf-select lf-target-lang"></select></label>
              </div>
              <section class="lf-section">
                <div class="lf-section-head"><span>${t('selectionOriginal')}</span><span class="lf-result-actions"><span class="lf-source-count">0 / ${MAX_SELECTION.toLocaleString()}</span><button class="lf-link lf-source-speak" type="button">${t('selectionSpeak')}</button><button class="lf-link lf-source-copy" type="button">${t('selectionCopy')}</button></span></div>
                <textarea class="lf-source" maxlength="${MAX_SELECTION}" spellcheck="false"></textarea>
              </section>
              <div class="lf-status"><span class="lf-status-dot"></span><span class="lf-status-text">${t('selectionWaiting')}</span><span class="lf-progress"></span></div>
              <section class="lf-section">
                <div class="lf-section-head"><span>${t('selectionResult')}</span><span class="lf-result-actions"><button class="lf-link lf-result-speak" type="button">${t('selectionSpeak')}</button><button class="lf-link lf-result-copy" type="button">${t('selectionCopy')}</button></span></div>
                <div class="lf-result placeholder">—</div>
              </section>
              <div class="lf-privacy">${t('selectionRemotePrivacy')}</div>
            </div>
          </section>
        </div>`;

      actionButton = shadow.querySelector('.lf-action');
      dockButton = shadow.querySelector('.lf-dock');
      panel = shadow.querySelector('.lf-panel');
      RayLingoSelectionAppearance.applyToElement(shadow.querySelector('.lf-root'), prefs);
      actionButton.dataset.style = prefs.selectionTriggerStyle;
      dockButton.dataset.collapsed = 'true';
      const sourceSelect = shadow.querySelector('.lf-source-lang');
      const targetSelect = shadow.querySelector('.lf-target-lang');
      RayLingoI18n.populateLanguageSelect(sourceSelect, { includeAuto: true, selected: prefs.selectionSourceLanguage });
      RayLingoI18n.populateLanguageSelect(targetSelect, { selected: prefs.selectionTargetLanguage });
      sourceSelect.value = prefs.selectionSourceLanguage;
      targetSelect.value = prefs.selectionTargetLanguage;
      shadow.querySelector('.lf-privacy').classList.toggle('visible', !RayLingoTranslator.isNativeAvailable() && prefs.remoteFallbackEnabled);

      actionButton.addEventListener('click', () => {
        if (selectedText && selectedRect) showPanel(selectedText, selectedRect, { immediate: true });
      });
      shadow.querySelector('.lf-close').addEventListener('click', () => { if (prefs?.floatingWidgetEnabled) minimizePersistentPanel(); else hideAll(); });
      shadow.querySelector('.lf-minimize').addEventListener('click', minimizePersistentPanel);
      dockButton.addEventListener('click', () => openPersistentPanel({ fromHover: false }));
      dockButton.addEventListener('mouseenter', () => { if (prefs?.floatingWidgetHoverExpand) openPersistentPanel({ fromHover: true }); });
      dockButton.addEventListener('mouseleave', scheduleHoverCollapse);
      panel.addEventListener('mouseenter', () => { clearTimeout(hoverCloseTimer); });
      panel.addEventListener('mouseleave', scheduleHoverCollapse);
      shadow.querySelector('.lf-pin').addEventListener('click', togglePin);
      shadow.querySelector('.lf-swap').addEventListener('click', swapPanelLanguages);
      shadow.querySelector('.lf-source-copy').addEventListener('click', copyPanelSource);
      shadow.querySelector('.lf-source-speak').addEventListener('click', () => speakPanelText('source'));
      shadow.querySelector('.lf-result-copy').addEventListener('click', copyPanelResult);
      shadow.querySelector('.lf-result-speak').addEventListener('click', () => speakPanelText('translation'));
      shadow.querySelector('.lf-source').addEventListener('input', () => {
        updateSourceCount();
        schedulePanelTranslation();
      });
      sourceSelect.addEventListener('change', async () => {
        prefs.selectionSourceLanguage = sourceSelect.value;
        await chrome.storage.local.set({ selectionSourceLanguage: prefs.selectionSourceLanguage });
        schedulePanelTranslation(40);
      });
      targetSelect.addEventListener('change', async () => {
        prefs.selectionTargetLanguage = targetSelect.value;
        await chrome.storage.local.set({ selectionTargetLanguage: prefs.selectionTargetLanguage });
        schedulePanelTranslation(40);
      });

      document.documentElement.appendChild(host);
    })().finally(() => { uiReady = null; });
    return uiReady;
  }

  function scheduleHoverCollapse() {
    clearTimeout(hoverCloseTimer);
    if (!hoverOpened || pinned) return;
    hoverCloseTimer = setTimeout(() => {
      const overDock = dockButton?.matches(':hover');
      const overPanel = panel?.matches(':hover');
      if (!overDock && !overPanel) minimizePersistentPanel({ persist: false });
    }, 420);
  }

  function persistentRect() {
    const rect = dockButton?.getBoundingClientRect();
    if (rect?.width) return rect;
    return { left: Math.max(10, innerWidth - 455), right: innerWidth - 16, top: Math.max(10, innerHeight - 170), bottom: innerHeight - 112, width: 36, height: 36 };
  }

  async function setPersistentCollapsed(collapsed, persist = true) {
    if (!dockButton) return;
    const next = Boolean(collapsed);
    dockButton.dataset.collapsed = String(next);
    const changed = prefs?.floatingWidgetCollapsed !== next;
    if (prefs) prefs.floatingWidgetCollapsed = next;
    if (persist && changed) await chrome.storage.local.set({ floatingWidgetCollapsed: next }).catch(() => null);
  }

  async function openPersistentPanel({ fromHover = false } = {}) {
    await ensureUi();
    if (!prefs?.floatingWidgetEnabled) return;
    clearTimeout(hoverCloseTimer);
    persistentPanel = true;
    hoverOpened = Boolean(fromHover);
    dockButton.style.display = 'flex';
    await setPersistentCollapsed(false, !fromHover);
    actionButton.style.display = 'none';
    panel.style.display = 'block';
    const rect = persistentRect();
    positionNearRect(panel, rect, false);
    const source = shadow.querySelector('.lf-source');
    if (!source.value && selectedText) source.value = selectedText.slice(0, MAX_SELECTION);
    updateSourceCount();
    if (!source.value.trim()) {
      setPanelResult('—', true);
      setPanelStatus(t('readyInput', '輸入文字後會自動翻譯'), 'ready');
    }
  }

  async function minimizePersistentPanel({ persist = true } = {}) {
    if (!prefs?.floatingWidgetEnabled) { hideAll(); return; }
    clearTimeout(hoverCloseTimer);
    hoverOpened = false;
    persistentPanel = true;
    if (panel) panel.style.display = 'none';
    if (actionButton) actionButton.style.display = 'none';
    if (dockButton) dockButton.style.display = 'flex';
    await setPersistentCollapsed(true, persist);
  }

  async function syncPersistentWidget() {
    await loadPreferences();
    if (!prefs.floatingWidgetEnabled) {
      if (dockButton) dockButton.style.display = 'none';
      if (persistentPanel && panel) panel.style.display = 'none';
      persistentPanel = false;
      return;
    }
    await ensureUi();
    dockButton.style.display = 'flex';
    const collapsed = prefs.floatingWidgetCollapsed == null ? prefs.floatingWidgetStartCollapsed : prefs.floatingWidgetCollapsed;
    if (collapsed) await minimizePersistentPanel({ persist: false });
    else await openPersistentPanel({ fromHover: false });
  }

  async function showIntegrityBlocked(text, rect, state = null) {
    await ensureUi();
    actionButton.style.display = 'none';
    panel.style.display = 'block';
    if (!pinned) positionNearRect(panel, rect, true);
    const source = shadow.querySelector('.lf-source');
    source.value = String(text || '').slice(0, MAX_SELECTION);
    updateSourceCount();
    setPanelResult(t('statusNoResult', '—'), true);
    const reason = state?.reason ? ` · ${state.reason}` : '';
    setPanelStatus(`${t('selectionIntegrityBlocked', 'RayLingo integrity verification failed.')}${reason}`, 'error');
  }

  function readSelectionPayload(event = null) {
    const target = event?.target instanceof Element ? event.target : document.activeElement;
    if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && /^(?:text|search|url|tel|email|password)$/i.test(target.type || 'text'))) {
      const start = Number(target.selectionStart);
      const end = Number(target.selectionEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const text = String(target.value || '').slice(start, end).trim();
        if (text) {
          const box = target.getBoundingClientRect();
          return { text, rect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }, kind: 'form-control' };
        }
      }
    }
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (!text || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return { text, rect, kind: 'document' };
  }

  function updateSourceCount() {
    if (!shadow) return;
    const source = shadow.querySelector('.lf-source');
    shadow.querySelector('.lf-source-count').textContent = `${source.value.length.toLocaleString()} / ${MAX_SELECTION.toLocaleString()}`;
  }

  function positionNearRect(element, rect, preferBelow = true) {
    const gap = 8;
    const margin = 10;
    const width = Math.min(430, window.innerWidth - margin * 2);
    const guessedHeight = element === panel ? Math.min(500, window.innerHeight - margin * 2) : (prefs?.selectionTriggerSize || 36);
    let left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
    if (element === actionButton) { const size = prefs?.selectionTriggerSize || 36; left = Math.min(Math.max(margin, rect.right + 7), Math.max(margin, window.innerWidth - size - margin)); }
    let top = preferBelow ? rect.bottom + gap : rect.top - guessedHeight - gap;
    if (top + guessedHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - guessedHeight - gap);
    if (top < margin) top = margin;
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  async function showAction(rect) {
    await ensureUi();
    panel.style.display = 'none';
    actionButton.style.display = 'grid';
    positionNearRect(actionButton, rect, true);
  }

  async function showPanel(text, rect, { immediate = false, targetLanguage = null } = {}) {
    await ensureUi();
    persistentPanel = Boolean(prefs?.floatingWidgetEnabled);
    if (dockButton && prefs?.floatingWidgetEnabled) dockButton.style.display = 'flex';
    actionButton.style.display = 'none';
    panel.style.display = 'block';
    if (!pinned) positionNearRect(panel, rect, true);
    const source = shadow.querySelector('.lf-source');
    source.value = String(text || '').slice(0, MAX_SELECTION);
    updateSourceCount();
    if (targetLanguage && RayLingoLanguages.isSupported(targetLanguage)) {
      shadow.querySelector('.lf-target-lang').value = targetLanguage;
      prefs.selectionTargetLanguage = targetLanguage;
    }
    setPanelResult('—', true);
    setPanelStatus(t('selectionWaiting'), 'working');
    schedulePanelTranslation(immediate ? 20 : null);
  }

  function setPanelStatus(text, state = 'ready', progress = '') {
    if (!shadow) return;
    const status = shadow.querySelector('.lf-status');
    status.className = `lf-status ${state === 'ready' ? '' : state}`.trim();
    shadow.querySelector('.lf-status-text').textContent = text;
    shadow.querySelector('.lf-progress').textContent = progress;
  }

  function engineStatus(event) {
    switch (event.type) {
      case 'detecting': setPanelStatus(t('statusDetecting'), 'working'); break;
      case 'preparing': setPanelStatus(t('statusPreparingModel'), 'working'); break;
      case 'download': setPanelStatus(t('statusDownloadingModel'), 'working', `${event.percent}%`); break;
      case 'native': setPanelStatus(t('statusNativeTranslating'), 'working', event.total > 1 ? `${event.index}/${event.total}` : ''); break;
      case 'remote': setPanelStatus(t('statusRemoteTranslating'), 'working'); break;
      case 'ai': setPanelStatus(`${event.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} AI…`, 'working'); break;
      default: break;
    }
  }

  function setPanelResult(text, placeholder = false, animate = false) {
    if (!shadow) return;
    animationSerial += 1;
    const result = shadow.querySelector('.lf-result');
    result.classList.toggle('placeholder', placeholder);
    if (!animate || placeholder || !text || text.length > 1800) {
      result.textContent = text;
      return;
    }
    const token = animationSerial;
    result.textContent = '';
    let index = 0;
    const step = () => {
      if (token !== animationSerial || !result.isConnected) return;
      index = Math.min(text.length, index + Math.max(2, Math.ceil(text.length / 85)));
      result.textContent = text.slice(0, index);
      if (index < text.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function scheduleHistorySave(entry) {
    clearTimeout(historyTimer);
    if (!prefs.historyEnabled) return;
    historyTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'RAYLINGO_SAVE_HISTORY', entry }).catch(() => null);
    }, 900);
  }

  async function translatePanel() {
    if (!shadow || panel?.style.display !== 'block') return;
    const serial = ++translateSerial;
    const sourceText = shadow.querySelector('.lf-source').value.trim();
    const sourceLanguage = shadow.querySelector('.lf-source-lang').value;
    const targetLanguage = shadow.querySelector('.lf-target-lang').value;
    if (!sourceText) {
      setPanelResult('—', true);
      setPanelStatus(t('readyInput'), 'ready');
      return;
    }
    try {
      const translated = await RayLingoTranslator.translate({
        text: sourceText,
        sourceLanguage,
        targetLanguage,
        remoteFallbackEnabled: prefs.remoteFallbackEnabled,
        provider: prefs.translationProvider,
        onStatus: engineStatus
      });
      if (serial !== translateSerial) return;
      lastPanelSourceLanguage = translated.sourceLanguage || sourceLanguage || 'auto';
      setPanelResult(translated.text, false, prefs.typingEffectEnabled);
      setPanelStatus(translated.provider === 'native' ? t('statusNativeDone') : translated.provider === 'same' ? t('statusSameLanguage') : t('statusRemoteDone'), 'ready');
      scheduleHistorySave({
        sourceText,
        resultText: translated.text,
        sourceLanguage: translated.sourceLanguage || sourceLanguage,
        targetLanguage,
        provider: translated.provider,
        createdAt: Date.now()
      });
    } catch (error) {
      if (serial !== translateSerial) return;
      const message = localizedError(error);
      setPanelResult(t('statusNoResult'), true);
      setPanelStatus(message, 'error');
      console.debug('[RayLingo] selection translation failed:', error);
    }
  }

  function schedulePanelTranslation(delay = null) {
    clearTimeout(panelDebounce);
    const resolved = delay ?? (RayLingoTranslator.isNativeAvailable() ? 210 : 580);
    panelDebounce = setTimeout(translatePanel, resolved);
  }

  async function swapPanelLanguages() {
    const sourceSelect = shadow.querySelector('.lf-source-lang');
    const targetSelect = shadow.querySelector('.lf-target-lang');
    let source = sourceSelect.value;
    const target = targetSelect.value;
    if (source === 'auto') source = await RayLingoLanguages.detect(shadow.querySelector('.lf-source').value, target) || 'en';
    sourceSelect.value = target;
    targetSelect.value = source === target ? 'en' : source;
    prefs.selectionSourceLanguage = sourceSelect.value;
    prefs.selectionTargetLanguage = targetSelect.value;
    await chrome.storage.local.set({ selectionSourceLanguage: prefs.selectionSourceLanguage, selectionTargetLanguage: prefs.selectionTargetLanguage });
    schedulePanelTranslation(30);
  }

  function togglePin() {
    pinned = !pinned;
    const button = shadow.querySelector('.lf-pin');
    button.dataset.active = String(pinned);
    button.textContent = pinned ? t('selectionUnpin') : t('selectionPin');
    if (pinned) setPanelStatus(t('selectionPinned'), 'ready');
  }

  async function copyPanelText(text, button) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = t('copied');
      setTimeout(() => { if (button.isConnected) button.textContent = t('selectionCopy'); }, 900);
    } catch { setPanelStatus(t('copyFailed'), 'error'); }
  }

  function copyPanelSource() {
    const source = shadow?.querySelector('.lf-source');
    return copyPanelText(source?.value?.trim() || '', shadow.querySelector('.lf-source-copy'));
  }

  function copyPanelResult() {
    const result = shadow?.querySelector('.lf-result');
    if (!result || result.classList.contains('placeholder')) return;
    return copyPanelText(result.textContent || '', shadow.querySelector('.lf-result-copy'));
  }

  function setSelectionSpeakState(speaking, kind = activeSpeechKind) {
    ttsSpeaking = Boolean(speaking);
    if (!ttsSpeaking && selectionTtsWatchdogTimer) { clearInterval(selectionTtsWatchdogTimer); selectionTtsWatchdogTimer = null; }
    activeSpeechKind = ttsSpeaking ? (kind || activeSpeechKind || 'translation') : null;
    const sourceButton = shadow?.querySelector('.lf-source-speak');
    const resultButton = shadow?.querySelector('.lf-result-speak');
    if (sourceButton) sourceButton.textContent = ttsSpeaking && activeSpeechKind === 'source' ? t('stopSpeak') : t('selectionSpeak');
    if (resultButton) resultButton.textContent = ttsSpeaking && activeSpeechKind === 'translation' ? t('stopSpeak') : t('selectionSpeak');
  }

  function startSelectionTtsWatchdog(sessionId) {
    if (selectionTtsWatchdogTimer) clearInterval(selectionTtsWatchdogTimer);
    const startedAt = Date.now();
    selectionTtsWatchdogTimer = setInterval(async () => {
      if (!ttsSpeaking || activeTtsSessionId !== sessionId) { clearInterval(selectionTtsWatchdogTimer); selectionTtsWatchdogTimer = null; return; }
      const target = shadow?.querySelector('.lf-target-lang')?.value || 'en';
      const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STATUS', payload: { language: target } }).catch(() => null);
      if (!response || Date.now() - startedAt < 700) return;
      if (response.activeTtsOwner === 'selection' && response.activeTtsSessionId === sessionId) return;
      if (response.activeTtsSessionId == null && response.speaking === false) {
        activeTtsSessionId = null;
        setSelectionSpeakState(false);
      }
    }, 500);
  }

  async function stopPanelSpeech() {
    const sessionId = activeTtsSessionId;
    activeTtsSessionId = null;
    await chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STOP', owner: 'selection', sessionId }).catch(() => null);
    setSelectionSpeakState(false);
  }

  async function resolvePanelSourceLanguage() {
    const selected = shadow.querySelector('.lf-source-lang').value;
    if (selected !== 'auto') return selected;
    if (lastPanelSourceLanguage && lastPanelSourceLanguage !== 'auto') return lastPanelSourceLanguage;
    return await RayLingoLanguages.detect(shadow.querySelector('.lf-source').value, shadow.querySelector('.lf-target-lang').value) || 'en';
  }

  async function speakPanelText(kind = 'translation') {
    const isSource = kind === 'source';
    const source = shadow.querySelector('.lf-source');
    const result = shadow.querySelector('.lf-result');
    const text = isSource ? source.value.trim() : (result.classList.contains('placeholder') ? '' : result.textContent.trim());
    if (!text) return;
    if (ttsSpeaking) {
      if (activeSpeechKind === kind) { await stopPanelSpeech(); return; }
      await stopPanelSpeech();
    }
    const language = isSource ? await resolvePanelSourceLanguage() : shadow.querySelector('.lf-target-lang').value;
    const sessionId = `selection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeTtsSessionId = sessionId;
    activeSpeechKind = kind;
    setSelectionSpeakState(true, kind);
    startSelectionTtsWatchdog(sessionId);
    const response = await chrome.runtime.sendMessage({
      type: 'RAYLINGO_TTS_SPEAK',
      payload: {
        text,
        language,
        owner: 'selection',
        sessionId,
        engine: prefs.ttsEngine,
        voice: prefs.ttsVoice,
        systemVoice: prefs.systemVoice,
        speed: prefs.ttsSpeed
      }
    }).catch(error => ({ ok: false, error: error?.message }));
    if (activeTtsSessionId !== sessionId) return;
    if (!response?.ok) {
      activeTtsSessionId = null;
      setSelectionSpeakState(false);
      setPanelStatus(t('ttsFailed'), 'error');
      return;
    }
    setPanelStatus(response.engine === 'ai-browser' ? t('ttsAiUsing') : (response.fallback ? t('ttsFallbackSystem') : t('ttsSystemUsing')), 'ready');
  }

  function hideAll() {
    clearTimeout(panelDebounce);
    translateSerial += 1;
    animationSerial += 1;
    pinned = false;
    if (ttsSpeaking || activeTtsSessionId) stopPanelSpeech().catch(() => null);
    if (!host) return;
    actionButton.style.display = 'none';
    panel.style.display = 'none';
    if (prefs?.floatingWidgetEnabled && dockButton) dockButton.style.display = 'flex';
    const pin = shadow.querySelector('.lf-pin');
    if (pin) { pin.dataset.active = 'false'; pin.textContent = t('selectionPin'); }
  }

  async function handleSelection(event = null) {
    await loadPreferences();
    if (prefs.selectionMode === 'off') { hideAll(); return; }
    const payload = readSelectionPayload(event);
    if (!payload?.text) {
      if (!pinned) hideAll();
      return;
    }
    const { text, rect } = payload;
    selectedText = text.slice(0, MAX_SELECTION);
    selectedRect = rect;
    if (text.length > MAX_SELECTION) {
      await ensureUi();
      actionButton.style.display = 'none';
      panel.style.display = 'block';
      if (!pinned) positionNearRect(panel, rect, true);
      shadow.querySelector('.lf-source').value = text.slice(0, MAX_SELECTION);
      updateSourceCount();
      setPanelResult('—', true);
      setPanelStatus(t('selectionTooLong'), 'error');
      return;
    }
    if (globalThis.RayLingoIntegrityClient) {
      const integrity = await RayLingoIntegrityClient.status();
      if (!integrity?.ok) { await showIntegrityBlocked(selectedText, rect, integrity); return; }
    }
    if (pinned && panel?.style.display === 'block') return;
    if (prefs.selectionMode === 'button') await showAction(rect);
    else await showPanel(selectedText, rect, { immediate: true });
  }

  document.addEventListener('mouseup', event => {
    if (host && event.composedPath().includes(host)) return;
    setTimeout(() => handleSelection(event), 0);
  }, true);

  document.addEventListener('keyup', event => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) setTimeout(() => handleSelection(event), 0);
  }, true);

  document.addEventListener('mousedown', event => {
    if (!host || event.composedPath().includes(host)) return;
    if (!pinned && !persistentPanel && panel?.style.display === 'block') hideAll();
    else if (actionButton?.style.display === 'grid') hideAll();
  }, true);

  window.addEventListener('scroll', () => {
    if (!pinned && !persistentPanel && (panel?.style.display === 'block' || actionButton?.style.display === 'grid')) hideAll();
  }, { passive: true });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'RAYLINGO_TTS_EVENT') {
      if (message.owner && message.owner !== 'selection') return false;
      const terminal = ['ended', 'stopped', 'cancelled', 'interrupted', 'error'].includes(message.event);
      if (terminal) {
        if (activeTtsSessionId && message.sessionId && message.sessionId !== activeTtsSessionId) return false;
        activeTtsSessionId = null;
        setSelectionSpeakState(false);
        if (message.event === 'error' && panel?.style.display === 'block') setPanelStatus(t('ttsFailed'), 'error');
        return false;
      }
      if (message.sessionId && activeTtsSessionId && message.sessionId !== activeTtsSessionId) return false;
      if (message.event === 'started') {
        setSelectionSpeakState(true, activeSpeechKind);
        if (panel?.style.display === 'block') setPanelStatus(message.engine === 'ai-browser' ? t('ttsAiUsing') : t('ttsSystemUsing'), 'ready');
      } else if (message.event === 'preparing') {
        setSelectionSpeakState(true);
        if (panel?.style.display === 'block') setPanelStatus(t('ttsAiPreparing'), 'ready');
      } else if (message.event === 'progress') {
        setSelectionSpeakState(true);
        if (panel?.style.display === 'block') setPanelStatus(t('ttsAiDownloading').replace('{percent}', String(Math.round(message.percent || 0))), 'ready');
      } else if (message.event === 'fallback') {
        setSelectionSpeakState(true);
        if (panel?.style.display === 'block') setPanelStatus(t('ttsFallbackSystem'), 'ready');
      }
      return false;
    }
    if (message?.type !== 'RAYLINGO_TRANSLATE_SELECTION' || !message.text) return false;
    (async () => {
      if (globalThis.RayLingoIntegrityClient && !(await RayLingoIntegrityClient.status()).ok) { hideAll(); return; }
      await loadPreferences();
      selectedText = String(message.text).slice(0, MAX_SELECTION);
      const rect = selectedRect || { left: Math.max(10, window.innerWidth / 2 - 210), top: 70, right: 0, bottom: 90, width: 0, height: 0 };
      await showPanel(selectedText, rect, { immediate: true, targetLanguage: RayLingoLanguages.normalizeCode(message.targetLanguage) || prefs.selectionTargetLanguage });
    })();
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const relevant = ['uiLocale', 'selectionMode', 'selectionEnabled', 'typingEffectEnabled', 'historyEnabled', 'remoteFallbackEnabled', 'selectionSourceLanguage', 'selectionTargetLanguage', 'ttsEngine', 'ttsVoice', 'systemVoice', 'ttsSpeed', 'selectionTriggerStyle', 'selectionTriggerSize', 'selectionSurfaceTheme', 'selectionAccentColor', 'translationProvider', 'floatingWidgetEnabled', 'floatingWidgetHoverExpand', 'floatingWidgetStartCollapsed', 'floatingWidgetCollapsed'];
    if (!relevant.some(key => key in changes)) return;
    const localeChanged = 'uiLocale' in changes;
    loadPreferences().then(() => {
      if (localeChanged) destroyUi();
      if (prefs.selectionMode === 'off' && !prefs.floatingWidgetEnabled) hideAll();
      if ('floatingWidgetEnabled' in changes || 'floatingWidgetHoverExpand' in changes || 'floatingWidgetStartCollapsed' in changes || 'floatingWidgetCollapsed' in changes) syncPersistentWidget().catch(() => null);
      if (shadow) {
        shadow.querySelector('.lf-privacy')?.classList.toggle('visible', !RayLingoTranslator.isNativeAvailable() && prefs.remoteFallbackEnabled);
        RayLingoSelectionAppearance.applyToElement(shadow.querySelector('.lf-root'), prefs);
        if (actionButton) {
          actionButton.dataset.style = prefs.selectionTriggerStyle;
          if (actionButton.style.display !== 'none' && selectedRect) positionNearRect(actionButton, selectedRect, true);
        }
        if (dockButton && prefs.floatingWidgetEnabled) {
          dockButton.dataset.collapsed = String(prefs.floatingWidgetCollapsed == null ? prefs.floatingWidgetStartCollapsed : prefs.floatingWidgetCollapsed);
        }
      }
    });
  });

  // Persistent widget is opt-in and does not wait for a text selection.
  syncPersistentWidget().catch(error => console.debug('[RayLingo] persistent widget init failed:', error));

})();
