(() => {
  'use strict';

  const METADATA_URL = 'https://raw.githubusercontent.com/Ray20123315/RayLingo-translate/main/updates/latest.json';
  const EXPECTED_REPOSITORY = 'Ray20123315/RayLingo-translate';
  const PUBLIC_KEY_B64 = 'BSvI+aEQja2zdnXo3OIxReAHOAzxwx85aTotVeKEppQ=';
  const KEY_ID = 'ed25519-sha256:7d9fa0219c46ac10b516adc04f2234ded87f4f9ed7423e671190cfa6d62096ed';
  const encoder = new TextEncoder();

  function normalizeVersion(value) {
    const parts = String(value || '').trim().split('.').map(v => Number.parseInt(v, 10));
    if (!parts.length || parts.some(v => !Number.isInteger(v) || v < 0)) return null;
    return parts;
  }
  function compareVersions(a, b) {
    const av = normalizeVersion(a); const bv = normalizeVersion(b);
    if (!av || !bv) return 0;
    const length = Math.max(av.length, bv.length);
    for (let i = 0; i < length; i += 1) {
      const x = av[i] || 0; const y = bv[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  function canonicalize(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonicalize(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function fromB64(s){ const b=atob(s); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return u; }
  async function verifyEnvelope(envelope) {
    if (envelope?.keyId !== KEY_ID) throw new Error('UPDATE_KEY_ID_MISMATCH');
    if (!globalThis.crypto?.subtle) throw new Error('UPDATE_WEBCRYPTO_UNAVAILABLE');
    try {
      const key = await crypto.subtle.importKey('raw', fromB64(PUBLIC_KEY_B64), { name:'Ed25519' }, false, ['verify']);
      const ok = Boolean(await crypto.subtle.verify({ name:'Ed25519' }, key, fromB64(envelope.signature), encoder.encode(canonicalize(envelope.signed))));
      if (!ok) throw new Error('UPDATE_SIGNATURE_INVALID');
      return true;
    } catch (error) {
      if (error?.message === 'UPDATE_SIGNATURE_INVALID') throw error;
      if (error?.name === 'NotSupportedError' || /Ed25519|algorithm/i.test(String(error?.message || ''))) throw new Error('UPDATE_ED25519_UNSUPPORTED');
      throw new Error('UPDATE_VERIFY_FAILED');
    }
  }

  async function check() {
    const integrity = await globalThis.RayLingoIntegrityClient?.status?.();
    if (!integrity?.ok) throw new Error('INTEGRITY_LOCKED');
    const response = await fetch(METADATA_URL, { cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer' });
    if (!response.ok) throw new Error(`UPDATE_HTTP_${response.status}`);
    const envelope = await response.json();
    if (envelope?.schema !== 1 || envelope?.algorithm !== 'Ed25519') throw new Error('UPDATE_SCHEMA_INVALID');
    if (!envelope?.signed || envelope.signed.repository !== EXPECTED_REPOSITORY) throw new Error('UPDATE_REPOSITORY_MISMATCH');
    await verifyEnvelope(envelope);

    const currentVersion = globalThis.chrome.runtime.getManifest().version;
    const latestVersion = String(envelope.signed.version || '');
    if (!normalizeVersion(latestVersion)) throw new Error('UPDATE_VERSION_INVALID');
    const packageKey = globalThis.RayLingoPlatform?.packageKey || 'chromium';
    const pkg = envelope.signed.packages?.[packageKey] || envelope.signed.packages?.chromium || null;
    if (!pkg?.url || !/^https:\/\/github\.com\/Ray20123315\/RayLingo-translate\/releases\/download\//.test(pkg.url)) throw new Error('UPDATE_PACKAGE_URL_INVALID');
    const comparison = compareVersions(latestVersion, currentVersion);
    return Object.freeze({
      ok:true,
      currentVersion,
      latestVersion,
      newer:comparison > 0,
      comparison,
      packageKey,
      package:pkg,
      publishedAt:envelope.signed.publishedAt || null,
      notesUrl:envelope.signed.notesUrl || `https://github.com/${EXPECTED_REPOSITORY}/releases/latest`,
      repository:EXPECTED_REPOSITORY,
      signatureVerified:true,
      keyId:envelope.keyId
    });
  }

  async function openPackage(result) {
    const url = result?.package?.url || result?.notesUrl || `https://github.com/${EXPECTED_REPOSITORY}/releases/latest`;
    if (!/^https:\/\//i.test(url)) throw new Error('UPDATE_URL_INVALID');
    if (globalThis.chrome?.tabs?.create) return globalThis.chrome.tabs.create({ url });
    globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    return null;
  }

  globalThis.RayLingoUpdates = Object.freeze({ METADATA_URL, compareVersions, check, openPackage, keyId:KEY_ID });
})();
