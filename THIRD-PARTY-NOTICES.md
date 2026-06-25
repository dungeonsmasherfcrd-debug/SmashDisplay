# Third-Party Notices

SmashDisplay's own source — `index.html`, `styles.css`, `app.js`, and the
launcher scripts — is licensed under the MIT License (see [LICENSE](LICENSE)).

This repository also **bundles a copy of the official Windows embeddable build
of Python** in the `python/` folder, so the app runs with nothing to install.
That folder is **not** covered by SmashDisplay's MIT license; it is
redistributed under its original licenses:

- **Python** — Python Software Foundation License Agreement.
  Full text is included at [`python/LICENSE.txt`](python/LICENSE.txt).
  Project: https://www.python.org/
- **OpenSSL** (`python/libcrypto-3.dll`, `python/libssl-3.dll`) —
  Apache License 2.0. https://www.openssl.org/source/license.html
- **libffi** (`python/libffi-8.dll`) — MIT License.
  https://github.com/libffi/libffi

## Relationship to CRG Scoreboard

SmashDisplay is an independent, **read-only** companion to the CRG Scoreboard.
It connects to CRG's WebSocket API but contains no CRG code and is not
affiliated with or endorsed by the CRG project.

CRG Scoreboard: https://github.com/rollerderby/scoreboard
