(() => {
  'use strict';
  let pending=null, cached=null;
  async function status(force=false){
    if(force||!pending) pending=chrome.runtime.sendMessage({type:'RAYLINGO_INTEGRITY_STATUS',force}).then(r=>{cached=r||{ok:false,state:'locked',reason:'NO_RESPONSE'};return cached;}).catch(e=>cached={ok:false,state:'locked',reason:e?.message||'NO_RESPONSE'});
    return pending;
  }
  async function assertUnlocked(){ const s=await status(); if(!s?.ok){ const e=new Error('INTEGRITY_LOCKED'); e.code='INTEGRITY_LOCKED'; e.state=s; throw e; } return s; }
  function text(key,fallback){ try{return chrome.i18n.getMessage(key)||fallback;}catch{return fallback;} }
  function applyBadge(s){
    const el=document.getElementById('integrityBadge'); if(!el)return;
    el.dataset.state=s?.ok?'verified':'locked';
    el.textContent=s?.ok?text('securityVerified','Verified'):text('securityLocked','Locked');
    el.title=(s?.keyId||'');
  }
  function mountLock(s){
    if(location.protocol!=='chrome-extension:' || document.getElementById('raylingoIntegrityLock')) return;
    const wrap=document.createElement('div'); wrap.id='raylingoIntegrityLock'; wrap.className='integrity-lock-overlay';
    const failures=(s?.failures||[]).slice(0,5).map(x=>`<li>${String(x.path).replace(/[<>&]/g,'')}</li>`).join('');
    wrap.innerHTML=`<div class="integrity-lock-card"><div class="integrity-lock-icon">⌁</div><h2>${text('securityLockTitle','RayLingo is locked')}</h2><p>${text('securityLockBody','Protected files changed or the signature is invalid.')}</p>${failures?`<ul>${failures}</ul>`:''}<code>${s?.reason||'INTEGRITY_FAILED'}</code></div>`;
    document.documentElement.dataset.integrity='locked'; document.body?.appendChild(wrap);
  }
  async function protectPage(){ const s=await status(); applyBadge(s); if(!s?.ok) mountLock(s); else document.documentElement.dataset.integrity='verified'; return s; }
  if(location.protocol==='chrome-extension:') {
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>protectPage(),{once:true}); else protectPage();
  }
  globalThis.RayLingoIntegrityClient=Object.freeze({status,assertUnlocked,protectPage,get cached(){return cached;}});
})();
