(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    selectionTriggerStyle: 'label',
    selectionTriggerSize: 36,
    selectionSurfaceTheme: 'black',
    selectionAccentColor: '#7658ff'
  });

  function clampSize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.selectionTriggerSize;
    return Math.max(14, Math.min(56, Math.round(n)));
  }

  function normalizeStyle(value) {
    return value === 'dot' ? 'dot' : 'label';
  }

  function normalizeTheme(value) {
    return value === 'black' ? 'black' : 'white';
  }

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
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mix(hex, target, amount) {
    const rgb = hexToRgb(hex);
    const t = target === 'white' ? 255 : 0;
    const p = Math.max(0, Math.min(1, Number(amount) || 0));
    const part = key => Math.round(rgb[key] + (t - rgb[key]) * p).toString(16).padStart(2, '0');
    return `#${part('r')}${part('g')}${part('b')}`;
  }

  function fromStored(stored = {}) {
    return {
      selectionTriggerStyle: normalizeStyle(stored.selectionTriggerStyle),
      selectionTriggerSize: clampSize(stored.selectionTriggerSize),
      selectionSurfaceTheme: normalizeTheme(stored.selectionSurfaceTheme),
      selectionAccentColor: normalizeHex(stored.selectionAccentColor)
    };
  }

  function palette(preferences = {}) {
    const prefs = { ...DEFAULTS, ...fromStored(preferences) };
    const dark = prefs.selectionSurfaceTheme === 'black';
    const rgb = hexToRgb(prefs.selectionAccentColor);
    return {
      ...prefs,
      accent: prefs.selectionAccentColor,
      accentStrong: mix(prefs.selectionAccentColor, dark ? 'white' : 'black', dark ? 0.22 : 0.16),
      accentSoft: `rgba(${rgb.r},${rgb.g},${rgb.b},.13)`,
      accentRing: `rgba(${rgb.r},${rgb.g},${rgb.b},.34)`,
      panel: dark ? '#151519' : '#ffffff',
      surface: dark ? '#151519' : '#ffffff',
      surfaceMuted: dark ? '#1c1d22' : '#f4f4f6',
      text: dark ? '#f8f8fa' : '#151519',
      muted: dark ? '#858893' : '#777a84',
      line: dark ? '#292a31' : '#e2e2e6',
      shadow: dark ? '0 14px 38px rgba(0,0,0,.38)' : '0 12px 30px rgba(26,30,40,.14)'
    };
  }

  function applyToElement(element, preferences = {}) {
    if (!element) return;
    const p = palette(preferences);
    const vars = {
      '--rl-selection-accent': p.accent,
      '--rl-selection-accent-strong': p.accentStrong,
      '--rl-selection-accent-soft': p.accentSoft,
      '--rl-selection-accent-ring': p.accentRing,
      '--rl-selection-panel': p.panel,
      '--rl-selection-surface': p.surface,
      '--rl-selection-surface-muted': p.surfaceMuted,
      '--rl-selection-text': p.text,
      '--rl-selection-muted': p.muted,
      '--rl-selection-line': p.line,
      '--rl-selection-shadow': p.shadow,
      '--rl-selection-trigger-size': `${p.selectionTriggerSize}px`
    };
    for (const [key, value] of Object.entries(vars)) element.style.setProperty(key, value);
    element.dataset.selectionTheme = p.selectionSurfaceTheme;
    element.dataset.selectionTriggerStyle = p.selectionTriggerStyle;
  }

  globalThis.RayLingoSelectionAppearance = Object.freeze({
    DEFAULTS,
    clampSize,
    normalizeStyle,
    normalizeTheme,
    normalizeHex,
    fromStored,
    palette,
    applyToElement
  });
})();
