(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    selectionTriggerStyle: 'label',
    selectionTriggerSize: 36,
    selectionSurfaceTheme: 'black',
    selectionAccentColor: '#7c5cff'
  });

  function clampSize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.selectionTriggerSize;
    return Math.max(14, Math.min(56, Math.round(n)));
  }
  function normalizeStyle(value) { return value === 'dot' ? 'dot' : 'label'; }
  function normalizeTheme(value) { return value === 'black' ? 'black' : 'white'; }
  function normalizeHex(value) {
    const text = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      const s = text.slice(1).toLowerCase();
      return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
    }
    return DEFAULTS.selectionAccentColor;
  }
  function hexToRgb(hex) {
    const n = parseInt(normalizeHex(hex).slice(1), 16);
    return { r:(n >> 16) & 255, g:(n >> 8) & 255, b:n & 255 };
  }
  function mix(hex, target, amount) {
    const rgb = hexToRgb(hex); const t = target === 'white' ? 255 : 0;
    const p = Math.max(0, Math.min(1, Number(amount) || 0));
    const part = key => Math.round(rgb[key] + (t - rgb[key]) * p).toString(16).padStart(2, '0');
    return `#${part('r')}${part('g')}${part('b')}`;
  }
  function fromStored(stored = {}) {
    return {
      selectionTriggerStyle:normalizeStyle(stored.selectionTriggerStyle),
      selectionTriggerSize:clampSize(stored.selectionTriggerSize),
      selectionSurfaceTheme:normalizeTheme(stored.selectionSurfaceTheme),
      selectionAccentColor:normalizeHex(stored.selectionAccentColor)
    };
  }
  function palette(preferences = {}) {
    const prefs = { ...DEFAULTS, ...fromStored(preferences) };
    const dark = prefs.selectionSurfaceTheme === 'black';
    const rgb = hexToRgb(prefs.selectionAccentColor);
    return {
      ...prefs,
      accent:prefs.selectionAccentColor,
      accentStrong:mix(prefs.selectionAccentColor, dark ? 'white' : 'black', dark ? .28 : .18),
      accentSoft:`rgba(${rgb.r},${rgb.g},${rgb.b},${dark ? '.22' : '.12'})`,
      accentRing:`rgba(${rgb.r},${rgb.g},${rgb.b},${dark ? '.48' : '.34'})`,
      panel:dark ? '#111217' : '#ffffff',
      surface:dark ? '#121319' : '#ffffff',
      surfaceMuted:dark ? '#0b0c10' : '#f4f4f6',
      text:dark ? '#f5f6fa' : '#151519',
      muted:dark ? '#858995' : '#70737d',
      line:dark ? '#292a31' : '#e2e2e6',
      shadow:dark ? '0 22px 70px rgba(0,0,0,.46)' : '0 14px 36px rgba(26,30,40,.14)'
    };
  }
  function applyToElement(element, preferences = {}) {
    if (!element) return;
    const p = palette(preferences);
    const vars = {
      '--rl-selection-accent':p.accent,
      '--rl-selection-accent-strong':p.accentStrong,
      '--rl-selection-accent-soft':p.accentSoft,
      '--rl-selection-accent-ring':p.accentRing,
      '--rl-selection-panel':p.panel,
      '--rl-selection-surface':p.surface,
      '--rl-selection-surface-muted':p.surfaceMuted,
      '--rl-selection-text':p.text,
      '--rl-selection-muted':p.muted,
      '--rl-selection-line':p.line,
      '--rl-selection-shadow':p.shadow,
      '--rl-selection-trigger-size':`${p.selectionTriggerSize}px`
    };
    for (const [key, value] of Object.entries(vars)) element.style.setProperty(key, value);
    element.dataset.selectionTheme = p.selectionSurfaceTheme;
    element.dataset.selectionTriggerStyle = p.selectionTriggerStyle;
  }

  function installExtensionTheme() {
    if (typeof document === 'undefined' || !/-extension:$/.test(location.protocol)) return;
    if (document.getElementById('raylingoSemanticAccentTheme')) return;
    const style = document.createElement('style');
    style.id = 'raylingoSemanticAccentTheme';
    style.textContent = `
      html[data-ui-theme="black"],body[data-ui-theme="black"],body[data-full-workspace="true"][data-ui-theme="black"]{color-scheme:dark}
      body[data-ui-theme="black"]{background:#0b0c10!important}
      body[data-ui-theme="black"] .app,body[data-ui-theme="black"] .workspace-layout{background:transparent}
      body[data-ui-theme="black"] .section,body[data-ui-theme="black"] .card,body[data-ui-theme="black"] .feature-card{box-shadow:inset 0 1px rgba(255,255,255,.025)}
      body[data-ui-theme="black"] .translator-card,body[data-ui-theme="black"] .translator-hero{background:radial-gradient(circle at 7% -8%,color-mix(in srgb,var(--accent) 19%,transparent),transparent 43%),var(--surface)!important}
      .workspace-sidebar{background:color-mix(in srgb,var(--side) 96%,#000)!important}
      .nav-item.active{color:var(--text)!important;background:linear-gradient(90deg,var(--accent-soft),color-mix(in srgb,var(--accent) 4%,transparent))!important;border:1px solid var(--accent-border)!important;box-shadow:inset 3px 0 0 var(--accent),inset 0 0 0 1px rgba(255,255,255,.025),0 10px 30px color-mix(in srgb,var(--accent) 9%,transparent)!important}
      .nav-item.active span{color:var(--accent2)!important}
      .quick-pairs button.active,.primary-outline-btn,.safe-badge,.platform-badge{background:var(--accent-soft-2)!important;border-color:var(--accent-border)!important;color:var(--accent2)!important}
      .quick-pairs button:hover,.secondary-btn:hover,.action-button:hover,.text-button:hover{background:var(--accent-soft-2)!important;border-color:var(--accent-border)!important;color:var(--text)!important}
      .accent-swatch.selected{border-color:var(--accent-border)!important;box-shadow:0 0 0 3px var(--focus)!important;background:var(--accent-soft-2)!important}
      .selection-preview-panel{background:linear-gradient(160deg,color-mix(in srgb,var(--rl-selection-panel) 94%,var(--rl-selection-accent) 6%),var(--rl-selection-panel))!important}
      .selection-preview-trigger:not([data-style="dot"]){background:var(--rl-selection-accent-soft)!important;color:var(--rl-selection-accent-strong)!important;border-color:var(--rl-selection-accent-ring)!important}
      input[type="range"]::-webkit-slider-runnable-track{background:linear-gradient(90deg,var(--accent),var(--accent2))!important}
      input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:none!important;box-shadow:0 0 0 3px var(--focus)!important}
      .workspace-output,.translated-text{user-select:text!important;-webkit-user-select:text!important;cursor:text}
    `;
    document.head?.append(style);
  }

  installExtensionTheme();
  globalThis.RayLingoSelectionAppearance = Object.freeze({DEFAULTS,clampSize,normalizeStyle,normalizeTheme,normalizeHex,fromStored,palette,applyToElement});
})();
