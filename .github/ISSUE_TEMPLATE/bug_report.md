---
name: Bug report
about: Something does not work as documented
title: ''
labels: bug
assignees: ''
---

<!-- JPKCom Desktop — bug report template — © Jean Pierre Kolb — MIT License
     Security problems: do NOT open an issue — see SECURITY.md. -->

## What happened

<!-- A clear description of the problem. -->

## What you expected

## Steps to reproduce

1.
2.
3.

## Environment

- JPKCom Desktop version (`package.json` or "About this desktop"):
- Browser and version:
- Operating system / device:
- Server (`npm run serve`, Apache, nginx, Caddy, Ferron, static-web-server, other):
- Installed in the web root or a sub-folder (`/desktop/`)?
- Language (`?lang=…` or browser language):
- Phone layout (`body.compact`)? yes / no

## Configuration

<!-- The relevant part of site/config.js and site/apps.js, if you changed them.
     Remove anything private (vault salt, internal hosts). -->

```js

```

## Console output

<!-- Errors and warnings from the browser console, including CSP violation reports. -->

```

```

## Checks

- [ ] `npm test` passes on my copy
- [ ] `node tools/validate-manifest.mjs` reports no errors for my `site/`
- [ ] The problem also happens with the shipped `site/` folder
