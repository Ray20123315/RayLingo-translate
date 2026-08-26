(() => {
  'use strict';

  const REQUEST = 'RAYLINGO_PIPER_INSTALL_REQUEST';
  const PROGRESS = 'RAYLINGO_PIPER_INSTALL_PROGRESS';
  const RESULT = 'RAYLINGO_PIPER_INSTALL_RESULT';
  let active = false;

  function send(type, detail = {}) {
    try { parent.postMessage({ type, ...detail }, '*'); } catch {}
  }

  function normalize(text) { return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function findSection(title) {
    const headings = [...document.querySelectorAll('h1,h2,h3')];
    const heading = headings.find(node => normalize(node.textContent).includes(normalize(title)));
    return heading?.parentElement || null;
  }

  function scoreRow(row, spec) {
    const text = normalize(row.innerText || row.textContent);
    const keywords = (spec?.keywords || []).map(normalize);
    if (!keywords.some(k => k && text.includes(k))) return -1;
    let score = 20;
    if (text.includes('[medium]')) score += 35;
    if (text.includes('[high]')) score += 18;
    if (text.includes('[low]')) score += 8;
    if (text.includes('libritts')) score -= 20;
    for (const preferred of spec?.preferred || []) if (text.includes(normalize(preferred))) score += 50;
    return score;
  }

  async function waitForRows(timeoutMs = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const section = findSection('Available to Install');
      const rows = section ? [...section.querySelectorAll('tbody tr')] : [];
      if (rows.length) return rows;
      await new Promise(r => setTimeout(r, 300));
    }
    return [];
  }

  async function install(spec, requestId) {
    if (active) return send(RESULT, { requestId, ok: false, error: 'INSTALL_BUSY' });
    active = true;
    try {
      const rows = await waitForRows();
      const ranked = rows
        .map(row => ({ row, score: scoreRow(row, spec) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => b.score - a.score);
      const selected = ranked[0]?.row;
      if (!selected) throw new Error('PIPER_LANGUAGE_NOT_AVAILABLE');
      const button = [...selected.querySelectorAll('button')].find(btn => /install/i.test(btn.textContent || ''));
      if (!button) throw new Error('PIPER_INSTALL_BUTTON_NOT_FOUND');
      const voiceText = String(selected.innerText || selected.textContent || '').replace(/\s+/g, ' ').trim();
      send(PROGRESS, { requestId, percent: 0, voiceText });
      button.click();

      const started = Date.now();
      let last = -1;
      while (Date.now() - started < 240000) {
        const label = String(button.textContent || '').trim();
        const match = label.match(/(\d{1,3})%/);
        if (match) {
          const percent = Math.max(0, Math.min(100, Number(match[1])));
          if (percent !== last) { last = percent; send(PROGRESS, { requestId, percent, voiceText }); }
          if (percent >= 100) break;
        }
        if (!document.contains(button)) break;
        await new Promise(r => setTimeout(r, 350));
      }
      send(RESULT, { requestId, ok: true, voiceText });
    } catch (error) {
      send(RESULT, { requestId, ok: false, error: error?.message || 'PIPER_INSTALL_FAILED' });
    } finally {
      active = false;
    }
  }

  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (!String(event.origin || '').startsWith('chrome-extension://')) return;
    const message = event.data;
    if (message?.type !== REQUEST || !message.spec || !message.requestId) return;
    install(message.spec, message.requestId);
  });
})();
