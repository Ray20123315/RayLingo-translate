(() => {
  'use strict';
  const PUBLIC_KEY_B64 = 'BSvI+aEQja2zdnXo3OIxReAHOAzxwx85aTotVeKEppQ=';
  const KEY_ID = 'ed25519-sha256:7d9fa0219c46ac10b516adc04f2234ded87f4f9ed7423e671190cfa6d62096ed';
  let cachedPromise = null;
  let cachedState = null;
  const encoder = new TextEncoder();

  function canonicalize(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonicalize(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function fromB64(s){ const b=atob(s); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u; }
  function hex(buf){ return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  async function hashBytes(bytes){ return hex(await crypto.subtle.digest('SHA-256', bytes)); }

  async function verifyDetachedDetailed(signed, signature, keyId = KEY_ID){
    if (keyId !== KEY_ID) return { ok:false, reason:'KEY_ID_MISMATCH' };
    if (!signed || typeof signature !== 'string') return { ok:false, reason:'SIGNATURE_MISSING' };
    if (!globalThis.crypto?.subtle) return { ok:false, reason:'WEBCRYPTO_UNAVAILABLE' };
    try {
      const key=await crypto.subtle.importKey('raw',fromB64(PUBLIC_KEY_B64),{name:'Ed25519'},false,['verify']);
      const ok=Boolean(await crypto.subtle.verify({name:'Ed25519'},key,fromB64(signature),encoder.encode(canonicalize(signed))));
      return { ok, reason: ok ? null : 'SIGNATURE_INVALID' };
    } catch (error) {
      const unsupported = error?.name === 'NotSupportedError' || /Ed25519|algorithm/i.test(String(error?.message || ''));
      return { ok:false, reason: unsupported ? 'ED25519_UNSUPPORTED' : 'VERIFY_ERROR', detail:error?.name || null };
    }
  }
  async function verifyDetached(signed, signature, keyId = KEY_ID){ return (await verifyDetachedDetailed(signed, signature, keyId)).ok; }

  async function verifyNow(){
    const failures=[];
    try {
      const res=await fetch(chrome.runtime.getURL('integrity-manifest.json'),{cache:'no-store'});
      if(!res.ok) throw new Error('INTEGRITY_MANIFEST_MISSING');
      const manifest=await res.json();
      if(manifest.schema!==1 || manifest.algorithm!=='Ed25519') throw new Error('INTEGRITY_MANIFEST_SCHEMA');
      if(manifest.keyId!==KEY_ID) throw new Error('INTEGRITY_KEY_MISMATCH');
      if(manifest.signed?.version!==chrome.runtime.getManifest().version) throw new Error('INTEGRITY_VERSION_MISMATCH');
      const sig=await verifyDetachedDetailed(manifest.signed,manifest.signature,manifest.keyId);
      if(!sig.ok) throw new Error('INTEGRITY_'+sig.reason);
      for(const item of manifest.signed.files||[]){
        try{
          const r=await fetch(chrome.runtime.getURL(item.path),{cache:'no-store'});
          if(!r.ok){ failures.push({path:item.path,reason:'missing'}); continue; }
          const bytes=await r.arrayBuffer();
          if(bytes.byteLength!==item.size){ failures.push({path:item.path,reason:'size'}); continue; }
          const digest=await hashBytes(bytes);
          if(digest!==item.sha256) failures.push({path:item.path,reason:'sha256'});
        }catch{ failures.push({path:item.path,reason:'read'}); }
      }
      if(failures.length) throw new Error('INTEGRITY_FILE_MISMATCH');
      cachedState={ok:true,state:'verified',keyId:KEY_ID,version:manifest.signed.version,checkedAt:new Date().toISOString(),failures:[]};
    } catch (error) {
      cachedState={ok:false,state:'locked',keyId:KEY_ID,version:chrome.runtime.getManifest().version,checkedAt:new Date().toISOString(),reason:error?.message||'INTEGRITY_FAILED',failures};
    }
    return cachedState;
  }
  function ensureVerified(force=false){ if(force||!cachedPromise) cachedPromise=verifyNow(); return cachedPromise; }
  function state(){ return cachedState; }
  globalThis.RayLingoIntegrity=Object.freeze({ensureVerified,state,verifyDetached,verifyDetachedDetailed,keyId:KEY_ID});
})();
