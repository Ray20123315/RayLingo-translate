(() => {
  'use strict';

  const METADATA_URL = 'https://raw.githubusercontent.com/Ray20123315/RayLingo-translate/main/updates/latest.json';
  const EXPECTED_REPOSITORY = 'Ray20123315/RayLingo-translate';

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

  async function check() {
    const integrity = await globalThis.RayLingoIntegrityClient?.status?.();
    if (!integrity?.ok) throw new Error('INTEGRITY_LOCKED');
    const response = await fetch(METADATA_URL, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`UPDATE_HTTP_${response.status}`);
    const envelope = await response.json();
    if (envelope?.schema !== 1 || envelope?.algorithm !== 'Ed25519') throw new Error('UPDATE_SCHEMA_INVALID');
    if (!envelope?.signed || envelope.signed.repository !== EXPECTED_REPOSITORY) throw new Error('UPDATE_REPOSITORY_MISMATCH');
    const verified = await globalThis.RayLingoIntegrity?.verifyDetached?.(envelope.signed, envelope.signature, envelope.keyId);
    if (!verified) throw new Error('UPDATE_SIGNATURE_INVALID');

    const currentVersion = globalThis.chrome.runtime.getManifest().version;
    const latestVersion = String(envelope.signed.version || '');
    if (!normalizeVersion(latestVersion)) throw new Error('UPDATE_VERSION_INVALID');
    const packageKey = globalThis.RayLingoPlatform?.packageKey || 'chromium';
    const pkg = envelope.signed.packages?.[packageKey] || envelope.signed.packages?.chromium || null;
    return Object.freeze({
      ok: true,
      currentVersion,
      latestVersion,
      newer: compareVersions(latestVersion, currentVersion) > 0,
      comparison: compareVersions(latestVersion, currentVersion),
      packageKey,
      package: pkg,
      publishedAt: envelope.signed.publishedAt || null,
      notesUrl: envelope.signed.notesUrl || `https://github.com/${EXPECTED_REPOSITORY}`,
      repository: EXPECTED_REPOSITORY,
      signatureVerified: true
    });
  }

  async function openPackage(result) {
    const url = result?.package?.url || result?.notesUrl || `https://github.com/${EXPECTED_REPOSITORY}`;
    if (!/^https:\/\//i.test(url)) throw new Error('UPDATE_URL_INVALID');
    if (globalThis.chrome?.tabs?.create) return globalThis.chrome.tabs.create({ url });
    globalThis.open?.(url, '_blank', 'noopener,noreferrer');
    return null;
  }

  globalThis.RayLingoUpdates = Object.freeze({ METADATA_URL, compareVersions, check, openPackage });
})();
