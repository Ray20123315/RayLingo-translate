(() => {
  'use strict';
  const buttons = [...document.querySelectorAll('[data-workspace-page]')];
  const pages = [...document.querySelectorAll('.workspace-page[data-page]')];
  const title = document.getElementById('workspacePageTitle');
  const description = document.getElementById('workspacePageDescription');
  const descriptions = Object.freeze({
    translate:['workspaceTranslateDescription','即時翻譯、原文／譯文朗讀與複製。'],
    language:['workspaceLanguageDescription','管理介面語言與翻譯呈現方式。'],
    tts:['workspaceTtsDescription','管理多語言系統 TTS、Browser AI 聲音與語速。'],
    selection:['workspaceSelectionDescription','調整反白翻譯行為、觸發器與大小。'],
    appearance:['workspaceAppearanceDescription','所有背景與強調色只在完整工作台設定。'],
    history:['workspaceHistoryDescription','管理只儲存在本機的翻譯歷史。'],
    engine:['workspaceEngineDescription','查看目前瀏覽器的翻譯能力與遠端備援。'],
    security:['workspaceSecurityDescription','驗證 RayLingo Build 完整性與防偽狀態。'],
    media:['workspaceMediaDescription','管理常駐懸浮翻譯器、多模態文件與影片翻譯。']
  });
  function t(key,fallback){ try{return globalThis.RayLingoI18n?.t?.(key,fallback)||fallback;}catch{return fallback;} }
  function syncRuntimeVersion() {
    const version = globalThis.chrome?.runtime?.getManifest?.().version || '—';
    const badge = document.getElementById('appVersion');
    if (badge) badge.textContent = `v${version}`;
    const updateMeta = document.getElementById('updateVersionMeta');
    if (updateMeta && /^current\s/i.test(updateMeta.textContent || '')) updateMeta.textContent = `current ${version}`;
    for (const article of document.querySelectorAll('.diagnostic-grid article')) {
      if (article.querySelector('small')?.textContent?.trim() === 'Version') {
        const strong = article.querySelector('strong'); if (strong) strong.textContent = version;
      }
    }
  }
  function activate(name,{replaceHash=false}={}) {
    if (!pages.some(page => page.dataset.page === name)) name='translate';
    for (const page of pages) page.classList.toggle('active', page.dataset.page === name);
    for (const button of buttons) {
      const active=button.dataset.workspacePage === name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-current',active?'page':'false');
      if (active && title) title.textContent=t(button.dataset.titleKey,button.querySelector('b')?.textContent||'RayLingo');
    }
    const desc=descriptions[name]; if(description&&desc) description.textContent=t(desc[0],desc[1]);
    const hash='#'+name; if(location.hash!==hash) history[replaceHash?'replaceState':'pushState'](null,'',hash);
  }
  syncRuntimeVersion();
  for(const button of buttons) button.addEventListener('click',()=>activate(button.dataset.workspacePage));
  addEventListener('hashchange',()=>activate(location.hash.slice(1)||'translate',{replaceHash:true}));
  addEventListener('raylingo-i18n-applied',()=>{ syncRuntimeVersion(); activate(location.hash.slice(1)||'translate',{replaceHash:true}); });
  setTimeout(()=>activate(location.hash.slice(1)||'translate',{replaceHash:true}),0);
})();
