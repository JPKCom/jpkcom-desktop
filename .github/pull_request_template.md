<!-- JPKCom Desktop — pull request template — © Jean Pierre Kolb — MIT License
     Please read CONTRIBUTING.md first. Security fixes: see SECURITY.md before opening a public PR. -->

## What and why

<!-- What does this change, and why? Link the issue: Fixes #… -->

## How it was checked

<!-- Commands you ran and what you looked at (browser, theme, language, phone viewport). -->

- [ ] `npm test`
- [ ] `npm run i18n:check`
- [ ] `npm run icons:check` (after `npm run icons` if icons changed)
- [ ] `node tools/validate-manifest.mjs`
- [ ] `node tools/browser-check.mjs …` (options / scenario: …)

## Checklist

- [ ] No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`, no `style=""`, no `eval` — DOM through `h()`/`s()`
- [ ] New user-visible strings in every language of `locales/`, no two-language assumptions
- [ ] Tabler icons only, `src/icons/tabler.js` regenerated
- [ ] File header in every new source file; CSS inside its layer (+ `@layer compact`)
- [ ] Interface changes documented in `docs/ARCHITECTURE.md` first, package details in `docs/packages/`
- [ ] New config keys in `DEFAULTS` (`src/core/config.js`) and commented in `site/config.js`
- [ ] Stored data declared with a validator, a reset group and, where needed, a trash type
- [ ] Online services: declared with `consent`, off by default, hosts added to the docs and `docs/server/*`
- [ ] `CHANGELOG.md` updated under `[Unreleased]`

## Screenshots

<!-- For visible changes: dark and light theme, and a phone viewport when the layout changed. -->
