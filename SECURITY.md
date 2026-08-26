# RayLingo Integrity Security

RayLingo v0.4.8 protects packaged files with a signed SHA-256 inventory.

- Signature: Ed25519
- Key ID: `ed25519-sha256:c9a44509e7b9249e71c8e5fa8ce41daf47277cb13c4130d8248cc64658b9868a`
- Runtime behavior: any missing/changed protected file or invalid signature places RayLingo in **locked** state.
- The private signing key is intentionally not included in this repository/package. It exists only in the user's standalone `RayLingo_AI_CHANGE_AUTHORIZATION.md`.

## Scope and limitation

This protects against accidental edits and unauthorized re-signing. An unpacked Chromium extension is still user-editable, including the verifier itself; browser-level anti-tamper requires a signed CRX / Chrome Web Store package. Added files that are never referenced do not matter; adding executable references requires changing an already protected manifest/HTML/JS file and therefore triggers the lock.


## Signed update metadata

`updates/latest.json` is also Ed25519-signed with the same public identity. RayLingo checks repository identity and signature before trusting a reported version or package hash. The updater is advisory only: it can open a signed package URL but cannot rewrite installed extension code.

## Cross-browser boundary

Chromium package integrity is runtime-verified in its MV3 worker. Firefox/Safari builds use the same protected source and independently generated integrity manifest, but store-level installation authenticity still depends on Mozilla/Apple signing.
