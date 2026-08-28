# RayLingo Integrity Security — v0.7.1

RayLingo v0.7.1 protects packaged runtime/UI files with a signed SHA-256 inventory.

- Signature: Ed25519
- Key ID: `ed25519-sha256:c9a44509e7b9249e71c8e5fa8ce41daf47277cb13c4130d8248cc64658b9868a`
- Signing identity: v2, unchanged from v0.5.0/v0.5.1.
- Runtime behavior: a missing/changed protected file, version mismatch, bad hash, or invalid signature places RayLingo in a locked/error state instead of silently trusting modified code.
- The private signing authorization file is intentionally excluded from Git, extension ZIPs, Ray_Chen memory archives and Gmail notifications.

## Protected scope

v0.7.1 extends the signed inventory to the new AI provider, multimodal/media, expanded locale and persistent floating-UI runtime files while retaining documentation and icon coverage. Chromium and the Firefox/Safari package variants are signed from the exact files that are packaged for each platform.

## Remote AI boundary

Gemini/DeepSeek API credentials are user-provided configuration stored locally by the extension. Credentials must never be present in repository files, release metadata, integrity manifests, Ray_Chen memory, test fixtures containing real values, or notification mail.

Remote media processing is opt-in. Local DOCX/PPTX/text extraction does not require uploading the source file. Images/PDF/audio/video/current-tab recordings are sent only after explicit remote-media consent. RayLingo does not bypass DRM or access controls.

## Signed update metadata

`updates/latest.json` is Ed25519-signed with original user-authorized identity. The update checker validates signature, Key ID, canonical repository identity, version syntax and release-asset URL before offering a download. It never silently replaces the installed extension.

## Limitation

An unpacked extension remains writable by a user/process with local filesystem access, including the verifier itself. Browser-level anti-tamper ultimately requires a signed CRX/store package, Mozilla-signed XPI, or Apple-signed Safari Web Extension.

## Signing identity recovery

RayLingo v0.7.1 restores the original user-authorized Ed25519 identity used by v0.4.8. The interim v0.5.x identity is retained only in historical release artifacts and is not trusted for new signing. Because v0.5.x update checkers expect that interim identity, upgrading from v0.5.x to v0.7.1 requires one manual installation; subsequent releases remain on the restored original identity.
