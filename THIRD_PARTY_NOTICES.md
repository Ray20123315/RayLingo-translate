# Third-party notices

## Piper browser TTS integration

RayLingo interoperates with the public Piper browser service at `https://piper.ttstool.com/` using its documented/open-source `postMessage` host protocol and automatic voice installation UI. Reference implementation: `ken107/piper-browser-extension` (MIT License).

Piper voice models originate from the Rhasspy/Piper voice repository. Individual model licenses may vary; the extension chooses a model available through the Piper service for the requested language.

No third-party JavaScript is packaged as RayLingo extension code. The Piper service runs inside an isolated remote iframe; RayLingo communicates with it through `postMessage`.
