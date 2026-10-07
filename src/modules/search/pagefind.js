/* JPKCom Desktop — Search: optional full-text provider for a Pagefind index — © Jean Pierre Kolb — MIT License

   Active only when the site configures it:

     search: { pagefind: { path: 'pagefind/pagefind.js', excerptLength: 16, maxHits: 8, label: { en: 'Articles', de: 'Artikel' } } }

   The index (built by the Pagefind CLI over the site's pages) is imported
   on first use — when the search opens — from the same origin (CSP
   script-src 'self'; Pagefind needs 'wasm-unsafe-eval' as well, see
   docs/ARCHITECTURE.md §5). Pagefind picks its index from <html lang> when it
   initialises, so a language switch re-initialises it. A hit opens like any
   link of the desktop: its route, the page app with the longest URL prefix
   (Reader) or a new tab. */

import { excerptParts } from './engine.js';

/**
 * Creates the provider definition for search.addProvider().
 *   desk   the Desk API
 *   cfg    the cleaned config.search.pagefind ({ path, excerptLength, maxHits, label, order })
 */
export function createPagefind(desk, cfg) {
	let imported = null;    // Promise of the module (one import per page)
	let ready = null;       // Promise of the module, initialised for readyLang (null when unavailable)
	let readyLang = null;
	let failed = false;

	function load() {
		if (failed) return Promise.resolve(null);
		const lang = desk.lang();
		if (!ready || readyLang !== lang) {
			const prev = ready;
			readyLang = lang;
			ready = (prev ?? Promise.resolve(null)).then(async old => {
				imported ??= import(new URL(cfg.path, desk.env.root).href);
				const mod = await imported;
				if (typeof mod?.search !== 'function') throw new Error(`${cfg.path} is not a Pagefind module`);
				if (old) await old.destroy?.();
				await mod.options?.({ excerptLength: cfg.excerptLength });
				await mod.init?.();
				return mod;
			}).catch(err => {
				console.warn('[search] full-text index unavailable:', err?.message ?? err);
				failed = true;
				return null;
			});
		}
		return ready;
	}

	/* Excerpt HTML parsed inertly; only text and <mark> survive (as text nodes and fresh <mark>s) */
	function excerpt(html) {
		const body = new DOMParser().parseFromString(String(html ?? ''), 'text/html').body;
		return excerptParts([...body.childNodes].map(n => ({ name: n.nodeName, text: n.textContent })))
			.map(p => (p.mark ? desk.h('mark', { text: p.text }) : p.text));
	}

	function result(hit) {
		const raw = typeof hit?.url === 'string' ? hit.url : '';
		const url = raw ? desk.router.resolveUrl(raw) : null;
		if (!url || !/^https?:$/.test(url.protocol)) return null;
		const external = desk.router.isExternal(url);
		let app = null;
		if (!external) {
			const r = desk.router.route(url);
			app = r.app ? desk.apps.get(r.app) : r.page ? desk.router.pageApp(url.pathname) : null;
			if (app && !desk.apps.available(app)) app = null;
		}
		const title = typeof hit.meta?.title === 'string' && hit.meta.title.trim() ? hit.meta.title : raw;
		return {
			key: `pf:${url.href}`,
			title,
			sub: excerpt(hit.excerpt),
			app: app ?? { icon: 'ti-file-text', tint: 'slate' },
			/* without an app window (other origin, a file, no Reader) the link opens in a new tab */
			external: external || !app || app.kind === 'link',
			run: () => desk.openUrl(url.href)
		};
	}

	return {
		id: 'pagefind',
		label: cfg.label ?? '@search.fullText',
		order: cfg.order,
		max: cfg.maxHits,
		minLength: 2,
		delay: 160,
		/* The search opened: start loading the index */
		warm: () => { load(); },
		/* Once the index failed to load, the search shows it as unavailable without asking again */
		available: () => !failed,
		async search(q, ctx) {
			const mod = await load();
			if (!mod) throw new Error('unavailable');
			const res = await mod.search(q);
			if (ctx?.signal?.aborted) return [];
			const data = await Promise.all((res?.results ?? []).slice(0, cfg.maxHits).map(r => r.data()));
			return data.map(result).filter(Boolean);
		}
	};
}
