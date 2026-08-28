(() => {
  'use strict';

  const PAGE_MODE = document.body?.dataset?.pageMode === 'app' ? 'app' : 'popup';
  const TTS_OWNER = PAGE_MODE;

  const QUICK_PAIRS = [
    ['en', 'zh-Hant'], ['zh-Hant', 'en'], ['en', 'ja'], ['ja', 'zh-Hant'], ['en', 'ko'], ['zh', 'zh-Hant']
  ];

  const elements = {
    apiBadge: document.getElementById('apiBadge'),
    openAppButton: document.getElementById('openAppButton'),
    sourceLanguage: document.getElementById('sourceLanguage'),
    targetLanguage: document.getElementById('targetLanguage'),
    swapButton: document.getElementById('swapButton'),
    quickPairs: document.getElementById('quickPairs'),
    sourceText: document.getElementById('sourceText'),
    translatedText: document.getElementById('translatedText'),
    detectedLabel: document.getElementById('detectedLabel'),
    statusLine: document.querySelector('.status-line'),
    statusText: document.getElementById('statusText'),
    progressText: document.getElementById('progressText'),
    charCount: document.getElementById('charCount'),
    sourceCopyButton: document.getElementById('sourceCopyButton'),
    sourceSpeakButton: document.getElementById('sourceSpeakButton'),
    sourceSpeakButtonLabel: document.getElementById('sourceSpeakButtonLabel'),
    copyButton: document.getElementById('copyButton'),
    speakButton: document.getElementById('speakButton'),
    speakButtonLabel: document.getElementById('speakButtonLabel'),
    clearButton: document.getElementById('clearButton'),
    pasteButton: document.getElementById('pasteButton'),
    uiLocale: document.getElementById('uiLocale'),
    selectionMode: document.getElementById('selectionMode'),
    selectionSourceLanguage: document.getElementById('selectionSourceLanguage'),
    selectionTargetLanguage: document.getElementById('selectionTargetLanguage'),
    selectionTriggerStyle: document.getElementById('selectionTriggerStyle'),
    selectionTriggerSize: document.getElementById('selectionTriggerSize'),
    selectionTriggerSizeValue: document.getElementById('selectionTriggerSizeValue'),
    selectionSurfaceTheme: document.getElementById('selectionSurfaceTheme'),
    selectionAccentColor: document.getElementById('selectionAccentColor'),
    selectionAccentColorValue: document.getElementById('selectionAccentColorValue'),
    selectionAppearancePreview: document.getElementById('selectionAppearancePreview'),
    accentPalette: document.getElementById('accentPalette'),
    selectionPreviewTrigger: document.getElementById('selectionPreviewTrigger'),
    selectionPreviewPanel: document.getElementById('selectionPreviewPanel'),
    ttsEngine: document.getElementById('ttsEngine'),
    ttsVoice: document.getElementById('ttsVoice'),
    ttsAiLanguages: document.getElementById('ttsAiLanguages'),
    ttsAiCompatibilityNote: document.getElementById('ttsAiCompatibilityNote'),
    systemVoice: document.getElementById('systemVoice'),
    ttsSpeed: document.getElementById('ttsSpeed'),
    ttsSpeedValue: document.getElementById('ttsSpeedValue'),
    ttsStatus: document.getElementById('ttsStatus'),
    ttsStatusDot: document.getElementById('ttsStatusDot'),
    ttsTestButton: document.getElementById('ttsTestButton'),
    appVersion: document.getElementById('appVersion'),
    typingEffectToggle: document.getElementById('typingEffectToggle'),
    historyToggle: document.getElementById('historyToggle'),
    remoteFallbackToggle: document.getElementById('remoteFallbackToggle'),
    remoteFallbackHelp: document.getElementById('remoteFallbackHelp'),
    providerNote: document.getElementById('providerNote'),
    historyList: document.getElementById('historyList'),
    clearHistoryButton: document.getElementById('clearHistoryButton'),
    updateCheckButton: document.getElementById('updateCheckButton'),
    updateDownloadButton: document.getElementById('updateDownloadButton'),
    updateStatus: document.getElementById('updateStatus'),
    updateVersionMeta: document.getElementById('updateVersionMeta'),
    updatePackageMeta: document.getElementById('updatePackageMeta'),
    updateSignatureBadge: document.getElementById('updateSignatureBadge'),
    platformBadge: document.getElementById('platformBadge'),
    platformName: document.getElementById('platformName'),
    platformCapabilities: document.getElementById('platformCapabilities'),
    translationProvider: document.getElementById('translationProvider'),
    geminiModel: document.getElementById('geminiModel'),
    geminiApiKey: document.getElementById('geminiApiKey'),
    deepseekModel: document.getElementById('deepseekModel'),
    deepseekApiKey: document.getElementById('deepseekApiKey'),
    geminiTestButton: document.getElementById('geminiTestButton'),
    deepseekTestButton: document.getElementById('deepseekTestButton'),
    aiProviderStatus: document.getElementById('aiProviderStatus'),
    floatingWidgetEnabled: document.getElementById('floatingWidgetEnabled'),
    floatingWidgetHoverExpand: document.getElementById('floatingWidgetHoverExpand'),
    floatingWidgetStartCollapsed: document.getElementById('floatingWidgetStartCollapsed'),
    multimodalFile: document.getElementById('multimodalFile'),
    multimodalProcessButton: document.getElementById('multimodalProcessButton'),
    multimodalStatus: document.getElementById('multimodalStatus'),
    videoSubtitleEnabled: document.getElementById('videoSubtitleEnabled'),
    videoSubtitleTargetLanguage: document.getElementById('videoSubtitleTargetLanguage'),
    videoTranscriptButton: document.getElementById('videoTranscriptButton'),
    videoStatus: document.getElementById('videoStatus'),
    remoteMediaConsent: document.getElementById('remoteMediaConsent')
  };

  let preferences = null;
  let debounceTimer = null;
  let requestSerial = 0;
  let outputAnimation = 0;
  let historyTimer = null;
  let lastResult = '';
  let lastResultLanguage = 'zh-Hant';
  let lastSourceLanguage = 'auto';
  let isBrave = false;
  let ttsSpeaking = false;
  let activeSpeechKind = null;
  let activeTtsSessionId = null;
  let ttsWatchdogTimer = null;
  let tabCaptureActive = false;
  const lifecyclePort = chrome.runtime.connect({ name: `raylingo-${TTS_OWNER}` });
  if (elements.appVersion) elements.appVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  let systemVoiceCatalog = [];
  let aiVoiceCatalog = [];

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

  function setStatus(message, state = 'ready', progress = '') {
    elements.statusText.textContent = message;
    elements.statusLine.dataset.state = state;
    elements.progressText.textContent = progress;
  }

  function setApiBadge(state, text) {
    elements.apiBadge.dataset.state = state;
    elements.apiBadge.textContent = text;
  }

  function updateCharCount() {
    const hasSource = Boolean(elements.sourceText.value.trim());
    elements.charCount.textContent = `${elements.sourceText.value.length.toLocaleString()} / 12,000`;
    elements.sourceCopyButton.disabled = !hasSource;
    elements.sourceSpeakButton.disabled = !hasSource;
  }

  function cancelOutputAnimation() {
    outputAnimation += 1;
  }

  function setOutput(text, { placeholder = false, animate = false } = {}) {
    cancelOutputAnimation();
    lastResult = placeholder ? '' : text;
    elements.translatedText.classList.toggle('placeholder', placeholder);
    elements.copyButton.disabled = placeholder || !text;
    elements.speakButton.disabled = placeholder || !text;
    if (!animate || placeholder || !text || text.length > 1800) {
      elements.translatedText.textContent = text;
      return;
    }
    const token = outputAnimation;
    elements.translatedText.textContent = '';
    let index = 0;
    const step = () => {
      if (token !== outputAnimation) return;
      const increment = Math.max(2, Math.ceil(text.length / 90));
      index = Math.min(text.length, index + increment);
      elements.translatedText.textContent = text.slice(0, index);
      if (index < text.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function engineStatus(event) {
    switch (event.type) {
      case 'detecting': setStatus(t('statusDetecting'), 'working'); break;
      case 'preparing': setStatus(t('statusPreparingModel'), 'working', event.availability === 'downloadable' ? '↓' : '…'); break;
      case 'download': setStatus(t('statusDownloadingModel'), 'working', `${event.percent}%`); break;
      case 'native': setStatus(t('statusNativeTranslating'), 'working', event.total > 1 ? `${event.index}/${event.total}` : ''); break;
      case 'remote': setStatus(t('statusRemoteTranslating'), 'working', ''); break;
      case 'ai': setStatus(`${event.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'} AI…`, 'working', 'AI'); break;
      default: break;
    }
  }

  async function detectBrave() {
    try { return Boolean(navigator.brave && await navigator.brave.isBrave()); }
    catch { return false; }
  }

  function normalizeStoredLanguage(value, fallback) {
    if (value === 'auto') return 'auto';
    return RayLingoLanguages.normalizeCode(value) || fallback;
  }

  async function restorePreferences() {
    const stored = await chrome.storage.local.get({
      sourceLanguage: 'auto',
      targetLanguage: 'zh-Hant',
      selectionMode: null,
      selectionEnabled: true,
      selectionSourceLanguage: 'auto',
      selectionTargetLanguage: null,
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
      aiProvider: 'gemini',
      geminiModel: 'gemini-3.7-flash',
      geminiApiKey: '',
      deepseekModel: 'deepseek-v4-flash',
      deepseekApiKey: '',
      floatingWidgetEnabled: false,
      floatingWidgetHoverExpand: true,
      floatingWidgetStartCollapsed: true,
      videoSubtitleEnabled: false,
      videoSubtitleTargetLanguage: null,
      remoteMediaConsent: false
    });
    const selectionMode = stored.selectionMode || (stored.selectionEnabled === false ? 'off' : 'auto');
    preferences = {
      sourceLanguage: normalizeStoredLanguage(stored.sourceLanguage, 'auto'),
      targetLanguage: normalizeStoredLanguage(stored.targetLanguage, 'zh-Hant'),
      selectionMode,
      selectionSourceLanguage: normalizeStoredLanguage(stored.selectionSourceLanguage, 'auto'),
      selectionTargetLanguage: normalizeStoredLanguage(stored.selectionTargetLanguage || stored.targetLanguage, 'zh-Hant'),
      typingEffectEnabled: stored.typingEffectEnabled !== false,
      historyEnabled: stored.historyEnabled !== false,
      remoteFallbackEnabled: stored.remoteFallbackEnabled !== false,
      uiLocale: stored.uiLocale || 'auto',
      ttsEngine: RayLingoTTS.normalizeEngine(stored.ttsEngine),
      ttsVoice: typeof stored.ttsVoice === 'string' ? stored.ttsVoice : 'auto',
      systemVoice: typeof stored.systemVoice === 'string' ? stored.systemVoice : 'auto',
      ttsSpeed: RayLingoTTS.clampSpeed(stored.ttsSpeed),
      translationProvider: globalThis.RayLingoAI?.normalizeTranslationProvider?.(stored.translationProvider) || 'auto',
      aiProvider: globalThis.RayLingoAI?.normalizeProvider?.(stored.aiProvider) || 'gemini',
      geminiModel: String(stored.geminiModel || 'gemini-3.7-flash'),
      geminiApiKey: String(stored.geminiApiKey || ''),
      deepseekModel: String(stored.deepseekModel || 'deepseek-v4-flash'),
      deepseekApiKey: String(stored.deepseekApiKey || ''),
      floatingWidgetEnabled: stored.floatingWidgetEnabled === true,
      floatingWidgetHoverExpand: stored.floatingWidgetHoverExpand !== false,
      floatingWidgetStartCollapsed: stored.floatingWidgetStartCollapsed !== false,
      videoSubtitleEnabled: stored.videoSubtitleEnabled === true,
      videoSubtitleTargetLanguage: normalizeStoredLanguage(stored.videoSubtitleTargetLanguage || stored.selectionTargetLanguage || stored.targetLanguage, 'zh-Hant'),
      remoteMediaConsent: stored.remoteMediaConsent === true,
      ...RayLingoSelectionAppearance.fromStored(stored)
    };
  }

  async function savePreferences() {
    preferences.sourceLanguage = elements.sourceLanguage.value;
    preferences.targetLanguage = elements.targetLanguage.value;
    if (elements.selectionMode) preferences.selectionMode = elements.selectionMode.value;
    if (elements.selectionSourceLanguage) preferences.selectionSourceLanguage = elements.selectionSourceLanguage.value;
    if (elements.selectionTargetLanguage) preferences.selectionTargetLanguage = elements.selectionTargetLanguage.value;
    if (elements.selectionTriggerStyle) preferences.selectionTriggerStyle = RayLingoSelectionAppearance.normalizeStyle(elements.selectionTriggerStyle.value);
    if (elements.selectionTriggerSize) preferences.selectionTriggerSize = RayLingoSelectionAppearance.clampSize(elements.selectionTriggerSize.value);
    if (elements.selectionSurfaceTheme) preferences.selectionSurfaceTheme = RayLingoSelectionAppearance.normalizeTheme(elements.selectionSurfaceTheme.value);
    if (elements.selectionAccentColor) preferences.selectionAccentColor = RayLingoSelectionAppearance.normalizeHex(elements.selectionAccentColor.value);
    if (elements.typingEffectToggle) preferences.typingEffectEnabled = elements.typingEffectToggle.checked;
    if (elements.historyToggle) preferences.historyEnabled = elements.historyToggle.checked;
    if (elements.remoteFallbackToggle) preferences.remoteFallbackEnabled = elements.remoteFallbackToggle.checked;
    if (elements.uiLocale) preferences.uiLocale = elements.uiLocale.value;
    if (elements.ttsEngine) preferences.ttsEngine = RayLingoTTS.normalizeEngine(elements.ttsEngine.value);
    if (elements.ttsVoice) preferences.ttsVoice = elements.ttsVoice.value || 'auto';
    if (elements.systemVoice) preferences.systemVoice = elements.systemVoice.value || 'auto';
    if (elements.ttsSpeed) preferences.ttsSpeed = RayLingoTTS.clampSpeed(elements.ttsSpeed.value);
    if (elements.translationProvider) preferences.translationProvider = RayLingoAI.normalizeTranslationProvider(elements.translationProvider.value);
    if (elements.geminiModel) preferences.geminiModel = elements.geminiModel.value.trim() || 'gemini-3.7-flash';
    if (elements.geminiApiKey) preferences.geminiApiKey = elements.geminiApiKey.value.trim();
    if (elements.deepseekModel) preferences.deepseekModel = elements.deepseekModel.value.trim() || 'deepseek-v4-flash';
    if (elements.deepseekApiKey) preferences.deepseekApiKey = elements.deepseekApiKey.value.trim();
    if (elements.floatingWidgetEnabled) preferences.floatingWidgetEnabled = elements.floatingWidgetEnabled.checked;
    if (elements.floatingWidgetHoverExpand) preferences.floatingWidgetHoverExpand = elements.floatingWidgetHoverExpand.checked;
    if (elements.floatingWidgetStartCollapsed) preferences.floatingWidgetStartCollapsed = elements.floatingWidgetStartCollapsed.checked;
    if (elements.videoSubtitleEnabled) preferences.videoSubtitleEnabled = elements.videoSubtitleEnabled.checked;
    if (elements.videoSubtitleTargetLanguage) preferences.videoSubtitleTargetLanguage = elements.videoSubtitleTargetLanguage.value;
    if (elements.remoteMediaConsent) preferences.remoteMediaConsent = elements.remoteMediaConsent.checked;
    applyInterfaceTheme();
    await chrome.storage.local.set({ ...preferences, selectionEnabled: preferences.selectionMode !== 'off' });
  }

  function populateLanguageControls() {
    const source = preferences.sourceLanguage;
    const target = preferences.targetLanguage;
    RayLingoI18n.populateLanguageSelect(elements.sourceLanguage, { includeAuto: true, selected: source });
    RayLingoI18n.populateLanguageSelect(elements.targetLanguage, { selected: target });
    if (!elements.sourceLanguage.value) elements.sourceLanguage.value = 'auto';
    if (!elements.targetLanguage.value) elements.targetLanguage.value = 'zh-Hant';
  }

  function renderQuickPairs() {
    elements.quickPairs.replaceChildren();
    for (const [source, target] of QUICK_PAIRS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.source = source;
      button.dataset.target = target;
      button.textContent = `${RayLingoI18n.languageLabel(source)} → ${RayLingoI18n.languageLabel(target)}`;
      button.classList.toggle('active', elements.sourceLanguage.value === source && elements.targetLanguage.value === target);
      button.addEventListener('click', async () => {
        elements.sourceLanguage.value = source;
        elements.targetLanguage.value = target;
        populateAiVoiceControl();
        populateSystemVoiceControl();
        await savePreferences();
        renderQuickPairs();
        refreshTtsStatus(false).catch(() => null);
        scheduleTranslation(30);
      });
      elements.quickPairs.append(button);
    }
  }

  function applyInterfaceTheme() {
    if (!preferences) return;
    const appearance = currentSelectionAppearance();
    const palette = RayLingoSelectionAppearance.palette(appearance);
    const root = document.documentElement;
    const dark = appearance.selectionSurfaceTheme === 'black';
    root.dataset.uiTheme = dark ? 'black' : 'white';
    const vars = dark ? {
      '--bg':'#0f0f0f','--side':'#111216','--surface':'#151519','--surface2':'#1c1d22','--surface-strong':'#151519','--surface-muted':'#1c1d22','--border':'#292a31','--line':'#292a31','--text':'#f8f8fa','--text2':'#c6c7ce','--muted':'#858893','--accent':palette.accent,'--accent2':palette.accentStrong,'--accent-strong':palette.accentStrong,'--accent-soft':palette.accentSoft,'--focus':palette.accentRing,'--shadow':'0 9px 24px rgba(0,0,0,.18)'
    } : {
      '--bg':'#ffffff','--side':'#ffffff','--surface':'#ffffff','--surface2':'#f4f4f6','--surface-strong':'#ffffff','--surface-muted':'#f4f4f6','--border':'#e2e2e6','--line':'#e2e2e6','--text':'#151519','--text2':'#36373e','--muted':'#777a84','--accent':palette.accent,'--accent2':palette.accentStrong,'--accent-strong':palette.accentStrong,'--accent-soft':palette.accentSoft,'--focus':palette.accentRing,'--shadow':'0 9px 24px rgba(26,30,40,.08)'
    };
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    root.style.setProperty('--accent-soft-2', `color-mix(in srgb, ${palette.accent} 7%, transparent)`);
    root.style.setProperty('--accent-border', `color-mix(in srgb, ${palette.accent} 42%, transparent)`);
    root.style.setProperty('--accent-shadow', `color-mix(in srgb, ${palette.accent} 28%, transparent)`);
    document.body.dataset.uiTheme = dark ? 'black' : 'white';
  }

  function syncAccentPalette() {
    if (!elements.accentPalette) return;
    const selected = RayLingoSelectionAppearance.normalizeHex(elements.selectionAccentColor?.value ?? preferences?.selectionAccentColor);
    for (const button of elements.accentPalette.querySelectorAll('[data-accent]')) {
      button.classList.toggle('selected', RayLingoSelectionAppearance.normalizeHex(button.dataset.accent) === selected);
    }
  }

  function currentSelectionAppearance() {
    return RayLingoSelectionAppearance.fromStored({
      selectionTriggerStyle: elements.selectionTriggerStyle?.value ?? preferences?.selectionTriggerStyle,
      selectionTriggerSize: elements.selectionTriggerSize?.value ?? preferences?.selectionTriggerSize,
      selectionSurfaceTheme: elements.selectionSurfaceTheme?.value ?? preferences?.selectionSurfaceTheme,
      selectionAccentColor: elements.selectionAccentColor?.value ?? preferences?.selectionAccentColor
    });
  }

  function updateSelectionAppearancePreview() {
    if (!elements.selectionAppearancePreview) return;
    const appearance = currentSelectionAppearance();
    RayLingoSelectionAppearance.applyToElement(elements.selectionAppearancePreview, appearance);
    if (elements.selectionPreviewTrigger) elements.selectionPreviewTrigger.dataset.style = appearance.selectionTriggerStyle;
    if (elements.selectionTriggerSizeValue) elements.selectionTriggerSizeValue.textContent = `${appearance.selectionTriggerSize}px`;
    if (elements.selectionAccentColorValue) elements.selectionAccentColorValue.textContent = appearance.selectionAccentColor;
    applyInterfaceTheme();
    syncAccentPalette();
  }

  function renderPreferenceControls() {
    if (elements.uiLocale) RayLingoI18n.populateUiLocaleSelect(elements.uiLocale, preferences.uiLocale);
    if (elements.selectionMode) elements.selectionMode.value = preferences.selectionMode;
    if (elements.selectionSourceLanguage) RayLingoI18n.populateLanguageSelect(elements.selectionSourceLanguage, { includeAuto: true, selected: preferences.selectionSourceLanguage });
    if (elements.selectionTargetLanguage) RayLingoI18n.populateLanguageSelect(elements.selectionTargetLanguage, { selected: preferences.selectionTargetLanguage });
    if (elements.selectionTriggerStyle) elements.selectionTriggerStyle.value = preferences.selectionTriggerStyle;
    if (elements.selectionTriggerSize) elements.selectionTriggerSize.value = String(preferences.selectionTriggerSize);
    if (elements.selectionSurfaceTheme) elements.selectionSurfaceTheme.value = preferences.selectionSurfaceTheme;
    if (elements.selectionAccentColor) elements.selectionAccentColor.value = preferences.selectionAccentColor;
    if (elements.typingEffectToggle) elements.typingEffectToggle.checked = preferences.typingEffectEnabled;
    if (elements.translationProvider) elements.translationProvider.value = preferences.translationProvider;
    if (elements.geminiModel) elements.geminiModel.value = preferences.geminiModel;
    if (elements.geminiApiKey) elements.geminiApiKey.value = preferences.geminiApiKey;
    if (elements.deepseekModel) elements.deepseekModel.value = preferences.deepseekModel;
    if (elements.deepseekApiKey) elements.deepseekApiKey.value = preferences.deepseekApiKey;
    if (elements.floatingWidgetEnabled) elements.floatingWidgetEnabled.checked = preferences.floatingWidgetEnabled;
    if (elements.floatingWidgetHoverExpand) elements.floatingWidgetHoverExpand.checked = preferences.floatingWidgetHoverExpand;
    if (elements.floatingWidgetStartCollapsed) elements.floatingWidgetStartCollapsed.checked = preferences.floatingWidgetStartCollapsed;
    if (elements.videoSubtitleEnabled) elements.videoSubtitleEnabled.checked = preferences.videoSubtitleEnabled;
    if (elements.videoSubtitleTargetLanguage) RayLingoI18n.populateLanguageSelect(elements.videoSubtitleTargetLanguage, { selected: preferences.videoSubtitleTargetLanguage });
    if (elements.remoteMediaConsent) elements.remoteMediaConsent.checked = preferences.remoteMediaConsent;
    if (elements.historyToggle) elements.historyToggle.checked = preferences.historyEnabled;
    if (elements.remoteFallbackToggle) elements.remoteFallbackToggle.checked = preferences.remoteFallbackEnabled;
    if (elements.ttsEngine) elements.ttsEngine.value = preferences.ttsEngine;
    if (elements.ttsSpeed) elements.ttsSpeed.value = String(preferences.ttsSpeed);
    if (elements.ttsSpeedValue) elements.ttsSpeedValue.textContent = `${preferences.ttsSpeed.toFixed(2)}×`;
    updateSelectionAppearancePreview();
    applyInterfaceTheme();
    syncAccentPalette();
    populateAiVoiceControl();
    populateSystemVoiceControl();
  }

  async function refreshProviderUi() {
    isBrave = await detectBrave();
    if (preferences?.translationProvider === 'gemini' || preferences?.translationProvider === 'deepseek') {
      const provider = preferences.translationProvider;
      const status = await RayLingoAI.status(provider).catch(() => null);
      const configured = provider === 'gemini' ? status?.geminiConfigured : status?.deepseekConfigured;
      setApiBadge(configured ? 'ready' : 'error', provider === 'gemini' ? 'Gemini' : 'DeepSeek');
      if (elements.providerNote) elements.providerNote.textContent = configured ? `${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} AI translation` : `${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} API key required`;
      if (!elements.sourceText.value.trim()) setStatus(configured ? 'AI ready' : 'API key required', configured ? 'ready' : 'error');
      return;
    }
    if (RayLingoTranslator.isNativeAvailable()) {
      setApiBadge('ready', t('badgeLocal'));
      if (elements.providerNote) elements.providerNote.textContent = t('providerNative');
      if (elements.remoteFallbackHelp) elements.remoteFallbackHelp.textContent = preferences.remoteFallbackEnabled ? t('remoteHelpEnabled') : t('remoteHelpDisabled');
      if (!elements.sourceText.value.trim()) setStatus(t('readyInput'), 'ready');
      return;
    }
    if (preferences.remoteFallbackEnabled) {
      setApiBadge('ready', isBrave ? t('badgeBrave') : t('badgeRemote'));
      if (elements.providerNote) elements.providerNote.textContent = isBrave ? t('providerBrave') : t('providerRemote');
      if (elements.remoteFallbackHelp) elements.remoteFallbackHelp.textContent = t('remoteHelpEnabled');
      if (!elements.sourceText.value.trim()) setStatus(t('statusRemoteReady'), 'ready');
    } else {
      setApiBadge('error', t('badgeDisabled'));
      if (elements.providerNote) elements.providerNote.textContent = isBrave ? t('providerBrave') : t('providerRemote');
      if (elements.remoteFallbackHelp) elements.remoteFallbackHelp.textContent = t('remoteHelpDisabled');
      setStatus(t('statusRemoteDisabled'), 'error');
    }
  }

  function scheduleHistorySave(entry) {
    clearTimeout(historyTimer);
    if (!preferences.historyEnabled) return;
    historyTimer = setTimeout(async () => {
      await chrome.runtime.sendMessage({ type: 'RAYLINGO_SAVE_HISTORY', entry }).catch(() => null);
      await renderHistory();
    }, 950);
  }

  async function translateCurrentText() {
    const serial = ++requestSerial;
    const text = elements.sourceText.value.trim();
    updateCharCount();
    if (!text) {
      elements.detectedLabel.textContent = t('detectedInput');
      setOutput('—', { placeholder: true });
      setStatus(t('readyInput'), 'ready');
      return;
    }

    try {
      const result = await RayLingoTranslator.translate({
        text,
        sourceLanguage: elements.sourceLanguage.value,
        targetLanguage: elements.targetLanguage.value,
        remoteFallbackEnabled: preferences.remoteFallbackEnabled,
        provider: preferences.translationProvider,
        onStatus: engineStatus
      });
      if (serial !== requestSerial) return;
      const sourceLabel = result.sourceLanguage === 'auto' ? t('lang_auto') : RayLingoI18n.languageLabel(result.sourceLanguage);
      elements.detectedLabel.textContent = elements.sourceLanguage.value === 'auto' ? `${t('autoDetected')}：${sourceLabel}` : sourceLabel;
      lastSourceLanguage = result.sourceLanguage || elements.sourceLanguage.value || 'auto';
      lastResultLanguage = result.targetLanguage;
      setOutput(result.text, { animate: preferences.typingEffectEnabled });
      setStatus(result.provider === 'native' ? t('statusNativeDone') : result.provider === 'same' ? t('statusSameLanguage') : t('statusRemoteDone'), 'ready');
      scheduleHistorySave({
        sourceText: text.slice(0, 12000),
        resultText: result.text.slice(0, 12000),
        sourceLanguage: result.sourceLanguage || elements.sourceLanguage.value,
        targetLanguage: result.targetLanguage,
        provider: result.provider,
        createdAt: Date.now()
      });
    } catch (error) {
      if (serial !== requestSerial) return;
      const message = localizedError(error);
      setOutput(t('statusNoResult'), { placeholder: true });
      setStatus(message, 'error');
      console.debug('[RayLingo] popup translation failed:', error);
    }
  }

  function scheduleTranslation(delay = null) {
    clearTimeout(debounceTimer);
    const resolved = delay ?? (RayLingoTranslator.isNativeAvailable() ? 220 : 620);
    debounceTimer = setTimeout(translateCurrentText, resolved);
  }

  async function renderHistory() {
    if (!elements.historyList) return;
    if (!preferences.historyEnabled) {
      elements.historyList.innerHTML = `<div class="history-empty">${t('emptyHistory')}</div>`;
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_GET_HISTORY' }).catch(() => ({ entries: [] }));
    const entries = response?.entries || [];
    elements.historyList.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = t('emptyHistory');
      elements.historyList.append(empty);
      return;
    }
    for (const entry of entries.slice(0, 8)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      const source = RayLingoI18n.languageLabel(entry.sourceLanguage || 'auto');
      const target = RayLingoI18n.languageLabel(entry.targetLanguage || 'zh-Hant');
      const time = new Date(entry.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const head = document.createElement('div'); head.className = 'history-item-head'; head.innerHTML = `<span>${source} → ${target}</span><span>${time}</span>`;
      const src = document.createElement('div'); src.className = 'history-item-text'; src.textContent = entry.sourceText || '';
      const res = document.createElement('div'); res.className = 'history-item-text history-item-result'; res.textContent = entry.resultText || '';
      button.append(head, src, res);
      button.addEventListener('click', async () => {
        elements.sourceText.value = (entry.sourceText || '').slice(0, 12000);
        elements.sourceLanguage.value = entry.sourceLanguage && entry.sourceLanguage !== 'auto' && RayLingoLanguages.isSupported(entry.sourceLanguage) ? entry.sourceLanguage : 'auto';
        elements.targetLanguage.value = RayLingoLanguages.normalizeCode(entry.targetLanguage) || 'zh-Hant';
        lastResultLanguage = elements.targetLanguage.value;
        setOutput(entry.resultText || '', { animate: false });
        updateCharCount();
        populateAiVoiceControl();
        populateSystemVoiceControl();
        await savePreferences();
        renderQuickPairs();
        refreshTtsStatus(false).catch(() => null);
        setStatus(t('historyRestored'), 'ready');
      });
      elements.historyList.append(button);
    }
  }

  function populateAiVoiceControl() {
    if (!elements.ttsVoice) return;
    const language = elements.targetLanguage?.value || preferences?.targetLanguage || 'zh-Hant';
    const catalog = RayLingoTTS.piperCatalog();
    const installed = Array.isArray(aiVoiceCatalog) ? aiVoiceCatalog : [];
    elements.ttsVoice.replaceChildren();

    const ordered = catalog.slice().sort((a, b) => Number(b.code === language) - Number(a.code === language) || a.label.localeCompare(b.label));
    let selectedValue = 'auto';
    for (const item of ordered) {
      const group = document.createElement('optgroup');
      const current = item.code === language;
      const compatibilitySuffix = item.compatibility === 'mandarin-traditional' ? ` · ${t('ttsAiTraditionalCompatibleShort')}` : '';
      group.label = `${current ? '✓ ' : ''}${RayLingoI18n.languageLabel(item.code)} · ${item.tag}${compatibilitySuffix}`;
      const voices = installed.filter(voice => RayLingoTTS.voiceMatchesLanguage(voice, item.code));
      if (current) {
        const auto = document.createElement('option');
        auto.value = 'auto';
        auto.textContent = voices.length ? t('ttsAiVoiceAuto') : t('ttsAiAutoDownload');
        group.append(auto);
        for (const voice of voices) {
          const option = document.createElement('option');
          option.value = voice.voiceName;
          option.textContent = `${voice.voiceName} · ${voice.lang || item.tag}`;
          group.append(option);
        }
        if (voices.some(v => v.voiceName === preferences?.ttsVoice)) selectedValue = preferences.ttsVoice;
      } else {
        const info = document.createElement('option');
        info.disabled = true;
        info.textContent = voices.length
          ? t('ttsAiInstalledVoices').replace('{count}', String(voices.length))
          : t('ttsAiAutoDownload');
        group.append(info);
        for (const voice of voices.slice(0, 3)) {
          const infoVoice = document.createElement('option');
          infoVoice.disabled = true;
          infoVoice.textContent = `${voice.voiceName} · ${voice.lang || item.tag}`;
          group.append(infoVoice);
        }
      }
      elements.ttsVoice.append(group);
    }

    if (!RayLingoTTS.piperSupported(language)) {
      const group = document.createElement('optgroup');
      group.label = `— ${RayLingoI18n.languageLabel(language)} —`;
      const unsupported = document.createElement('option');
      unsupported.value = 'auto';
      unsupported.textContent = t('ttsAiUnsupportedShort');
      group.append(unsupported);
      elements.ttsVoice.prepend(group);
      selectedValue = 'auto';
    }
    elements.ttsVoice.disabled = false;
    elements.ttsVoice.value = selectedValue;
    if (elements.ttsAiLanguages) {
      const languageNames = catalog.map(item => `${RayLingoI18n.languageLabel(item.code)} (${item.compatibility ? `${item.tag}→${item.voiceTag}` : item.tag})`).join(' · ');
      elements.ttsAiLanguages.textContent = t('ttsAiLanguagesSummary')
        .replace('{count}', String(catalog.length))
        .replace('{languages}', languageNames);
      elements.ttsAiLanguages.title = languageNames;
    }
    if (elements.ttsAiCompatibilityNote) {
      const compat = RayLingoTTS.piperTarget(language)?.compatibility === 'mandarin-traditional';
      elements.ttsAiCompatibilityNote.hidden = !compat;
      elements.ttsAiCompatibilityNote.textContent = compat ? t('ttsAiTraditionalCompatibilityNote') : '';
    }
  }

  function populateSystemVoiceControl() {
    if (!elements.systemVoice) return;
    const language = elements.targetLanguage?.value || preferences?.targetLanguage || 'en';
    const compatible = systemVoiceCatalog.filter(voice => RayLingoTTS.systemVoiceMatchesLanguage(voice, language));
    const untagged = systemVoiceCatalog.filter(voice => RayLingoTTS.systemVoiceMatchTier(voice, language) === 'untagged');
    // Prefer voices with reliable language metadata. If Brave exposes only untagged
    // voices, still show them instead of implying the language is unavailable.
    let voices = compatible.length ? compatible : untagged.length ? untagged : systemVoiceCatalog.slice(0, 24);
    voices = voices.filter(voice => Boolean(voice.name));
    elements.systemVoice.replaceChildren();
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = t('ttsSystemVoiceAuto');
    elements.systemVoice.append(auto);
    for (const voice of voices.slice(0, 40)) {
      const option = document.createElement('option');
      option.value = voice.name;
      const quality = voice.score >= 65 ? ` · ${t('ttsQualityNatural')}` : '';
      const langLabel = voice.lang ? ` (${voice.lang})` : ` (${t('ttsVoiceLanguageUnknown')})`;
      option.textContent = `${voice.name}${langLabel}${quality}`;
      elements.systemVoice.append(option);
    }
    elements.systemVoice.value = voices.some(v => v.name === preferences?.systemVoice) ? preferences.systemVoice : 'auto';
  }

  function setTtsStatus(text, state = 'offline') {
    if (!elements.ttsStatus) return;
    elements.ttsStatus.textContent = text;
    if (elements.ttsStatus.parentElement) elements.ttsStatus.parentElement.dataset.state = state;
  }

  function setTtsSpeaking(speaking, engine = null, kind = activeSpeechKind) {
    ttsSpeaking = Boolean(speaking);
    activeSpeechKind = ttsSpeaking ? (kind || activeSpeechKind || 'translation') : null;
    if (!ttsSpeaking && ttsWatchdogTimer) { clearInterval(ttsWatchdogTimer); ttsWatchdogTimer = null; }
    if (elements.sourceSpeakButtonLabel) elements.sourceSpeakButtonLabel.textContent = ttsSpeaking && activeSpeechKind === 'source' ? t('stopSpeak') : t('speak');
    if (elements.speakButtonLabel) elements.speakButtonLabel.textContent = ttsSpeaking && activeSpeechKind === 'translation' ? t('stopSpeak') : t('speak');
    if (elements.ttsTestButton) elements.ttsTestButton.textContent = ttsSpeaking && activeSpeechKind === 'test' ? t('ttsStop') : t('ttsTest');
    if (ttsSpeaking && engine) setTtsStatus(engine === 'ai-browser' ? t('ttsAiUsing') : t('ttsSystemUsing'), engine === 'ai-browser' ? 'online' : 'offline');
  }

  function startTtsWatchdog(sessionId) {
    if (ttsWatchdogTimer) clearInterval(ttsWatchdogTimer);
    const startedAt = Date.now();
    ttsWatchdogTimer = setInterval(async () => {
      if (!ttsSpeaking || activeTtsSessionId !== sessionId) { clearInterval(ttsWatchdogTimer); ttsWatchdogTimer = null; return; }
      const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STATUS', payload: { language: elements.targetLanguage.value } }).catch(() => null);
      if (!response || Date.now() - startedAt < 700) return;
      if (response.activeTtsOwner === TTS_OWNER && response.activeTtsSessionId === sessionId) return;
      if (response.activeTtsSessionId == null && response.speaking === false) {
        activeTtsSessionId = null;
        setTtsSpeaking(false);
        refreshTtsStatus(false).catch(() => null);
      }
    }, 500);
  }

  async function refreshTtsStatus(force = false) {
    setTtsStatus(t('ttsStatusChecking'), 'offline');
    const response = await chrome.runtime.sendMessage({
      type: 'RAYLINGO_TTS_STATUS',
      payload: { force, language: elements.targetLanguage.value }
    }).catch(error => ({ ok: false, aiOnline: false, systemVoices: [], error: error?.message }));
    systemVoiceCatalog = Array.isArray(response?.systemVoices) ? response.systemVoices : [];
    aiVoiceCatalog = Array.isArray(response?.aiVoices) ? response.aiVoices : [];
    populateSystemVoiceControl();
    populateAiVoiceControl();
    if (response?.nativeTtsAvailable && response?.matchingSystemVoice) setTtsStatus(t('ttsSystemReady'), 'online');
    else if (response?.nativeTtsAvailable) setTtsStatus(t('ttsSystemBrowserAuto'), 'online');
    else if (response?.aiReady) setTtsStatus(t('ttsAiOnline'), 'online');
    else if (response?.ok) setTtsStatus(t('ttsAiWarming'), 'offline');
    else setTtsStatus(t('ttsStatusFailed'), 'error');
    return response;
  }

  function ttsPayload(text, language, sessionId) {
    return {
      text,
      language,
      owner: TTS_OWNER,
      sessionId,
      engine: preferences.ttsEngine,
      voice: elements.ttsVoice?.value || preferences.ttsVoice || 'auto',
      systemVoice: elements.systemVoice?.value || preferences.systemVoice || 'auto',
      speed: RayLingoTTS.clampSpeed(elements.ttsSpeed?.value ?? preferences.ttsSpeed)
    };
  }

  async function stopSpeech() {
    const sessionId = activeTtsSessionId;
    activeTtsSessionId = null;
    try { chrome.tts?.stop?.(); } catch {}
    await chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STOP', owner: TTS_OWNER, sessionId }).catch(() => null);
    setTtsSpeaking(false);
  }

  async function speak(text, language, kind = 'translation') {
    if (!text) { setTtsStatus(t('ttsNoText'), 'error'); return; }
    if (ttsSpeaking) {
      if (activeSpeechKind === kind) { await stopSpeech(); return; }
      await stopSpeech();
    }
    const sessionId = `${TTS_OWNER}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeTtsSessionId = sessionId;
    activeSpeechKind = kind;
    setTtsSpeaking(true, null, kind);
    startTtsWatchdog(sessionId);
    const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_SPEAK', payload: ttsPayload(text, language, sessionId) }).catch(error => ({ ok: false, error: error?.message }));
    if (activeTtsSessionId !== sessionId) return;
    if (!response?.ok) {
      activeTtsSessionId = null;
      setTtsSpeaking(false);
      setTtsStatus(t('ttsFailed'), 'error');
      return;
    }
    if (response.engine) setTtsStatus(response.engine === 'ai-browser' ? t('ttsAiUsing') : t('ttsSystemUsing'), response.engine === 'ai-browser' ? 'online' : 'offline');
    if (response.fallback) setTtsStatus(t('ttsFallbackSystem'), 'offline');
    startTtsWatchdog(sessionId);
  }

  async function resolvedSourceSpeechLanguage() {
    const selected = elements.sourceLanguage.value;
    if (selected !== 'auto') return selected;
    if (lastSourceLanguage && lastSourceLanguage !== 'auto') return lastSourceLanguage;
    return await RayLingoLanguages.detect(elements.sourceText.value, elements.targetLanguage.value) || 'en';
  }

  async function copyText(text, button, resetKey = 'copy') {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const span = button.querySelector('span');
      span.textContent = t('copied');
      setTimeout(() => { if (span.isConnected) span.textContent = t(resetKey); }, 1000);
    } catch { setStatus(t('copyFailed'), 'error'); }
  }

  function renderPlatformStatus() {
    const platform = globalThis.RayLingoPlatform;
    if (!platform) return;
    if (elements.platformBadge) elements.platformBadge.textContent = String(platform.family || 'webext').toUpperCase();
    if (elements.platformName) elements.platformName.textContent = platform.label || platform.family || 'WebExtension';
    if (elements.platformCapabilities) {
      const c = platform.capabilities();
      const parts = [c.extensionTts ? 'Extension TTS' : c.webSpeech ? 'Web Speech TTS' : 'TTS fallback', c.offscreen ? 'Offscreen AI' : 'No offscreen', c.translator ? 'Translator API' : 'Remote translation'];
      elements.platformCapabilities.textContent = parts.join(' · ');
    }
  }

  let lastUpdateResult = null;
  async function checkForUpdates() {
    if (!elements.updateStatus || !globalThis.RayLingoUpdates) return;
    elements.updateCheckButton && (elements.updateCheckButton.disabled = true);
    if (elements.updateDownloadButton) elements.updateDownloadButton.hidden = true;
    elements.updateStatus.textContent = t('updateStatusChecking');
    try {
      const result = await RayLingoUpdates.check();
      lastUpdateResult = result;
      elements.updateStatus.textContent = result.newer ? t('updateStatusAvailable').replace('{version}', result.latestVersion) : t('updateStatusLatest').replace('{version}', result.currentVersion);
      if (elements.updateVersionMeta) elements.updateVersionMeta.textContent = `current ${result.currentVersion} · latest ${result.latestVersion}`;
      if (elements.updatePackageMeta) elements.updatePackageMeta.textContent = result.package?.sha256 ? `${result.packageKey} · sha256 ${result.package.sha256.slice(0,12)}…` : result.packageKey;
      if (elements.updateSignatureBadge) { elements.updateSignatureBadge.textContent = t('updateSigned'); elements.updateSignatureBadge.dataset.state = 'verified'; }
      if (elements.updateDownloadButton) elements.updateDownloadButton.hidden = !result.newer;
    } catch (error) {
      lastUpdateResult = null;
      elements.updateStatus.textContent = `${t('updateStatusFailed')} (${error?.message || 'UPDATE_FAILED'})`;
      if (elements.updateSignatureBadge) { elements.updateSignatureBadge.textContent = 'ERROR'; elements.updateSignatureBadge.dataset.state = 'locked'; }
    } finally {
      elements.updateCheckButton && (elements.updateCheckButton.disabled = false);
    }
  }

  async function changeUiLocale() {
    if (!elements.uiLocale) return;
    preferences.uiLocale = elements.uiLocale.value;
    if (elements.ttsEngine) preferences.ttsEngine = RayLingoTTS.normalizeEngine(elements.ttsEngine.value);
    if (elements.ttsVoice) preferences.ttsVoice = elements.ttsVoice.value || 'auto';
    if (elements.systemVoice) preferences.systemVoice = elements.systemVoice.value || 'auto';
    if (elements.ttsSpeed) preferences.ttsSpeed = RayLingoTTS.clampSpeed(elements.ttsSpeed.value);
    await chrome.storage.local.set({ uiLocale: preferences.uiLocale });
    await RayLingoI18n.init(preferences.uiLocale);
    RayLingoI18n.apply(document);
    document.dispatchEvent(new CustomEvent('raylingo-i18n-applied'));
    const source = elements.sourceLanguage.value;
    const target = elements.targetLanguage.value;
    populateLanguageControls();
    elements.sourceLanguage.value = source;
    elements.targetLanguage.value = target;
    renderPreferenceControls();
    renderQuickPairs();
    await refreshProviderUi();
    if (elements.ttsStatus || elements.ttsVoice || elements.systemVoice) await refreshTtsStatus(false);
    if (elements.historyList) await renderHistory();
  }

  function setInlineFeatureStatus(element, text, state = '') {
    if (!element) return;
    element.textContent = text;
    element.dataset.state = state;
  }

  async function testAiProvider(provider) {
    setInlineFeatureStatus(elements.aiProviderStatus, `${provider}…`);
    try {
      await savePreferences();
      const result = await RayLingoAI.test(provider);
      setInlineFeatureStatus(elements.aiProviderStatus, `${provider}: ${String(result.text || 'OK').slice(0, 80)}`, 'ready');
    } catch (error) {
      setInlineFeatureStatus(elements.aiProviderStatus, `${provider}: ${localizedError(error)}`, 'error');
    }
  }

  async function processMultimodalFile() {
    const file = elements.multimodalFile?.files?.[0];
    if (!file) { setInlineFeatureStatus(elements.multimodalStatus, t('multimodalChooseFile', '請先選擇檔案'), 'error'); return; }
    const provider = preferences.translationProvider === 'deepseek' ? 'deepseek' : 'gemini';
    const mediaNeedsRemote = !['docx','pptx','txt','md','csv','html','htm','xml','srt','vtt','json'].includes((file.name.split('.').pop() || '').toLowerCase());
    if (mediaNeedsRemote && !preferences.remoteMediaConsent) { setInlineFeatureStatus(elements.multimodalStatus, t('remoteMediaConsentRequired','請先允許遠端媒體處理'), 'error'); return; }
    setInlineFeatureStatus(elements.multimodalStatus, `${file.name} · processing…`);
    try {
      const prepared = await RayLingoMultimodal.process(file, { provider, targetLanguage: elements.targetLanguage.value, task: file.type.startsWith('audio/') || file.type.startsWith('video/') ? 'transcribe_translate' : 'extract_translate' });
      if (prepared.kind === 'text') {
        elements.sourceText.value = prepared.text.slice(0, 12000);
        updateCharCount();
        if (preferences.translationProvider === 'auto' || preferences.translationProvider === 'browser') await translateCurrentText();
        else {
          const result = await RayLingoAI.translate({ text: prepared.text, sourceLanguage: 'auto', targetLanguage: elements.targetLanguage.value, provider });
          lastResultLanguage = elements.targetLanguage.value;
          setOutput(result.text, { animate: preferences.typingEffectEnabled });
          setStatus(`${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} AI`, 'ready');
        }
      } else {
        if (prepared.transcript) {
          elements.sourceText.value = prepared.transcript.slice(0, 12000);
          lastSourceLanguage = 'auto';
          updateCharCount();
        }
        lastResultLanguage = elements.targetLanguage.value;
        setOutput(prepared.translation || prepared.text, { animate: preferences.typingEffectEnabled });
        setStatus(prepared.transcript ? 'Gemini · transcript + translation' : 'Gemini multimodal', 'ready');
      }
      setInlineFeatureStatus(elements.multimodalStatus, `${file.name} · done`, 'ready');
    } catch (error) {
      setInlineFeatureStatus(elements.multimodalStatus, localizedError(error), 'error');
      setStatus(localizedError(error), 'error');
    }
  }

  function setTabCaptureUi(active, detail = '') {
    tabCaptureActive = Boolean(active);
    if (elements.videoTranscriptButton) {
      elements.videoTranscriptButton.dataset.capturing = String(tabCaptureActive);
      elements.videoTranscriptButton.textContent = tabCaptureActive ? t('videoTranscriptStop', '停止錄製並翻譯') : t('videoTranscriptStart', '目前影片：AI 取文字並翻譯');
    }
    if (detail && elements.videoStatus) setInlineFeatureStatus(elements.videoStatus, detail, active ? 'working' : 'ready');
  }

  async function refreshTabCaptureStatus() {
    if (!elements.videoTranscriptButton || !chrome.runtime?.sendMessage) return;
    const status = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TAB_TRANSCRIBE_STATUS' }).catch(() => null);
    if (status?.ok && status.state === 'recording') setTabCaptureUi(true, t('videoTranscriptRecording', '正在擷取目前分頁的影片／音訊…'));
    else if (status?.ok && status.state === 'ready-to-process') setTabCaptureUi(true, t('videoTranscriptReady', '錄製已停止；按下按鈕完成上傳與翻譯。'));
    else setTabCaptureUi(false);
  }

  async function runCurrentVideoTranscript() {
    if (!preferences.remoteMediaConsent) { setInlineFeatureStatus(elements.videoStatus, t('remoteMediaConsentRequired','請先允許遠端媒體處理'), 'error'); return; }
    try {
      await savePreferences();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      const isYoutube = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(String(tab.url || ''));

      if (isYoutube && !tabCaptureActive) {
        setInlineFeatureStatus(elements.videoStatus, t('videoYoutubeProcessing', 'Gemini 正在讀取公開 YouTube 影片…'), 'working');
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'RAYLINGO_MEDIA_TRANSCRIBE_CURRENT' });
        if (!response?.ok) { const error = new Error(response?.error || 'Video transcription failed'); error.code = response?.errorCode; throw error; }
        setInlineFeatureStatus(elements.videoStatus, `${response.segments || 0} segments loaded`, 'ready');
        return;
      }

      if (!tabCaptureActive) {
        setInlineFeatureStatus(elements.videoStatus, t('videoTranscriptStarting', '正在啟動目前分頁擷取…'), 'working');
        const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TAB_TRANSCRIBE_START', payload: { tabId: tab.id, targetLanguage: elements.videoSubtitleTargetLanguage?.value || elements.targetLanguage.value } });
        if (!response?.ok) { const error = new Error(response?.error || 'Tab capture failed'); error.code = response?.errorCode; throw error; }
        setTabCaptureUi(true, t('videoTranscriptRecording', '正在擷取目前分頁的影片／音訊；再次按下即可停止並翻譯。'));
        return;
      }

      setInlineFeatureStatus(elements.videoStatus, t('videoTranscriptProcessing', '正在停止錄製、上傳並翻譯…'), 'working');
      const response = await chrome.runtime.sendMessage({ type: 'RAYLINGO_TAB_TRANSCRIBE_STOP', payload: { targetLanguage: elements.videoSubtitleTargetLanguage?.value || elements.targetLanguage.value } });
      if (!response?.ok) { const error = new Error(response?.error || 'Tab transcription failed'); error.code = response?.errorCode; throw error; }
      setTabCaptureUi(false);
      const transcript = String(response.transcript || '').trim();
      const translated = String(response.translation || '').trim();
      if (transcript) {
        elements.sourceText.value = transcript.slice(0, 12000);
        lastSourceLanguage = 'auto';
        updateCharCount();
      }
      if (translated) {
        lastResultLanguage = response.targetLanguage || elements.targetLanguage.value;
        setOutput(translated, { animate: preferences.typingEffectEnabled });
        setStatus('Gemini · transcript + translation', 'ready');
      }
      setInlineFeatureStatus(elements.videoStatus, `${Math.max(1, Math.round((response.durationMs || 0) / 1000))}s · ${(Number(response.size || 0) / 1048576).toFixed(1)} MB · done`, 'ready');
    } catch (error) {
      setTabCaptureUi(false);
      setInlineFeatureStatus(elements.videoStatus, localizedError(error), 'error');
    }
  }

  elements.sourceText.addEventListener('input', () => { updateCharCount(); scheduleTranslation(); });
  elements.sourceLanguage.addEventListener('change', async () => { await savePreferences(); renderQuickPairs(); scheduleTranslation(50); });
  elements.targetLanguage.addEventListener('change', async () => { populateAiVoiceControl(); populateSystemVoiceControl(); await savePreferences(); renderQuickPairs(); refreshTtsStatus(false).catch(() => null); scheduleTranslation(50); });
  elements.swapButton.addEventListener('click', async () => {
    const source = elements.sourceLanguage.value;
    const target = elements.targetLanguage.value;
    if (source === 'auto') {
      const detected = await RayLingoLanguages.detect(elements.sourceText.value, target);
      elements.sourceLanguage.value = target;
      elements.targetLanguage.value = detected && detected !== target ? detected : 'en';
    } else {
      elements.sourceLanguage.value = target;
      elements.targetLanguage.value = source;
    }
    if (lastResult) {
      const original = elements.sourceText.value;
      elements.sourceText.value = lastResult;
      setOutput(original, { animate: false });
    }
    updateCharCount();
    populateAiVoiceControl();
    populateSystemVoiceControl();
    await savePreferences();
    renderQuickPairs();
    refreshTtsStatus(false).catch(() => null);
    scheduleTranslation(40);
  });
  elements.clearButton.addEventListener('click', () => { elements.sourceText.value = ''; updateCharCount(); translateCurrentText(); elements.sourceText.focus(); });
  elements.pasteButton.addEventListener('click', async () => {
    try { elements.sourceText.value = (await navigator.clipboard.readText()).slice(0, 12000); updateCharCount(); scheduleTranslation(20); }
    catch { setStatus(t('clipboardReadFailed'), 'error'); }
  });
  elements.sourceCopyButton.addEventListener('click', () => copyText(elements.sourceText.value.trim(), elements.sourceCopyButton));
  elements.sourceSpeakButton.addEventListener('click', async () => speak(elements.sourceText.value.trim(), await resolvedSourceSpeechLanguage(), 'source'));
  elements.copyButton.addEventListener('click', () => copyText(lastResult, elements.copyButton));
  elements.speakButton.addEventListener('click', () => speak(lastResult, lastResultLanguage, 'translation'));
  elements.ttsTestButton?.addEventListener('click', () => speak(lastResult || RayLingoTTS.sampleText(elements.targetLanguage.value), lastResult ? lastResultLanguage : elements.targetLanguage.value, 'test'));
  elements.ttsEngine?.addEventListener('change', async () => { await savePreferences(); await refreshTtsStatus(true); });
  elements.ttsVoice?.addEventListener('change', savePreferences);
  elements.systemVoice?.addEventListener('change', savePreferences);
  elements.ttsSpeed?.addEventListener('input', () => { if (elements.ttsSpeedValue) elements.ttsSpeedValue.textContent = `${RayLingoTTS.clampSpeed(elements.ttsSpeed.value).toFixed(2)}×`; });
  elements.ttsSpeed?.addEventListener('change', savePreferences);
  elements.uiLocale?.addEventListener('change', changeUiLocale);
  elements.selectionMode?.addEventListener('change', savePreferences);
  elements.selectionSourceLanguage?.addEventListener('change', savePreferences);
  elements.selectionTargetLanguage?.addEventListener('change', savePreferences);
  elements.selectionTriggerStyle?.addEventListener('change', async () => { updateSelectionAppearancePreview(); await savePreferences(); });
  elements.selectionSurfaceTheme?.addEventListener('change', async () => { updateSelectionAppearancePreview(); await savePreferences(); });
  elements.selectionTriggerSize?.addEventListener('input', updateSelectionAppearancePreview);
  elements.selectionTriggerSize?.addEventListener('change', async () => { updateSelectionAppearancePreview(); await savePreferences(); });
  elements.selectionAccentColor?.addEventListener('input', updateSelectionAppearancePreview);
  elements.selectionAccentColor?.addEventListener('change', async () => { updateSelectionAppearancePreview(); await savePreferences(); });
  elements.accentPalette?.addEventListener('click', async event => {
    const button = event.target.closest('[data-accent]');
    if (!button || !elements.selectionAccentColor) return;
    elements.selectionAccentColor.value = RayLingoSelectionAppearance.normalizeHex(button.dataset.accent);
    updateSelectionAppearancePreview();
    await savePreferences();
  });
  elements.typingEffectToggle?.addEventListener('change', savePreferences);
  elements.historyToggle?.addEventListener('change', async () => { await savePreferences(); await renderHistory(); });
  elements.remoteFallbackToggle?.addEventListener('change', async () => { await savePreferences(); await refreshProviderUi(); if (elements.sourceText.value.trim()) scheduleTranslation(30); });
  elements.translationProvider?.addEventListener('change', async () => { await savePreferences(); await refreshProviderUi(); if (elements.sourceText.value.trim()) scheduleTranslation(20); });
  elements.geminiModel?.addEventListener('change', savePreferences);
  elements.geminiApiKey?.addEventListener('change', savePreferences);
  elements.deepseekModel?.addEventListener('change', savePreferences);
  elements.deepseekApiKey?.addEventListener('change', savePreferences);
  elements.geminiTestButton?.addEventListener('click', () => testAiProvider('gemini'));
  elements.deepseekTestButton?.addEventListener('click', () => testAiProvider('deepseek'));
  elements.floatingWidgetEnabled?.addEventListener('change', savePreferences);
  elements.floatingWidgetHoverExpand?.addEventListener('change', savePreferences);
  elements.floatingWidgetStartCollapsed?.addEventListener('change', savePreferences);
  elements.multimodalProcessButton?.addEventListener('click', processMultimodalFile);
  elements.multimodalFile?.addEventListener('change', () => setInlineFeatureStatus(elements.multimodalStatus, elements.multimodalFile.files?.[0]?.name || t('multimodalIdle','尚未選擇檔案')));
  elements.videoSubtitleEnabled?.addEventListener('change', savePreferences);
  elements.videoSubtitleTargetLanguage?.addEventListener('change', savePreferences);
  elements.videoTranscriptButton?.addEventListener('click', runCurrentVideoTranscript);
  elements.remoteMediaConsent?.addEventListener('change', savePreferences);
  elements.openAppButton?.addEventListener('click', async () => {
    const url = chrome.runtime.getURL('workspace.html');
    await chrome.tabs.create({ url }).catch(() => null);
  });

  elements.updateCheckButton?.addEventListener('click', checkForUpdates);
  elements.updateDownloadButton?.addEventListener('click', async () => { if (lastUpdateResult) await RayLingoUpdates.openPackage(lastUpdateResult).catch(() => null); });

  elements.clearHistoryButton?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RAYLINGO_CLEAR_HISTORY' }).catch(() => null);
    await renderHistory();
    setStatus(t('historyCleared'), 'ready');
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'RAYLINGO_TTS_EVENT') return false;
    if (message.owner && message.owner !== TTS_OWNER) return false;
    const terminal = ['ended','stopped','cancelled','interrupted','error'].includes(message.event);
    if (terminal) {
      if (activeTtsSessionId && message.sessionId && message.sessionId !== activeTtsSessionId) return false;
      activeTtsSessionId = null;
      setTtsSpeaking(false);
      if (message.event === 'error') setTtsStatus(t('ttsFailed'), 'error');
      else refreshTtsStatus(false).catch(() => null);
      return false;
    }
    if (message.sessionId && activeTtsSessionId && message.sessionId !== activeTtsSessionId) return false;
    if (message.event === 'started') setTtsSpeaking(true, message.engine, activeSpeechKind);
    else if (message.event === 'preparing') { setTtsSpeaking(true, 'ai-browser'); setTtsStatus(t('ttsAiPreparing'), 'offline'); }
    else if (message.event === 'progress') { setTtsSpeaking(true, 'ai-browser'); setTtsStatus(t('ttsAiDownloading').replace('{percent}', String(Math.round(message.percent || 0))), 'offline'); }
    else if (message.event === 'fallback') { setTtsSpeaking(true, 'system'); setTtsStatus(t('ttsFallbackSystem'), 'offline'); }
    return false;
  });


  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !preferences) return;
    let themed = false;
    if (changes.selectionSurfaceTheme) { preferences.selectionSurfaceTheme = RayLingoSelectionAppearance.normalizeTheme(changes.selectionSurfaceTheme.newValue); themed = true; }
    if (changes.selectionAccentColor) { preferences.selectionAccentColor = RayLingoSelectionAppearance.normalizeHex(changes.selectionAccentColor.newValue); themed = true; }
    if (changes.selectionSourceLanguage) { preferences.selectionSourceLanguage = normalizeStoredLanguage(changes.selectionSourceLanguage.newValue, 'auto'); if (elements.selectionSourceLanguage) elements.selectionSourceLanguage.value = preferences.selectionSourceLanguage; }
    if (changes.selectionTargetLanguage) { preferences.selectionTargetLanguage = normalizeStoredLanguage(changes.selectionTargetLanguage.newValue, 'zh-Hant'); if (elements.selectionTargetLanguage) elements.selectionTargetLanguage.value = preferences.selectionTargetLanguage; }
    if (changes.translationProvider) { preferences.translationProvider = RayLingoAI.normalizeTranslationProvider(changes.translationProvider.newValue); if (elements.translationProvider) elements.translationProvider.value = preferences.translationProvider; }
    if (changes.floatingWidgetEnabled) { preferences.floatingWidgetEnabled = changes.floatingWidgetEnabled.newValue === true; if (elements.floatingWidgetEnabled) elements.floatingWidgetEnabled.checked = preferences.floatingWidgetEnabled; }
    if (changes.floatingWidgetHoverExpand) { preferences.floatingWidgetHoverExpand = changes.floatingWidgetHoverExpand.newValue !== false; if (elements.floatingWidgetHoverExpand) elements.floatingWidgetHoverExpand.checked = preferences.floatingWidgetHoverExpand; }
    if (changes.videoSubtitleEnabled) { preferences.videoSubtitleEnabled = changes.videoSubtitleEnabled.newValue === true; if (elements.videoSubtitleEnabled) elements.videoSubtitleEnabled.checked = preferences.videoSubtitleEnabled; }
    if (themed) {
      if (elements.selectionSurfaceTheme) elements.selectionSurfaceTheme.value = preferences.selectionSurfaceTheme;
      if (elements.selectionAccentColor) elements.selectionAccentColor.value = preferences.selectionAccentColor;
      updateSelectionAppearancePreview();
      applyInterfaceTheme();
    }
  });

  window.addEventListener('pagehide', () => {
    if (!ttsSpeaking && !activeTtsSessionId) return;
    const sessionId = activeTtsSessionId;
    activeTtsSessionId = null;
    try { chrome.tts?.stop?.(); } catch {}
    chrome.runtime.sendMessage({ type: 'RAYLINGO_TTS_STOP', owner: TTS_OWNER, sessionId }).catch(() => null);
    setTtsSpeaking(false);
  }, { once: true });

  (async () => {
    if (globalThis.RayLingoIntegrityClient) { const integrity = await RayLingoIntegrityClient.protectPage(); if (!integrity.ok) return; }
    await restorePreferences();
    await RayLingoI18n.init(preferences.uiLocale);
    RayLingoI18n.apply(document);
    document.dispatchEvent(new CustomEvent('raylingo-i18n-applied'));
    populateLanguageControls();
    renderPreferenceControls();
    renderQuickPairs();
    renderPlatformStatus();
    updateCharCount();
    setOutput('—', { placeholder: true });
    await refreshProviderUi();
    if (elements.ttsStatus || elements.ttsVoice || elements.systemVoice) await refreshTtsStatus(false);
    if (elements.historyList) await renderHistory();
    await refreshTabCaptureStatus().catch(() => null);
    elements.sourceText.focus();
  })().catch(error => {
    console.error('[RayLingo] popup init failed:', error);
    setStatus(error?.message || 'Initialization failed', 'error');
  });
})();
