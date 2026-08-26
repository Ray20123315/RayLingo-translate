(() => {
  'use strict';
  const PUBLIC_KEY_B64 = 'aX2fqaYF7j0JcRbVDUkkqpYicLimgnhN90znvhO0RUE=';
  const KEY_ID = 'ed25519-sha256:c9a44509e7b9249e71c8e5fa8ce41daf47277cb13c4130d8248cc64658b9868a';
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
  async function verifyDetached(signed, signature, keyId = KEY_ID){
    try {
      if (keyId !== KEY_ID || !signed || typeof signature !== 'string') return false;
      const key=await crypto.subtle.importKey('raw',fromB64(PUBLIC_KEY_B64),{name:'Ed25519'},false,['verify']);
      return Boolean(await crypto.subtle.verify({name:'Ed25519'},key,fromB64(signature),encoder.encode(canonicalize(signed))));
    } catch { return false; }
  }
  async function verifyNow(){
    const failures=[];
    try {
      const res=await fetch(chrome.runtime.getURL('integrity-manifest.json'),{cache:'no-store'});
      if(!res.ok) throw new Error('INTEGRITY_MANIFEST_MISSING');
      const manifest=await res.json();
      if(manifest.schema!==1 || manifest.algorithm!=='Ed25519') throw new Error('INTEGRITY_MANIFEST_SCHEMA');
      if(manifest.keyId!==KEY_ID) throw new Error('INTEGRITY_KEY_MISMATCH');
      if(manifest.signed?.version!==chrome.runtime.getManifest().version) throw new Error('INTEGRITY_VERSION_MISMATCH');
      const sigOk=await verifyDetached(manifest.signed,manifest.signature,manifest.keyId);
      if(!sigOk) throw new Error('INTEGRITY_SIGNATURE_INVALID');
      for(const item of manifest.signed.files||[]){
        try{
          const r=await fetch(chrome.runtime.getURL(item.path),{cache:'no-store'});
          if(!r.ok){ failures.push({path:item.path,reason:'missing'}); continue; }
          const bytes=await r.arrayBuffer();
          if(bytes.byteLength!==item.size){ failures.push({path:item.path,reason:'size'}); continue; }
          const digest=await hashBytes(bytes);
          if(digest!==item.sha256) failures.push({path:item.path,reason:'sha256'});
        }catch(e){ failures.push({path:item.path,reason:'read'}); }
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
  globalThis.RayLingoIntegrity=Object.freeze({ensureVerified,state,verifyDetached,keyId:KEY_ID});
})();
