# RayLingo Integrity Security — v0.5.1

RayLingo v0.5.1 protects packaged files with a signed SHA-256 inventory.

- Signature: Ed25519
- Key ID: `ed25519-sha256:7d9fa0219c46ac10b516adc04f2234ded87f4f9ed7423e671190cfa6d62096ed`
- Runtime behavior: any missing/changed protected file or invalid signature places RayLingo in **locked** state.
- The private signing key is intentionally not included in this repository/package. It is delivered separately to the user as `RayLingo_AI_CHANGE_AUTHORIZATION_v2.md`.

## v0.5.0 trust rollover

The v0.4.8 private signing key is unavailable in the current work session. v0.5.0 therefore establishes signing identity v2. The v0.4.8 updater cannot securely bootstrap this rollover because its UI-context verifier was not loaded; installation of v0.5.0 is a one-time manual trust transition. Future v0.5.x metadata and integrity manifests use the v2 public identity above.

## v0.5.1 protected-scope hardening

v0.5.1 restores the v0.4.8 integrity coverage semantics: Chromium signs 36 packaged files and Firefox/Safari sign 33, including documentation, UI locale message files and icons in addition to executable/UI files. v0.5.0 packages were correctly signed and release-verified, but their signed inventory covered only executable/UI files.

## Scope and limitation

This protects against accidental edits and unauthorized re-signing. An unpacked Chromium extension is still user-editable, including the verifier itself; browser-level anti-tamper requires a signed CRX / Chrome Web Store package.

## Signed update metadata

`updates/latest.json` is Ed25519-signed with signing identity v2. The update checker verifies the detached signature directly in its own extension-page execution context and reports distinct failures for unsupported WebCrypto/Ed25519, key mismatch, repository mismatch, and invalid signature. It only accepts release asset URLs under the canonical GitHub repository.

## Secret handling

The private authorization file must never be committed to Git, included in an extension ZIP, Ray_Chen memory/archive, or Gmail notification.
