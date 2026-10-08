# Security policy

© Jean Pierre Kolb — MIT License

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub's private vulnerability reporting:
<https://github.com/JPKCom/jpkcom-desktop/security/advisories/new>. If that is not possible for you,
use the contact details on the author's website <https://www.jpkc.com/> and ask for a private channel
first — do not send the details in a first message.

Please include:

- the affected version (`package.json`, or "About this desktop" in the running desktop) and browser;
- what an attacker can do, and under which preconditions (a configuration, a crafted page or file,
  a malicious online service, …);
- steps to reproduce, ideally with a minimal `site/config.js` / `site/apps.js` or a
  `tools/browser-check.mjs` scenario;
- whether the problem needs a deployment that deviates from the shipped server configurations.

The aim is a first answer within a week. Fixes are released as a patch version and noted in
[`CHANGELOG.md`](CHANGELOG.md); you are credited there unless you prefer otherwise. Please give us a
reasonable time to release a fix before you publish details.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | yes |
| < 1.0 | no (never released) |

Only the latest release of the latest minor version receives security fixes.

## Security model

JPKCom Desktop is a set of static files. It has no server-side code and no build step; everything runs
in the visitor's browser under the deploying site's origin. Its protections are designed so that the
**Content Security Policy is the outer wall** and the code never relies on it alone. The binding rules
are in [`docs/ARCHITECTURE.md` §5](docs/ARCHITECTURE.md#5-security-rules) and §16.

### Content Security Policy

The shipped server configurations ([`docs/server/`](docs/server/)) and the local server
(`tools/serve.mjs`) send:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:;
font-src 'self'; connect-src 'self' blob:; frame-src 'self'; worker-src 'self'; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

plus `upgrade-insecure-requests` and HSTS on HTTPS, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin` and a
`Permissions-Policy`. Only three extensions exist, each opt-in: the hosts of online services a site
switches on (`connect-src`), the origins of framed `web` apps (`frame-src`) and `'wasm-unsafe-eval'`
for the optional Pagefind search. Nothing else needs a weaker policy.

The code is written so that it works under this policy: no inline script or style, no `style=""`
attributes, no `eval` or `new Function`, and **no HTML strings** — `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, `document.write`, `setHTMLUnsafe` and `srcdoc` are not used anywhere. The DOM
helper `h()` (`src/core/dom.js`) throws on those properties and on string event handlers.

### Foreign HTML: the Reader sanitiser

The Reader shows same-origin HTML pages natively, without an iframe. A page is fetched, parsed inert
with `DOMParser` (scripts never run, images never load) and cleaned by an **allowlist** sanitiser
(`src/modules/reader/sanitize.js`) before a single node is imported:

- elements: only allowlisted ones are kept; `script`, `style`, `iframe`, `object`, `embed`, `base`,
  `link`, `meta`, forms and form controls, `template`, SVG animation and similar go with their content;
  unknown wrappers are unwrapped so their text stays;
- attributes: an allowlist per element — never `style`, `on*`, `data-*` or `target`;
- URLs are re-resolved against the page and checked: links `http(s)`, `mailto`, `tel`; media `http(s)`
  (images also `data:image/…`); SVG references only within the page;
- ids get a per-window prefix and classes a `c-` prefix, so page content cannot collide with or pick up
  the desktop's own ids and styles.

### Online services and consent

No request leaves the site unless two gates are open (`src/core/consent.js`):

1. the site offers the service (`services.<id>: true` in `site/config.js`; all are `false` by default),
2. the visitor agreed — asked before the first request, stored per service, withdrawable in
   Settings → Online services (and revoked by the settings reset).

`Desk.net` refuses a request with a `service` id otherwise. Third-party requests go out with
`credentials: 'omit'`, `referrerPolicy: 'no-referrer'` and a timeout.
The CSP `connect-src` must list the service's host as well, so a missing consent check would still be
stopped by the browser.

### Vault crypto

Private bookmarks are sealed offline with `tools/seal-vault.mjs` and decrypted in the browser with Web
Crypto (`src/modules/vault/vault-core.js`):

- **PBKDF2-HMAC-SHA-256** over the normalised user name and password, salted with `config.vault.salt`,
  `config.vault.iterations` rounds (default 600 000); 512 derived bits: the first 256 are the
  **AES-256-GCM** key (imported non-extractable), the next 128 name the file (32 hex characters).
- File format version 2 stores the KDF id, iteration count and salt in a header that is the GCM
  additional data, so the parameters cannot be changed unnoticed; a file sealed with other parameters
  than the deployment's is refused.
- A wrong password finds no file (`404`) or fails authentication; both read as "denied". Files above
  `config.vault.maxBytes` are not read.
- "Stay logged in" keeps only the non-extractable `CryptoKey` in IndexedDB — never the password.
  Plain-text buffers are zeroed after use. The service worker never caches the vault folder.
- Requires a secure context (HTTPS). The deployment must not list directories, should serve
  `site/vault/*.bin` with `Cache-Control: no-cache` and `X-Robots-Tag: noindex` (the shipped
  configurations do), and the plain-text bookmark file must stay outside the project and every web
  root (the sealing tool refuses it there).

The vault protects the bookmarks against anyone who does not know the credentials; its strength is the
strength of the password. Use a site-specific salt (`npm run seal -- --new-salt`).

### Files from the device: blob URLs

Pictures, music, videos and text files a visitor opens or drops never leave the device. Because a
`blob:` URL has the desktop's origin, a file opened as a document could run script with access to the
desktop's storage — so device files are **never opened as documents**:

- a blob URL carries a validated type only: a raster image type (viewer), the audio/video type of an
  accepted extension (players), otherwise `application/octet-stream`;
- an **SVG never gets a blob URL**; the viewer shows a device SVG from a `data:` URL, which a page
  cannot navigate to and which never has the desktop's origin;
- no "Open in new tab" and no "Copy link" for windows that show a device file (`canPopOut` /
  `canLink` hooks); `window.open` never receives a `blob:` or `data:` URL;
- images only through `<img>`, not draggable, without the browser's context menu; downloads only
  through `<a download>` with a neutral type;
- text files are read as text and never get a URL.

### Stored data and configuration

Everything read from `localStorage`, IndexedDB, a backup file, the site manifest or the configuration
is treated as untrusted: validated, reduced to known shapes, ids re-checked before they reach a
selector. Manifest URLs are restricted to relative paths and `http(s)` (`link` apps `https` unless a
collection opts in to `http`); `javascript:`, `data:` and protocol-relative URLs are rejected. Links to
other origins open with `noopener`.

### Supply chain

The desktop ships no third-party code at runtime (the Tabler icon subset is generated into
`src/icons/tabler.js` and committed). npm brings two development tools only, installed with
`ignore-scripts`, exact versions from the lockfile (`npm ci`) and Node.js ≥ 24 enforced; we recommend
Socket Firewall Free (`sfw npm ci`). CI pins every GitHub Action to a commit SHA and verifies registry
signatures (`npm audit signatures`). Details: [`CONTRIBUTING.md` → Supply chain](CONTRIBUTING.md#supply-chain).

## Out of scope

- Content a site owner deploys (pages, apps, framed `web` apps, collections) and the configuration of
  their server, as long as the shipped configurations are not at fault.
- Weakening the policy deliberately (`'unsafe-inline'`, `'unsafe-eval'`, wildcard hosts).
- The third-party online services themselves; the desktop only limits what is sent to them.
- Attacks that require control of the visitor's device or browser.
